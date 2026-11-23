package traceapi_test

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/dop251/goja"
)

// These tests pin the integration of query/*.js with the archive's actual bytes:
// normalized index headers, loop-pass scopes that name only a header block,
// and dump ranges that end with the next pass's announcement.

func jsonValue(t *testing.T, vm *goja.Runtime, expr string, into any) {
	t.Helper()
	v := value(t, vm, "JSON.stringify("+expr+")")
	if err := json.Unmarshal([]byte(v.String()), into); err != nil {
		t.Fatalf("%s: %v (%s)", expr, err, v)
	}
}

// The function catalog comes from the module given to the pipeline and the
// CGSCC headers, never from loop labels; every middle-end event has a scope.
func TestCatalogNamesOnlyModuleFunctions(t *testing.T) {
	vm := session(t, loadArchive(t))
	var checked, firmware, firmwareModule []string
	jsonValue(t, vm, `a.variant("checked").functions()`, &checked)
	jsonValue(t, vm, `a.variant("firmware").functions()`, &firmware)
	jsonValue(t, vm, `a.variant("firmware").initialModule().functions().sort()`, &firmwareModule)
	if strings.Join(checked, ",") != "element,row" {
		t.Fatalf("checked catalog: %v", checked)
	}
	if len(firmware) != 24 || strings.Join(firmware, ",") != strings.Join(firmwareModule, ",") {
		t.Fatalf("firmware catalog %d %v; module defines %v", len(firmware), firmware, firmwareModule)
	}
	var kinds map[string]int
	jsonValue(t, vm, `(() => { const k = {}; ["checked", "unchecked", "firmware"].forEach(v =>
	    q.run(a.variant(v).events("middle"), { maxRows: 5000 }).rows.forEach(e => { k[e.scope.kind] = (k[e.scope.kind] || 0) + 1; })); return k; })()`, &kinds)
	if len(kinds) != 4 || kinds["function"] == 0 || kinds["module"] == 0 || kinds["cgscc"] == 0 || kinds["loop"] != 42+42+438 {
		t.Fatalf("middle-end scope kinds: %v", kinds)
	}
	// A module pass whose name contains spaces is a module event, so it stays in every function timeline.
	var e struct {
		Pass  string
		Scope struct{ Kind string }
	}
	jsonValue(t, vm, `q.run(a.variant("checked").function("row").timeline("middle").at(26).select("pass", "scope"))`, &e)
	if e.Scope.Kind != "module" || !strings.Contains(e.Pass, "RequireAnalysisPass<") || !strings.Contains(e.Pass, ", ") {
		t.Fatalf("module pass with spaces: %+v", e)
	}
}

