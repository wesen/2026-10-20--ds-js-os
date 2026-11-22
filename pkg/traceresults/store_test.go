package traceresults

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSaveLoadListReplace(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "nested", "results"))
	if err != nil {
		t.Fatal(err)
	}
	a, err := s.Save("ray-frame", []byte(`{"value": 1}`))
	if err != nil || a.Name != "ray-frame" || a.Path != filepath.Join(s.Dir(), "ray-frame.json") || len(a.SHA256) != 64 {
		t.Fatalf("%+v %v", a, err)
	}
	data, info, err := s.Load("ray-frame")
	if err != nil || string(data) != "{\n  \"value\": 1\n}\n" || info.SHA256 != a.SHA256 || info.Bytes != len(data) {
		t.Fatalf("%q %+v %v", data, info, err)
	}
	b, err := s.Save("ray-frame", []byte(`{"value": 2}`))
	if err != nil || b.SHA256 == a.SHA256 {
		t.Fatalf("replace: %+v %v", b, err)
	}
	if _, err := s.Save("b.v2_x-1", []byte(`[1]`)); err != nil {
		t.Fatal(err)
	}
	list, err := s.List()
	if err != nil || len(list) != 2 || list[0].Name != "b.v2_x-1" || list[1].Name != "ray-frame" {
		t.Fatalf("%+v %v", list, err)
	}
	entries, _ := os.ReadDir(s.Dir())
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".tmp") {
			t.Fatalf("temporary file left behind: %s", e.Name())
		}
	}
}

func TestRefusals(t *testing.T) {
	s, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"", ".hidden", "../up", "a/b", "a..b", "-x", strings.Repeat("n", 129), "space name"} {
		if _, err := s.Save(name, []byte("1")); err == nil {
			t.Errorf("name %q accepted", name)
		}
		if _, _, err := s.Load(name); err == nil {
			t.Errorf("load %q accepted", name)
		}
	}
	if _, err := s.Save("x", []byte("{not json")); err == nil {
		t.Error("invalid JSON accepted")
	}
	if _, err := s.Save("x", make([]byte, MaxRecordBytes+1)); err == nil {
		t.Error("oversized record accepted")
	}
	if _, _, err := s.Load("absent"); !errors.Is(err, ErrNotFound) {
		t.Errorf("absent: %v", err)
	}
	if _, err := Open(""); err == nil {
		t.Error("empty directory accepted")
	}
}
