// Package tracehardware reads the three-treatment ESP32-P4 raytrace experiment
// in the PicoCalc PIE-LOOPS ticket. Pairing is done once while opening a study.
package tracehardware

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"sort"

	"github.com/pkg/errors"
)

const side = 160 // RAYTRACE_DEMO_SIDE in the archived harness

// timerArm is the inner timer arm paired across treatments, the same one
// scripts/09-paired-results.py reads (timesUs[2]) to publish summary.json.
const timerArm = 2

var treatments = map[int]string{0: "stock", 8: "scalar", 5: "pie"}
var phases = [...]string{"clean", "audit", "primary", "shade"}
var contrasts = [...][2]int{{0, 8}, {8, 5}, {0, 5}}

type Pair struct {
	Pose              string    `json:"pose"`
	Coordinates       [4]int    `json:"coordinates"`
	Stride            int       `json:"stride"`
	Block             int       `json:"block"`
	Phase             string    `json:"phase"`
	Baseline          string    `json:"baseline"`
	Candidate         string    `json:"candidate"`
	BaselineUs        int64     `json:"baselineUs"`
	CandidateUs       int64     `json:"candidateUs"`
	SavedUs           int64     `json:"savedUs"`
	SavedPct          float64   `json:"savedPct"`
	BaselinePosition  int       `json:"baselinePosition"`
	CandidatePosition int       `json:"candidatePosition"`
	BaselineRotation  int       `json:"baselineRotation"`
	CandidateRotation int       `json:"candidateRotation"`
	OutputCRC         [3]string `json:"outputCRC"`
	SourceSHA         string    `json:"sourceSHA"`
	BaselineRow       int       `json:"baselineRow"`
	CandidateRow      int       `json:"candidateRow"`
}

// Image is the identity of one treatment's linked program, as recorded by the
// build and confirmed by the device's ELF CRC receipt for every load.
type Image struct {
	Program int    `json:"program"`
	Image   string `json:"imageSHA"`
	ELF     string `json:"elfSHA"`
	CRC     string `json:"elfCRC"`
}

type Metadata struct {
	Width       int               `json:"width"`
	Height      int               `json:"height"`
	TimerArm    int               `json:"timerArm"`
	FirmwareSHA string            `json:"firmwareSHA"`
	SourceSHA   string            `json:"sourceSHA"`
	Images      map[string]Image  `json:"images"`
	ArtifactSHA map[string]string `json:"artifactSHA"`
}

// Load is one on-device cold compile and load of a treatment's program in a
// block. It is the cost side of an optimization: compiler time and memory on
// the handheld, and the size of what it produced.
type Load struct {
	Treatment    string `json:"treatment"`
	Program      int    `json:"program"`
	Block        int    `json:"block"`
	Position     int    `json:"position"`
	CompilerUs   int64  `json:"compilerUs"`
	ElapsedUs    int64  `json:"elapsedUs"`
	PeakJSBytes  int64  `json:"peakJSBytes"`
	SourceBytes  int64  `json:"sourceBytes"`
	ELFBytes     int64  `json:"elfBytes"`
	SegmentBytes int64  `json:"segmentBytes"`
	ELFCRC       string `json:"elfCRC"`
}

type Study struct {
	meta  Metadata
	pairs []Pair
	loads []Load
}

func (s *Study) Rows() []Pair { return slices.Clone(s.pairs) }

// Loads lists the cold compiles in loads.json order.
func (s *Study) Loads() []Load { return slices.Clone(s.loads) }

func (s *Study) Metadata() Metadata {
	m := s.meta
	m.ArtifactSHA = maps.Clone(m.ArtifactSHA)
	m.Images = maps.Clone(m.Images)
	return m
}

type image struct {
	ID     *int   `json:"id"`
	Source string `json:"source"`
	Image  string `json:"image"`
	ELF    string `json:"elf"`
	CRC    string `json:"crc"`
}

type load struct {
	Program      *int   `json:"program"`
	Block        *int   `json:"block"`
	Position     *int   `json:"position"`
	ELFCRC       string `json:"elfCRC"`
	CompilerUs   int64  `json:"compilerUs"`
	ElapsedUs    int64  `json:"elapsedUs"`
	PeakJSBytes  int64  `json:"peakJSBytes"`
	SourceBytes  int64  `json:"sourceBytes"`
	ELFBytes     int64  `json:"elfBytes"`
	SegmentBytes int64  `json:"segmentBytes"`
}

type row struct {
	Program  *int      `json:"program"`
	Block    *int      `json:"block"`
	Fixture  string    `json:"fixture"`
	Pose     []int     `json:"pose"`
	Stride   int       `json:"stride"`
	Rotation *int      `json:"rotation"`
	Times    [][]int64 `json:"timesUs"`
	CRC      []string  `json:"crc"`
}

