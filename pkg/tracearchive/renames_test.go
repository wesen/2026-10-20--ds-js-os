package tracearchive

import (
	"path/filepath"
	"strings"
	"testing"
)

// GlobalOpt resolves the alias @kernel = alias … @checked_shadow at middle
// ordinal 17 and rewrites the calls to fastcc in the same pass, so the body
// changes; the alias in ordinal 16's print is what identifies the rename.
func TestRenamesFollowGlobalOptAliasResolution(t *testing.T) {
	dirs, err := filepath.Glob("../../ttmp/2026/11/21/PICOCALC-SHADOW-LLVM--*")
	if err != nil || len(dirs) != 1 {
		t.Fatalf("find SHADOW-LLVM archive: %v %v", dirs, err)
	}
	a, err := Open(dirs[0])
	if err != nil {
		t.Fatal(err)
	}
	renames, err := a.Renames("checked")
	if err != nil {
		t.Fatal(err)
	}
	if len(renames) != 1 {
		t.Fatalf("renames: %+v", renames)
	}
	r := renames[0]
	if r.Phase != "middle" || r.Ordinal != 17 || r.From != "checked_shadow" || r.To != "kernel" || r.Method != "alias" ||
		r.AliasOrdinal == nil || *r.AliasOrdinal != 16 || r.Pass != "GlobalOptPass" || r.Ref.Ordinal != 17 {
		t.Fatalf("rename: %+v", r)
	}
	if _, err := a.Renames("nope"); err == nil || !strings.Contains(err.Error(), "unknown variant") {
		t.Fatalf("unknown variant: %v", err)
	}
	// The ray row keeps its name through the whole pipeline.
	if row, err := actualArchive(t).Renames("checked"); err != nil || len(row) != 0 {
		t.Fatalf("ROW-IR renames: %+v %v", row, err)
	}
}

func TestRenamesByIdenticalBody(t *testing.T) {
	prints := []string{
		"*** IR Dump After A on [module] ***\n; ModuleID = 'm'\ndefine internal i32 @old(i32 %x) {\n  ret i32 %x\n}\ndefine i32 @other() {\n  ret i32 1\n}\n",
		"*** IR Dump After B on old ***\ndefine internal i32 @old(i32 %x) {\n  %y = add i32 %x, 0\n  ret i32 %y\n}\n",
		// The new name carries the body old had in its latest print, not in the earlier module.
		"*** IR Dump After C on [module] ***\n; ModuleID = 'm'\ndefine i32 @new(i32 %x) {\n  %y = add i32 %x, 0\n  ret i32 %y\n}\ndefine i32 @other() {\n  ret i32 1\n}\ndefine i32 @twin() {\n  ret i32 1\n}\n",
		// other and twin vanish with the same body as p: ambiguous, so no rename is claimed.
		"*** IR Dump After D on [module] ***\n; ModuleID = 'm'\ndefine i32 @p() {\n  ret i32 1\n}\n",
	}
	var text string
	var events []Event
	for i, p := range prints {
		events = append(events, Event{Variant: "v", Phase: "middle", Ordinal: i, Pass: string(rune('A' + i)), Ref: Ref{Start: len(text), End: len(text) + len(p), Ordinal: i}})
		text += p
	}
	renames := findRenames(text, events)
	if len(renames) != 1 || renames[0].From != "old" || renames[0].To != "new" || renames[0].Method != "body" || renames[0].Ordinal != 2 || renames[0].BodySHA256 == "" {
		t.Fatalf("renames: %+v", renames)
	}
	defs, order, aliases, module := printFunctions(`; ModuleID = 'x'` + "\n@a = dso_local alias i32 (ptr), ptr @\"quoted name\"\ndefine void @\"quoted name\"() {\n  ret void\n}\n")
	if module || len(order) != 1 || order[0] != "quoted name" || defs["quoted name"] == "" || aliases["a"] != "quoted name" {
		t.Fatalf("parse: %v %v %v %v", defs, order, aliases, module)
	}
}
