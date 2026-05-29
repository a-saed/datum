// packages/server/auth_test.go
package main

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func makeHS256Token(t *testing.T, secret string, claims map[string]any, exp time.Time) string {
	t.Helper()
	mc := jwt.MapClaims{"exp": exp.Unix()}
	for k, v := range claims {
		mc[k] = v
	}
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
	v, _ := newVerifier(AuthConfig{JWTAlgorithm: "HS256"})
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
	v, _ := newVerifier(AuthConfig{JWTAlgorithm: "HS256"})
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
