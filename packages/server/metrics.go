// packages/server/metrics.go
package main

import (
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

// Metrics use bounded-cardinality labels only (table name, message type,
// write result, query operation) — never client_id or IP, which would be
// unbounded and blow up Prometheus's memory over the life of a deployment.
var (
	metricConnections = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "datum_websocket_connections",
			Help: "Current number of active WebSocket connections, by table.",
		},
		[]string{"table"},
	)

	metricMessagesTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "datum_messages_total",
			Help: "Total WebSocket messages received, by table and message type.",
		},
		[]string{"table", "type"},
	)

	metricDeltasTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "datum_deltas_broadcast_total",
			Help: "Total delta messages broadcast to clients, by table.",
		},
		[]string{"table"},
	)

	metricWritesTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "datum_writes_total",
			Help: "Total write requests, by table and result (success|error).",
		},
		[]string{"table", "result"},
	)

	metricRateLimitRejections = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "datum_rate_limit_rejections_total",
			Help: "Total write requests rejected by the per-IP rate limiter.",
		},
	)

	metricDBQueryDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "datum_db_query_duration_seconds",
			Help:    "Duration of datum-server's runtime database queries, by operation.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"operation"},
	)
)

func init() {
	prometheus.MustRegister(
		metricConnections,
		metricMessagesTotal,
		metricDeltasTotal,
		metricWritesTotal,
		metricRateLimitRejections,
		metricDBQueryDuration,
	)
}

// observeDBQuery records how long a runtime database query took, labeled by
// a short operation name (e.g. "snapshot", "rls_check").
func observeDBQuery(operation string, start time.Time) {
	metricDBQueryDuration.WithLabelValues(operation).Observe(time.Since(start).Seconds())
}
