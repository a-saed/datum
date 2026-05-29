// packages/server/auth_test.go
package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"maps"
	"os"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func makeHS256Token(t *testing.T, secret string, claims map[string]any, exp time.Time) string {
	t.Helper()
	mc := jwt.MapClaims{"exp": exp.Unix()}
	maps.Copy(mc, claims)
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, mc).SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return tok
}

func TestVerify_HS256_Valid(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-that-is-long-enough-x")
	v, err := newVerifier(AuthConfig{JWTAlgorithm: "HS256"})
	if err != nil {
		t.Fatalf("newVerifier: %v", err)
	}
	tok := makeHS256Token(t, "test-secret-that-is-long-enough-x",
		map[string]any{"sub": "user-1", "role": "member"},
		time.Now().Add(time.Hour),
	)
	claims, err := v.Verify(tok)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if claims["sub"] != "user-1" {
		t.Errorf("sub: got %v, want user-1", claims["sub"])
	}
	if claims["role"] != "member" {
		t.Errorf("role: got %v, want member", claims["role"])
	}
}

func TestVerify_HS256_Expired(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-that-is-long-enough-x")
	v, err := newVerifier(AuthConfig{JWTAlgorithm: "HS256"})
	if err != nil {
		t.Fatalf("newVerifier: %v", err)
	}
	tok := makeHS256Token(t, "test-secret-that-is-long-enough-x",
		map[string]any{"sub": "user-1"},
		time.Now().Add(-time.Hour),
	)
	if _, err := v.Verify(tok); err == nil {
		t.Fatal("expected error for expired token")
	}
}

func TestVerify_HS256_WrongSecret(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-that-is-long-enough-x")
	v, err := newVerifier(AuthConfig{JWTAlgorithm: "HS256"})
	if err != nil {
		t.Fatalf("newVerifier: %v", err)
	}
	tok := makeHS256Token(t, "completely-different-secret-xxxxx",
		map[string]any{"sub": "user-1"},
		time.Now().Add(time.Hour),
	)
	if _, err := v.Verify(tok); err == nil {
		t.Fatal("expected error for wrong secret")
	}
}

func TestVerify_Disabled(t *testing.T) {
	v, err := newVerifier(AuthConfig{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v != nil {
		t.Fatal("expected nil verifier when auth not configured")
	}
}

func TestNewVerifier_MissingSecret(t *testing.T) {
	t.Setenv("JWT_SECRET", "")
	if _, err := newVerifier(AuthConfig{JWTAlgorithm: "HS256"}); err == nil {
		t.Fatal("expected error when JWT_SECRET is empty")
	}
}

func TestNewVerifier_UnsupportedAlgorithm(t *testing.T) {
	if _, err := newVerifier(AuthConfig{JWTAlgorithm: "none"}); err == nil {
		t.Fatal("expected error for unsupported algorithm")
	}
}

func TestNewVerifier_RS256_MissingKey(t *testing.T) {
	if _, err := newVerifier(AuthConfig{JWTAlgorithm: "RS256", JWTPublicKey: ""}); err == nil {
		t.Fatal("expected error when jwt_public_key is empty for RS256")
	}
}

func TestVerify_RS256_Valid(t *testing.T) {
	// Generate ephemeral RSA key pair for the test.
	privKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate RSA key: %v", err)
	}

	// Write public key to a temp PEM file.
	pubDER, err := x509.MarshalPKIXPublicKey(&privKey.PublicKey)
	if err != nil {
		t.Fatalf("marshal public key: %v", err)
	}
	f, err := os.CreateTemp(t.TempDir(), "*.pub.pem")
	if err != nil {
		t.Fatalf("create temp file: %v", err)
	}
	if err := pem.Encode(f, &pem.Block{Type: "PUBLIC KEY", Bytes: pubDER}); err != nil {
		t.Fatalf("encode PEM: %v", err)
	}
	f.Close()

	v, err := newVerifier(AuthConfig{JWTAlgorithm: "RS256", JWTPublicKey: f.Name()})
	if err != nil {
		t.Fatalf("newVerifier: %v", err)
	}

	// Sign a token with the private key.
	mc := jwt.MapClaims{
		"sub": "user-rsa",
		"exp": time.Now().Add(time.Hour).Unix(),
	}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodRS256, mc).SignedString(privKey)
	if err != nil {
		t.Fatalf("sign RS256 token: %v", err)
	}

	claims, err := v.Verify(tok)
	if err != nil {
		t.Fatalf("Verify RS256: %v", err)
	}
	if claims["sub"] != "user-rsa" {
		t.Errorf("sub: got %v, want user-rsa", claims["sub"])
	}
}
