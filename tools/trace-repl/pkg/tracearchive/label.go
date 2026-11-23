package tracearchive

// The archive's label, from its ticket directory, and the list of its streams.

import (
	"os"
	"path/filepath"
	"strings"
)

// Label names the capture a service mounted. The manifest has no title, so the
// name comes from the archive directory, which is a docmgr ticket
// (TICKET--slug), and from the Title line of that ticket's index.md.
type Label struct {
	Ticket string `json:"ticket"`
	Title  string `json:"title,omitempty"`
	Dir    string `json:"dir"`
}

// String is the name help text uses, for example
// "PICOCALC-ROW-IR (Trace the ray row through GCC and LLVM optimization passes)".
func (l Label) String() string {
	if l.Title == "" {
		return l.Ticket
	}
	return l.Ticket + " (" + l.Title + ")"
}

func readLabel(dir string) Label {
	base := filepath.Base(dir)
	ticket, _, _ := strings.Cut(base, "--")
	label := Label{Ticket: ticket, Dir: dir}
	index, err := os.ReadFile(filepath.Join(dir, "index.md"))
	if err != nil {
		return label
	}
	front, ok := strings.CutPrefix(string(index), "---\n")
	if !ok {
		return label
	}
	front, _, _ = strings.Cut(front, "\n---")
	for _, line := range strings.Split(front, "\n") {
		if title, ok := strings.CutPrefix(line, "Title:"); ok {
			label.Title = strings.Trim(strings.TrimSpace(title), `"'`)
			break
		}
	}
	return label
}

// StreamInfo is one pass-dump stream as the manifest declares it.
type StreamInfo struct {
	Variant  string `json:"variant"`
	Phase    string `json:"phase"`
	SHA256   string `json:"sha256"`
	RawBytes int    `json:"rawBytes"`
	Dumps    int    `json:"dumps"`
}

// Dir is the absolute archive (ticket) directory given to Open.
func (a *Archive) Dir() string { return a.dir }

// Label names the mounted capture for help text and inventories.
func (a *Archive) Label() Label { return a.label }

// ManifestSHA256 is the digest of the manifest file bytes read by Open.
func (a *Archive) ManifestSHA256() string { return a.manifestSHA }

// Streams lists the streams in Events order (variant, then middle before backend).
func (a *Archive) Streams() []StreamInfo {
	out := make([]StreamInfo, 0, len(a.order))
	for _, id := range a.order {
		spec := a.streams[id].spec
		out = append(out, StreamInfo{Variant: id.variant, Phase: id.phase, SHA256: spec.SHA256, RawBytes: spec.RawBytes, Dumps: spec.Dumps})
	}
	return out
}
