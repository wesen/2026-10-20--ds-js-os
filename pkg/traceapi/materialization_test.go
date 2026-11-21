package traceapi_test

// The q.run boundary between lazy plans and values that are already materialized.
// Observed failures (repro.json, two blinded investigators):
//   q.run(profiles.arm("checked-llc-nolsr").describe())  → [notAPlan] "got object", fix: q.run(a.events().count())
//   profiles.arm("checked-llc-nolsr").describe().arm     → "checked-llc-nolsr" (direct use worked)
// Run with: go test -run Materialization

import (
	"encoding/json"
	"strings"
	"testing"
)

// The probe evaluates a JS function body and returns its value, or the thrown QueryError's
// code / got / message / fix, as JSON. No host code beyond session and loadArchive.
const materializationProbeJS = `globalThis.__materializationProbe = function (thunk) {
  try { return JSON.stringify({ ok: true, value: thunk() }); }
  catch (e) {
    return JSON.stringify({ ok: false, code: (e && e.code) || "", got: (e && e.got) || "",
      message: String(e && e.message), fix: (e && e.fix) || "" });
  }
};`

// Fixtures for every probe body. The arm is the one the investigators used.
const materializationPrelude = `
  const sel = profiles.arm("checked-llc-nolsr");
  const names = Object.keys(sel.describe().totals);
  const metric = names.indexOf("instructions") >= 0 ? "instructions" : names[0];
  const t = sel.total(metric);
  const v = a.variants()[0].variant;
  const fns = a.variant(v).functions();
  const f = fns.indexOf("row") >= 0 ? "row" : fns[0];
`

// The baseline's only advice for every non-plan, unrelated to what was passed.
const baselineNotAPlanFix = "q.run(a.events().count())"

type materializationReply struct {
	OK      bool            `json:"ok"`
	Value   json.RawMessage `json:"value"`
	Code    string          `json:"code"`
	Got     string          `json:"got"`
	Message string          `json:"message"`
	Fix     string          `json:"fix"`
}

type materializationSession struct {
	raw func(src string) (string, error)
}

func newMaterializationSession(t *testing.T) materializationSession {
	t.Helper()
	vm := session(t, loadArchive(t))
	if _, err := vm.RunString(materializationProbeJS); err != nil {
		t.Fatalf("install probe: %v", err)
	}
	return materializationSession{raw: func(src string) (string, error) {
		v, err := vm.RunString(src)
		if err != nil {
			return "", err
		}
		return v.String(), nil
	}}
}

func (s materializationSession) probe(t *testing.T, body string) materializationReply {
	t.Helper()
	out, err := s.raw("__materializationProbe(function () {" + materializationPrelude + body + "\n})")
	if err != nil {
		t.Fatalf("probe did not run: %v\n%s", err, body)
	}
	var r materializationReply
	if err := json.Unmarshal([]byte(out), &r); err != nil {
		t.Fatalf("probe reply %q: %v", out, err)
	}
	return r
}

func wantValue(t *testing.T, r materializationReply, want string) {
	t.Helper()
	if !r.OK {
		t.Fatalf("want value %s, got [%s] got=%q: %s", want, r.Code, r.Got, r.Message)
	}
	if string(r.Value) != want {
		t.Fatalf("value = %s, want %s", r.Value, want)
	}
}

func wantText(t *testing.T, r materializationReply) string {
	t.Helper()
	if !r.OK {
		t.Fatalf("want text, got [%s]: %s", r.Code, r.Message)
	}
	var s string
	if err := json.Unmarshal(r.Value, &s); err != nil {
		t.Fatalf("value %s is not a string: %v", r.Value, err)
	}
	return s
}

// A refusal must be an error (never a value a scientist could read as zero), carry the expected
// code and err.got, give a non-empty fix other than the baseline's unrelated example, and
// mention what the caller needs.
func wantRefusal(t *testing.T, r materializationReply, code, got string, mentions ...string) {
	t.Helper()
	if r.OK {
		t.Fatalf("want [%s] got=%q, but the call returned a value: %s", code, got, r.Value)
	}
	if r.Code != code || r.Got != got {
		t.Fatalf("code=%q got=%q, want code=%q got=%q\n%s\n  fix: %s", r.Code, r.Got, code, got, r.Message, r.Fix)
	}
	if r.Fix == "" || r.Fix == baselineNotAPlanFix {
		t.Errorf("fix %q is not specific to the argument\n%s", r.Fix, r.Message)
	}
	text := r.Message + "\n" + r.Fix
	for _, m := range mentions {
		if !strings.Contains(text, m) {
			t.Errorf("refusal does not mention %q:\n%s", m, text)
		}
	}
}

