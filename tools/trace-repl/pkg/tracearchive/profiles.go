package tracearchive

// Execution summaries (profiles) and the initial module of a variant.

import (
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"strings"

	"github.com/pkg/errors"
)

func (a *Archive) loadProfile(name string) (*profile, error) {
	p := a.profiles[name]
	if p == nil {
		return nil, errors.Errorf("unknown profile %q; available: execution, metrics, typed", name)
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.digest == "" {
		raw, err := os.ReadFile(p.path)
		if err != nil {
			return nil, errors.Wrapf(err, "read profile %q", name)
		}
		var value interface{}
		if err = json.Unmarshal(raw, &value); err != nil {
			return nil, errors.Wrapf(err, "decode profile %q", name)
		}
		sum := sha256.Sum256(raw)
		p.value = value
		p.digest = hex.EncodeToString(sum[:])
		a.profileLoads.Add(1)
	}
	return p, nil
}

// Profile returns private JSON data that a caller may mutate, independent of
// other sessions. A successful load parses and hashes each profile file once.
func (a *Archive) Profile(name string) (interface{}, error) {
	p, err := a.loadProfile(name)
	if err != nil {
		return nil, err
	}
	a.profileReads.Add(1)
	return cloneJSON(p.value), nil
}

// ProfileSHA returns the SHA-256 of the original file bytes for JSON citations.
func (a *Archive) ProfileSHA(name string) (string, error) {
	p, err := a.loadProfile(name)
	if err != nil {
		return "", err
	}
	return p.digest, nil
}

func cloneJSON(value interface{}) interface{} {
	switch x := value.(type) {
	case map[string]interface{}:
		m := make(map[string]interface{}, len(x))
		for k, v := range x {
			m[k] = cloneJSON(v)
		}
		return m
	case []interface{}:
		items := make([]interface{}, len(x))
		for i, v := range x {
			items[i] = cloneJSON(v)
		}
		return items
	default:
		return value
	}
}

// InitialModule returns the archived pre-optimization IR module and the digest
// of its uncompressed bytes. Its digest is calculated on first use because
// the stream manifest enumerates pass dumps, not the standalone modules.
func (a *Archive) InitialModule(variant string) (text, digest string, err error) {
	m := a.initialModules[variant]
	if m == nil {
		return "", "", errors.Errorf("unknown initial-module variant %q; available: %s", variant, strings.Join(a.variants, ", "))
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.digest != "" {
		return m.text, m.digest, nil
	}
	f, err := os.Open(m.path)
	if err != nil {
		return "", "", errors.Wrap(err, "open initial LLVM module")
	}
	defer f.Close()
	r, err := gzip.NewReader(f)
	if err != nil {
		return "", "", errors.Wrap(err, "open gzipped initial LLVM module")
	}
	defer r.Close()
	data, err := io.ReadAll(r)
	if err != nil {
		return "", "", errors.Wrap(err, "inflate initial LLVM module")
	}
	sum := sha256.Sum256(data)
	m.text = string(data)
	m.digest = hex.EncodeToString(sum[:])
	a.moduleLoads.Add(1)
	return m.text, m.digest, nil
}
