// Package tracerepo gives trace-REPL sessions read-only access to files of one
// repository, in its working tree or at a git revision, and to files mounted
// explicitly at startup. Every file it returns carries the SHA-256 of the
// bytes as stored, so a value in a session can be traced to exact bytes.
package tracerepo

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pkg/errors"
)

const (
	// MaxFileBytes caps a file as stored, compressed or not.
	MaxFileBytes = 32 << 20
	// MaxTextBytes caps the inflated text of a .gz file.
	MaxTextBytes = 64 << 20
	// Worktree names the files on disk now, as opposed to a git revision.
	Worktree    = "worktree"
	gitDeadline = 30 * time.Second
)

// File is one read. Path is repository-relative (slash-separated) for repo
// reads and the absolute path for mounts. SHA256 and Bytes describe the
// stored bytes; Text is the content, inflated when Gzip is true.
type File struct {
	Path     string `json:"path"`
	Revision string `json:"revision"`
	SHA256   string `json:"sha256"`
	Bytes    int    `json:"bytes"`
	Gzip     bool   `json:"gzip"`
	Text     string `json:"-"`
}

// Entry is one directory entry of a listing.
type Entry struct {
	Name  string `json:"name"`
	Type  string `json:"type"` // file, dir, symlink, submodule, other
	Bytes int64  `json:"bytes"`
}

// Mount is a file outside (or inside) the repository named on the command
// line. It is read and digested once, at startup, and never re-read.
type Mount struct {
	Name string `json:"name"`
	File
}

// MountInfo describes a mount without its text.
type MountInfo struct {
	Name   string `json:"name"`
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Bytes  int    `json:"bytes"`
	Gzip   bool   `json:"gzip"`
}

func (m *Mount) Info() MountInfo {
	return MountInfo{Name: m.Name, Path: m.Path, SHA256: m.SHA256, Bytes: m.Bytes, Gzip: m.Gzip}
}

type Repo struct {
	root   string // absolute, symlinks resolved
	head   string // HEAD at Open, "" outside git
	mounts map[string]*Mount
	order  []string

	mu        sync.Mutex
	blobs     map[string]*File // commit + ":" + path; immutable once stored
	blobBytes int
}

// maxCachedBytes bounds the revision cache. When a new entry would exceed it
// the cache starts over; entries are immutable, so dropping one costs only a
// later git read.
const maxCachedBytes = 256 << 20

var (
	mountName = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
	revision  = regexp.MustCompile(`^[A-Za-z0-9_][A-Za-z0-9._/@{}^~-]*$`)
	fullSHA   = regexp.MustCompile(`^[0-9a-f]{40}$`)
)

// Open confines reads to root. mounts maps names to file paths; each is read
// and digested now, so a missing or oversized mount stops startup.
func Open(root string, mounts map[string]string) (*Repo, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, errors.Wrap(err, "resolve repository root")
	}
	resolved, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return nil, errors.Wrap(err, "resolve repository root")
	}
	if info, err := os.Stat(resolved); err != nil || !info.IsDir() {
		return nil, errors.Errorf("repository root %s is not a directory", resolved)
	}
	r := &Repo{root: resolved, mounts: map[string]*Mount{}, blobs: map[string]*File{}}
	if out, err := r.git(context.Background(), "rev-parse", "--verify", "--quiet", "HEAD^{commit}"); err == nil {
		r.head = strings.TrimSpace(string(out))
	}
	for name, file := range mounts {
		if !mountName.MatchString(name) {
			return nil, errors.Errorf("mount name %q must be a JavaScript identifier (letters, digits, _), for example board=/path/rows.json", name)
		}
		if name == "list" || name == "help" || name == "toJSON" {
			return nil, errors.Errorf("mount name %q is reserved for mounts.%s()", name, name)
		}
		m, err := readMount(name, file)
		if err != nil {
			return nil, err
		}
		r.mounts[name] = m
		r.order = append(r.order, name)
	}
	sort.Strings(r.order)
	return r, nil
}

// Discover returns the top level of the git work tree containing dir.
func Discover(dir string) (string, error) {
	cmd := exec.Command("git", "-C", dir, "rev-parse", "--show-toplevel")
	cmd.Env = gitEnv()
	out, err := cmd.Output()
	if err != nil {
		return "", errors.Errorf("%s is not inside a git work tree; pass --repo", dir)
	}
	return strings.TrimSpace(string(out)), nil
}

func (r *Repo) Root() string { return r.root }

// Head is HEAD of the repository at startup, or "" when it is not a git work tree.
func (r *Repo) Head() string { return r.head }

// Mounts lists the mounts by name.
func (r *Repo) Mounts() []*Mount {
	out := make([]*Mount, 0, len(r.order))
	for _, name := range r.order {
		out = append(out, r.mounts[name])
	}
	return out
}

// Mount returns one mount by name.
func (r *Repo) Mount(name string) (*Mount, error) {
	m := r.mounts[name]
	if m == nil {
		return nil, errors.Errorf("no mount named %q; mounted: %s (start the service with --mount %s=PATH)", name, r.mountList(), name)
	}
	return m, nil
}