type refusalCase struct {
	name, body, code, got string
	mentions              []string
}

func runRefusals(t *testing.T, s materializationSession, cases []refusalCase) {
	t.Helper()
	for _, c := range cases {
		c := c
		t.Run(c.name, func(t *testing.T) { wantRefusal(t, s.probe(t, c.body), c.code, c.got, c.mentions...) })
	}
}

// Observed failure 1 and the still-working direct use (observed 2), through the REPL's own path.
func TestMaterializationObservedDescriptorRun(t *testing.T) {
	s := newMaterializationSession(t)
	if _, err := s.raw(`q.run(profiles.arm("checked-llc-nolsr").describe())`); err != nil {
		t.Fatalf("repro source still fails: %v", err)
	}
	for _, src := range []string{
		`q.run(profiles.arm("checked-llc-nolsr").describe()).arm`,
		`profiles.arm("checked-llc-nolsr").describe().arm`,
	} {
		got, err := s.raw(src)
		if err != nil || got != "checked-llc-nolsr" {
			t.Fatalf("%s = %q, %v; want checked-llc-nolsr", src, got, err)
		}
	}
}

func TestMaterializationDescriptorIsIdempotent(t *testing.T) {
	s := newMaterializationSession(t)
	t.Run("same object, empty options allowed", func(t *testing.T) {
		wantValue(t, s.probe(t, `const d = sel.describe(); return q.run(d) === d && q.run(d, {}) === d && q.run(d, undefined) === d;`), "true")
	})
	t.Run("same content as direct describe", func(t *testing.T) {
		wantValue(t, s.probe(t, `return JSON.stringify(q.run(sel.describe())) === JSON.stringify(sel.describe());`), "true")
	})
	t.Run("fluent chain", func(t *testing.T) {
		wantValue(t, s.probe(t, `return q.run(sel.describe()).totals[metric] === sel.describe().totals[metric];`), "true")
	})
	t.Run("region and workload chain", func(t *testing.T) {
		wantValue(t, s.probe(t, `const d = sel.region("row").workload("opening-160-rows").describe(); return q.run(d) === d;`), "true")
	})
	t.Run("initial module descriptor", func(t *testing.T) {
		r := s.probe(t, `let d; try { d = a.variant(v).initialModule().describe(); } catch (e) { return "skip: " + e.message; } return q.run(d) === d;`)
		if r.OK && strings.HasPrefix(string(r.Value), `"skip: `) {
			t.Skipf("archive has no initial module: %s", r.Value)
		}
		wantValue(t, r, "true")
	})
}

func TestMaterializationResultsAreIdempotent(t *testing.T) {
	s := newMaterializationSession(t)
	wantValue(t, s.probe(t, `const r = q.run(t); return r.kind === "total" && q.run(r) === r;`), "true")
	wantValue(t, s.probe(t, `const r = t.run(); return q.run(r) === r;`), "true")
	wantValue(t, s.probe(t, `const b = q.run({ x: t }); return q.run(b.outputs.x) === b.outputs.x && q.run(b) === b;`), "true")
}

