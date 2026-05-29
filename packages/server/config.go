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
	Table         TableConf   `yaml:"table"`
	Tables        []TableConf `yaml:"tables"`
	Auth          AuthConfig  `yaml:"auth"`
}

// AuthConfig holds JWT verification settings.
// Enabled when JWTAlgorithm is non-empty.
// jwt_secret must come from the JWT_SECRET env var — never the config file.
type AuthConfig struct {
	JWTAlgorithm string `yaml:"jwt_algorithm"`  // HS256 | RS256 | ES256 (and 384/512 variants)
	JWTPublicKey string `yaml:"jwt_public_key"`  // path to PEM file (RS256/ES256 only)
}

// Enabled returns true when JWT auth is configured.
func (a AuthConfig) Enabled() bool {
	return a.JWTAlgorithm != ""
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
