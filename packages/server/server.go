// packages/server/server.go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/time/rate"
)

// tableState holds the runtime state for one configured table.
type tableState struct {
	name    string
	cols    ColumnConfig
	clients map[string]*wsClient
	mu      sync.RWMutex
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

func (ts *tableState) broadcast(msg []byte, originClientID string, geomLon, geomLat float64) {
	ts.mu.RLock()
	defer ts.mu.RUnlock()
	point := [2]float64{geomLon, geomLat}
	for id, c := range ts.clients {
		if id == originClientID {
			continue
		}
		if bboxContainsPoint(c.bbox, point) {
			select {
			case c.send <- msg:
			default:
				log.Printf("datum-server: client %s send buffer full, dropping delta", id)
			}
		}
	}
}

type wsClient struct {
	id    string
	table string // which table this client is subscribed to
	bbox  [4]float64
	send  chan []byte
	conn  *websocket.Conn
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
}

func newServer(pool *pgxpool.Pool, tables []*tableState, port, allowedOrigin string, writeLimit int) *server {
	s := &server{
		pool:       pool,
		tables:     make(map[string]*tableState, len(tables)),
		writeLimit: writeLimit,
		ipLimiters: make(map[string]*ipLimiter),
		port:       port,
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
	http.HandleFunc("/ws", s.handleWS)

	if s.writeLimit > 0 {
		go s.cleanupLimiters()
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

	return http.ListenAndServe(fmt.Sprintf(":%s", s.port), nil)
}

func (s *server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("datum-server: ws upgrade: %v", err)
		return
	}

	client := &wsClient{
		send: make(chan []byte, 64),
		conn: conn,
	}

	go client.writePump()

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
			ts := s.resolveTable(msg.Table)
			if ts == nil {
				log.Printf("datum-server: client %s: unknown table %q", msg.ClientID, msg.Table)
				continue
			}
			// Remove from old table if the client is switching tables.
			if client.table != "" && client.table != ts.name {
				if old := s.tables[client.table]; old != nil {
					old.removeClient(client.id)
				}
			}
			client.id    = msg.ClientID
			client.table = ts.name
			client.bbox  = msg.BBox
			ts.addClient(client)

			if err := sendSnapshot(r.Context(), s, ts, client, msg.Since); err != nil {
				log.Printf("datum-server: snapshot error for %s: %v", client.id, err)
			}

		case "write":
			if s.writeLimit > 0 && !s.allowWrite(r.RemoteAddr) {
				log.Printf("datum-server: rate limit exceeded for %s", r.RemoteAddr)
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
			if err := applyWrites(r.Context(), s, ts, client.id, msg.Edits); err != nil {
				log.Printf("datum-server: write error for %s: %v", client.id, err)
			}
		}
	}
}

func (s *server) allowWrite(remoteAddr string) bool {
	s.ipMu.Lock()
	defer s.ipMu.Unlock()

	il, ok := s.ipLimiters[remoteAddr]
	if !ok {
		r := rate.Every(time.Minute / time.Duration(s.writeLimit))
		il = &ipLimiter{limiter: rate.NewLimiter(r, s.writeLimit)}
		s.ipLimiters[remoteAddr] = il
	}
	il.lastSeen = time.Now()
	return il.limiter.Allow()
}

// cleanupLimiters removes IP limiters that haven't been seen in 10 minutes.
func (s *server) cleanupLimiters() {
	for {
		time.Sleep(10 * time.Minute)
		s.ipMu.Lock()
		for ip, il := range s.ipLimiters {
			if time.Since(il.lastSeen) > 10*time.Minute {
				delete(s.ipLimiters, ip)
			}
		}
		s.ipMu.Unlock()
	}
}

// bboxContainsPoint returns true if [lon, lat] is within bbox [minX, minY, maxX, maxY].
func bboxContainsPoint(bbox [4]float64, point [2]float64) bool {
	return point[0] >= bbox[0] && point[0] <= bbox[2] &&
		point[1] >= bbox[1] && point[1] <= bbox[3]
}

func (c *wsClient) writePump() {
	defer c.conn.Close()
	for msg := range c.send {
		if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			return
		}
	}
}