func (r *Repo) mountList() string {
	if len(r.order) == 0 {
		return "none"
	}
	return strings.Join(r.order, ", ")
}

func readMount(name, file string) (*Mount, error) {
	abs, err := filepath.Abs(file)
	if err != nil {
		return nil, errors.Wrapf(err, "mount %s", name)
	}
	f, err := readRegular(abs)
	if err != nil {
		return nil, errors.Wrapf(err, "mount %s=%s", name, file)
	}
	f.Path = abs
	f.Revision = "mount"
	return &Mount{Name: name, File: *f}, nil
}

// clean turns a repository-relative path into its slash-separated canonical
// form, or explains why it is not one.
func clean(p string) (string, error) {
	if p == "" || strings.ContainsRune(p, 0) {
		return "", errors.New("path must be a non-empty repository-relative path")
	}
	if filepath.IsAbs(p) || strings.HasPrefix(p, "/") {
		return "", errors.Errorf("path %q is absolute; give a path relative to the repository root, or mount the file with --mount", p)
	}
	c := path.Clean(filepath.ToSlash(p))
	if c == ".." || strings.HasPrefix(c, "../") {
		return "", errors.Errorf("path %q leaves the repository", p)
	}
	for _, part := range strings.Split(c, "/") {
		if part == ".git" {
			return "", errors.Errorf("path %q names git's own files; use repo.show(rev, path) for content at a revision", p)
		}
	}
	return c, nil
}

// inside resolves symlinks and checks that the result stays below the root.
func (r *Repo) inside(rel string) (string, error) {
	full := filepath.Join(r.root, filepath.FromSlash(rel))
	resolved, err := filepath.EvalSymlinks(full)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return "", errors.Errorf("%s does not exist in the working tree of %s", rel, r.root)
		}
		return "", err
	}
	if resolved != r.root && !strings.HasPrefix(resolved, r.root+string(filepath.Separator)) {
		return "", errors.Errorf("%s resolves to %s, outside the repository; mount it explicitly with --mount NAME=PATH", rel, resolved)
	}
	return resolved, nil
}

// Read returns a working-tree file now. It is not cached: the file may change.
func (r *Repo) Read(p string) (*File, error) {
	rel, err := clean(p)
	if err != nil {
		return nil, err
	}
	full, err := r.inside(rel)
	if err != nil {
		return nil, err
	}
	f, err := readRegular(full)
	if err != nil {
		return nil, errors.Wrap(err, rel)
	}
	f.Path = rel
	f.Revision = Worktree
	return f, nil
}

func readRegular(full string) (*File, error) {
	info, err := os.Stat(full)
	if err != nil {
		return nil, err
	}
	if info.IsDir() {
		return nil, errors.New("is a directory; use repo.list(path)")
	}
	if !info.Mode().IsRegular() {
		return nil, errors.New("is not a regular file")
	}
	if info.Size() > MaxFileBytes {
		return nil, errors.Errorf("is %d bytes; files are capped at %d", info.Size(), MaxFileBytes)
	}
	f, err := os.Open(full)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, MaxFileBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > MaxFileBytes {
		return nil, errors.Errorf("grew past %d bytes while being read", MaxFileBytes)
	}
	return fromBytes(data, strings.HasSuffix(full, ".gz"))
}

// fromBytes digests the stored bytes and inflates a gzip file.
func fromBytes(data []byte, gz bool) (*File, error) {
	sum := sha256.Sum256(data)
	f := &File{SHA256: hex.EncodeToString(sum[:]), Bytes: len(data), Gzip: gz}
	if !gz {
		f.Text = string(data)
		return f, nil
	}
	zr, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, errors.Wrap(err, "open gzip")
	}
	defer zr.Close()
	text, err := io.ReadAll(io.LimitReader(zr, MaxTextBytes+1))
	if err != nil {
		return nil, errors.Wrap(err, "inflate gzip")
	}
	if len(text) > MaxTextBytes {
		return nil, errors.Errorf("inflates past %d bytes", MaxTextBytes)
	}
	f.Text = string(text)
	return f, nil
}

// Resolve turns a revision name into a full commit SHA.
func (r *Repo) Resolve(rev string) (string, error) {
	if rev == Worktree {
		return "", errors.New(`"worktree" is not a git revision; use repo.read(path) for working-tree files`)
	}
	if len(rev) > 128 || !revision.MatchString(rev) || strings.Contains(rev, "..") {
		return "", errors.Errorf("revision %q is not a commit name, tag, branch or abbreviated SHA", rev)
	}
	if fullSHA.MatchString(rev) {
		// A full SHA still has to name a commit in this repository.
		if _, err := r.git(context.Background(), "cat-file", "-e", rev+"^{commit}"); err == nil {
			return rev, nil
		}
	}
	out, err := r.git(context.Background(), "rev-parse", "--verify", "--quiet", "--end-of-options", rev+"^{commit}")
	if err != nil {
		return "", errors.Errorf("unknown revision %q in %s", rev, r.root)
	}
	return strings.TrimSpace(string(out)), nil
}

