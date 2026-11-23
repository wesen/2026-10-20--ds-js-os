package traceapi

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dop251/goja"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/tracerepo"
)

func repoVM(t *testing.T, repo *tracerepo.Repo) *goja.Runtime {
	t.Helper()
	vm := goja.New()
	if err := InstallRepo(vm, repo); err != nil {
		t.Fatal(err)
	}
	return vm
}

func TestRepoAndMountsInASession(t *testing.T) {
	root, err := tracerepo.Discover(".")
	if err != nil {
		t.Fatal(err)
	}
	board := filepath.Join(t.TempDir(), "rows.json")
	if err := os.WriteFile(board, []byte(`[{"block":0,"value":1.5}]`), 0o644); err != nil {
		t.Fatal(err)
	}
	repo, err := tracerepo.Open(root, map[string]string{"board": board})
	if err != nil {
		t.Fatal(err)
	}
	readme, err := os.ReadFile(filepath.Join(root, "tools", "trace-repl", "README.md"))
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(readme)
	first, second := repoVM(t, repo), repoVM(t, repo)
	for expr, want := range map[string]string{
		"typeof __repo": "undefined",
		"repo.read('tools/trace-repl/README.md').sha256":                                   hex.EncodeToString(sum[:]),
		"repo.read('tools/trace-repl/README.md').revision":                                 "worktree",
		"repo.show('eaf0872', 'picocalc-os/compiler/typed-rv32.js').bytes":                 "33175",
		"repo.show('eaf0872', 'picocalc-os/compiler/typed-rv32.js').revision":              "eaf087281dbad1183f23eff353145d1c8a413e64",
		"repo.resolve('eaf0872')":                                                          "eaf087281dbad1183f23eff353145d1c8a413e64",
		"repo.list('picocalc-os/tools', 'eaf0872').some(e => e.name === 'rv32-interp.js')": "true",
		"repo.list('picocalc-os/tools', '25cd108').some(e => e.name === 'rv32-interp.js')": "false",
		"Object.keys(repo.read('tools/trace-repl/README.md')).join()":                      "path,revision,sha256,bytes,gzip,text",
		"mounts.board.json()[0].value":                                                     "1.5",
		"mounts.board.revision + ' ' + mounts.board.name":                                  "mount board",
		"JSON.stringify(mounts)":                                                           `[{"name":"board","path":"` + board + `","sha256":"` + mounts0(t, board) + `","bytes":25,"gzip":false}]`,
		"Object.isFrozen(repo) && Object.isFrozen(mounts)":                                 "true",
		"repo.help().includes('repo.show(rev, path)')":                                     "true",
		"mounts.help().includes('currently: board')":                                       "true",
	} {
		v, err := first.RunString(expr)
		if err != nil || v.String() != want {
			t.Errorf("%s = %v (%v); want %s", expr, v, err, want)
		}
	}
	for expr, want := range map[string]string{
		"repo.read('../x')":                              "[repo] path \"../x\" leaves the repository",
		"repo.read('firmware')":                          "is a directory",
		"repo.show('no-such-rev', 'README.md')":          "unknown revision",
		"mounts.board.json.call({path: 'p', text: '{'})": "[repo] p is not JSON",
	} {
		if _, err := first.RunString(expr); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: %v; want %q", expr, err, want)
		}
	}
	// One session's edits to a returned object never reach another session.
	if _, err := first.RunString("mounts.board.text = 'edited'"); err != nil {
		t.Fatal(err)
	}
	if v, _ := first.RunString("mounts.board.text"); v.String() != "edited" {
		t.Fatal("first session lost its own edit")
	}
	if v, _ := second.RunString("mounts.board.text"); v.String() != `[{"block":0,"value":1.5}]` {
		t.Fatalf("edit leaked across sessions: %v", v)
	}
}

func mounts0(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
