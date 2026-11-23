package tracerepo

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func digest(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func run(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	cmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@example.org", "GIT_COMMITTER_NAME=t",
		"GIT_COMMITTER_EMAIL=t@example.org", "GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_SYSTEM=/dev/null")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

func write(t *testing.T, path string, data []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
}

// fixture is a git repository with two commits of src/a.txt, a gzip file, a
// file outside the tree and a symlink pointing at it.
func fixture(t *testing.T) (root, first, second, outside string) {
	t.Helper()
	base := t.TempDir()
	root = filepath.Join(base, "repo")
	outside = filepath.Join(base, "secret.txt")
	write(t, outside, []byte("outside"))
	write(t, filepath.Join(root, "src", "a.txt"), []byte("one\n"))
	var gz bytes.Buffer
	w := gzip.NewWriter(&gz)
	_, _ = w.Write([]byte(`{"rows":[1,2,3]}`))
	_ = w.Close()
	write(t, filepath.Join(root, "data", "rows.json.gz"), gz.Bytes())
	run(t, root, "init", "-q", "-b", "main")
	run(t, root, "add", ".")
	run(t, root, "commit", "-q", "-m", "first")
	first = run(t, root, "rev-parse", "HEAD")
	write(t, filepath.Join(root, "src", "a.txt"), []byte("two\n"))
	run(t, root, "commit", "-q", "-am", "second")
	second = run(t, root, "rev-parse", "HEAD")
	write(t, filepath.Join(root, "src", "a.txt"), []byte("three, uncommitted\n"))
	if err := os.Symlink(outside, filepath.Join(root, "src", "escape.txt")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("a.txt", filepath.Join(root, "src", "alias.txt")); err != nil {
		t.Fatal(err)
	}
	return root, first, second, outside
}

func TestReadIsConfinedToTheRepository(t *testing.T) {
	root, _, _, outside := fixture(t)
	r, err := Open(root, nil)
	if err != nil {
		t.Fatal(err)
	}
	f, err := r.Read("src/a.txt")
	if err != nil || f.Text != "three, uncommitted\n" || f.Revision != Worktree || f.Path != "src/a.txt" ||
		f.SHA256 != digest([]byte("three, uncommitted\n")) || f.Bytes != 19 || f.Gzip {
		t.Fatalf("read: %+v %v", f, err)
	}
	// A symlink that stays inside the tree is followed.
	if f, err := r.Read("src/./alias.txt"); err != nil || f.Text != "three, uncommitted\n" || f.Path != "src/alias.txt" {
		t.Fatalf("inside symlink: %+v %v", f, err)
	}
	for path, want := range map[string]string{
		"../secret.txt":        "leaves the repository",
		"src/../../secret.txt": "leaves the repository",
		outside:                "is absolute",
		"src/escape.txt":       "outside the repository",
		".git/config":          "git's own files",
		"src":                  "is a directory",
		"src/missing.txt":      "does not exist",
		"":                     "non-empty",
	} {
		if _, err := r.Read(path); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%q: %v; want %q", path, err, want)
		}
	}
	// A gzip file is inflated; its digest and size name the stored bytes.
	stored, _ := os.ReadFile(filepath.Join(root, "data", "rows.json.gz"))
	if f, err := r.Read("data/rows.json.gz"); err != nil || f.Text != `{"rows":[1,2,3]}` || !f.Gzip || f.SHA256 != digest(stored) || f.Bytes != len(stored) {
		t.Fatalf("gzip: %+v %v", f, err)
	}
	// The cap is checked from the file size, before reading.
	big, err := os.Create(filepath.Join(root, "big.bin"))
	if err != nil {
		t.Fatal(err)
	}
	if err := big.Truncate(MaxFileBytes + 1); err != nil {
		t.Fatal(err)
	}
	big.Close()
	if _, err := r.Read("big.bin"); err == nil || !strings.Contains(err.Error(), "capped") {
		t.Fatalf("size cap: %v", err)
	}
}

func TestShowReadsCommittedContentAtARevision(t *testing.T) {
	root, first, second, _ := fixture(t)
	r, err := Open(root, nil)
	if err != nil {
		t.Fatal(err)
	}
	if r.Head() != second {
		t.Fatalf("head %s, want %s", r.Head(), second)
	}
	for rev, want := range map[string]string{first: "one\n", first[:8]: "one\n", "main": "two\n", "HEAD~1": "one\n", second: "two\n"} {
		f, err := r.Show(rev, "src/a.txt")
		if err != nil || f.Text != want || f.SHA256 != digest([]byte(want)) || len(f.Revision) != 40 {
			t.Errorf("show %s: %+v %v", rev, f, err)
		}
	}
	if f, err := r.Show(first, "data/rows.json.gz"); err != nil || f.Text != `{"rows":[1,2,3]}` || !f.Gzip {
		t.Fatalf("gzip at revision: %+v %v", f, err)
	}
	for _, tc := range []struct{ rev, path, want string }{
		{"no-such-branch", "src/a.txt", "unknown revision"},
		{"--output=/tmp/x", "src/a.txt", "not a commit name"},
		{"main..HEAD", "src/a.txt", "not a commit name"},
		{"worktree", "src/a.txt", "not a git revision"},
		{first, "src/missing.txt", "does not exist"},
		{first, "src", "is a tree"},
		{first, "../x", "leaves the repository"},
		{strings.Repeat("0", 40), "src/a.txt", "unknown revision"},
	} {
		if _, err := r.Show(tc.rev, tc.path); err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("show %s %s: %v; want %q", tc.rev, tc.path, err, tc.want)
		}
	}
}