func TestMaterializationRefusals(t *testing.T) {
	s := newMaterializationSession(t)
	runRefusals(t, s, []refusalCase{
		// Options cannot change a value that already exists.
		{"descriptor with options", `return q.run(sel.describe(), { maxRows: 5 });`, "alreadyMaterialized", "descriptor",
			[]string{`profiles.arm("checked-llc-nolsr").describe()`, "drop the options"}},
		{"result with options", `return q.run(q.run(t), { maxRows: 5 });`, "alreadyMaterialized", "result",
			[]string{`q.run(profiles.arm("checked-llc-nolsr").total(`, "maxRows"}},
		// The tag is identity, not shape: lookalikes are refused.
		{"copied descriptor", `return q.run(Object.assign({}, sel.describe()));`, "notAPlan", "object", []string{"carry no tag", "arm"}},
		{"JSON round trip", `return q.run(JSON.parse(JSON.stringify(sel.describe())));`, "notAPlan", "object", []string{"carry no tag"}},
		{"hand-built object", `return q.run({ arm: "checked-llc-nolsr" });`, "notAPlan", "object", []string{"keys arm"}},
		{"empty object", `return q.run({});`, "notAPlan", "object", []string{"empty object"}},
		{"descriptor inside a bundle", `return q.run({ total: t, info: sel.describe() });`, "notAPlan", "bundleMember",
			[]string{`"info" is the descriptor profiles.arm("checked-llc-nolsr").describe()`, "every value is a plan"}},
		// Accidental undefined, null and plain values: nothing was evaluated, never a zero.
		{"misspelled descriptor field", `return q.run(sel.describe().total);`, "notAPlan", "undefined", []string{"got undefined", "not a zero", "describe().totals"}},
		{"no argument", `return q.run();`, "notAPlan", "noArgument", []string{"no argument"}},
		{"null", `return q.run(null);`, "notAPlan", "null", []string{"not a zero"}},
		{"zero", `return q.run(0);`, "notAPlan", "number", []string{"the number 0", ".total("}},
		{"number read from a descriptor", `return q.run(sel.describe().totals[metric]);`, "notAPlan", "number", []string{"without unit"}},
		{"boolean", `return q.run(true);`, "notAPlan", "boolean", []string{"the boolean true"}},
		{"plan label from describe()", `return q.run(t.describe());`, "notAPlan", "string", []string{"label", "q.run(plan)"}},
		// JS functions: a method reference without its call is not a value.
		{"method without call", `return q.run(sel.total);`, "notAPlan", "function", []string{"the function total itself", ".total("}},
		{"describe without call", `return q.run(sel.describe);`, "notAPlan", "function", []string{"the function describe itself", ".describe()"}},
		{"lambda", `return q.run(() => 0);`, "notAPlan", "function", []string{"anonymous function", ".where("}},
		{"eager listing", `return q.run(profiles.arms());`, "notAPlan", "array", []string{"profiles.arms()"}},
		{"array of plans", `return q.run([t, t]);`, "notAPlan", "arrayOfPlans", []string{"q.run({ first: p1, second: p2 })"}},
	})
}

// Function handles and other navigation handles are named as such, distinct from undefined.
func TestMaterializationNamesHandles(t *testing.T) {
	s := newMaterializationSession(t)
	runRefusals(t, s, []refusalCase{
		{"function handle", `return q.run(a.variant(v).function(f));`, "notAPlan", "functionHandle", []string{"function handle", `.function("`, ".timeline("}},
		{"typo on a function handle is undefined, not a handle", `return q.run(a.variant(v).function(f).timelin);`, "notAPlan", "undefined", []string{"not a zero"}},
		{"run handle", `return q.run(a.variant(v));`, "notAPlan", "run", []string{".events("}},
		{"profile selection", `return q.run(sel);`, "notAPlan", "profileSelection",
			[]string{`q.run(profiles.arm("checked-llc-nolsr").total(`, `profiles.arm("checked-llc-nolsr").describe()`}},
		{"metric without state", `return q.run(q.ir.instructions().opcode("load").count());`, "notAPlan", "metric", []string{".at("}},
		{"instruction selector", `return q.run(q.ir.instructions().opcode("load"));`, "notAPlan", "instructionQuery", []string{".count()"}},
		{"parameter", `return q.run(q.param.int("minimum", { min: 1, max: 16, default: 1 }));`, "notAPlan", "param", []string{"bindings: { minimum"}},
		{"archive", `return q.run(a);`, "notAPlan", "archive", []string{"a.events().count()"}},
		{"profiles facade", `return q.run(profiles);`, "notAPlan", "profiles", []string{"profiles.arms()"}},
		{"namespace", `return q.run(q.ir);`, "notAPlan", "namespace", []string{"q.ir.help()"}},
	})
}

