// packages/server/server.go
package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/time/rate"
)

const (
	wsReadLimit    = 1 << 20 // 1 MiB
	wsPingInterval = 30 * time.Second
	wsPongWait     = 60 * time.Second
	wsWriteWait    = 10 * time.Second
)

// tableState holds the runtime state for one configured table.
type tableState struct {
	name      string
	cols      ColumnConfig
	columns   []ColumnDef // introspected at startup, immutable after init
	schemaMsg []byte      // pre-serialised SchemaMessage, sent as-is
	isSpatial bool        // true if table has a geometry column
	clients   map[string]*wsClient
	mu        sync.RWMutex
}

func (ts *tableState) addClient(c *wsClient) {
	ts.mu.Lock()
	ts.clients[c.id] = c
	ts.mu.Unlock()
}

func (ts *tableState) removeClient(id string) {
	ts.mu.Lock()
	delete(ts.clients, id)
	ts.mu.Unlock()
}

func (ts *tableState) broadcast(msg []byte, originClientID string, geomBbox [4]float64) {
	ts.mu.RLock()
	defer ts.mu.RUnlock()
	for id, c := range ts.clients {
		if id == originClientID {
			continue
		}
		if bboxesIntersect(c.bbox, geomBbox) {
			select {
			case c.send <- msg:
			default:
				log.Printf("datum-server: client %s send buffer full, dropping delta", id)
			}
		}
	}
}

type wsClient struct {
	id          string
	table       string // which table this client is subscribed to
	bbox        [4]float64
	send        chan []byte
	conn        *websocket.Conn
	claims      map[string]any // nil when auth not configured
	where       string         // validated WHERE clause; empty means no predicate
	whereParams []any          // bound parameter values for $n placeholders
}

type ipLimiter struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

type server struct {
	pool         *pgxpool.Pool
	tables       map[string]*tableState
	defaultTable string // set when only one table is configured
	port         string
	upgrader     websocket.Upgrader
	writeLimit   int // max writes per minute per IP, 0 = disabled
	ipLimiters   map[string]*ipLimiter
	ipMu         sync.Mutex
	mux          *http.ServeMux
	verifier     Verifier
}

func newServer(pool *pgxpool.Pool, tables []*tableState, port, allowedOrigin string, writeLimit int, verifier Verifier) *server {
	s := &server{
		pool:       pool,
		tables:     make(map[string]*tableState, len(tables)),
		writeLimit: writeLimit,
		ipLimiters: make(map[string]*ipLimiter),
		port:       port,
		mux:        http.NewServeMux(),
		verifier:   verifier,
	}
	for _, ts := range tables {
		s.tables[ts.name] = ts
	}
	if len(tables) == 1 {
		s.defaultTable = tables[0].name
	}
	s.upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			if allowedOrigin == "*" {
				return true
			}
			return r.Header.Get("Origin") == allowedOrigin
		},
	}
	s.mux.HandleFunc("/ws", s.handleWS)
	return s
}

// resolveTable returns the tableState for the given name, falling back to
// defaultTable when name is empty (single-table backwards compat).
func (s *server) resolveTable(name string) *tableState {
	if name == "" && s.defaultTable != "" {
		return s.tables[s.defaultTable]
	}
	return s.tables[name]
}

func (s *server) run(ctx context.Context) error {
	if s.writeLimit > 0 {
		go s.cleanupLimiters(ctx)
	}

	go func() {
		for {
			if err := listenForNotifications(ctx, s); err != nil {
				if ctx.Err() != nil {
					return
				}
				log.Printf("datum-server: notify listener stopped: %v — retrying in 5s", err)
				time.Sleep(5 * time.Second)
			}
		}
	}()

	httpServer := &http.Server{
		Addr:    fmt.Sprintf(":%s", s.port),
		Handler: s.mux,
	}

	errCh := make(chan error, 1)
	go func() {
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return httpServer.Shutdown(shutdownCtx)
	}
}

// verifyToken verifies the token and returns its claims.
// Returns nil claims (not an error) when auth is disabled.
func verifyToken(v Verifier, token string) (map[string]any, error) {
	if v == nil {
		return nil, nil
	}
	if token == "" {
		return nil, errors.New("auth required: token missing")
	}
	return v.Verify(token)
}

