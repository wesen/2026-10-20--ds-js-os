package traceapi

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dop251/goja"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/tracecompiler"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/tracerepo"
)

func compilerVM(t *testing.T) (*goja.Runtime, string) {
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
	if err := InstallCompiler(vm, tracecompiler.New(repo)); err != nil {
		t.Fatal(err)
	}
	return vm, root
}

// Three revisions live in one VM. eaf0872 and 3213028 differ in typed-rv32.js;
// 3213028 and 14c95b5 (a documentation commit) do not. Images must differ
// exactly where the backend source differs and the options reach the change.
func TestCompilerRevisionsCoexistInOneSession(t *testing.T) {
	vm, _ := compilerVM(t)
	v, err := vm.RunString(`(() => {
	  const before = new Set(Object.getOwnPropertyNames(globalThis));
	  const base = compiler.at('eaf0872'), work = compiler.at('3213028'), docs = compiler.at('14c95b5');
	  const leaked = Object.getOwnPropertyNames(globalThis).filter(n => !before.has(n));
	  const rv32 = b => b.files.find(f => f.path.endsWith('typed-rv32.js')).sha256;
	  const ray = work.ray;
	  const same = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
	  const arms = {stock: {policy: 'stock'}, default: undefined,
	    savedDirect: {operandLocations: {forward: true, capacity: true, homes: true, saved: true, direct: true}}};
	  const sizes = {}, identical = {};
	  for (const [arm, o] of Object.entries(arms)) {
	    const [a, b, c] = [base, work, docs].map(r => r.typedRv32.compile(ray, [], 96 * 1024, o).image);
	    sizes[arm] = [a.length, b.length, c.length];
	    identical[arm] = [same(a, b), same(b, c)];
	  }
	  const chess = work.world('chess');
	  return {
	    leaked, distinct: base.typedRv32 !== work.typedRv32 && work.typedRv32 !== docs.typedRv32 && base.typedWasm !== work.typedWasm,
	    memoized: compiler.at('eaf0872') === base && compiler.at(base.revision) === base,
	    revision: base.revision, requested: base.requested,
	    rv32Differs: [rv32(base) !== rv32(work), rv32(work) !== rv32(docs)],
	    sizes, identical,
	    exports: Object.keys(work.globals).sort(),
	    interp: typeof work.interp.run + typeof work.rayBench.frameProfile,
	    chess: {files: chess.files.length, text: chess.text === chess.files.map(f => work.read(f.path).text).join('\n'),
	      base: base.typedRv32.compile(chess.text, base.typedWorld.imports, 96 * 1024).image.length,
	      work: work.typedRv32.compile(chess.text, work.typedWorld.imports, 96 * 1024).image.length},
	    typedSources: work.typedSources().length,
	    where: base.where(base.files[3].line + 9),
	    old: (b => ({missing: b.missing, interp: b.interp, rayBench: b.rayBench}))(compiler.at('25cd108')),
	  };
	})()`)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(v.Export())
	var got struct {
		Leaked              []string
		Distinct, Memoized  bool
		Revision, Requested string
		RV32Differs         []bool
		Sizes               map[string][]int
		Identical           map[string][]bool
		Exports             []string
		Interp              string
		Chess               struct {
			Files      int
			Text       bool
			Base, Work int
		}
		TypedSources int
		Where        struct {
			Path string
			Line int
		}
		Old struct {
			Missing          []string
			Interp, RayBench any
		}
	}
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Leaked) != 0 || !got.Distinct || !got.Memoized || got.Revision != "eaf087281dbad1183f23eff353145d1c8a413e64" || got.Requested != "eaf0872" {
		t.Fatalf("isolation: %s", raw)
	}
	// typed-rv32.js differs between eaf0872 and 3213028 and not between 3213028 and 14c95b5.
	if !got.RV32Differs[0] || got.RV32Differs[1] {
		t.Fatalf("digests: %v", got.RV32Differs)
	}
	for arm, want := range map[string][]int{"stock": {9564, 9564, 9564}, "default": {8632, 8632, 8632}, "savedDirect": {8632, 8048, 8048}} {
		if s := got.Sizes[arm]; len(s) != 3 || s[0] != want[0] || s[1] != want[1] || s[2] != want[2] {
			t.Errorf("%s sizes %v, want %v", arm, s, want)
		}
	}
	// Same source, same image; the changed backend differs only where an option reaches the change.
	if got.Identical["stock"][0] != true || got.Identical["default"][0] != true || got.Identical["savedDirect"][0] != false {
		t.Errorf("eaf0872 vs 3213028: %v", got.Identical)
	}
	for arm, pair := range got.Identical {
		if !pair[1] {
			t.Errorf("%s: 3213028 and 14c95b5 have the same typed-rv32.js but different images", arm)
		}
	}
	wantExports := []string{"compileTyped", "compileTypedWorld", "compileTypedWorldRv32", "typedAsync", "typedPieLoops", "typedRayBench", "typedRv32", "typedRv32Interp", "typedWasm", "typedWorld"}
	if len(got.Exports) != len(wantExports) {
		t.Fatalf("exports %v", got.Exports)
	}
	for i := range wantExports {
		if got.Exports[i] != wantExports[i] {
			t.Fatalf("exports %v", got.Exports)
		}
	}
	if got.Interp != "functionfunction" || got.Chess.Files != 6 || !got.Chess.Text || got.Chess.Base != 45348 || got.Chess.Work != 45348 || got.TypedSources != 33 {
		t.Fatalf("modules and sources: %s", raw)
	}
	if got.Where.Path != "picocalc-os/compiler/typed-rv32.js" || got.Where.Line != 10 {
		t.Fatalf("where: %+v", got.Where)
	}
	// Before eaf0872 the two host tools did not exist, and tape.js and the two RV32 pass-group bundles are newer
	// still; the revision still loads.
	if len(got.Old.Missing) != 5 || got.Old.Interp != nil || got.Old.RayBench != nil {
		t.Fatalf("25cd108: %+v", got.Old)
	}
}