// Show returns a file at a revision. Content at a commit is immutable, so a
// successful read is cached for every session.
func (r *Repo) Show(rev, p string) (*File, error) {
	commit, err := r.Resolve(rev)
	if err != nil {
		return nil, err
	}
	rel, err := clean(p)
	if err != nil {
		return nil, err
	}
	key := commit + ":" + rel
	r.mu.Lock()
	cached := r.blobs[key]
	r.mu.Unlock()
	if cached != nil {
		return cached, nil
	}
	ctx := context.Background()
	kind, err := r.git(ctx, "cat-file", "-t", key)
	if err != nil {
		return nil, errors.Errorf("%s does not exist at %s", rel, short(commit))
	}
	if t := strings.TrimSpace(string(kind)); t != "blob" {
		return nil, errors.Errorf("%s is a %s at %s; use repo.list(path, rev)", rel, t, short(commit))
	}
	size, err := r.git(ctx, "cat-file", "-s", key)
	if err != nil {
		return nil, err
	}
	if n, _ := strconv.Atoi(strings.TrimSpace(string(size))); n > MaxFileBytes {
		return nil, errors.Errorf("%s is %d bytes at %s; files are capped at %d", rel, n, short(commit), MaxFileBytes)
	}
	data, err := r.git(ctx, "cat-file", "blob", key)
	if err != nil {
		return nil, err
	}
	f, err := fromBytes(data, strings.HasSuffix(rel, ".gz"))
	if err != nil {
		return nil, errors.Wrapf(err, "%s at %s", rel, short(commit))
	}
	f.Path = rel
	f.Revision = commit
	r.mu.Lock()
	if r.blobBytes+len(f.Text) > maxCachedBytes {
		r.blobs, r.blobBytes = map[string]*File{}, 0
	}
	r.blobs[key] = f
	r.blobBytes += len(f.Text)
	r.mu.Unlock()
	return f, nil
}

// List returns the entries of a directory in the working tree (rev "" or
// "worktree") or at a revision, sorted by name.
func (r *Repo) List(p, rev string) ([]Entry, error) {
	rel := "."
	if p != "" && p != "." {
		var err error
		if rel, err = clean(p); err != nil {
			return nil, err
		}
	}
	if rev == "" || rev == Worktree {
		full, err := r.inside(rel)
		if err != nil {
			return nil, err
		}
		items, err := os.ReadDir(full)
		if err != nil {
			return nil, errors.Wrap(err, rel)
		}
		out := make([]Entry, 0, len(items))
		for _, item := range items {
			if item.Name() == ".git" {
				continue
			}
			e := Entry{Name: item.Name(), Type: "other"}
			switch {
			case item.Type()&fs.ModeSymlink != 0:
				e.Type = "symlink"
			case item.IsDir():
				e.Type = "dir"
			case item.Type().IsRegular():
				e.Type = "file"
				if info, err := item.Info(); err == nil {
					e.Bytes = info.Size()
				}
			}
			out = append(out, e)
		}
		return out, nil
	}
	commit, err := r.Resolve(rev)
	if err != nil {
		return nil, err
	}
	tree := commit
	if rel != "." {
		tree += ":" + rel
	}
	out, err := r.git(context.Background(), "ls-tree", "-z", "-l", tree)
	if err != nil {
		return nil, errors.Errorf("%s is not a directory at %s", rel, short(commit))
	}
	var entries []Entry
	for _, record := range strings.Split(strings.TrimSuffix(string(out), "\x00"), "\x00") {
		if record == "" {
			continue
		}
		meta, name, ok := strings.Cut(record, "\t")
		fields := strings.Fields(meta)
		if !ok || len(fields) != 4 {
			return nil, errors.Errorf("unexpected ls-tree record %q", record)
		}
		e := Entry{Name: name, Type: "other"}
		switch {
		case fields[1] == "tree":
			e.Type = "dir"
		case fields[1] == "commit":
			e.Type = "submodule"
		case fields[0] == "120000":
			e.Type = "symlink"
		case fields[1] == "blob":
			e.Type = "file"
			e.Bytes, _ = strconv.ParseInt(fields[3], 10, 64)
		}
		entries = append(entries, e)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name < entries[j].Name })
	return entries, nil
}

// git runs a read-only plumbing command in the repository. Optional locks are
// disabled so that no command here rewrites the index.
func (r *Repo) git(ctx context.Context, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, gitDeadline)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", append([]string{"-C", r.root}, args...)...)
	cmd.Env = gitEnv()
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return nil, errors.Errorf("git %s: %s", strings.Join(args, " "), msg)
	}
	return out, nil
}

func gitEnv() []string {
	return append(os.Environ(), "GIT_OPTIONAL_LOCKS=0", "GIT_TERMINAL_PROMPT=0", "GIT_PAGER=cat", "LC_ALL=C")
}

func short(commit string) string {
	if len(commit) > 12 {
		return commit[:12]
	}
	return commit
}
