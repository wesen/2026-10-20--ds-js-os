package tracerv32

import "testing"

// A loop shaped like the ray tracer's inner loops: a checked load, arithmetic,
// a store and a backward branch, 1,000,000 iterations (8,000,003 steps).
func BenchmarkLoop(b *testing.B) {
	code := image(
		lui(t0, 0xf4000), addi(t0, t0, 0x240), // t0 = 1,000,000
		li(a1, 0),
		lw(a2, zero, 0), // loop:
		mul(a2, a2, t0),
		add(a1, a1, a2),
		sw(a1, zero, 4),
		bltu(a1, t0, 4), // a forward branch over nothing, taken or not
		addi(t0, t0, -1),
		bne(t0, zero, -24),
		ret,
	)
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		x, mem := setup(make([]byte, 16), 64)
		m := Machine{Image: code, Memory: mem, X: x, Counts: make([]uint32, len(code)/4), Limit: 50e6, LimitText: "50000000"}
		out, err := m.Run(0)
		if err != nil || out.Steps != 7000004 {
			b.Fatal(out, err)
		}
	}
	b.ReportMetric(float64(7000004*b.N)/b.Elapsed().Seconds()/1e6, "Msteps/s")
}