type loadKey struct{ block, program int }
type rowKey struct {
	fixture string
	loadKey
}
type fixture struct {
	coords [4]int
	stride int
	crc    [3]string
}

func present(n *int) int {
	if n == nil {
		return -1
	}
	return *n
}

func validHex(s string, n int) bool {
	if len(s) != 2*n {
		return false
	}
	_, err := hex.DecodeString(s)
	return err == nil
}

func (s *Study) read(dir, file string, dst interface{}) error {
	raw, err := os.ReadFile(filepath.Join(dir, file))
	if err != nil {
		return errors.Wrapf(err, "open PIE-LOOPS evidence %s", file)
	}
	if err = json.Unmarshal(raw, dst); err != nil {
		return errors.Wrapf(err, "decode %s", file)
	}
	sum := sha256.Sum256(raw)
	s.meta.ArtifactSHA[file] = hex.EncodeToString(sum[:])
	return nil
}

// Open verifies matching source identities, linked-ELF CRC receipts, complete
// counterbalanced blocks and fixture agreement, then pairs Typed measurements.
// It reads only the main physical run, never the different cold-only follow-up.
func Open(ticketRoot string) (*Study, error) {
	dir := filepath.Join(ticketRoot, "various", "device")
	s := &Study{meta: Metadata{Width: side, Height: side, TimerArm: timerArm, Images: map[string]Image{}, ArtifactSHA: map[string]string{}}}
	var build struct {
		AppSHA    string `json:"appSHA"`
		Selector8 string `json:"selector8"`
	}
	if err := s.read(dir, "build.json", &build); err != nil {
		return nil, err
	}
	if !validHex(build.AppSHA, 32) || (build.Selector8 != "" && build.Selector8 != "matched-scalar") {
		return nil, errors.New("build.json lacks the original matched-scalar trial identity")
	}
	s.meta.FirmwareSHA = build.AppSHA
	var images []image
	if err := s.read(dir, "images.json", &images); err != nil {
		return nil, err
	}
	byProgram := make(map[int]image)
	for i, img := range images {
		id := present(img.ID)
		if _, known := treatments[id]; !known {
			return nil, errors.Errorf("images.json/%d: unknown treatment %d", i, id)
		}
		if _, ok := byProgram[id]; ok {
			return nil, errors.Errorf("images.json/%d: duplicate program %d", i, id)
		}
		if !validHex(img.Source, 32) || !validHex(img.Image, 32) || !validHex(img.ELF, 32) || !validHex(img.CRC, 4) {
			return nil, errors.Errorf("images.json/%d: invalid source, image, ELF or CRC identity", i)
		}
		if s.meta.SourceSHA != "" && s.meta.SourceSHA != img.Source {
			return nil, errors.Errorf("images.json/%d: source SHA differs across treatments", i)
		}
		s.meta.SourceSHA = img.Source
		s.meta.Images[treatments[id]] = Image{Program: id, Image: img.Image, ELF: img.ELF, CRC: img.CRC}
		byProgram[id] = img
	}
	if len(byProgram) != len(treatments) {
		return nil, errors.New("images.json: missing treatment")
	}
	var loads []load
	if err := s.read(dir, "loads.json", &loads); err != nil {
		return nil, err
	}
	positions, err := validateLoads(loads, byProgram)
	if err != nil {
		return nil, err
	}
	for _, l := range loads {
		s.loads = append(s.loads, Load{Treatment: treatments[*l.Program], Program: *l.Program, Block: *l.Block, Position: *l.Position,
			CompilerUs: l.CompilerUs, ElapsedUs: l.ElapsedUs, PeakJSBytes: l.PeakJSBytes,
			SourceBytes: l.SourceBytes, ELFBytes: l.ELFBytes, SegmentBytes: l.SegmentBytes, ELFCRC: l.ELFCRC})
	}
	var rows []row
	if err := s.read(dir, "rows.json", &rows); err != nil {
		return nil, err
	}
	if err := s.pair(rows, positions); err != nil {
		return nil, err
	}
	return s, nil
}

