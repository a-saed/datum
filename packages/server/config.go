// packages/server/config.go
package main

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// Config is the structure of datum.yaml.
type Config struct {
	Port          string      `yaml:"port"`
	AllowedOrigin string      `yaml:"allowed_origin"`
	RateLimit     int         `yaml:"rate_limit"`
	Table         TableConf   `yaml:"table"`   // single-table shorthand (backwards compat)
	Tables        []TableConf `yaml:"tables"`  // multi-table list
}

// TableConf holds the table name and its column mapping.
type TableConf struct {
	Name          string `yaml:"name"`
	ColID         string `yaml:"col_id"`
	ColGeom       string `yaml:"col_geom"`
	ColUpdatedAt  string `yaml:"col_updated_at"`
	ColProperties string `yaml:"col_properties"`
}

func loadConfig(path string) (Config, error) {
	var cfg Config
	data, err := os.ReadFile(path)
	if err != nil {
		return cfg, fmt.Errorf("read config file: %w", err)
	}
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return cfg, fmt.Errorf("parse config file: %w", err)
	}
	return cfg, nil
}

// coalesce returns the first non-empty string from the list.
func coalesce(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}
