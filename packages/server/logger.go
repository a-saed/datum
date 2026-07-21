// packages/server/logger.go
package main

import (
	"log/slog"
	"os"
	"strings"
)

// newLogger builds a JSON structured logger. levelStr comes from the
// LOG_LEVEL env var ("debug", "info", "warn", "error"); unrecognised or
// empty values default to info.
func newLogger(levelStr string) *slog.Logger {
	var level slog.Level
	switch strings.ToLower(levelStr) {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})).
		With("component", "datum-server")
}
