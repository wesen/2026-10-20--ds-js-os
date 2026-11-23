// Package tracecompiler loads the Typed compiler (compiler/typed, formerly
// picocalc-os/compiler) and its host tools at a git revision or from the
// working tree, so that one session VM can hold several compiler revisions side
// by side.
//
// The files moved during PICOCALC-REPO-LAYOUT. Every module therefore names its
// paths newest layout first, and a revision loads the first one that exists
// there: compiler.at works at commits before and after each move.
//
// The compiler files are classic scripts. Each publishes its module with
// `globalThis.<name> = …` and finds the others either through globalThis or
// by bare name. A revision is loaded by evaluating all of its files inside one
// function whose scope shadows globalThis with a prototype-less object and
// declares each bare name as a let binding (see wrap). Revisions therefore
// share nothing and leave no trace on the real global object.
package tracecompiler

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"sync"

	"github.com/dop251/goja"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/tracerepo"
	"github.com/pkg/errors"
)

// Module is one compiler file, in load order.
type Module struct {
	Binding  string   `json:"binding"` // the name the file publishes on globalThis
	Alias    string   `json:"alias"`   // the property on a loaded revision
	Paths    []string `json:"paths"`   // newest layout first; a revision loads the first that exists
	Required bool     `json:"required"`
}

// Modules lists the files a revision loads, in the order PICOCALC-RAY-PARITY
// used. The order only has to put each file after those it uses at load time;
// later references go through live let bindings.
var Modules = []Module{
	{"typedWasm", "typedWasm", compilerPaths("typed-wasm.js"), true},
	{"typedAsync", "typedAsync", compilerPaths("typed-async.js"), false},
	{"typedWorld", "typedWorld", compilerPaths("typed-world.js"), true},
	{"typedRv32", "typedRv32", compilerPaths("typed-rv32.js"), true},
	{"typedPieLoops", "typedPieLoops", compilerPaths("typed-pie-loops.js"), false},
	{"typedRv32Interp", "interp", toolPaths("rv32-interp.js"), false},
	{"typedRayBench", "rayBench", toolPaths("typed-ray-bench.js"), false},
}

func compilerPaths(name string) []string {
	return []string{"compiler/typed/" + name, "picocalc-os/compiler/" + name}
}

func toolPaths(name string) []string {
	return []string{"bench/host/" + name, "picocalc-os/tools/" + name}
}

// WorldRoots are the directories that have held the Typed worlds, newest first.
var WorldRoots = []string{"apps/typed", "picocalc-os/worlds"}

// File is one loaded file. Line is the wrapper line at which it starts, so a
// stack position "compiler@rev:LINE:COL" can be mapped back to the file.
type File struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Bytes  int    `json:"bytes"`
	Line   int    `json:"line"`
}

// Bundle is one revision's compiled wrapper. It is immutable and shared by
// every session; each session runs Program to get its own module objects.
type Bundle struct {
	Revision string        `json:"revision"` // full commit SHA or "worktree"
	Files    []File        `json:"files"`
	Missing  []string      `json:"missing"`
	Worlds   string        `json:"worlds"` // the WorldRoots entry that exists at this revision
	Key      string        `json:"key"`    // SHA-256 over the files' paths and digests
	Program  *goja.Program `json:"-"`
}

// Provider resolves and caches bundles for all sessions of a service.
type Provider struct {
	repo *tracerepo.Repo

	mu       sync.Mutex
	byCommit map[string]*Bundle
	byKey    map[string]*Bundle // compiled programs by content, for worktree reloads
}

const maxCached = 32

func New(repo *tracerepo.Repo) *Provider {
	return &Provider{repo: repo, byCommit: map[string]*Bundle{}, byKey: map[string]*Bundle{}}
}

// Repo is the repository the provider reads from.
func (p *Provider) Repo() *tracerepo.Repo { return p.repo }

// Cached lists the commits whose bundles are compiled, sorted.
func (p *Provider) Cached() []string {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]string, 0, len(p.byCommit))
	for commit := range p.byCommit {
		out = append(out, commit)
	}
	sort.Strings(out)
	return out
}

// At returns the bundle of a revision. "worktree" reads the files on disk
// now; any other name is resolved to a commit, whose bundle is cached.
func (p *Provider) At(rev string) (*Bundle, error) {
	if rev == tracerepo.Worktree {
		return p.load(tracerepo.Worktree, func(path string) (*tracerepo.File, error) { return p.repo.Read(path) })
	}
	commit, err := p.repo.Resolve(rev)
	if err != nil {
		return nil, err
	}
	p.mu.Lock()
	cached := p.byCommit[commit]
	p.mu.Unlock()
	if cached != nil {
		return cached, nil
	}
	b, err := p.load(commit, func(path string) (*tracerepo.File, error) { return p.repo.Show(commit, path) })
	if err != nil {
		return nil, err
	}
	p.mu.Lock()
	if len(p.byCommit) >= maxCached {
		p.byCommit = map[string]*Bundle{}
	}
	p.byCommit[commit] = b
	p.mu.Unlock()
	return b, nil
}

