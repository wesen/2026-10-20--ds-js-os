package traceapi_test

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"testing"
)

// Regression for a false attribution by an independent researcher: typed-scalar was read as a
// dedicated stack-placement treatment, typed-pie as a stack-traffic intervention, and the
// checked-GCC rowBytes as the length of the pixel output. profiles.arm(id).describe() must say
// what each arm is, which counts are static or dynamic, what a pair isolates, and what the
// inputs cannot attribute. No corpus numbers are hard-coded here.
func TestProfileArmTreatmentMetadata(t *testing.T) {
	type fieldMeaning struct {
		Scope   string `json:"scope"`
		Meaning string `json:"meaning"`
		IsNot   string `json:"isNot"`
	}
	type pair struct {
		Before    string `json:"before"`
		After     string `json:"after"`
		Isolates  string `json:"isolates"`
		HeldEqual string `json:"heldEqual"`
	}
	type description struct {
		Arm    string `json:"arm"`
		Source struct {
			Profile string `json:"profile"`
			Entry   string `json:"entry"`
		} `json:"source"`
		RowBytes *float64 `json:"rowBytes"`
		Contract struct {
			Value *string `json:"value"`
		} `json:"contract"`
		Treatment struct {
			ID         string `json:"id"`
			Status     string `json:"status"`
			Role       string `json:"role"`
			Design     string `json:"design"`
			Build      string `json:"build"`
			NotA       string `json:"notA"`
			Provenance struct {
				Kind     string   `json:"kind"`
				Measured *bool    `json:"measured"`
				Basis    []string `json:"basis"`
			} `json:"provenance"`
		} `json:"treatment"`
		CountsCover struct {
			Treatment string `json:"treatment"`
			Workload  string `json:"workload"`
			Counter   string `json:"counter"`
		} `json:"countsCover"`
		Fields          map[string]fieldMeaning `json:"fields"`
		Comparisons     []pair                  `json:"comparisons"`
		CannotAttribute []string                `json:"cannotAttribute"`
		Timing          string                  `json:"timing"`
	}

	vm := session(t, loadArchive(t))
	jsonOf := func(expr string) string {
		t.Helper()
		return fmt.Sprint(value(t, vm, "JSON.stringify("+expr+")"))
	}
	eval := func(expr string, out any) {
		t.Helper()
		raw := jsonOf(expr)
		if err := json.Unmarshal([]byte(raw), out); err != nil {
			t.Fatalf("%s: %v\n%s", expr, err, raw)
		}
	}
	describe := func(arm string) description {
		t.Helper()
		var d description
		eval(fmt.Sprintf("profiles.arm(%q).describe()", arm), &d)
		return d
	}
	has := func(what, s, sub string) {
		t.Helper()
		if !strings.Contains(s, sub) {
			t.Errorf("%s = %q; want it to mention %q", what, s, sub)
		}
	}
	pairOf := func(d description, before, after string) pair {
		t.Helper()
		for _, p := range d.Comparisons {
			if p.Before == before && p.After == after {
				return p
			}
		}
		t.Errorf("%s: no comparison %s → %s in %+v", d.Arm, before, after, d.Comparisons)
		return pair{}
	}

	// Treatment identity is bound to the profile source and entry, and labelled as curated
	// study/capture metadata rather than a measurement.
	identity := map[string][2]string{
		"typed-stock": {"typed", "stock"}, "typed-scalar": {"typed", "scalar"}, "typed-pie": {"typed", "pie"},
		"checked-gcc": {"execution", "checked-gcc"}, "checked-llc": {"execution", "checked-llc"},
		"checked-llc-nolsr": {"execution", "checked-llc-nolsr"},
	}
	descs := map[string]description{}
	for arm, src := range identity {
		d := describe(arm)
		descs[arm] = d
		if d.Arm != arm || d.Treatment.ID != arm || d.CountsCover.Treatment != arm {
			t.Errorf("%s: identity arm=%q treatment.id=%q countsCover.treatment=%q", arm, d.Arm, d.Treatment.ID, d.CountsCover.Treatment)
		}
		if d.Source.Profile != src[0] || d.Source.Entry != src[1] {
			t.Errorf("%s: source = %s[%q]; want %s[%q]", arm, d.Source.Profile, d.Source.Entry, src[0], src[1])
		}
		if d.Treatment.Status != "described" {
			t.Errorf("%s: treatment.status = %q; want described", arm, d.Treatment.Status)
		}
		pv := d.Treatment.Provenance
		if pv.Kind != "study/capture metadata" || pv.Measured == nil || *pv.Measured || len(pv.Basis) == 0 {
			t.Errorf("%s: provenance = %+v; want study/capture metadata, measured=false, a basis", arm, pv)
		}
		if d.CountsCover.Workload == "" || d.CountsCover.Counter == "" {
			t.Errorf("%s: countsCover lacks workload or counter: %+v", arm, d.CountsCover)
		}
		limits := strings.Join(d.CannotAttribute, " | ")
		for _, want := range []string{"stack slot", "spill", "individual optimization", "board time"} {
			has(arm+" cannotAttribute", limits, want)
		}
		has(arm+" timing", d.Timing, "emulator counts")
	}

	stock, scalar, pie := descs["typed-stock"], descs["typed-scalar"], descs["typed-pie"]
	has("typed-stock role", stock.Treatment.Role, "baseline")
	has("typed-stock build", stock.Treatment.Build, "pieLoops: undefined")
	has("typed-scalar role", scalar.Treatment.Role, "matched scalar control")
	has("typed-scalar build", scalar.Treatment.Build, `pieLoops: "scalar"`)
	has("typed-scalar notA", scalar.Treatment.NotA, "stack-placement")
	has("typed-pie build", pie.Treatment.Build, `pieLoops: "pie"`)
	has("typed-pie design", pie.Treatment.Design, "subtraction")
	has("typed-pie notA", pie.Treatment.NotA, "stack traffic")
	for _, d := range []description{scalar, pie} {
		if strings.Contains(d.Treatment.Role, "stack") {
			t.Errorf("%s: role %q names stack placement as the design target", d.Arm, d.Treatment.Role)
		}
	}

	// What each pair isolates: producer only, a bundle, and the LSR ablation.
	p := pairOf(scalar, "typed-scalar", "typed-pie")
	has("scalar→pie isolates", p.Isolates, "packet producer only")
	has("scalar→pie heldEqual", p.HeldEqual, "fallback")
	has("stock→scalar isolates", pairOf(stock, "typed-stock", "typed-scalar").Isolates, "no single change")
	for _, arm := range []string{"checked-llc", "checked-llc-nolsr"} {
		p := pairOf(descs[arm], "checked-llc-nolsr", "checked-llc")
		has(arm+" LSR isolates", p.Isolates, "Loop Strength Reduction")
		has(arm+" LSR heldEqual", p.HeldEqual, "only -disable-lsr differs")
	}
	if c := descs["checked-gcc"].Comparisons; len(c) != 0 {
		t.Errorf("checked-gcc claims comparisons the sources do not document as isolating: %+v", c)
	}

	// Static vs dynamic: rowBytes is linked code size, totals are executed emulator work.
	gcc := descs["checked-gcc"]
	if gcc.RowBytes == nil || gcc.Contract.Value == nil || *gcc.Contract.Value != "checked" {
		t.Errorf("checked-gcc: existing describe() fields rowBytes/contract changed: rowBytes=%v contract=%v", gcc.RowBytes, gcc.Contract.Value)
	}
	rb := gcc.Fields["rowBytes"]
	if rb.Scope != "static" {
		t.Errorf("checked-gcc fields.rowBytes.scope = %q; want static", rb.Scope)
	}
	has("checked-gcc rowBytes meaning", rb.Meaning, "nm -S")
	has("checked-gcc rowBytes meaning", rb.Meaning, "row symbol")
	has("checked-gcc rowBytes isNot", rb.IsNot, ".gold")
	has("checked-gcc rowBytes isNot", rb.IsNot, "output bytes")
	for _, arm := range []string{"checked-gcc", "checked-llc", "checked-llc-nolsr"} {
		f := descs[arm].Fields
		if f["totals.instructions"].Scope != "dynamic" || f["totals.stackLoads"].Scope != "dynamic" {
			t.Errorf("%s: totals must be dynamic: %+v", arm, f)
		}
		has(arm+" instructions meaning", f["totals.instructions"].Meaning, "QEMU")
		has(arm+" instructions isNot", f["totals.instructions"].IsNot, "board time")
	}
	for _, d := range []description{stock, scalar, pie} {
		ins := d.Fields["totals.instructions"]
		if ins.Scope != "dynamic" {
			t.Errorf("%s: totals.instructions.scope = %q; want dynamic", d.Arm, ins.Scope)
		}
		has(d.Arm+" instructions meaning", ins.Meaning, "interpreter steps")
		has(d.Arm+" instructions isNot", ins.IsNot, "board time")
		if d.RowBytes != nil || d.Fields["rowBytes"].Scope != "static" {
			t.Errorf("%s: rowBytes=%v fields.rowBytes=%+v; want null value described as static and absent", d.Arm, d.RowBytes, d.Fields["rowBytes"])
		}
		has(d.Arm+" rowBytes meaning", d.Fields["rowBytes"].Meaning, "absent")
	}
	has("typed-pie packets meaning", pie.Fields["totals.packets"].Meaning, "packed scratch stores")

	// An arm whose build the sources do not describe says so instead of inventing one.
	llvm := describe("checked-llvm")
	if llvm.Treatment.Status != "partial" {
		t.Errorf("checked-llvm: treatment.status = %q; want partial", llvm.Treatment.Status)
	}
	has("checked-llvm build", llvm.Treatment.Build, "not described")

	// The curated metadata carries no hashes; digests stay in source.digest from the bridge.
	hexRun := regexp.MustCompile(`\b[0-9a-f]{7,}\b`)
	for arm := range identity {
		meta := jsonOf(fmt.Sprintf(`(() => { const d = profiles.arm(%q).describe();
			return [d.treatment, d.countsCover, d.fields, d.comparisons, d.cannotAttribute, d.timing]; })()`, arm))
		for _, m := range hexRun.FindAllString(meta, -1) {
			if strings.ContainsAny(m, "0123456789") {
				t.Errorf("%s: treatment metadata contains a hash-like token %q", arm, m)
			}
		}
	}

	// Discoverable in help, without exact numerical answers. Digits inside public identifiers
	// (the workload label "opening-160-rows") and the declared workload contract
	// "rowsVerified === <rows>" define the fixture; they are not measured answers. A measured total
	// can coincide with the workload size, so only those two forms are removed, and only
	// standalone numeric tokens of the remaining prose are matched against the corpus values.
	var h struct {
		Help            string   `json:"help"`
		ArmHelp         string   `json:"armHelp"`
		Leaked          []string `json:"leaked"`
		SeenCount       int      `json:"seenCount"`
		Probe           []string `json:"probe"`
		Coincident      []string `json:"coincident"`
		ProbeCoincident []string `json:"probeCoincident"`
	}
	eval(`(() => {
		const help = q.help("profiles"), seen = {}, rows = {};
		profiles.arms().forEach(x => {
			const d = profiles.arm(x.arm).describe();
			Object.keys(d.totals).forEach(k => { const v = d.totals[k]; if (typeof v === "number" && v >= 100) seen[String(v)] = true; });
			if (typeof d.rowBytes === "number" && d.rowBytes >= 100) seen[String(d.rowBytes)] = true;
			if (typeof d.rowsVerified === "number") rows[String(d.rowsVerified)] = true;
		});
		const ids = profiles.arms().map(x => x.arm).concat(profiles.workloads().map(w => w.workload)).filter(n => /\d/.test(n));
		const scrub = text => {
			let s = text;
			ids.forEach(n => { s = s.split(n).join("<id>"); });
			return s.replace(/rowsVerified\s*===\s*(\d+)/g, (m, n) => (rows[n] ? "rowsVerified === <rows>" : m));
		};
		const leaks = text => {
			const out = [];
			scrub(text).replace(/(^|[^\w-])(\d[\d,]*\d|\d)(?![\w-])/g, (m, pre, num) => { const v = num.replace(/,/g, ""); if (seen[v]) out.push(v); return m; });
			return out;
		};
		const values = Object.keys(seen), coincident = Object.keys(rows).filter(n => seen[n]);
		return { help, armHelp: profiles.arm("typed-pie").help(), leaked: leaks(help), seenCount: values.length,
			probe: values.length ? leaks(help + "\nexample: " + values[0] + " stack loads.") : [],
			coincident, probeCoincident: coincident.length ? leaks(help + "\nexample: executes " + coincident[0] + " stack loads") : [] };
	})()`, &h)
	for _, want := range []string{"describe().treatment", "study/capture metadata", "rowBytes is static", "board time", "stack slot"} {
		has(`q.help("profiles")`, h.Help, want)
	}
	has(`profiles.arm("typed-pie").help()`, h.ArmHelp, "describe().treatment")
	has(`q.help("profiles")`, h.Help, "opening-160-rows") // the public fixture identifier stays documented
	if len(h.Leaked) != 0 {
		t.Errorf(`q.help("profiles") contains standalone corpus values %v; help must not carry numerical answers`, h.Leaked)
	}
	// The matcher must still catch real answers, including a total equal to the workload size.
	if h.SeenCount == 0 || len(h.Probe) == 0 {
		t.Errorf("leak matcher is vacuous: %d corpus values, probe hits %v", h.SeenCount, h.Probe)
	}
	if len(h.Coincident) > 0 && len(h.ProbeCoincident) == 0 {
		t.Errorf("a standalone total equal to the workload size (%v) is not detected outside the identifier", h.Coincident)
	}
}