// Unknown or misplaced arguments to q.run were silently ignored by the baseline.
func TestMaterializationUnknownArguments(t *testing.T) {
	s := newMaterializationSession(t)
	runRefusals(t, s, []refusalCase{
		{"second plan as options", `return q.run(t, t);`, "badArgument", "planAsOptions", []string{"q.run({ first: p1, second: p2 })"}},
		{"descriptor as options", `return q.run(t, sel.describe());`, "badArgument", "planAsOptions", []string{"the descriptor"}},
		{"misspelled bindings", `return q.run(t, { bindigns: {} });`, "unknownOption", "", []string{`Did you mean "bindings"`}},
		{"misspelled maxRows", `return q.run(t, { maxrows: 5 });`, "unknownOption", "", []string{`Did you mean "maxRows"`}},
		{"number as options", `return q.run(t, 5);`, "badArgument", "badOptions", []string{"the number 5"}},
		{"string as options", `return q.run(t, "checked-llc");`, "badArgument", "badOptions", []string{"string"}},
		{"zero maxRows", `return q.run(t, { maxRows: 0 });`, "badArgument", "badOptions", []string{"positive integer"}},
		{"bindings not an object", `return q.run(t, { bindings: "arm" });`, "badArgument", "badOptions", []string{"bindings must be an object"}},
		{"three arguments", `return q.run(t, {}, {});`, "badArgument", "extraArguments", []string{"3 arguments"}},
		// Unknown arm names fail in the eager call itself, with a suggestion, before q.run is reached.
		{"unknown arm", `return q.run(profiles.arm("checked-llc-nolsrr").describe());`, "unknownArm", "", []string{`Did you mean "checked-llc-nolsr"`}},
		{"eager describe on a parameter arm", `const arm = q.param.choice("arm", ["checked-llc", "checked-llc-nolsr"]); return profiles.arm(arm).describe();`,
			"unboundParam", "", []string{"eager", "bindings: { arm"}},
		// Combinators share the diagnostics for materialized values and undefined.
		{"q.add of a descriptor", `return q.add(sel.describe(), t);`, "notAPlan", "", []string{"the descriptor profiles.arm(", "already a value"}},
		{"q.compare of undefined", `return q.compare(undefined, t);`, "notAPlan", "", []string{"not a zero"}},
	})
}

func TestMaterializationValidPlansUnchanged(t *testing.T) {
	s := newMaterializationSession(t)
	wantValue(t, s.probe(t, `const r = q.run(t); return r.kind === "total" && r.arm === "checked-llc-nolsr" && r.metric === metric;`), "true")
	wantValue(t, s.probe(t, `return t.run().value === q.run(t).value;`), "true")
	wantValue(t, s.probe(t, `const b = q.run({ x: t }); return b.kind === "bundle" && b.outputs.x.kind === "total";`), "true")
	wantValue(t, s.probe(t, `return q.run(t, { maxRows: 10, bindings: {} }).kind;`), `"total"`)
	wantValue(t, s.probe(t, `const arm = q.param.choice("arm", ["checked-llc", "checked-llc-nolsr"]);
		return q.run(profiles.arm(arm).total(metric), { bindings: { arm: "checked-llc-nolsr" } }).arm;`), `"checked-llc-nolsr"`)
	wantValue(t, s.probe(t, `return Array.isArray(sel.totals()) && sel.samples() === sel.samples();`), "true")
}

func TestMaterializationHelpStatesContract(t *testing.T) {
	s := newMaterializationSession(t)
	plans := wantText(t, s.probe(t, `return q.help("plans");`))
	for _, m := range []string{"q.run(d) === d", "never by its shape", "alreadyMaterialized", "functionHandle", "undefined", "never a zero"} {
		if !strings.Contains(plans, m) {
			t.Errorf(`q.help("plans") lacks %q:\n%s`, m, plans)
		}
	}
	if alias := wantText(t, s.probe(t, `return q.help("describe");`)); alias != plans {
		t.Errorf(`q.help("describe") should be the plans topic`)
	}
	checks := map[string][]string{
		`q.help("profiles")`: {"eager", `q.help("plans")`},
		`sel.help()`:         {"eager", `q.help("plans")`},
		`q.help("errors")`:   {"alreadyMaterialized", "unknownOption", "err.got"},
		`q.help()`:           {`"plans"`},
	}
	for src, ms := range checks {
		text := wantText(t, s.probe(t, "return "+src+";"))
		for _, m := range ms {
			if !strings.Contains(text, m) {
				t.Errorf("%s lacks %q:\n%s", src, m, text)
			}
		}
	}
}
