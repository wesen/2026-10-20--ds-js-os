package tracearchive

import (
	"math"
	"strings"
	"testing"
)

// These tests recompute the workbook's verified numbers from archived bytes and
// the original JSON summaries, without the query library. They are the oracle
// that the JS examples must agree with, and they pin the evidence a researcher
// uses to judge a simple optimization (one pass, one snapshot pair) and a
// complex one (an ablation of whole pipelines, a property across a gap).

func countLines(body, needle string) int {
	n := 0
	for _, line := range strings.Split(body, "\n") {
		if strings.Contains(line, needle) {
			n++
		}
	}
	return n
}

// A full function print of row, as opposed to a loop fragment or module print.
func fullRowPrint(e Event) bool { return strings.HasSuffix(e.Header, " on row") }

const capacityLoad = "load i32, ptr %work,"

func TestWorkbookOracleSimpleOptimizations(t *testing.T) {
	a := actualArchive(t)
	text := func(variant, phase string, ordinal int) string {
		t.Helper()
		body, err := a.Text(variant, phase, ordinal)
		if err != nil {
			t.Fatal(err)
		}
		return body
	}
	middle, err := a.Events("checked", "middle")
	if err != nil {
		t.Fatal(err)
	}
	t.Run("01-02 populations", func(t *testing.T) {
		all, _ := a.Events("", "")
		backend, _ := a.Events("checked", "backend")
		if len(all) != 4133 || len(middle) != 195 || len(backend) != 116 || backend[0].Ordinal != 0 {
			t.Fatalf("events %d, checked middle %d, backend %d", len(all), len(middle), len(backend))
		}
	})
	t.Run("03 ordinal addresses the original stream", func(t *testing.T) {
		e := middle[74]
		if e.Ordinal != 74 || e.Pass != "EarlyCSEPass" || !fullRowPrint(e) || e.Ref.End <= e.Ref.Start {
			t.Fatal(e)
		}
	})
	t.Run("05-06 EarlyCSE removes five capacity loads", func(t *testing.T) {
		before, after := countLines(text("checked", "middle", 73), capacityLoad), countLines(text("checked", "middle", 74), capacityLoad)
		if middle[73].Pass != "SROAPass" || before != 11 || after != 6 {
			t.Fatalf("%s: %d -> %d", middle[73].Pass, before, after)
		}
	})
	t.Run("07 first observed decrease between consecutive full row prints", func(t *testing.T) {
		prev, found := -1, false
		for _, e := range middle {
			if !fullRowPrint(e) {
				prev = -1 // coverage is missing; do not difference across it
				continue
			}
			n := countLines(text("checked", "middle", e.Ordinal), capacityLoad)
			if prev >= 0 && n < prev {
				if e.Ordinal != 74 || n-prev != -5 {
					t.Fatalf("first decrease at %d: %d", e.Ordinal, n-prev)
				}
				found = true
				break
			}
			prev = n
		}
		if !found {
			t.Fatal("no decrease found")
		}
	})
	t.Run("09-10 SROA promotes sixteen allocas to SSA values", func(t *testing.T) {
		five, six := text("checked", "middle", 5), text("checked", "middle", 6)
		if got := []int{countLines(five, " = alloca "), countLines(six, " = alloca "), countLines(six, " = phi ")}; got[0] != 16 || got[1] != 0 || got[2] != 3 {
			t.Fatalf("alloca %d -> %d, phi %d", got[0], got[1], got[2])
		}
		if middle[6].Pass != "SROAPass" || !fullRowPrint(middle[5]) || !fullRowPrint(middle[6]) {
			t.Fatal(middle[5], middle[6])
		}
	})
	t.Run("12 the initial module has no source locations", func(t *testing.T) {
		module, digest, err := a.InitialModule("checked")
		if err != nil || len(digest) != 64 || strings.Contains(module, "!DILocation(") || strings.Contains(module, "!DICompileUnit(") {
			t.Fatalf("debug metadata present or unreadable: %v", err)
		}
	})
}

func TestWorkbookOracleComplexOptimizations(t *testing.T) {
	a := actualArchive(t)
	t.Run("14-16 only the second register rewriter leaves no virtual registers", func(t *testing.T) {
		backend, err := a.Events("checked", "backend")
		if err != nil {
			t.Fatal(err)
		}
		var rows []int
		for _, e := range backend {
			body, err := a.Text("checked", "backend", e.Ordinal)
			if err != nil {
				t.Fatal(err)
			}
			if e.Pass == "virtregrewriter" && strings.Contains(body, "# Machine code for function row:") {
				rows = append(rows, e.Ordinal)
				if got, want := strings.Contains(strings.SplitN(body, "\n", 3)[1], "NoVRegs"), e.Ordinal == 78; got != want {
					t.Fatalf("ordinal %d NoVRegs %v", e.Ordinal, got)
				}
			}
		}
		// Two matches: a select-one convenience must report ambiguity, and
		// comparing 74 with 78 spans an interval of other passes.
		if len(rows) != 2 || rows[0] != 74 || rows[1] != 78 {
			t.Fatal(rows)
		}
	})
	total := func(profile, arm, counter string) float64 {
		t.Helper()
		raw, err := a.Profile(profile)
		if err != nil {
			t.Fatal(err)
		}
		v, ok := raw.(map[string]interface{})[arm].(map[string]interface{})["totals"].(map[string]interface{})[counter].(float64)
		if !ok {
			t.Fatalf("%s/%s/%s missing", profile, arm, counter)
		}
		return v
	}
	t.Run("18-20 executed guest instructions are per arm totals", func(t *testing.T) {
		if gcc, llvm := total("execution", "checked-gcc", "instructions"), total("execution", "checked-llvm", "instructions"); gcc != 1136142 || llvm != 1233611 {
			t.Fatal(gcc, llvm)
		}
		if stack := total("typed", "stock", "stackLoads") + total("typed", "stock", "stackStores"); stack != 1290106 {
			t.Fatal(stack)
		}
		if packets := total("typed", "pie", "packets"); packets != 3135 {
			t.Fatal(packets)
		}
	})
	t.Run("21 strength-reduction ablation", func(t *testing.T) {
		off, on := total("execution", "checked-llc-nolsr", "instructions"), total("execution", "checked-llc", "instructions")
		if pct := 100 * (on - off) / off; off != 1275560 || on != 1233611 || on-off != -41949 || math.Abs(pct+3.2886) > 5e-4 {
			t.Fatal(off, on, pct)
		}
	})
	t.Run("17 22 26 absent evidence is an error, not an empty answer", func(t *testing.T) {
		// The ablation arm has emulator totals but no captured pipeline, so a
		// machine-state observation cannot be attributed to it.
		if _, err := a.Events("checked-llc-nolsr", "backend"); err == nil || !strings.Contains(err.Error(), "checked") {
			t.Fatalf("disabled arm has an event source: %v", err)
		}
		if _, err := a.Profile("remarks"); err == nil || !strings.Contains(err.Error(), "available") {
			t.Fatalf("missing remarks artifact: %v", err)
		}
	})
}