func (p *Provider) load(revision string, read func(string) (*tracerepo.File, error)) (*Bundle, error) {
	texts := make([]string, len(Modules))
	present := make([]bool, len(Modules))
	b := &Bundle{Revision: revision, Missing: []string{}}
	key := sha256.New()
	for i, m := range Modules {
		var f *tracerepo.File
		var path string
		var err error
		for _, path = range m.Paths {
			if f, err = read(path); err == nil || !strings.Contains(err.Error(), "does not exist") {
				break
			}
		}
		if err != nil {
			if !m.Required && strings.Contains(err.Error(), "does not exist") {
				b.Missing = append(b.Missing, m.Paths[len(m.Paths)-1])
				continue
			}
			return nil, errors.Wrapf(err, "load compiler at %s", label(revision))
		}
		texts[i], present[i] = f.Text, true
		b.Files = append(b.Files, File{Path: path, SHA256: f.SHA256, Bytes: f.Bytes})
		fmt.Fprintf(key, "%s %s\n", path, f.SHA256)
	}
	worlds, err := p.worldRoot(revision)
	if err != nil {
		return nil, err
	}
	b.Worlds = worlds
	b.Key = hex.EncodeToString(key.Sum(nil))
	p.mu.Lock()
	same := p.byKey[b.Key]
	p.mu.Unlock()
	src, lines := wrap(texts, present)
	for i := range b.Files {
		b.Files[i].Line = lines[i]
	}
	if same != nil {
		// Identical files compile to an identical program; reuse it.
		b.Program = same.Program
		return b, nil
	}
	program, err := goja.Compile("compiler@"+label(revision), src, false)
	if err != nil {
		return nil, errors.Wrapf(err, "compile compiler files at %s", label(revision))
	}
	b.Program = program
	p.mu.Lock()
	if len(p.byKey) >= maxCached {
		p.byKey = map[string]*Bundle{}
	}
	p.byKey[b.Key] = b
	p.mu.Unlock()
	return b, nil
}

// wrap builds the isolating wrapper. Each file is followed by a newline and a
// statement that starts with `;`: a file may end in a // comment, and every
// file starts with `(`, which would otherwise call the previous file's result.
// It returns the source and the first wrapper line of each present file.
func wrap(texts []string, present []bool) (string, []int) {
	var b strings.Builder
	names := make([]string, len(Modules))
	for i, m := range Modules {
		names[i] = m.Binding
	}
	b.WriteString("(function () {\nconst globalThis = Object.create(null);\nlet " + strings.Join(names, ", ") + ";\n")
	line := 4
	var starts []int
	for i, m := range Modules {
		if !present[i] {
			continue
		}
		starts = append(starts, line)
		b.WriteString(texts[i])
		b.WriteString("\n;" + m.Binding + " = globalThis." + m.Binding + ";\n")
		line += strings.Count(texts[i], "\n") + 2
	}
	b.WriteString("return globalThis;\n})()\n")
	return b.String(), starts
}

func label(revision string) string {
	if len(revision) == 40 {
		return revision[:12]
	}
	return revision
}

// Where maps a wrapper line to a file and a line within it.
func (b *Bundle) Where(line int) (string, int, bool) {
	for i := len(b.Files) - 1; i >= 0; i-- {
		if line >= b.Files[i].Line {
			return b.Files[i].Path, line - b.Files[i].Line + 1, true
		}
	}
	return "", 0, false
}

// worldRoot is the first of WorldRoots that exists at a revision (or "worktree").
func (p *Provider) worldRoot(rev string) (string, error) {
	for _, root := range WorldRoots {
		if _, err := p.repo.List(root, rev); err == nil {
			return root, nil
		} else if !absent(err) {
			return "", errors.Wrapf(err, "list %s at %s", root, label(rev))
		}
	}
	return "", errors.Errorf("no Typed world directory (%s) at %s", strings.Join(WorldRoots, ", "), label(rev))
}

// absent reports whether a repository read failed because the path is not there
// at that revision (tracerepo says "does not exist" for files and "is not a
// directory" for a directory it cannot list).
func absent(err error) bool {
	return strings.Contains(err.Error(), "does not exist") || strings.Contains(err.Error(), "is not a directory")
}

// TypedSources lists every *.typed file under the revision's world directory
// (WorldRoots) at a revision (or "worktree"), sorted, as repository-relative paths.
func (p *Provider) TypedSources(rev string) ([]string, error) {
	var out []string
	var walk func(dir string) error
	walk = func(dir string) error {
		entries, err := p.repo.List(dir, rev)
		if err != nil {
			return err
		}
		for _, e := range entries {
			path := dir + "/" + e.Name
			switch {
			case e.Type == "dir":
				if err := walk(path); err != nil {
					return err
				}
			case e.Type == "file" && strings.HasSuffix(e.Name, ".typed"):
				out = append(out, path)
			}
		}
		return nil
	}
	root, err := p.worldRoot(rev)
	if err != nil {
		return nil, err
	}
	if err := walk(root); err != nil {
		return nil, err
	}
	sort.Strings(out)
	return out, nil
}
