package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/rs/zerolog"
)

func evidenceRoot(t *testing.T, pattern string) string {
	t.Helper()
	roots, err := filepath.Glob(filepath.Join("../../ttmp/2026/11/21", pattern))
	if err != nil || len(roots) != 1 {
		t.Fatalf("locate %s: %v %v", pattern, roots, err)
	}
	return roots[0]
}

// The served product: verified archive, every session's VM, the optional
// device study, the loopback HTTP protocol and an orderly shutdown.
func TestServeWiresVerifiedEvidenceAndOptionalDevice(t *testing.T) {
	archive := evidenceRoot(t, "PICOCALC-ROW-IR--*")
	for _, tc := range []struct {
		device string
		checks map[string]string
	}{
		{"", map[string]string{
			"hardware.help().available":                      "false",
			"typeof require + typeof __trace + typeof fetch": `"undefinedundefinedundefined"`,
		}},
		{evidenceRoot(t, "PICOCALC-PIE-LOOPS--*"), map[string]string{
			"hardware.help().available":                    "true",
			"hardware.pairs('stock','pie','clean').length": "72",
			"hardware.loads('pie').length":                 "6",
		}},
	} {
		ctx, cancel := context.WithCancel(context.Background())
		service, err := newService(ctx, settings{Archive: archive, DeviceStudy: tc.device}, zerolog.Nop())
		if err != nil {
			t.Fatal(err)
		}
		ln, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		done := make(chan error, 1)
		go func() { done <- serveListener(ctx, ln, service, zerolog.Nop()) }()
		base := "http://" + ln.Addr().String() + "/sessions"
		resp, err := http.Post(base, "application/json", nil)
		if err != nil {
			t.Fatal(err)
		}
		var session struct{ ID string }
		if err = json.NewDecoder(resp.Body).Decode(&session); err != nil || resp.StatusCode != http.StatusCreated {
			t.Fatalf("open: %d %v", resp.StatusCode, err)
		}
		resp.Body.Close()
		for expr, want := range tc.checks {
			body, _ := json.Marshal(map[string]string{"source": expr})
			resp, err := http.Post(base+"/"+session.ID+"/eval", "application/json", bytes.NewReader(body))
			if err != nil {
				t.Fatal(err)
			}
			var result struct {
				OK    bool
				Value json.RawMessage
				Error string
			}
			if err = json.NewDecoder(resp.Body).Decode(&result); err != nil || !result.OK || string(result.Value) != want {
				t.Fatalf("device %q: %s = %+v (%v); want %s", tc.device, expr, result, err, want)
			}
			resp.Body.Close()
		}
		if err = client(ctx, settings{Addr: ln.Addr().String(), Session: session.ID}, "close"); err != nil {
			t.Fatal(err)
		}
		cancel()
		select {
		case err := <-done:
			if err != nil {
				t.Fatal(err)
			}
		case <-time.After(10 * time.Second):
			t.Fatal("server did not shut down")
		}
		if err = service.Close(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
}

// A capture whose bytes do not match its manifest is refused before serving.
func TestServeRefusesUnverifiableArchive(t *testing.T) {
	dir := t.TempDir()
	pipe := filepath.Join(dir, "various", "llvm-pipeline")
	if err := os.MkdirAll(pipe, 0o755); err != nil {
		t.Fatal(err)
	}
	raw := "; *** IR Dump After FirstPass on row ***\nret i32 0\n"
	manifest := `{"checked":{"middle":{"sha256":"` + strings.Repeat("0", 64) + `","rawBytes":` + strconv.Itoa(len(raw)) + `,"dumps":1}}}`
	if err := os.WriteFile(filepath.Join(pipe, "manifest.json"), []byte(manifest), 0o644); err != nil {
		t.Fatal(err)
	}
	for name, data := range map[string]string{
		"checked-middle.index.json.gz": `[{"offset":0,"header":"IR Dump After FirstPass on row"}]`,
		"checked-middle.log.gz":        raw,
	} {
		var buf bytes.Buffer
		w := gzip.NewWriter(&buf)
		if _, err := w.Write([]byte(data)); err != nil {
			t.Fatal(err)
		}
		if err := w.Close(); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(pipe, name), buf.Bytes(), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	_, err := newService(context.Background(), settings{Archive: dir}, zerolog.Nop())
	if err == nil || !strings.Contains(err.Error(), "verify evidence archive") || !strings.Contains(err.Error(), "SHA-256") {
		t.Fatalf("unverifiable archive accepted: %v", err)
	}
}

func TestPublicCommandGrammar(t *testing.T) {
	for _, tc := range []struct {
		args       []string
		wantErr    string
		wantOutput string
	}{
		{[]string{"serve", "--help"}, "", "--archive"},
		{[]string{"eval", "--help"}, "", "--session"},
		{[]string{"serve", "--archive", ".", "--addr", "0.0.0.0:3791"}, "loopback", ""},
		{[]string{"eval", "--code", "1+1"}, "session", ""},
	} {
		root, err := root()
		if err != nil {
			t.Fatal(err)
		}
		var out bytes.Buffer
		root.SetOut(&out)
		root.SetErr(&out)
		root.SetArgs(tc.args)
		err = root.ExecuteContext(context.Background())
		if tc.wantErr == "" && err != nil {
			t.Fatalf("%v: %s", tc.args, err)
		}
		if tc.wantErr != "" && (err == nil || !strings.Contains(err.Error(), tc.wantErr)) {
			t.Fatalf("%v: expected %q, got %v", tc.args, tc.wantErr, err)
		}
		if !strings.Contains(out.String(), tc.wantOutput) {
			t.Fatalf("%v: missing %s in %q", tc.args, tc.wantOutput, out.String())
		}
	}
}
