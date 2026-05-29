// packages/server/auth.go
package main

import (
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"os"

	"github.com/golang-jwt/jwt/v5"
)

// Verifier verifies a raw JWT string and returns its claims.
type Verifier interface {
	Verify(tokenStr string) (map[string]any, error)
}

type jwtVerifier struct {
	algorithm string
	keyFunc   jwt.Keyfunc
}

// newVerifier builds a Verifier from the auth config.
// Returns nil, nil when cfg is disabled — unauthenticated mode.
func newVerifier(cfg AuthConfig) (Verifier, error) {
	if !cfg.Enabled() {
		return nil, nil
	}
	alg := cfg.JWTAlgorithm
	switch alg {
	case "HS256", "HS384", "HS512":
		secret := os.Getenv("JWT_SECRET")
		if secret == "" {
			return nil, errors.New("JWT_SECRET env var is required for HS* algorithms")
		}
		return &jwtVerifier{
			algorithm: alg,
			keyFunc: func(t *jwt.Token) (any, error) {
				if t.Method.Alg() != alg {
					return nil, fmt.Errorf("unexpected signing method: %s", t.Method.Alg())
				}
				return []byte(secret), nil
			},
		}, nil
	case "RS256", "RS384", "RS512", "ES256", "ES384", "ES512":
		if cfg.JWTPublicKey == "" {
			return nil, fmt.Errorf("jwt_public_key is required for %s", alg)
		}
		pub, err := loadPublicKey(cfg.JWTPublicKey)
		if err != nil {
			return nil, fmt.Errorf("load public key: %w", err)
		}
		return &jwtVerifier{
			algorithm: alg,
			keyFunc: func(t *jwt.Token) (any, error) {
				if t.Method.Alg() != alg {
					return nil, fmt.Errorf("unexpected signing method: %s", t.Method.Alg())
				}
				return pub, nil
			},
		}, nil
	default:
		return nil, fmt.Errorf("unsupported jwt_algorithm %q (supported: HS256/384/512, RS256/384/512, ES256/384/512)", alg)
	}
}

func (v *jwtVerifier) Verify(tokenStr string) (map[string]any, error) {
	token, err := jwt.Parse(tokenStr, v.keyFunc,
		jwt.WithValidMethods([]string{v.algorithm}),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return nil, err
	}
	mc, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token claims")
	}
	out := make(map[string]any, len(mc))
	for k, v := range mc {
		out[k] = v
	}
	return out, nil
}

// loadPublicKey reads a PEM file and returns the parsed public key.
// Supports RSA and ECDSA in PKIX format.
func loadPublicKey(path string) (any, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %q: %w", path, err)
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, fmt.Errorf("no PEM block found in %q", path)
	}
	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse public key from %q: %w", path, err)
	}
	return pub, nil
}