func validateLoads(loads []load, images map[int]image) (map[loadKey]int, error) {
	var order [6][3]int
	for b := range order {
		order[b] = [3]int{-1, -1, -1}
	}
	pos := make(map[loadKey]int)
	for i, l := range loads {
		b, id, p := present(l.Block), present(l.Program), present(l.Position)
		img, ok := images[id]
		if !ok || b < 0 || b >= len(order) || p < 0 || p >= 3 {
			return nil, errors.Errorf("loads.json/%d: invalid block/program/position", i)
		}
		if l.ELFCRC != img.CRC {
			return nil, errors.Errorf("loads.json/%d: device-linked ELF CRC differs from images.json for program %d", i, id)
		}
		if l.CompilerUs <= 0 || l.ElapsedUs < l.CompilerUs || l.PeakJSBytes <= 0 || l.ELFBytes <= 0 {
			return nil, errors.Errorf("loads.json/%d: expected positive compilerUs, peakJSBytes and elfBytes, with elapsedUs >= compilerUs", i)
		}
		key := loadKey{b, id}
		if _, duplicate := pos[key]; duplicate || order[b][p] != -1 {
			return nil, errors.Errorf("loads.json/%d: duplicate program or position in block %d", i, b)
		}
		pos[key] = p
		order[b][p] = id
	}
	if len(pos) != 18 {
		return nil, errors.Errorf("loads.json: missing treatment/position; got %d of 18", len(pos))
	}
	orders := make(map[[3]int]bool)
	for _, sequence := range order {
		orders[sequence] = true
	}
	if len(orders) != 6 {
		return nil, errors.Errorf("loads.json: only %d of 6 unique treatment orders", len(orders))
	}
	return pos, nil
}

func (s *Study) pair(rows []row, pos map[loadKey]int) error {
	indices := make(map[rowKey]int)
	fixtures := make(map[string]fixture)
	for i, r := range rows {
		k := loadKey{present(r.Block), present(r.Program)}
		if _, ok := pos[k]; !ok {
			return errors.Errorf("rows.json/%d: no matching load for block %d program %d", i, k.block, k.program)
		}
		if r.Fixture == "" || len(r.Pose) != 4 || r.Stride < side || r.Stride > 320 || present(r.Rotation) < 0 || present(r.Rotation) > 2 || len(r.CRC) != 3 {
			return errors.Errorf("rows.json/%d: invalid pose, stride, rotation or CRC shape", i)
		}
		for _, crc := range r.CRC {
			if !validHex(crc, 4) {
				return errors.Errorf("rows.json/%d: invalid output CRC", i)
			}
		}
		if len(r.Times) != 3 {
			return errors.Errorf("rows.json/%d: expected three measurement arms", i)
		}
		for _, arm := range r.Times {
			if len(arm) != len(phases) || slices.Min(arm) <= 0 {
				return errors.Errorf("rows.json/%d: expected four positive phase times per arm", i)
			}
		}
		f := fixture{[4]int(r.Pose), r.Stride, [3]string(r.CRC)}
		if prior, ok := fixtures[r.Fixture]; ok && prior != f {
			return errors.Errorf("rows.json/%d: coordinates, stride or output CRC disagree for %s", i, r.Fixture)
		}
		fixtures[r.Fixture] = f
		key := rowKey{r.Fixture, k}
		if _, ok := indices[key]; ok {
			return errors.Errorf("rows.json/%d: duplicate %s/block %d/program %d", i, r.Fixture, k.block, k.program)
		}
		indices[key] = i
	}
	if len(fixtures) != 12 {
		return errors.Errorf("rows.json: expected 12 fixtures, found %d", len(fixtures))
	}
	names := make([]string, 0, len(fixtures))
	for name := range fixtures {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		f := fixtures[name]
		for b := 0; b < 6; b++ {
			for _, c := range contrasts {
				before := loadKey{b, c[0]}
				after := loadKey{b, c[1]}
				l, lok := indices[rowKey{name, before}]
				r, rok := indices[rowKey{name, after}]
				if !lok || !rok {
					return errors.Errorf("rows.json: missing observation for %s/block %d/contrast %s to %s", name, b, treatments[c[0]], treatments[c[1]])
				}
				// The acquisition script rotates both the outer treatment order and
				// the three inner timer arms. Within this fixture/block, changing
				// the outer position by one changes the inner rotation by one.
				if (present(rows[l].Rotation)-pos[before]+3)%3 != (present(rows[r].Rotation)-pos[after]+3)%3 {
					return errors.Errorf("rows.json: timer-arm rotation disagrees with load order for %s/block %d", name, b)
				}
				for j, phase := range phases {
					base, cand := rows[l].Times[timerArm][j], rows[r].Times[timerArm][j]
					saved := base - cand
					s.pairs = append(s.pairs, Pair{
						Pose: name, Coordinates: f.coords, Stride: f.stride, Block: b, Phase: phase,
						Baseline: treatments[c[0]], Candidate: treatments[c[1]], BaselineUs: base, CandidateUs: cand, SavedUs: saved, SavedPct: 100 * float64(saved) / float64(base),
						BaselinePosition: pos[before], CandidatePosition: pos[after], BaselineRotation: present(rows[l].Rotation), CandidateRotation: present(rows[r].Rotation),
						OutputCRC: f.crc, SourceSHA: s.meta.SourceSHA, BaselineRow: l, CandidateRow: r,
					})
				}
			}
		}
	}
	return nil
}