// Expectations for loop events, computed in the session from the event listing and the print
// bytes, never from the scope fields under test.
const loopEvidenceJS = `
function middleEvents(variant) {
  const sel = a.variant(variant).events("middle"), n = q.run(sel.count()).value;
  return q.run(sel, { maxRows: Math.max(n, 1) }).rows;
}
function middlePrint(variant, ordinal) { return q.run(a.variant(variant).events("middle").at(ordinal).text()).print; }
function hasBlockLabel(print, name) {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^(?:" + n + "|\"" + n + "\"):", "m").test(print);
}
// LLVM's loop printer: "; Preheader:" / "; Loop:" sections, no define line, not a module.
function isLoopFragment(print) {
  return /^; (Preheader|Loop):\s*$/m.test(print) && !/^; ModuleID = /m.test(print) && !/^define\b/m.test(print);
}
// The adopted tentative hint: the nearest earlier event of the same stream scoped to exactly one
// function, with no module-wide or multi-function event in between; null when there is none.
function expectedOwnerHints(events) {
  const out = new Map();
  let anchor = null;
  events.forEach(e => {
    const s = e.scope;
    if (s.kind === "function" && !s.resolvedFrom) anchor = { function: s.function, anchorOrdinal: e.ordinal };
    else if (s.kind === "cgscc") anchor = s.functions.length === 1 ? { function: s.functions[0], anchorOrdinal: e.ordinal } : null;
    else if (s.kind === "module") anchor = null;
    else if (s.kind === "loop" && s.functionEvidence.method !== "header") out.set(e.ordinal, anchor);
  });
  return out;
}
// Every bare loop of a variant: owner null on scope and event, no ownership method, and the hint
// exactly the expected tentative witness (or null without an anchor).
function loopOwnershipViolations(variant) {
  const events = middleEvents(variant), hints = expectedOwnerHints(events), bad = [];
  let bare = 0;
  events.forEach(e => {
    const s = e.scope;
    if (s.kind !== "loop") return;
    if (s.functionEvidence.method === "header") { if (!s.function) bad.push([e.ordinal, "header-named loop without its function"]); return; }
    bare++;
    if (!("function" in s) || s.function !== null || e.function !== null) bad.push([e.ordinal, "owner without proof", s.function, e.function]);
    if (s.functionEvidence.method !== "none") bad.push([e.ordinal, "functionEvidence.method", s.functionEvidence.method]);
    const want = hints.get(e.ordinal), got = s.ownerHint;
    if (want === null) { if (got !== null) bad.push([e.ordinal, "ownerHint without an anchor", got]); return; }
    if (!got || got.tentative !== true || got.method !== "passManagerAdjacency" || got.function !== want.function || got.anchorOrdinal !== want.anchorOrdinal)
      bad.push([e.ordinal, "ownerHint", got || null, want]);
  });
  return { bare, bad };
}
// Change rows: "known" only between consecutive original ordinals of the stream. Every other pair of
// available rows is a gap that names the stream events between them and carries no per-pass delta.
function changeViolations(variant, timeline, metrics) {
  const ordinals = new Set(middleEvents(variant).map(e => e.ordinal));
  const between = (lo, hi) => { const o = []; for (let k = lo + 1; k < hi; k++) if (ordinals.has(k)) o.push(k); return o; };
  const out = { rows: 0, known: 0, gaps: 0, bad: [] };
  metrics.forEach(m => q.run(timeline.measure(m).changes(), { maxRows: 100000 }).rows.forEach(c => {
    out.rows++;
    if (c.status === "known") {
      out.known++;
      if (c.ordinal !== c.from + 1) out.bad.push(["known across nonconsecutive ordinals", c.from, c.ordinal]);
      return;
    }
    if (c.delta !== null) out.bad.push([c.status + " row with a per-pass delta", c.from, c.ordinal, c.delta]);
    if (c.status !== "gap") return;
    out.gaps++;
    if (c.ordinal === c.from + 1) out.bad.push(["gap between consecutive ordinals", c.from, c.ordinal]);
    if (JSON.stringify(c.skippedOrdinals) !== JSON.stringify(between(c.from, c.ordinal))) out.bad.push(["gap witness", c.from, c.ordinal, c.skippedOrdinals]);
  }));
  return out;
}
`

