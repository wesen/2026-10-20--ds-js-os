package traceapi_test

import (
	"os"
	"testing"
)

// PICOCALC-TYPED-F32: f32 programs compiled by the working tree's compiler in goja, run on the Go machine under
// every policy, against WebAssembly's results recorded in testdata/f32-differential.json
// (tests/compiler/typed-f32-fixture.mjs). An f32 compares as its bits, except that every NaN equals every NaN.
func TestRV32F32MatchesWebAssembly(t *testing.T) {
	vm := rv32VM(t)
	fixture, err := os.ReadFile("testdata/f32-differential.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := vm.Set("f32Fixture", string(fixture)); err != nil {
		t.Fatal(err)
	}
	var got struct {
		Failures []map[string]any
		Checked  int
	}
	jsJSON(t, vm, `(() => {
	  const c = compiler.at('worktree'), fx = JSON.parse(f32Fixture), failures = [];
	  const nan = n => (n & 0x7f800000) === 0x7f800000 && (n & 0x7fffff) !== 0;
	  let checked = 0;
	  for (const program of fx.programs) for (const policy of fx.policies) {
	    const image = c.typedRv32.compile(program.source, [], 1 << 20, {policy});
	    for (const k of program.cases) {
	      const x = [], f = new Uint32Array(32);
	      let next = 10;
	      k.params.forEach((type, i) => { if (type === 'f32') f[next++] = k.args[i]; else x.push(k.args[i]); });
	      const run = rv32.run(image, k.name, x, new Uint8Array(64), {fregisters: f});
	      const value = k.result === 'f32' ? run.fregisters[10] >>> 0 : run.result;
	      const ok = !run.trap && (k.result === 'f32' ? value === k.expect >>> 0 || (nan(value) && nan(k.expect >>> 0)) : value === k.expect);
	      if (!ok && failures.length < 5) failures.push({policy, name: k.name, args: k.args, value, expect: k.expect, trap: run.trap});
	      checked++;
	    }
	  }
	  return {failures, checked};
	})()`, &got)
	if len(got.Failures) > 0 {
		t.Fatalf("the Go machine and WebAssembly differ: %v", got.Failures)
	}
	if got.Checked < 3000 {
		t.Fatalf("only %d cases checked", got.Checked)
	}
	t.Logf("%d f32 cases agree", got.Checked)
}
