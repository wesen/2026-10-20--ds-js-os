// Package traceresults keeps named workbench results as JSON files in one
// directory. A record is written whole to a temporary file and renamed into
// place, so a reader never sees half of one. The package knows nothing about
// sessions: callers build the record (pkg/tracerepl adds the session, script
// digest, args and revision) and the store names, writes, lists and reads it.
package traceresults

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/pkg/errors"
)

// MaxRecordBytes caps one stored record.
const MaxRecordBytes = 32 << 20

var namePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`)

// ErrNotFound is returned by Load for a name the store does not hold.
var ErrNotFound = errors.New("result not found")

// ValidName reports whether name can name a result: 1-128 characters of
// letters, digits, '.', '_' and '-', starting with a letter or digit, without
// "..". The name is the file name without ".json".
func ValidName(name string) error {
	if !namePattern.MatchString(name) || strings.Contains(name, "..") {
		return errors.Errorf("result name %q: use 1-128 letters, digits, '.', '_' or '-', starting with a letter or digit, without '..'", name)
	}
	return nil
}

// Info describes one stored record.
type Info struct {
	Name   string    `json:"name"`
	Path   string    `json:"path"`
	SHA256 string    `json:"sha256"`
	Bytes  int       `json:"bytes"`
	Saved  time.Time `json:"saved"` // the file's modification time
}

// Store is a directory of NAME.json records.
type Store struct {
	dir string
	mu  sync.Mutex // serializes writers; readers see whole files either way
}

// Open creates dir if needed and returns a store over it.
func Open(dir string) (*Store, error) {
	if dir == "" {
		return nil, errors.New("result store needs a directory")
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return nil, errors.Wrap(err, "create result directory")
	}
	return &Store{dir: abs}, nil
}

// Dir is the store's absolute directory.
func (s *Store) Dir() string { return s.dir }

func (s *Store) path(name string) string { return filepath.Join(s.dir, name+".json") }

func info(name, path string, data []byte, saved time.Time) Info {
	sum := sha256.Sum256(data)
	return Info{Name: name, Path: path, SHA256: hex.EncodeToString(sum[:]), Bytes: len(data), Saved: saved.UTC()}
}

// Save writes record, which must be one JSON value, as NAME.json, replacing
// an earlier record of that name. It returns the stored file's description.
func (s *Store) Save(name string, record []byte) (Info, error) {
	if err := ValidName(name); err != nil {
		return Info{}, err
	}
	if len(record) > MaxRecordBytes {
		return Info{}, errors.Errorf("result %s is %d bytes; the store keeps at most %d", name, len(record), MaxRecordBytes)
	}
	if !json.Valid(record) {
		return Info{}, errors.Errorf("result %s is not JSON", name)
	}
	var pretty bytes.Buffer
	if err := json.Indent(&pretty, record, "", "  "); err != nil {
		return Info{}, err
	}
	pretty.WriteByte('\n')
	s.mu.Lock()
	defer s.mu.Unlock()
	tmp, err := os.CreateTemp(s.dir, "."+name+".*.tmp")
	if err != nil {
		return Info{}, errors.Wrap(err, "write result")
	}
	defer os.Remove(tmp.Name()) // a no-op after the rename
	if _, err := tmp.Write(pretty.Bytes()); err != nil {
		tmp.Close()
		return Info{}, errors.Wrap(err, "write result")
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return Info{}, errors.Wrap(err, "write result")
	}
	if err := tmp.Close(); err != nil {
		return Info{}, errors.Wrap(err, "write result")
	}
	path := s.path(name)
	if err := os.Rename(tmp.Name(), path); err != nil {
		return Info{}, errors.Wrap(err, "write result")
	}
	st, err := os.Stat(path)
	if err != nil {
		return Info{}, err
	}
	return info(name, path, pretty.Bytes(), st.ModTime()), nil
}

// Load reads one record.
func (s *Store) Load(name string) ([]byte, Info, error) {
	if err := ValidName(name); err != nil {
		return nil, Info{}, err
	}
	path := s.path(name)
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, Info{}, errors.Wrapf(ErrNotFound, "result %s in %s", name, s.dir)
	}
	if err != nil {
		return nil, Info{}, err
	}
	st, err := os.Stat(path)
	if err != nil {
		return nil, Info{}, err
	}
	return data, info(name, path, data, st.ModTime()), nil
}

// List describes every record, sorted by name.
func (s *Store) List() ([]Info, error) {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return nil, err
	}
	out := []Info{}
	for _, e := range entries {
		name, ok := strings.CutSuffix(e.Name(), ".json")
		if !ok || e.IsDir() || ValidName(name) != nil {
			continue
		}
		_, i, err := s.Load(name)
		if err != nil {
			continue // removed while listing
		}
		out = append(out, i)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}