// A bare loop header ("… on for.body29") names only the loop's header block. Neither the header
// nor the loop fragment proves which function owns the loop, so scope.function is null and every
// function timeline keeps the event. The nearest earlier single-function event is reported
// separately, as a tentative scope.ownerHint. A fragment cannot answer whole-function questions,
// and a change is known only between consecutive original stream ordinals.
func TestLoopPrintsHaveNoProvenOwnerAndBreakAdjacency(t *testing.T) {
	vm := session(t, loadArchive(t))
	value(t, vm, loopEvidenceJS)
	value(t, vm, `const run = a.variant("checked"), row = run.function("row"), middle = row.timeline("middle");
	  const header = q.ir.instructions().opcode("load").resultType("i32").pointer(row.argument(0)).count();`)
	var loop struct {
		Scope         map[string]any
		EventFunction any
		Expected      map[string]any
		Anchor        map[string]any
		FragmentPrint bool
		LabelInPrint  bool
		LabelInAnchor bool
		InTimelines   map[string]bool
	}
	jsonValue(t, vm, `(() => {
	  const scope = q.run(middle.at(98).select("scope")).scope, events = middleEvents("checked");
	  const hint = scope.ownerHint, print = middlePrint("checked", 98);
	  const anchor = hint ? events.find(e => e.ordinal === hint.anchorOrdinal) : null;
	  const inTimelines = {};
	  run.functions().forEach(f => { inTimelines[f] = q.run(run.function(f).timeline("middle").at(98)).ordinal === 98; });
	  return { scope, eventFunction: q.run(middle.at(98).select("function")).function,
	    expected: expectedOwnerHints(events).get(98) || null, anchor: anchor ? { ordinal: anchor.ordinal, scope: anchor.scope } : null,
	    fragmentPrint: isLoopFragment(print), labelInPrint: hasBlockLabel(print, scope.loop),
	    labelInAnchor: anchor ? hasBlockLabel(middlePrint("checked", anchor.ordinal), scope.loop) : null, inTimelines };
	})()`, &loop)
	s := loop.Scope
	if fn, hasFn := s["function"]; s["kind"] != "loop" || s["loop"] != "for.body29" || !hasFn || fn != nil || loop.EventFunction != nil {
		t.Fatalf("a bare loop's owner must be null, not inferred: %v (event function %v)", s, loop.EventFunction)
	}
	if ev, _ := s["functionEvidence"].(map[string]any); ev == nil || ev["method"] != "none" {
		t.Fatalf("functionEvidence: %v", s["functionEvidence"])
	}
	// Loop-fragment evidence, checked against the bytes: a loop fragment that contains the header block.
	if s["print"] != "loopFragment" || s["headerBlockInPrint"] != true || !loop.FragmentPrint || !loop.LabelInPrint {
		t.Fatalf("loop fragment evidence: print=%v headerBlockInPrint=%v; bytes: fragment=%v label=%v",
			s["print"], s["headerBlockInPrint"], loop.FragmentPrint, loop.LabelInPrint)
	}
	// Tentative anchor witness: the nearest earlier single-function event of the stream.
	hint, _ := s["ownerHint"].(map[string]any)
	if hint == nil || loop.Expected == nil || loop.Anchor == nil {
		t.Fatalf("ownerHint %v; expected anchor %v; anchor event %v", s["ownerHint"], loop.Expected, loop.Anchor)
	}
	if ao, ok := hint["anchorOrdinal"].(float64); !ok || ao >= 98 || hint["tentative"] != true || hint["method"] != "passManagerAdjacency" ||
		hint["function"] != loop.Expected["function"] || hint["anchorOrdinal"] != loop.Expected["anchorOrdinal"] {
		t.Fatalf("ownerHint %v, want the nearest earlier single-function event %v", hint, loop.Expected)
	}
	as, _ := loop.Anchor["scope"].(map[string]any)
	single := as["kind"] == "function" && as["function"] == hint["function"]
	if fs, ok := as["functions"].([]any); as["kind"] == "cgscc" && ok && len(fs) == 1 && fs[0] == hint["function"] {
		single = true
	}
	if !single {
		t.Fatalf("anchor event %v is not scoped to exactly %v", loop.Anchor, hint["function"])
	}
	// The optional cross-check reports what the anchor print contains; it supports, never proves.
	if hint["headerBlockInAnchorPrint"] != loop.LabelInAnchor {
		t.Fatalf("headerBlockInAnchorPrint %v, but the anchor print has the label: %v", hint["headerBlockInAnchorPrint"], loop.LabelInAnchor)
	}
	// Multiple-function coverage: an unowned loop stays in every function's timeline.
	if len(loop.InTimelines) < 2 {
		t.Fatalf("checked functions: %v", loop.InTimelines)
	}
	for f, in := range loop.InTimelines {
		if !in {
			t.Fatalf("loop 98 missing from %s's timeline: %v", f, loop.InTimelines)
		}
	}
	var rotated []any
	jsonValue(t, vm, `(s => [s.headerNote, s.headerBlockInPrint, hasBlockLabel(middlePrint("checked", 91), s.loop), "function" in s && s.function === null])(q.run(middle.at(91).select("scope")).scope)`, &rotated)
	if note, _ := rotated[0].(string); !strings.Contains(note, "LoopRotatePass") || rotated[1] != false || rotated[2] != false || rotated[3] != true {
		t.Fatalf("rotated header: %v", rotated)
	}
	var ordinals []int
	jsonValue(t, vm, `q.run(middle.ordinals()).ordinals.filter(o => o >= 86 && o <= 122)`, &ordinals)
	if len(ordinals) != 37 {
		t.Fatalf("row timeline skips loop events: %v", ordinals)
	}
	// Every bare loop of both small variants follows the same ownership contract.
	for _, variant := range []string{"checked", "unchecked"} {
		var own struct {
			Bare int
			Bad  []any
		}
		jsonValue(t, vm, `loopOwnershipViolations("`+variant+`")`, &own)
		if own.Bare == 0 || len(own.Bad) != 0 {
			t.Fatalf("%s loops (%d bare): %v", variant, own.Bare, own.Bad)
		}
	}
	// Workbook example 13: a loop print cannot answer a whole-function question. The state's
	// function is the metric's (row.argument(0)), not an owner inferred for the loop.
	var m []any
	jsonValue(t, vm, `(r => [r.status, r.reason, r.state.ordinal, r.state.function])(q.run(header.at(run.events("middle").where(e => e.scope.kind === "loop").first().after).requireCoverage("function")))`, &m)
	if m[0] != "unavailable" || m[1] != "loopFragment" || m[2] != float64(88) || m[3] != "row" {
		t.Fatalf("example 13: %v", m)
	}
	// A change is known only between consecutive original ordinals. Any other pair of available rows
	// is a conservative gap, whatever lies between them (other functions' events, loops of unknown owner,
	// ordinals missing from the capture, or rows a where() dropped).
	loads, allocas := `q.ir.instructions().opcode("load").count()`, `q.ir.instructions().opcode("alloca").count()`
	for _, c := range []struct {
		name, expr          string
		wantKnown, wantGaps bool
	}{
		{"row", `changeViolations("checked", middle, [header, ` + loads + `, ` + allocas + `])`, true, false},
		{"element", `changeViolations("checked", run.function("element").timeline("middle"), [` + loads + `, ` + allocas + `])`, false, false},
		{"row, even ordinals only", `changeViolations("checked", middle.where(e => e.ordinal % 2 === 0), [` + loads + `])`, false, true},
	} {
		var r struct {
			Rows, Known, Gaps int
			Bad               []any
		}
		jsonValue(t, vm, c.expr, &r)
		if r.Rows == 0 || len(r.Bad) != 0 || (c.wantKnown && r.Known == 0) || (c.wantGaps && r.Gaps == 0) {
			t.Fatalf("%s changes: %d rows, %d known, %d gaps; violations %v", c.name, r.Rows, r.Known, r.Gaps, r.Bad)
		}
	}
	var after []any
	jsonValue(t, vm, `(c => [c.status, c.reason])(q.run(middle.measure(header).changes(), { maxRows: 400 }).rows.find(c => c.ordinal === 106))`, &after)
	if after[0] != "unknown" || !strings.Contains(after[1].(string), "105") {
		t.Fatalf("first change after the loop pipeline: %v", after)
	}
}