func TestListWorktreeAndRevision(t *testing.T) {
	root, first, _, _ := fixture(t)
	r, err := Open(root, nil)
	if err != nil {
		t.Fatal(err)
	}
	entries, err := r.List("src", "")
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]Entry{}
	for _, e := range entries {
		got[e.Name] = e
	}
	if got["a.txt"].Type != "file" || got["a.txt"].Bytes != 19 || got["escape.txt"].Type != "symlink" || len(entries) != 3 {
		t.Fatalf("worktree: %+v", entries)
	}
	if top, err := r.List("", ""); err != nil || len(top) != 2 {
		t.Fatalf("root listing hides .git: %+v %v", top, err)
	}
	at, err := r.List("src", first)
	if err != nil || len(at) != 1 || at[0].Name != "a.txt" || at[0].Bytes != 4 || at[0].Type != "file" {
		t.Fatalf("at revision: %+v %v", at, err)
	}
	if top, err := r.List(".", first); err != nil || len(top) != 2 || top[0].Type != "dir" {
		t.Fatalf("root at revision: %+v %v", top, err)
	}
	if _, err := r.List("src/a.txt", first); err == nil {
		t.Fatal("listing a blob")
	}
}

func TestMountsAreReadAndDigestedAtStartup(t *testing.T) {
	root, _, _, outside := fixture(t)
	r, err := Open(root, map[string]string{"secret": outside})
	if err != nil {
		t.Fatal(err)
	}
	m, err := r.Mount("secret")
	if err != nil || m.Text != "outside" || m.SHA256 != digest([]byte("outside")) || m.Path != outside || m.Revision != "mount" {
		t.Fatalf("mount: %+v %v", m, err)
	}
	// Changing the file later does not change the mount.
	write(t, outside, []byte("changed"))
	if m, _ := r.Mount("secret"); m.Text != "outside" {
		t.Fatal("mount re-read")
	}
	if _, err := r.Mount("other"); err == nil || !strings.Contains(err.Error(), "mounted: secret") {
		t.Fatalf("unknown mount: %v", err)
	}
	for want, mounts := range map[string]map[string]string{
		"JavaScript identifier": {"bad-name": outside},
		"reserved":              {"list": outside},
		"no such file":          {"gone": filepath.Join(root, "nope")},
		"is a directory":        {"dir": root},
	} {
		if _, err := Open(root, mounts); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%v: %v; want %q", mounts, err, want)
		}
	}
	if top, err := Discover(filepath.Join(root, "src")); err != nil || top != root {
		t.Fatalf("discover: %s %v", top, err)
	}
	if _, err := Discover(t.TempDir()); err == nil {
		t.Fatal("discovered a repository in an empty directory")
	}
}
