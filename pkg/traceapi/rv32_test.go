package traceapi_test

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/dop251/goja"
	"github.com/go-go-golems/picocalc-trace/pkg/traceapi"
	"github.com/go-go-golems/picocalc-trace/pkg/tracecompiler"
	"github.com/go-go-golems/picocalc-trace/pkg/tracerepo"
)

// rv32VM is a session-like VM with rv32, compiler and the working tree's
// reference interpreter bound as `ref`.
func rv32VM(t *testing.T) *goja.Runtime {
	t.Helper()
	root, err := tracerepo.Discover(".")
	if err != nil {
		t.Fatal(err)
	}
	repo, err := tracerepo.Open(root, nil)
	if err != nil {
		t.Fatal(err)
	}
	vm := goja.New()
	if err := traceapi.InstallRV32(vm); err != nil {
		t.Fatal(err)
	}
	if err := traceapi.InstallCompiler(vm, tracecompiler.New(repo)); err != nil {
		t.Fatal(err)
	}
	reference, err := os.ReadFile(filepath.Join(root, "bench/host/rv32-interp.js"))
	if err != nil {
		t.Fatal(err)
	}
	if err := vm.Set("referenceSource", string(reference)); err != nil {
		t.Fatal(err)
	}
	if _, err := vm.RunString(`globalThis.ref = (() => { const shadow = Object.create(null);
	  new Function('globalThis', referenceSource)(shadow); return shadow.typedRv32Interp; })()`); err != nil {
		t.Fatal(err)
	}
	differential, err := os.ReadFile("testdata/rv32-differential.js")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := vm.RunScript("rv32-differential.js", string(differential)); err != nil {
		t.Fatal(err)
	}
	return vm
}

func jsJSON(t *testing.T, vm *goja.Runtime, src string, out any) {
	t.Helper()
	v, err := vm.RunString("JSON.stringify(" + src + ")")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal([]byte(v.String()), out); err != nil {
		t.Fatalf("%v: %s", err, v.String())
	}
}

// Seeded random programs: the native interpreter must agree with the reference
// on every field of every outcome, including fault messages and their types.
func TestRV32MatchesReferenceOnRandomPrograms(t *testing.T) {
	vm := rv32VM(t)
	cases := 4000
	if raceDetector || testing.Short() {
		cases = 800
	}
	var got struct {
		Failures   []map[string]any
		Categories map[string]int
	}
	jsJSON(t, vm, `(() => {
	  const failures = [], categories = {};
	  for (let seed = 1; seed <= `+itoa(cases)+`; seed++) {
	    const c = differential.generate(seed);
	    const {problems, outcome} = differential.compare(ref, rv32, c);
	    const k = differential.category(outcome);
	    categories[k] = (categories[k] || 0) + 1;
	    if (problems.length && failures.length < 5) failures.push({seed, problems});
	  }
	  return {failures, categories};
	})()`, &got)
	if len(got.Failures) > 0 {
		t.Fatalf("native and reference differ: %v", got.Failures)
	}
	// The generator must reach every outcome the reference can produce, or the agreement says little.
	for _, want := range []string{"return", "trap", "fault: instruction limit N reached", "fault: instruction address outside program",
		"fault: memory access outside guest memory: N", "fault: unsupported load", "fault: unsupported store", "fault: unsupported F instruction",
		"fault: unsupported branch", "fault: unsupported system instruction", "fault: unsupported RV32 opcode 0xH", "fault: unaligned sp at internal call", "fault: unaligned sp at import call",
		"fault: callee-saved xN changed across a call", "fault: return address does not match the call",
		"fault: no handler for import N", "Error: unknown RV32 entry missing", "Error: boom"} {
		if got.Categories[want] == 0 {
			t.Errorf("no case produced %q; categories: %v", want, got.Categories)
		}
	}
	t.Logf("%d cases: %v", cases, got.Categories)
}

// Single RV32F instructions on random operands: the native machine and the
// reference agree on the f registers, x registers and fcsr, beyond the
// conformance vectors' inputs.
func TestRV32FloatMatchesReference(t *testing.T) {
	vm := rv32VM(t)
	cases := 20000
	if raceDetector || testing.Short() {
		cases = 2000
	}
	var got struct {
		Failures []map[string]any
		Traps    int
		Changed  int
	}
	jsJSON(t, vm, `(() => {
	  const failures = []; let traps = 0, changed = 0;
	  for (let seed = 1; seed <= `+itoa(cases)+`; seed++) {
	    const c = differential.floatCase(seed);
	    const {problems, outcome} = differential.compare(ref, rv32, c);
	    if (!outcome.threw && outcome.value.trap) {
	      traps++;
	      if (outcome.value.fcsr !== (c.options.fcsr & 0xff)) changed++;
	    }
	    if (problems.length && failures.length < 5) failures.push({seed, problems});
	  }
	  return {failures, traps, changed};
	})()`, &got)
	if len(got.Failures) > 0 {
		t.Fatalf("native and reference differ: %v", got.Failures)
	}
	if got.Traps < cases*3/4 || got.Changed < cases/5 {
		t.Fatalf("too few cases executed (%d) or raised flags (%d)", got.Traps, got.Changed)
	}
	t.Logf("%d cases, %d executed, %d raised new flags", cases, got.Traps, got.Changed)
}

