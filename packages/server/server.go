// packages/server/server.go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
)

type wsClient struct {
	id   string
	bbox [4]float64
	send chan []byte
	conn *websocket.Conn
}

type server struct {
	pool     *pgxpool.Pool
	table    string
	port     string
	upgrader websocket.Upgrader
	clients  map[string]*wsClient
	mu       sync.RWMutex
}

func newServer(pool *pgxpool.Pool, table, port, allowedOrigin string) *server {
	s := &server{
		pool:    pool,
		table:   table,
		port:    port,
		clients: make(map[string]*wsClient),
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

	go func() {
		if err := listenForNotifications(ctx, s); err != nil {
			log.Printf("datum-server: notify listener stopped: %v", err)
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

			if err := sendSnapshot(r.Context(), s, client); err != nil {
				log.Printf("datum-server: snapshot error for %s: %v", client.id, err)
			}

		case "write":
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
