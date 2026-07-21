package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func TestMetricsEndpoint_ExposesRegisteredMetrics(t *testing.T) {
	metricConnections.WithLabelValues("features").Set(3)
	metricMessagesTotal.WithLabelValues("features", "subscribe").Inc()
	metricDeltasTotal.WithLabelValues("features").Inc()
	metricWritesTotal.WithLabelValues("features", "success").Inc()
	metricRateLimitRejections.Inc()
	metricDBQueryDuration.WithLabelValues("snapshot").Observe(0.01)

	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rec := httptest.NewRecorder()

	promhttp.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status: got %d, want %d", rec.Code, http.StatusOK)
	}
	body := rec.Body.String()
	for _, want := range []string{
		"datum_websocket_connections",
		"datum_messages_total",
		"datum_deltas_broadcast_total",
		"datum_writes_total",
		"datum_rate_limit_rejections_total",
		"datum_db_query_duration_seconds",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("expected /metrics output to contain %q", want)
		}
	}
}
