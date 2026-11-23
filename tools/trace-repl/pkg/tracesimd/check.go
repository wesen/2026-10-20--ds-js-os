package tracesimd

// Validation: every key a study must carry, and the checks of decisions, traces and packet sets.

import (
	"fmt"
	"path"
	"regexp"
	"sort"
	"strings"

	"github.com/pkg/errors"
)

// required lists keys that must be present and non-null at each path.
// encoding/json alone cannot tell a missing integer from a zero.
var required = map[string][]string{
	"":                       {"format", "images", "decisions", "traces", "packetSets"},
	"images":                 {"sha256", "code"},
	"decisions":              {"id", "function", "source", "imageSHA", "plan", "alternatives", "ranges"},
	"decisions.source":       {"path", "sha256", "lineStart", "lineEnd"},
	"decisions.alternatives": {"plan", "status", "reason"},
	"decisions.ranges":       {"start", "end", "role"},
	"traces":                 {"id", "imageSHA", "workload", "steps", "counts"},
	"traces.counts":          {"pc", "executions"},
	"packetSets":             {"workload", "sourceSHA", "packets"},
	"packetSets.packets":     {"pose", "row", "group", "lanes", "hitMask"},
}

func checkKeys(at string, v any) error {
	switch x := v.(type) {
	case []any:
		for i, e := range x {
			if err := checkKeys(at, e); err != nil {
				return errors.Wrapf(err, "[%d]", i)
			}
		}
	case map[string]any:
		for _, k := range required[at] {
			if e, ok := x[k]; !ok || e == nil {
				return fmt.Errorf("missing field %q", k)
			}
		}
		for k, e := range x {
			child := strings.TrimPrefix(at+"."+k, ".")
			if _, ok := required[child]; ok {
				if err := checkKeys(child, e); err != nil {
					return errors.Wrap(err, k)
				}
			}
		}
	}
	return nil
}

var hex64 = regexp.MustCompile(`^[0-9a-f]{64}$`)

func safe(v int64) bool { return v >= 0 && v <= MaxSafe }

// datasetPath accepts only clean relative slash paths inside the dataset.
func datasetPath(p string) bool {
	return p != "" && p != "." && !strings.ContainsAny(p, "\\:\x00") && !path.IsAbs(p) &&
		path.Clean(p) == p && p != ".." && !strings.HasPrefix(p, "../")
}

// isInstruction checks the low two bits used by this compiler’s fixed-width
// RV32 and PIE words. The emitting compiler supplies the instruction ranges.
// Data with the same low bits would pass this prefix check.
func isInstruction(code []byte, off int64) bool { return code[off]&3 == 3 }

func checkDecision(d Decision, code map[string][]byte) error {
	src := d.Source
	switch {
	case d.ID == "" || d.Function == "" || d.Plan == "":
		return fmt.Errorf("malformedDecision: id, function and plan must be nonempty")
	case !datasetPath(src.Path):
		return fmt.Errorf("pathOutsideDataset: source.path %q must be a clean relative path inside the dataset", src.Path)
	case !hex64.MatchString(src.SHA256):
		return fmt.Errorf("badDigest: source.sha256 %q", src.SHA256)
	case src.LineStart < 1 || src.LineEnd < src.LineStart || !safe(src.LineEnd):
		return fmt.Errorf("badSourceInterval: lines %d..%d", src.LineStart, src.LineEnd)
	case code[d.ImageSHA] == nil:
		return fmt.Errorf("unknownImage: imageSHA %q is not among images", d.ImageSHA)
	case len(d.Ranges) == 0:
		return fmt.Errorf("malformedDecision: no ranges")
	}
	for i, a := range d.Alternatives {
		if a.Plan == "" || a.Status == "" || a.Reason == "" {
			return fmt.Errorf("malformedDecision: alternatives[%d] needs plan, status and reason", i)
		}
	}
	img := code[d.ImageSHA]
	byRole := map[string][]Range{}
	for i, r := range d.Ranges {
		if r.Role == "" {
			return fmt.Errorf("malformedRange: ranges[%d] has no role", i)
		}
		if r.Start < 0 || r.Start >= r.End || r.End > int64(len(img)) {
			return fmt.Errorf("rangeOutsideImage: ranges[%d] [%d,%d) is empty or outside the %d-byte image", i, r.Start, r.End, len(img))
		}
		if r.Start%4 != 0 || r.End%4 != 0 {
			return fmt.Errorf("misalignedRange: ranges[%d] [%d,%d) is not 4-byte aligned", i, r.Start, r.End)
		}
		for off := r.Start; off < r.End; off += 4 {
			if !isInstruction(img, off) {
				return fmt.Errorf("notFixedWidth: byte %d in ranges[%d] is not a 32-bit RV32 encoding", off, i)
			}
		}
		byRole[r.Role] = append(byRole[r.Role], r)
	}
	for role, rs := range byRole {
		sort.Slice(rs, func(a, b int) bool { return rs[a].Start < rs[b].Start })
		for i := 1; i < len(rs); i++ {
			if rs[i].Start < rs[i-1].End {
				return fmt.Errorf("overlappingRanges: role %q has [%d,%d) and [%d,%d)", role, rs[i-1].Start, rs[i-1].End, rs[i].Start, rs[i].End)
			}
		}
	}
	return nil
}

