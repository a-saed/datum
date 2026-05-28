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

type wsClient struct {
	id   string
	bbox [4]float64
	send chan []byte
	conn *websocket.Conn
}

type ipLimiter struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

type server struct {
	pool        *pgxpool.Pool
	table       string
	cols        ColumnConfig
	port        string
	upgrader    websocket.Upgrader
	clients     map[string]*wsClient
	mu          sync.RWMutex
	writeLimit  int // max writes per minute per IP, 0 = disabled
	ipLimiters  map[string]*ipLimiter
	ipMu        sync.Mutex
}

func newServer(pool *pgxpool.Pool, table, port, allowedOrigin string, writeLimit int, cols ColumnConfig) *server {
	s := &server{
		pool:       pool,
		table:      table,
		cols:       cols,
		port:       port,
		clients:    make(map[string]*wsClient),
		writeLimit: writeLimit,
		ipLimiters: make(map[string]*ipLimiter),
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
			s.removeClient(client.id)
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
			client.id   = msg.ClientID
			client.bbox = msg.BBox
			s.addClient(client)

			if err := sendSnapshot(r.Context(), s, client, msg.Since); err != nil {
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
			if err := applyWrites(r.Context(), s, client.id, msg.Edits); err != nil {
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

func (s *server) addClient(c *wsClient) {
	s.mu.Lock()
	s.clients[c.id] = c
	s.mu.Unlock()
}

func (s *server) removeClient(id string) {
	s.mu.Lock()
	delete(s.clients, id)
	s.mu.Unlock()
}

func (s *server) broadcast(msg []byte, originClientID string, geomLon, geomLat float64) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	point := [2]float64{geomLon, geomLat}
	for id, c := range s.clients {
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