// Firmware has 24 functions and partial loops, including a fully unrolled
// loop whose invalidated print is the whole module. Its bare loop headers prove
// no owner either. Such a loop is in every function's timeline whatever its
// tentative hint says, while another function's own events stay out.
func TestFirmwareLoopsAcrossFunctions(t *testing.T) {
	vm := session(t, loadArchive(t))
	value(t, vm, loopEvidenceJS)
	value(t, vm, `const fw = a.variant("firmware"), prepare = fw.function("prepare").timeline("middle");`)
	var inv []any
	jsonValue(t, vm, `(s => [s.kind, s.loop, "function" in s && s.function === null, s.invalidated, s.print, s.functionEvidence.method])(q.run(prepare.at(584).select("scope")).scope)`, &inv)
	if p, _ := inv[4].(string); inv[0] != "loop" || inv[1] != "for.cond1.preheader.i" || inv[2] != true || inv[3] != true || !strings.HasPrefix(p, "module") || inv[5] != "none" {
		t.Fatalf("invalidated loop: %v", inv)
	}
	// After invalidation the pass printed the module, which contains prepare in full.
	var after []any
	jsonValue(t, vm, `(r => [r.status, r.state.coverage])(q.run(q.ir.instructions().opcode("ret").count().at(prepare.at(584).after)))`, &after)
	if after[0] != "available" || after[1] != "module" {
		t.Fatalf("state after the invalidated loop: %v", after)
	}
	// The unroll's copies are new blocks. The tentative anchor's print predates them, and the
	// cross-check reports that (checked against the bytes) instead of assigning an owner.
	var unrolled []any
	jsonValue(t, vm, `(s => { const h = s.ownerHint;
	    return [s.loop, "function" in s && s.function === null, h && h.tentative, h && h.anchorOrdinal < 585, h && h.headerBlockInAnchorPrint,
	      h ? hasBlockLabel(middlePrint("firmware", h.anchorOrdinal), s.loop) : null]; })(q.run(prepare.at(585).select("scope")).scope)`, &unrolled)
	if unrolled[0] != "for.body4.i.2" || unrolled[1] != true || unrolled[2] != true || unrolled[3] != true || unrolled[4] != false || unrolled[5] != false {
		t.Fatalf("unrolled copy: %v", unrolled)
	}
	// Multiple-function coverage. A bare loop whose hint names another function is in every
	// function's timeline (the hint decides nothing). A function-scoped event of another
	// function is in its own timeline, not in prepare's, and the error says so.
	var spread struct {
		Loop       int
		Hinted     string
		Functions  int
		Missing    [][]string
		Other      int
		OtherFn    string
		OtherInOwn bool
	}
	jsonValue(t, vm, `(() => {
	  const events = middleEvents("firmware");
	  const loop = events.find(e => e.scope.kind === "loop" && e.scope.function === null && e.scope.ownerHint && e.scope.ownerHint.function !== "prepare");
	  const other = events.find(e => e.scope.kind === "function" && e.scope.function !== "prepare");
	  const missing = [];
	  fw.functions().forEach(f => {
	    try { const o = q.run(fw.function(f).timeline("middle").at(loop.ordinal)).ordinal; if (o !== loop.ordinal) missing.push([f, String(o)]); }
	    catch (err) { missing.push([f, err.message.split("\n")[0]]); }
	  });
	  return { loop: loop.ordinal, hinted: loop.scope.ownerHint.function, functions: fw.functions().length, missing,
	    other: other.ordinal, otherFn: other.scope.function,
	    otherInOwn: q.run(fw.function(other.scope.function).timeline("middle").at(other.ordinal)).ordinal === other.ordinal };
	})()`, &spread)
	if spread.Hinted == "" || spread.Hinted == "prepare" || spread.Functions != 24 || len(spread.Missing) != 0 {
		t.Fatalf("loop %d (hint %q) missing from function timelines: %v (of %d functions)", spread.Loop, spread.Hinted, spread.Missing, spread.Functions)
	}
	if spread.OtherFn == "" || spread.OtherFn == "prepare" || !spread.OtherInOwn {
		t.Fatalf("another function's event: %+v", spread)
	}
	if _, err := vm.RunString(`q.run(prepare.at(` + itoa(spread.Other) + `))`); err == nil || !strings.Contains(err.Error(), "notInSelection") {
		t.Fatalf("%s's event %d in prepare's timeline: %v", spread.OtherFn, spread.Other, err)
	}
	// No firmware loop gets an owner without proof, and every hint is the expected tentative witness.
	var own struct {
		Bare int
		Bad  []any
	}
	jsonValue(t, vm, `loopOwnershipViolations("firmware")`, &own)
	if own.Bare == 0 || len(own.Bad) != 0 {
		t.Fatalf("firmware loops (%d bare): %v", own.Bare, own.Bad)
	}
	// Around the invalidated loop (a module print available for prepare) and its copies, a change
	// is still known only between consecutive original ordinals.
	var ch struct {
		Rows, Known, Gaps int
		Bad               []any
	}
	jsonValue(t, vm, `changeViolations("firmware", prepare.where(e => e.ordinal >= 570 && e.ordinal <= 600), [q.ir.instructions().opcode("ret").count()])`, &ch)
	if ch.Rows == 0 || len(ch.Bad) != 0 {
		t.Fatalf("prepare changes 570..600: %d rows, %d known, %d gaps; violations %v", ch.Rows, ch.Known, ch.Gaps, ch.Bad)
	}
}