// The ray tracer's opening frame at a pinned commit, against digests recorded
// from the reference interpreter under Node (design doc Section 3.5).
func TestRV32OpeningFrameMatchesReference(t *testing.T) {
	vm := rv32VM(t)
	type frame struct {
		ImageSHA, BytesSHA, CountsSHA, RegistersSHA string
		Steps, Result                               int
		Trap                                        bool
		Digest                                      string
		ProfileSame, ClassifySame                   bool
		Ms                                          int
	}
	var got map[string]frame
	// Hash in Go, so the comparison does not depend on JavaScript.
	v, err := vm.RunString(`(() => { const c = compiler.at('2712684'), out = {};
	  for (const [arm, o] of [['default', undefined], ['stock', {policy: 'stock'}]]) {
	    const p = c.typedRv32.compile(c.ray, [], 65536, o), t = Date.now(), f = c.native.rayBench.openingFrame(p), ms = Date.now() - t;
	    out[arm] = {image: p.image, bytes: f.bytes, counts: new Uint8Array(f.counts.buffer), registers: new Uint8Array(f.registers.buffer),
	      steps: f.steps, result: f.result, trap: f.trap, digest: c.native.rayBench.fnv1a(f.bytes), ms,
	      profileSame: JSON.stringify(rv32.profile(p, f.counts)) === JSON.stringify(ref.profile(p, f.counts)), classifySame: true};
	    // classify on every word of the image, with its two successors.
	    const view = new DataView(p.image.buffer, p.image.byteOffset, p.image.byteLength);
	    for (let at = 0; at + 8 < p.image.length; at += 4) {
	      const w = [0, 4, 8].map(d => view.getUint32(at + d, true));
	      if (JSON.stringify(rv32.classify(...w)) !== JSON.stringify(ref.classify(...w))) out[arm].classifySame = false;
	    }
	  }
	  return out; })()`)
	if err != nil {
		t.Fatal(err)
	}
	sum := func(o *goja.Object, k string) string {
		b := o.Get(k).Export().([]byte)
		s := sha256.Sum256(b)
		return hex.EncodeToString(s[:])
	}
	got = map[string]frame{}
	all := v.(*goja.Object)
	for _, arm := range []string{"default", "stock"} {
		o := all.Get(arm).(*goja.Object)
		got[arm] = frame{ImageSHA: sum(o, "image"), BytesSHA: sum(o, "bytes"), CountsSHA: sum(o, "counts"), RegistersSHA: sum(o, "registers"),
			Steps: int(o.Get("steps").ToInteger()), Result: int(o.Get("result").ToInteger()), Trap: o.Get("trap").ToBoolean(),
			Digest: o.Get("digest").String(), ProfileSame: o.Get("profileSame").ToBoolean(), ClassifySame: o.Get("classifySame").ToBoolean(),
			Ms: int(o.Get("ms").ToInteger())}
	}
	// Recorded at 2712684 by PICOCALC-WORKBENCH-NATIVE scripts/01-node-reference-frame.mjs (the W1 wrapper in Node).
	want := map[string]frame{
		"default": {ImageSHA: "d9c25ef928d70c4ca46f065a18396c6f3df6fafaaf021bd2e840318be844b8f3", Steps: 4888369, Result: 1,
			BytesSHA:     "430f0d5016593f5b5232593107f198e92f6ecdfd88c946b59d0af364e2117625",
			CountsSHA:    "b901ce56542f5f522541a68064c57e1180fde22b3004fced85ca62a3910d5678",
			RegistersSHA: "c431bb3215d34a4ee561225bb9287e4410a6623e7b62ecbd294caabdaf1c773e", Digest: "b3c26cc8", ProfileSame: true, ClassifySame: true},
		"stock": {ImageSHA: "813974db340e1b1e6e42e898ef9741e59847e0b20ae89adffd851409d6b57fe4", Steps: 15532634, Result: 1,
			BytesSHA:     "430f0d5016593f5b5232593107f198e92f6ecdfd88c946b59d0af364e2117625",
			CountsSHA:    "223167e5b52228524652e099a4327138d284b0b099afffcf62cb6970ce47dd73",
			RegistersSHA: "384e124d21e40f196fa69e0b53a54cbba596b6bb2b00b3623215eb62dbd78f67", Digest: "b3c26cc8", ProfileSame: true, ClassifySame: true},
	}
	for arm, w := range want {
		g := got[arm]
		w.Ms = g.Ms
		if g != w {
			t.Errorf("%s:\n got %+v\nwant %+v", arm, g, w)
		}
		t.Logf("%s: %d steps natively in %d ms", arm, g.Steps, g.Ms)
	}
}

