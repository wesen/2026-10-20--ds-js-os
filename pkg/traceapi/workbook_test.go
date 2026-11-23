package traceapi_test

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"testing"

	"github.com/dop251/goja"
	"github.com/go-go-golems/picocalc-trace/pkg/traceapi"
	"github.com/go-go-golems/picocalc-trace/pkg/tracerepl"
	"github.com/rs/zerolog"
)

// workbookCase is one example of research/workbook.md, with its body copied
// verbatim. Expectations come from the workbook and from the independent
// oracle in pkg/tracearchive/workbook_oracle_test.go, never from this library.
// The assertions do not depend on result shapes: they search the JSON value
// (or the error) for the leaves the workbook names.
type workbookCase struct {
	n        int
	body     string
	call     string    // %s receives the example function; default q.run(%s)
	verified bool      // the workbook marks the numbers verified: the cell must succeed
	numbers  []float64 // numeric leaves that must appear
	bools    []bool    // boolean leaves that must appear
	texts    []string  // substrings of string leaves, or of the error for a contract
	percent  float64   // a leaf equal to this percent (or fraction) must appear
}

var workbook = []workbookCase{
	{n: 1, verified: true, numbers: []float64{4133}, body: `return a.events().count();`},
	{n: 2, verified: true, numbers: []float64{195}, body: `return run.events("middle").count();`},
	{n: 3, verified: true, numbers: []float64{74}, texts: []string{"EarlyCSEPass"}, body: `return run.events("middle").at(74)
  .select("ordinal", "header", "ref");`},
	{n: 4, texts: []string{"load i32, ptr %work"}, body: `return middle.at(74).after.excerpt({ contains: "load i32, ptr %work" });`},
	{n: 5, verified: true, numbers: []float64{6}, body: `return header.at(middle.at(74).after);`},
	{n: 6, verified: true, numbers: []float64{11, 6}, body: `return q.bundle({
  earlier: header.at(middle.at(73).after),
  later:   header.at(middle.at(74).after)
});`},
	{n: 7, verified: true, numbers: []float64{-5}, body: `return middle.measure(header).changes()
  .where(c => c.status === "known" && c.delta < 0).first();`},
	{n: 8, body: `const onlyCSE = middle.where(e => e.pass === "EarlyCSEPass");
return onlyCSE.measure(header).changes();`},
	{n: 9, verified: true, numbers: []float64{0, 3}, body: `const sites = op => q.ir.instructions().opcode(op).count();
const state = middle.at(6).after;
return q.bundle({ allocations: sites("alloca").at(state),
                  merges: sites("phi").at(state) });`},
	{n: 10, verified: true, numbers: []float64{16, 0}, body: `const allocas = q.ir.instructions().opcode("alloca").count();
return q.compare(allocas.at(middle.at(5).after),
                 allocas.at(middle.at(6).after));`},
	{n: 11, body: `const state = middle.at(74).after;
return state.instructions().opcode("load").resultType("i32")
  .pointer(row.argument(0)).uses().select("userOpcode", "operandIndex", "ref");`},
	{n: 12, texts: []string{"missingDebugLocations"}, body: `return run.initialModule().sourceLocations({ function: "row" });`},
	{n: 13, body: `const loopPrint = run.events("middle")
  .where(e => e.scope.kind === "loop").first();
return header.at(loopPrint.after).requireCoverage("function");`},
	{n: 14, verified: true, numbers: []float64{74, 78}, texts: []string{"virtregrewriter"}, body: `return row.timeline("backend")
  .where(e => e.passId === "virtregrewriter")
  .select("ordinal", "passId", "scope", "ref");`},
	{n: 15, verified: true, bools: []bool{false, true}, body: `const machine = row.timeline("backend");
const noVRegs = q.machine.property("NoVRegs");
return q.bundle({
  first: noVRegs.at(machine.at(74).after),
  last:  noVRegs.at(machine.at(78).after)
});`},
	{n: 16, bools: []bool{false, true}, body: `const states = row.timeline("backend");
const metric = q.machine.property("NoVRegs");
return q.compare(metric.at(states.at(74).after),
                 metric.at(states.at(78).after))
  .asEndpoints();`},
	{n: 17, body: `const vector = middle.where(e => e.pass === "LoopVectorizePass").first();
return q.bundle({
  state: vector.after.excerpt({ contains: "define" }),
  reasons: run.remarks().forEvent(vector)
});`},
	{n: 18, verified: true, numbers: []float64{1136142}, body: `return profiles.arm("checked-gcc").region("row")
  .workload("opening-160-rows").total("instructions");`},
	{n: 19, verified: true, numbers: []float64{1290106}, body: `const stock = profiles.arm("typed-stock").region("row")
  .workload("opening-160-rows");
return q.add(stock.total("stackLoads"), stock.total("stackStores"))
  .label("direct stack accesses");`},
	{n: 20, verified: true, numbers: []float64{1136142, 1233611}, body: `const total = arm => profiles.arm(arm).region("row")
  .workload("opening-160-rows").total("instructions");
return q.compare(total("checked-gcc"), total("checked-llvm"))
  .matchOn("workload", "region", "checkedContract", "unit");`},
	{n: 21, verified: true, numbers: []float64{1275560, 1233611}, percent: -3.2886, body: `const total = arm => profiles.arm(arm).region("row")
  .workload("opening-160-rows").total("instructions");
return q.compare(total("checked-llc-nolsr"), total("checked-llc"))
  .matchOn("workload", "region", "checkedContract", "unit")
  .percentChange({ denominator: "before" });`},
	{n: 22, texts: []string{"missingPCSamples"}, body: `const summary = profiles.arm("checked-llvm");
return q.joinPCs(summary, run.finalImage())
  .requireMatch("imageSHA", "addressSpace");`},
	{n: 23, numbers: []float64{6}, body: `const layout = q.fragment("picocalc.row.v1").on("irFunction", {
  capacityMetric: fn => q.ir.instructions().opcode("load")
    .resultType("i32").pointer(fn.argument(0)).count()
});
return row.with(layout).capacityMetric().at(middle.at(74).after);`},
	{n: 24, call: "%s", numbers: []float64{-5}, body: `const minimum = q.param.int("minimum", { min: 1, max: 16, default: 1 });
const drops = middle.measure(header).changes()
  .where((r, ctx) => r.status === "known" && -r.delta >= ctx.param(minimum),
         { dependsOn: [minimum] });
return q.run(drops, { bindings: { minimum: 5 } });`},
	{n: 25, call: "%s", body: `const changes = middle.measure(header).changes();
const plan = q.bundle({
  timeline: changes.table("ordinal", "before", "after", "delta"),
  first: changes.where(r => r.status === "known" && r.delta < 0).first()
});
return q.explain(plan);`},
}

