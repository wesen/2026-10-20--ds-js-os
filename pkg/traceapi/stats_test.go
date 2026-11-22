package traceapi

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/dop251/goja"
)

func statsVM(t *testing.T) *goja.Runtime {
	t.Helper()
	vm := goja.New()
	if err := InstallStats(vm); err != nil {
		t.Fatal(err)
	}
	// Six blocks, two arms: the shape of a PicoCalc board trial.
	if _, err := vm.RunString(`const rows = [
	  {block: 0, arm: 0, value: 100}, {block: 0, arm: 1, value: 90},
	  {block: 1, arm: 0, value: 110}, {block: 1, arm: 1, value: 99},
	  {block: 2, arm: 0, value: 120}, {block: 2, arm: 1, value: 96},
	  {block: 3, arm: 0, value: 100}, {block: 3, arm: 1, value: 105},
	  {block: 4, arm: 0, value: 200}, {block: 4, arm: 1, value: 150},
	  {block: 5, arm: 0, value: 100}, {block: 5, arm: 1, value: 100},
	  {block: 0, arm: 2, value: 1}]`); err != nil {
		t.Fatal(err)
	}
	return vm
}

func TestStatsFixtures(t *testing.T) {
	vm := statsVM(t)
	for expr, want := range map[string]string{
		"stats.median([3, 1, 2])":            "2",
		"stats.median([4, 1, 3, 2])":         "2.5",
		"stats.median([7])":                  "7",
		"stats.mean([1, 2, 3, 6])":           "3",
		"stats.quantile([1, 2, 3, 4], 0.25)": "1.75",
		"stats.summary([5, 1, 4, 2, 3])":     `{"n":5,"min":1,"q1":2,"median":3,"q3":4,"max":5,"mean":3}`,
		"stats.percentSaved(200, 150)":       "25",
		// The input is not reordered.
		"const xs = [3, 1, 2]; stats.median(xs); xs": "[3,1,2]",
	} {
		v, err := vm.RunString("JSON.stringify(" + expr + ")")
		if strings.HasPrefix(expr, "const") {
			v, err = vm.RunString("(() => { " + strings.Replace(expr, "; xs", "; return JSON.stringify(xs)", 1) + " })()")
		}
		if err != nil || v.String() != want {
			t.Errorf("%s = %v (%v); want %s", expr, v, err, want)
		}
	}
}

func TestStatsPairedComparison(t *testing.T) {
	vm := statsVM(t)
	v, err := vm.RunString(`JSON.stringify(stats.paired(rows, {key: 'block', control: r => r.arm === 0, candidate: r => r.arm === 1, value: 'value'}))`)
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		Pairs                 int
		ControlMedian         float64
		CandidateMedian       float64
		MedianPercentSaved    float64
		PercentSavedOfMedians float64
		Wins, Losses, Ties    int
		Better, Method        string
		PerPair               []struct {
			Key          float64
			PercentSaved float64
		}
	}
	if err := json.Unmarshal([]byte(v.String()), &got); err != nil {
		t.Fatal(err)
	}
	// Per-block savings: 10, 10, 20, -5, 25, 0 percent. Their median is 10. The
	// medians of the arms are 105 and 99.5, a 5.24% change: a different number.
	if got.Pairs != 6 || got.ControlMedian != 105 || got.CandidateMedian != 99.5 || !near(got.MedianPercentSaved, 10) ||
		got.Wins != 4 || got.Losses != 1 || got.Ties != 1 || got.Better != "lower" || len(got.PerPair) != 6 || !near(got.PerPair[3].PercentSaved, -5) {
		t.Fatalf("%+v", got)
	}
	if !near(got.PercentSavedOfMedians, 100*(1-99.5/105)) {
		t.Fatalf("percent of medians %v", got.PercentSavedOfMedians)
	}
	v, err = vm.RunString(`const h = stats.paired(rows, {key: r => r.block, control: r => r.arm === 0, candidate: r => r.arm === 1, value: r => r.value, better: 'higher'}); [h.wins, h.losses, h.ties].join()`)
	if err != nil || v.String() != "1,4,1" {
		t.Fatalf("higher is better: %v %v", v, err)
	}
}

func TestStatsRefusesWhatItCannotSummarize(t *testing.T) {
	vm := statsVM(t)
	for expr, want := range map[string]string{
		"stats.median([])":       "[empty]",
		"stats.median([1, NaN])": "[notFinite] median input[1] is NaN",
		"stats.median('12')":     "[notAnArray]",
		"stats.quantile([1], 2)": "[badArgument]",
		// Block 0 of arm 2 has no partner in arm 1.
		"stats.paired(rows, {key: 'block', control: r => r.arm === 2, candidate: r => r.arm === 1, value: 'value'})":                                     "[unmatchedKey] unpaired keys: control only none; candidate only 1, 2, 3, 4, 5",
		"stats.paired(rows, {key: 'block', control: r => r.arm !== 1, candidate: r => r.arm === 1, value: 'value'})":                                     "[duplicatePair] control has more than one row for key 0",
		"stats.paired(rows, {key: 'block', control: r => true, candidate: r => r.arm === 1, value: 'value'})":                                            "[ambiguousRow] rows 1, 3, 5",
		"stats.paired(rows, {key: 'block', control: r => r.arm === 9, candidate: r => r.arm === 8, value: 'value'})":                                     "[empty]",
		"stats.paired([{k: 'a', arm: 0, v: 0}, {k: 'a', arm: 1, v: 1}], {key: 'k', control: r => r.arm === 0, candidate: r => r.arm === 1, value: 'v'})": `[zeroControl] control value for key "a" is 0`,
		"stats.paired(rows, {key: 'block', control: r => r.arm === 0, candidate: r => r.arm === 1, value: 'missing'})":                                   "[notFinite] control value for key 0 is undefined",
	} {
		_, err := vm.RunString(expr)
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: %v; want %q", expr, err, want)
		}
	}
	if v, err := vm.RunString("stats.help()"); err != nil || !strings.Contains(v.String(), "stats.paired(rows") {
		t.Fatalf("help: %v %v", v, err)
	}
}

func near(x, y float64) bool { return x-y < 1e-9 && y-x < 1e-9 }