// The same frame run by the reference inside goja and natively, compared
// array for array. This is the measurement behind the speedup in the design.
func TestRV32OpeningFrameAgainstReferenceInGoja(t *testing.T) {
	if raceDetector || testing.Short() {
		t.Skip("the reference needs 10-25 s per frame in goja; skipped with -short and -race")
	}
	vm := rv32VM(t)
	var got struct {
		Same                []string
		RefMs, NatMs, Steps int
	}
	jsJSON(t, vm, `(() => {
	  const c = compiler.at('2712684');
	  const p = c.typedRv32.compile(c.ray, [], 65536);
	  let t = Date.now();
	  const a = c.rayBench.openingFrame(p);
	  const refMs = Date.now() - t;
	  t = Date.now();
	  const b = c.native.rayBench.openingFrame(p);
	  const natMs = Date.now() - t;
	  const eq = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
	  return {same: ['counts', 'bytes', 'registers'].filter(k => eq(a[k], b[k])).concat(['steps', 'result', 'trap'].filter(k => a[k] === b[k])),
	    refMs, natMs, steps: b.steps};
	})()`, &got)
	if strings.Join(got.Same, ",") != "counts,bytes,registers,steps,result,trap" {
		t.Fatalf("only %v agree", got.Same)
	}
	t.Logf("default frame, %d steps: reference in goja %d ms, native %d ms (%.0fx)", got.Steps, got.RefMs, got.NatMs, float64(got.RefMs)/float64(max(got.NatMs, 1)))
}

// A run with no step limit still ends at the VM's interrupt (the cell deadline).
func TestRV32StopsAtInterrupt(t *testing.T) {
	vm := rv32VM(t)
	go func() { time.Sleep(200 * time.Millisecond); vm.Interrupt("deadline") }()
	started := time.Now()
	_, err := vm.RunString(`try {
	  rv32.run({image: new Uint8Array([0x63, 0, 0, 0]), entries: {f: 0}}, 'f', [], new Uint8Array(0), {limit: Infinity});
	} catch (e) { 'caught ' + e }`)
	var interrupted *goja.InterruptedError
	if !errors.As(err, &interrupted) || time.Since(started) > 5*time.Second {
		t.Fatalf("want an uncatchable interrupt, got %v after %s", err, time.Since(started))
	}
}

func TestRV32Interface(t *testing.T) {
	vm := rv32VM(t)
	var got map[string]any
	jsJSON(t, vm, `(() => {
	  const p = {image: new Uint8Array([0x13, 0x05, 0x15, 0x00, 0x67, 0x80, 0x00, 0x00]), entries: {f: 0}}; // addi a0, a0, 1; ret
	  const r = rv32.run(p, 'f', [41], new Uint8Array(3));
	  let fault;
	  try { rv32.run(p, 'f', [], new Uint8Array(0), {limit: 1}); } catch (e) { fault = {cls: e instanceof rv32.Rv32Fault, message: e.message, at: e.at, steps: e.steps}; }
	  let bad;
	  try { rv32.run({image: p.image, entries: {f: '0'}}, 'f', [], []); } catch (e) { bad = e instanceof TypeError; }
	  return {keys: Object.keys(r), result: r.result, types: [r.counts, r.bytes, r.registers, r.fregisters].map(a => a.constructor.name),
	    bytes: r.bytes.length, size: r.bytes.buffer.byteLength, fault, bad, frozen: Object.isFrozen(rv32), help: rv32.help().slice(0, 4),
	    nativeIsRv32: compiler.at('2712684').native.interp === rv32, noBench: compiler.at('25cd108').native.rayBench,
	    partial: [ref, rv32].map(interp => { // a 6-byte image: the trailing half word is read past the end
	      try { interp.run({image: new Uint8Array([0x13, 0, 0, 0, 0x13, 0]), entries: {f: 0}}, 'f', [], []); return 'returned'; }
	      catch (e) { return e.constructor.name + ': ' + e.message; } })};
	})()`, &got)
	raw, _ := json.Marshal(got)
	want := `{"bad":true,"bytes":3,"fault":{"at":4,"cls":true,"message":"instruction limit 1 reached at 0x4","steps":2},"frozen":true,"help":"rv32","keys":["trap","result","steps","counts","bytes","registers","fregisters","fcsr"],"nativeIsRv32":true,"noBench":null,"partial":["RangeError: Index 4 is out of bounds","RangeError: Index 4 is out of bounds"],"result":42,"size":65552,"types":["Uint32Array","Uint8Array","Int32Array","Uint32Array"]}`
	if string(raw) != want {
		t.Fatalf("got  %s\nwant %s", raw, want)
	}
}