func checkTrace(t *trace, code map[string][]byte) error {
	img := code[t.ImageSHA]
	switch {
	case t.ID == "" || t.Workload == "":
		return fmt.Errorf("malformedTrace: id and workload must be nonempty")
	case img == nil:
		return fmt.Errorf("unknownImage: imageSHA %q is not among images", t.ImageSHA)
	case !safe(t.Steps):
		return fmt.Errorf("unsafeInteger: steps %d is negative or above 2^53-1", t.Steps)
	}
	seen := make(map[int64]bool, len(t.Counts))
	var total int64
	for i, c := range t.Counts {
		switch {
		case c.PC < 0 || c.PC >= int64(len(img)):
			return fmt.Errorf("pcOutsideImage: counts[%d].pc %d outside the %d-byte image", i, c.PC, len(img))
		case c.PC%4 != 0:
			return fmt.Errorf("misalignedPC: counts[%d].pc %d", i, c.PC)
		case !safe(c.Executions):
			return fmt.Errorf("unsafeInteger: counts[%d].executions %d is negative or above 2^53-1", i, c.Executions)
		case c.Executions > 0 && !isInstruction(img, c.PC):
			return fmt.Errorf("notFixedWidth: executed pc %d is not a 32-bit RV32 encoding", c.PC)
		case seen[c.PC]:
			return fmt.Errorf("duplicatePC: pc %d listed twice", c.PC)
		case c.Executions > MaxSafe-total:
			return fmt.Errorf("countOverflow: executions exceed 2^53-1 at counts[%d]", i)
		}
		seen[c.PC] = true
		total += c.Executions
	}
	if total != t.Steps {
		return fmt.Errorf("stepsMismatch: counts sum to %d, steps says %d", total, t.Steps)
	}
	sort.Slice(t.Counts, func(a, b int) bool { return t.Counts[a].PC < t.Counts[b].PC })
	return nil
}

func checkPackets(ps PacketSet) error {
	if ps.Workload == "" || !hex64.MatchString(ps.SourceSHA) {
		return fmt.Errorf("malformedPacketSet: needs a workload and a 64-hex sourceSHA")
	}
	type key struct {
		pose       string
		row, group int64
	}
	seen := map[key]bool{}
	for i, p := range ps.Packets {
		k := key{p.Pose, p.Row, p.Group}
		switch {
		case p.Pose == "" || !safe(p.Row) || !safe(p.Group):
			return fmt.Errorf("malformedPacket: packets[%d] needs a pose and nonnegative safe row and group", i)
		case p.Lanes < 1 || p.Lanes > 32 || p.HitMask < 0 || p.HitMask >= 1<<p.Lanes:
			return fmt.Errorf("malformedPacket: packets[%d] lanes %d, hitMask %d", i, p.Lanes, p.HitMask)
		case seen[k]:
			return fmt.Errorf("duplicatePacket: pose %q row %d group %d", p.Pose, p.Row, p.Group)
		}
		seen[k] = true
	}
	return nil
}