// Example 26 is evaluated once per binding. The machine observation belongs to
// the normal build in both results; only the executed work changes.
const example26 = `const arm = q.param.choice("arm", ["checked-llc", "checked-llc-nolsr"]);
const rowWork = profiles.arm(arm).region("row")
  .workload("opening-160-rows").total("instructions");
const state = row.timeline("backend").at(78).after;
return q.bundle({
  normalBuildHasPhysicalRegisters: q.machine.property("NoVRegs").at(state),
  executedRowWork: rowWork
});`

func init() {
	for _, arm := range []struct {
		name  string
		total float64
	}{{"checked-llc", 1233611}, {"checked-llc-nolsr", 1275560}} {
		workbook = append(workbook, workbookCase{n: 26, call: "q.run(%s, { bindings: { arm: " + fmt.Sprintf("%q", arm.name) + " } })",
			numbers: []float64{arm.total}, bools: []bool{true}, body: example26})
	}
}

func jsonLeaves(v any, nums *[]float64, bools *[]bool, texts *[]string) {
	switch x := v.(type) {
	case map[string]any:
		for _, item := range x {
			jsonLeaves(item, nums, bools, texts)
		}
	case []any:
		for _, item := range x {
			jsonLeaves(item, nums, bools, texts)
		}
	case float64:
		*nums = append(*nums, x)
	case bool:
		*bools = append(*bools, x)
	case string:
		*texts = append(*texts, x)
	}
}