// The working-tree bundle reports the digests of the files on disk and is
// re-read on every call.
func TestWorktreeCompilerReportsFileDigests(t *testing.T) {
	vm, root := compilerVM(t)
	v, err := vm.RunString(`const w = compiler.at('worktree'); JSON.stringify({files: w.files, revision: w.revision, fresh: compiler.at('worktree') !== w,
	  compiles: w.typedRv32.compile(w.ray, [], 96 * 1024).image.length > 0})`)
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		Files []struct {
			Path, SHA256 string
			Bytes        int
		}
		Revision        string
		Fresh, Compiles bool
	}
	if err := json.Unmarshal([]byte(v.String()), &got); err != nil {
		t.Fatal(err)
	}
	if got.Revision != "worktree" || !got.Fresh || !got.Compiles || len(got.Files) != len(tracecompiler.Modules) {
		t.Fatalf("%s", v)
	}
	for _, f := range got.Files {
		data, err := os.ReadFile(filepath.Join(root, f.Path))
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(data)
		if f.SHA256 != hex.EncodeToString(sum[:]) || f.Bytes != len(data) {
			t.Errorf("%s: reported %s, on disk %x", f.Path, f.SHA256, sum)
		}
	}
	for expr, want := range map[string]string{
		"compiler.at('no-such-rev')":               "[compiler] unknown revision",
		"compiler.at('eaf0872').world('raytrace')": "has no built-in layout (files, agenda)",
		"compiler.at()":                            "needs a revision name",
	} {
		if _, err := vm.RunString(expr); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: %v; want %q", expr, err, want)
		}
	}
}

// I2b: Files and Agenda have no source.list; world() assembles them the way
// the P4 firmware reads them, and they compile with the world imports.
func TestWorldLayoutsWithoutSourceList(t *testing.T) {
	vm, _ := compilerVM(t)
	v, err := vm.RunString(`(() => {
	  const w = compiler.at('worktree'), base = compiler.at('eaf0872');
	  const dir = w.worlds + '/';
	  const files = w.world('files'), agenda = w.world('agenda'), chess = w.world('chess');
	  const size = world => w.typedRv32.compile(world.text, w.typedWorld.imports, 96 * 1024).image.length;
	  return JSON.stringify({
	    layouts: [files.layout, agenda.layout, chess.layout],
	    files: files.text === w.read(dir + 'files/files.typed').text && files.files.length === 1,
	    agenda: agenda.text === w.read(dir + 'agenda/reminder.typed').text + '\n' + w.read(dir + 'agenda/entry.typed').text &&
	      agenda.files.map(f => f.path.slice(dir.length)).join() === 'agenda/reminder.typed,agenda/entry.typed',
	    compiles: size(files) > 0 && size(agenda) > 0,
	    atCommit: base.world('agenda').layout,
	    loaded: compiler.loaded().map(l => [l.requested, l.revision.length, l.key.length, l.files.length > 4]),
	  });
	})()`)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"layouts":["builtin","builtin","source.list"],"files":true,"agenda":true,"compiles":true,"atCommit":"builtin",` +
		`"loaded":[["worktree",8,64,true],["eaf0872",40,64,true]]}`
	if v.String() != want {
		t.Fatalf("got  %s\nwant %s", v, want)
	}
}