// The tail of a range announces the next pass. It is not evidence about this
// snapshot; offsets into the remaining print keep addressing archive bytes.
func TestExcerptsExcludeTheNextPassAnnouncement(t *testing.T) {
	archive := loadArchive(t)
	vm := session(t, archive)
	value(t, vm, `const run = a.variant("checked"), middle = run.function("row").timeline("middle");`)
	var sroa []any
	jsonValue(t, vm, `(r => [r.hitCount, r.excluded && r.excluded.lines])(q.run(run.events("middle").at(73).after.excerpt({ contains: "EarlyCSEPass", scope: "print" })))`, &sroa)
	if sroa[0] != float64(0) || sroa[1] != float64(4) {
		t.Fatalf("SROA print mentions the next pass: %v", sroa)
	}
	var own float64
	jsonValue(t, vm, `q.run(run.events("middle").at(74).after.excerpt({ contains: "EarlyCSEPass", scope: "print" })).hitCount`, &own)
	if own != 1 {
		t.Fatalf("EarlyCSE print header hits: %v", own)
	}
	var text []any
	jsonValue(t, vm, `(r => [r.print.includes("Running pass"), r.trailer.lines])(q.run(run.events("middle").at(98).text()))`, &text)
	if text[0] != false || text[1] == nil {
		t.Fatalf("loop print text: %v", text)
	}
	var hit struct {
		Start, Offset, Stream int
		Text                  string
	}
	jsonValue(t, vm, `(r => ({ start: r.source.ref.start, offset: r.hits[0].offsetInPrint, stream: r.hits[0].streamOffset }))(q.run(middle.at(74).after.excerpt({ contains: "load i32, ptr %work" })))`, &hit)
	body, err := archive.Text("checked", "middle", 74)
	if err != nil {
		t.Fatal(err)
	}
	if hit.Stream != hit.Start+hit.Offset || !strings.HasPrefix(body[hit.Offset:], "load i32, ptr %work") {
		t.Fatalf("offsets do not address archive bytes: %+v", hit)
	}
}

// A function's backend timeline resolves every llc header from its print. In
// a fresh session, firmware's 1,450 prints (14 MB) must stay far inside the
// 15 s cell deadline; a per-character JS pass over each print once took 7.6 s.
func TestColdFirmwareBackendTimelineFitsTheCellDeadline(t *testing.T) {
	if raceDetector {
		t.Skip("timing budget is meaningless under the race detector")
	}
	vm := session(t, loadArchive(t))
	start := time.Now()
	n := value(t, vm, `q.run(a.variant("firmware").function("trace_row").timeline("backend").count()).value`)
	if elapsed := time.Since(start); n.ToInteger() != 110 || elapsed > 3*time.Second {
		t.Fatalf("%v events in %v", n, elapsed)
	}
}

func itoa(n int) string {
	b, _ := json.Marshal(n)
	return string(b)
}
