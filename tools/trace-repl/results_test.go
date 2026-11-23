package main

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/rs/zerolog"
)

// Tests that start a service without --results must not write into the
// user's cache directory.
func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "trace-repl-cache-")
	if err != nil {
		panic(err)
	}
	os.Setenv("XDG_CACHE_HOME", dir)
	code := m.Run()
	os.RemoveAll(dir)
	os.Exit(code)
}

// A result saved from a cell that loaded the working-tree compiler records the
// repository HEAD and the digests of the compiler files it ran.
func TestResultsRecordCompilerAndRepository(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	dir := t.TempDir()
	service, err := newService(ctx, settings{Archive: evidenceRoot(t, "PICOCALC-ROW-IR--*"), Results: dir}, zerolog.Nop())
	if err != nil {
		t.Fatal(err)
	}
	defer service.Close(context.Background())
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	go func() { _ = serveListener(ctx, ln, service, zerolog.Nop()) }()
	cfg := settings{Addr: ln.Addr().String()}
	var session struct{ ID string }
	if err := call(ctx, cfg, http.MethodPost, "/sessions", nil, &session); err != nil {
		t.Fatal(err)
	}
	cfg.Session = session.ID
	cfg.Code = `const w = compiler.at("worktree"); results.save("image-size", w.typedRv32.compile(w.ray, [], 65536).image.length)`
	cfg.Args = []string{`note="first"`}
	if err := client(ctx, cfg, "eval"); err != nil {
		t.Fatal(err)
	}
	var record struct {
		Unit, Session string
		Args          map[string]string
		Repo          struct{ Root, Head string }
		Compilers     []struct {
			Requested, Revision, Key string
			Files                    []struct{ Path, SHA256 string }
		}
		Value int
	}
	data, err := os.ReadFile(filepath.Join(dir, "image-size.json"))
	if err != nil || json.Unmarshal(data, &record) != nil {
		t.Fatal(err, string(data))
	}
	if record.Unit != "cell" || record.Session != session.ID || record.Args["note"] != "first" || len(record.Repo.Head) != 40 || record.Value < 1000 ||
		len(record.Compilers) != 1 || record.Compilers[0].Revision != "worktree" || len(record.Compilers[0].Key) != 64 || len(record.Compilers[0].Files) < 5 {
		t.Fatalf("%s", data)
	}
	cfg.Name = "image-size"
	if err := client(ctx, cfg, "results"); err != nil {
		t.Fatal(err)
	}
	cfg.Name = ""
	var list []struct{ Name string }
	if err := call(ctx, cfg, http.MethodGet, "/results", nil, &list); err != nil || len(list) != 1 || list[0].Name != "image-size" {
		t.Fatalf("%+v %v", list, err)
	}
	var info struct{ Results struct{ Dir string } }
	if err := call(ctx, cfg, http.MethodGet, "/info", nil, &info); err != nil || info.Results.Dir != dir {
		t.Fatalf("%+v %v", info, err)
	}
	// Without --results the store lives in the user cache directory, never in the repository.
	store, err := openResults(settings{})
	if err != nil || !strings.HasPrefix(store.Dir(), os.Getenv("XDG_CACHE_HOME")) {
		t.Fatalf("default store %v %v", store, err)
	}
}
