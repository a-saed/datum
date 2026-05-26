// packages/server/server_test.go
package main

import (
	"testing"
)

func TestBBoxIntersects(t *testing.T) {
	tests := []struct {
		name       string
		clientBBox [4]float64
		point      [2]float64
		want       bool
	}{
		{"inside",  [4]float64{-1, -1, 1, 1}, [2]float64{0, 0}, true},
		{"outside", [4]float64{-1, -1, 1, 1}, [2]float64{5, 5}, false},
		{"on edge", [4]float64{-1, -1, 1, 1}, [2]float64{1, 1}, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := bboxContainsPoint(tc.clientBBox, tc.point)
			if got != tc.want {
				t.Errorf("bboxContainsPoint(%v, %v) = %v, want %v",
					tc.clientBBox, tc.point, got, tc.want)
			}
		})
	}
}