func (s *server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("datum-server: ws upgrade: %v", err)
		return
	}

	conn.SetReadLimit(wsReadLimit)
	_ = conn.SetReadDeadline(time.Now().Add(wsPongWait))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(wsPongWait))
	})

	client := &wsClient{
		id:   newUUID(),
		send: make(chan []byte, 64),
		conn: conn,
	}

	go client.writePump()

	clientIP := extractClientIP(r)

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			if client.table != "" {
				if ts := s.tables[client.table]; ts != nil {
					ts.removeClient(client.id)
				}
			}
			// removeClient holds a WLock that blocks until any in-flight broadcast
			// finishes, so closing the channel here cannot race with a send.
			close(client.send)
			return
		}

		var base struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(raw, &base); err != nil {
			continue
		}

		switch base.Type {
		case "subscribe":
			var msg SubscribeMessage
			if err := json.Unmarshal(raw, &msg); err != nil {
				continue
			}
			// Verify token when auth is configured.
			claims, err := verifyToken(s.verifier, msg.Token)
			if err != nil {
				log.Printf("datum-server: auth rejected for %s: %v", msg.ClientID, err)
				_ = conn.WriteControl(
					websocket.CloseMessage,
					websocket.FormatCloseMessage(4401, "unauthorized"),
					time.Now().Add(time.Second),
				)
				close(client.send)
				return
			}
			client.claims = claims
			ts := s.resolveTable(msg.Table)
			if ts == nil {
				log.Printf("datum-server: client %s: unknown table %q", msg.ClientID, msg.Table)
				continue
			}

			isFirstSubscribe := client.table == ""

			// Remove from old table if the client is switching tables.
			if client.table != "" && client.table != ts.name {
				if old := s.tables[client.table]; old != nil {
					old.removeClient(client.id)
				}
			}
			client.id    = msg.ClientID
			client.table = ts.name
			// Validate bbox based on table's spatial mode.
			if ts.isSpatial && msg.BBox == nil {
				log.Printf("datum-server: client %s: spatial table %q requires a bbox", msg.ClientID, ts.name)
				_ = conn.WriteControl(
					websocket.CloseMessage,
					websocket.FormatCloseMessage(4400, "spatial table requires a bbox"),
					time.Now().Add(time.Second),
				)
				close(client.send)
				return
			}
			if !ts.isSpatial && msg.BBox != nil {
				log.Printf("datum-server: client %s: bbox ignored for non-spatial table %q", msg.ClientID, ts.name)
			}
			if msg.BBox != nil {
				client.bbox = *msg.BBox
			}
			// Validate and store predicate if provided.
			if msg.Where != "" {
				if err := validatePredicate(r.Context(), s.pool, ts.name, msg.Where, msg.WhereParams); err != nil {
					log.Printf("datum-server: invalid predicate from %s: %v", msg.ClientID, err)
					_ = conn.WriteControl(
						websocket.CloseMessage,
						websocket.FormatCloseMessage(4400, "invalid predicate"),
						time.Now().Add(time.Second),
					)
					close(client.send)
					return
				}
			}
			client.where       = msg.Where
			client.whereParams = msg.WhereParams
			ts.addClient(client)

			// Send schema once per connection — not on bbox updates (setBbox).
			if isFirstSubscribe {
				select {
				case client.send <- ts.schemaMsg:
				default:
					log.Printf("datum-server: client %s schema send buffer full", client.id)
				}
			}

			if err := sendSnapshot(r.Context(), s, ts, client, msg.Since); err != nil {
				log.Printf("datum-server: snapshot error for %s: %v", client.id, err)
			}

		case "write":
			if s.writeLimit > 0 && !s.allowWrite(clientIP) {
				log.Printf("datum-server: rate limit exceeded for %s", clientIP)
				continue
			}
			var msg WriteMessage
			if err := json.Unmarshal(raw, &msg); err != nil {
				continue
			}
			ts := s.resolveTable(msg.Table)
			if ts == nil {
				log.Printf("datum-server: client %s: unknown table %q for write", client.id, msg.Table)
				continue
			}
			writeIDs, err := applyWrites(r.Context(), s, ts, client.id, client.claims, msg.Edits)
			if err != nil {
				log.Printf("datum-server: write error for %s: %v", client.id, err)
				continue
			}
			if len(writeIDs) > 0 {
				ack := AckMessage{Type: "ack", WriteIDs: writeIDs}
				if b, err := json.Marshal(ack); err == nil {
					select {
					case client.send <- b:
					default:
						log.Printf("datum-server: client %s ack buffer full", client.id)
					}
				}
			}

		case "auth":
			var msg AuthMessage
			if err := json.Unmarshal(raw, &msg); err != nil {
				continue
			}
			claims, err := verifyToken(s.verifier, msg.Token)
			if err != nil {
				log.Printf("datum-server: token refresh rejected for %s: %v", client.id, err)
				_ = conn.WriteControl(
					websocket.CloseMessage,
					websocket.FormatCloseMessage(4401, "token refresh failed"),
					time.Now().Add(time.Second),
				)
				if client.table != "" {
					if ts := s.tables[client.table]; ts != nil {
						ts.removeClient(client.id)
					}
				}
				close(client.send)
				return
			}
			client.claims = claims
			log.Printf("datum-server: token refreshed for %s", client.id)
		}
	}
}

func (s *server) allowWrite(ip string) bool {
	s.ipMu.Lock()
	defer s.ipMu.Unlock()

	il, ok := s.ipLimiters[ip]
	if !ok {
		r := rate.Every(time.Minute / time.Duration(s.writeLimit))
		il = &ipLimiter{limiter: rate.NewLimiter(r, s.writeLimit)}
		s.ipLimiters[ip] = il
	}
	il.lastSeen = time.Now()
	return il.limiter.Allow()
}

// cleanupLimiters removes IP limiters that haven't been seen in 10 minutes.
func (s *server) cleanupLimiters(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(10 * time.Minute):
		}
		s.ipMu.Lock()
		for ip, il := range s.ipLimiters {
			if time.Since(il.lastSeen) > 10*time.Minute {
				delete(s.ipLimiters, ip)
			}
		}
		s.ipMu.Unlock()
	}
}

// extractClientIP returns the real client IP, reading X-Forwarded-For when
// present (proxy/load-balancer deployments) and stripping the port from
// RemoteAddr when not.
func extractClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// Take the first (leftmost) address — the original client.
		if ip, _, err := net.SplitHostPort(xff); err == nil {
			return ip
		}
		return xff
	}
	if ip, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return ip
	}
	return r.RemoteAddr
}

// newUUID returns a random UUID v4.
func newUUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

func (c *wsClient) writePump() {
	ticker := time.NewTicker(wsPingInterval)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
