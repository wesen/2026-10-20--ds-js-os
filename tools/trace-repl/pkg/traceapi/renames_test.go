package traceapi

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/dop251/goja"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/tracearchive"
)

// Field note N3: SROA removed the shadow kernel's 18 allocas while it was
// called checked_shadow; GlobalOpt renamed it kernel at middle ordinal 17.
// kernel's own timeline shows no promotion; the followed timeline does.
func TestFollowedTimelineCrossesGlobalOptRename(t *testing.T) {
	dirs, err := filepath.Glob("../../../../ttmp/2026/11/21/PICOCALC-SHADOW-LLVM--*")
	if err != nil || len(dirs) != 1 {
		t.Fatalf("find SHADOW-LLVM archive: %v %v", dirs, err)
	}
	archive, err := tracearchive.Open(dirs[0])
	if err != nil {
		t.Fatal(err)
	}
	vm := goja.New()
	if err := Install(vm, archive); err != nil {
		t.Fatal(err)
	}
	v, err := vm.RunString(`(() => {
	  const run = a.variant('checked'), kernel = run.function('kernel');
	  const allocas = q.ir.instructions().opcode('alloca').count();
	  const loadsOfCtx = q.ir.instructions().opcode('load').pointer(kernel.argument(0)).count();
	  const drops = tl => q.run(tl.measure(allocas).changes().where(c => c.status === 'known' && c.delta < 0)).rows;
	  const followed = kernel.timeline('middle', { follow: true });
	  const rows = q.run(followed.measure(allocas)).rows;
	  const at17 = q.run(followed.measure(allocas).changes()).rows.find(c => c.ordinal === 17);
	  return JSON.stringify({
	    aliases: kernel.aliases(),
	    unfollowed: drops(kernel.timeline('middle')).length,
	    followed: drops(followed).map(c => [c.ordinal, c.pass, c.before, c.after, c.delta, c.function]),
	    names: [rows.find(r => r.ordinal === 6).function, rows.find(r => r.ordinal === 17).function, rows[0].followedAs],
	    rename17: rows.find(r => r.ordinal === 17).rename,
	    change17: [at17.status, at17.delta, at17.rename && at17.rename.from],
	    argumentBound: q.run(followed.measure(loadsOfCtx)).rows.filter(r => r.ordinal < 17 && r.status === 'available').length > 0,
	    stateAt6: (s => [s.status, s.state && s.state.function])(q.run(followed.at(6).after)),
	    beforeAt17: (s => [s.status, s.state && s.state.function])(q.run(followed.at(17).before)),
	    label: followed.describe(),
	    unfollowedAt6: q.run(kernel.timeline('middle').measure(allocas)).rows.some(r => r.ordinal === 6),
	  });
	})()`)
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		Aliases []struct {
			Name, RenamedTo, Phase, Method string
			Ordinal                        int
			AliasOrdinal                   int
		}
		Unfollowed    int
		Followed      [][]any
		Names         []string
		Rename17      struct{ From, To, Method string }
		Change17      []any
		ArgumentBound bool
		StateAt6      []any
		BeforeAt17    []any
		Label         string
		UnfollowedAt6 bool
	}
	if err := json.Unmarshal([]byte(v.String()), &got); err != nil {
		t.Fatalf("%v: %s", err, v)
	}
	if len(got.Aliases) != 1 || got.Aliases[0].Name != "checked_shadow" || got.Aliases[0].RenamedTo != "kernel" || got.Aliases[0].Ordinal != 17 ||
		got.Aliases[0].Method != "alias" || got.Aliases[0].AliasOrdinal != 16 {
		t.Fatalf("aliases: %+v", got.Aliases)
	}
	if got.Unfollowed != 0 || got.UnfollowedAt6 {
		t.Fatalf("unfollowed kernel timeline: %d drops, ordinal 6 present %v", got.Unfollowed, got.UnfollowedAt6)
	}
	if len(got.Followed) != 1 || got.Followed[0][0] != 6.0 || got.Followed[0][1] != "SROAPass" || got.Followed[0][2] != 18.0 ||
		got.Followed[0][3] != 0.0 || got.Followed[0][4] != -18.0 || got.Followed[0][5] != "checked_shadow" {
		t.Fatalf("followed drops: %v", got.Followed)
	}
	if got.Names[0] != "checked_shadow" || got.Names[1] != "kernel" || got.Names[2] != "kernel" ||
		got.Rename17.From != "checked_shadow" || got.Rename17.To != "kernel" || got.Rename17.Method != "alias" {
		t.Fatalf("names %v rename %+v", got.Names, got.Rename17)
	}
	if got.Change17[0] != "known" || got.Change17[1] != 0.0 || got.Change17[2] != "checked_shadow" {
		t.Fatalf("change at the rename: %v", got.Change17)
	}
	if !got.ArgumentBound {
		t.Fatal("kernel.argument(0) did not resolve in checked_shadow's prints")
	}
	if got.StateAt6[0] != "available" || got.StateAt6[1] != "checked_shadow" || got.BeforeAt17[0] != "available" || got.BeforeAt17[1] != "checked_shadow" {
		t.Fatalf("states: %v %v", got.StateAt6, got.BeforeAt17)
	}
	if got.Label != `a.variant("checked").function("kernel").timeline("middle", { follow: true })` {
		t.Fatal(got.Label)
	}
	if _, err := vm.RunString(`a.variant('checked').function('kernel').timeline('middle', { folow: true })`); err == nil {
		t.Fatal("misspelled option accepted")
	}
}