// TestWorkbookExamples needs the sibling's pkg/traceapi/query/*.js. It evaluates
// each example in one persistent session of the served product, as an agent
// would, after the workbook's common bindings.
func TestWorkbookExamples(t *testing.T) {
	archive := loadArchive(t)
	study := loadStudy(t)
	service, err := tracerepl.New(context.Background(), func(vm *goja.Runtime) error {
		if err := traceapi.Install(vm, archive); err != nil {
			return err
		}
		return traceapi.InstallHardware(vm, study)
	}, zerolog.Nop())
	if err != nil {
		t.Fatal(err)
	}
	defer service.Close(context.Background())
	id, err := service.Open(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	setup, err := service.Evaluate(context.Background(), id, `const run = a.variant("checked");
const row = run.function("row");
const middle = row.timeline("middle");
const header = q.ir.instructions().opcode("load")
  .resultType("i32").pointer(row.argument(0)).count();
undefined`)
	if err != nil || !setup.OK {
		t.Fatalf("common bindings: %+v %v", setup, err)
	}
	for _, ex := range workbook {
		call := ex.call
		if call == "" {
			call = "q.run(%s)"
		}
		source := fmt.Sprintf(call, "(() => {\n"+ex.body+"\n})()")
		t.Run(fmt.Sprintf("%02d", ex.n), func(t *testing.T) {
			r, err := service.Evaluate(context.Background(), id, source)
			if err != nil {
				t.Fatal(err)
			}
			shown := string(r.Value)
			if len(shown) > 600 {
				shown = shown[:600] + "…"
			}
			t.Logf("ok=%v kind=%q value=%s error=%q", r.OK, r.Kind, shown, r.Error)
			if !r.OK {
				// A contract example may be unavailable, but must say so, and a
				// named diagnostic must be the one the workbook specifies.
				if ex.verified || strings.TrimSpace(r.Error) == "" {
					t.Fatalf("example %d failed: %s", ex.n, r.Error)
				}
				for _, want := range ex.texts {
					if (ex.n == 12 || ex.n == 22) && !strings.Contains(r.Error, want) {
						t.Fatalf("example %d: error lacks %q", ex.n, want)
					}
				}
				return
			}
			var decoded any
			if err := json.Unmarshal(r.Value, &decoded); err != nil {
				t.Fatal(err)
			}
			switch v := decoded.(type) {
			case nil:
				t.Fatalf("example %d returned null (kind %q) without an error", ex.n, r.Kind)
			case map[string]any:
				if len(v) == 0 {
					t.Fatalf("example %d returned an empty object", ex.n)
				}
			}
			var nums []float64
			var bools []bool
			var texts []string
			jsonLeaves(decoded, &nums, &bools, &texts)
			for _, want := range ex.numbers {
				found := false
				for _, n := range nums {
					found = found || n == want
				}
				if !found {
					t.Errorf("example %d: no numeric leaf %v in %v", ex.n, want, nums)
				}
			}
			for _, want := range ex.bools {
				found := false
				for _, b := range bools {
					found = found || b == want
				}
				if !found {
					t.Errorf("example %d: no boolean leaf %v", ex.n, want)
				}
			}
			for _, want := range ex.texts {
				found := false
				for _, s := range texts {
					found = found || strings.Contains(s, want)
				}
				if !found {
					t.Errorf("example %d: no string containing %q", ex.n, want)
				}
			}
			if ex.percent != 0 {
				found := false
				for _, n := range nums {
					found = found || math.Abs(n-ex.percent) < 0.01 || math.Abs(n-ex.percent/100) < 1e-4
				}
				if !found {
					t.Errorf("example %d: no leaf near %v%% in %v", ex.n, ex.percent, nums)
				}
			}
		})
	}
}
