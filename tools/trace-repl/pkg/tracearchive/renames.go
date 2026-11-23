package tracearchive

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"sort"
	"strings"

	"github.com/pkg/errors"
)

// Rename records that a function continued under another name at one print.
//
// Method "alias": the previous module print declared To as an alias of From
// (`@To = … alias …, ptr @From`), and in this print To is defined while From
// is gone. This is how GlobalOpt resolves an alias to an internal function;
// it may change the body in the same pass (calling convention, attribute
// groups), so the body is not compared. Method "body": To first appears with
// exactly the body (lines after its define line) that From last had, and From
// is gone. A rename that changes the body and leaves no alias is not detected
// and remains two functions.
type Rename struct {
	Variant      string `json:"variant"`
	Phase        string `json:"phase"`
	Ordinal      int    `json:"ordinal"`
	Pass         string `json:"pass"`
	From         string `json:"from"`
	To           string `json:"to"`
	Method       string `json:"method"`
	AliasOrdinal *int   `json:"aliasOrdinal,omitempty"` // the module print that declared the alias
	BodySHA256   string `json:"bodySHA256,omitempty"`   // method body: the shared body digest
	Ref          Ref    `json:"ref"`
}

var (
	defineLine = regexp.MustCompile(`^define [^@]*@("(?:[^"\\]|\\.)*"|[-\w$.]+)\(`)
	aliasLine  = regexp.MustCompile(`^@("(?:[^"\\]|\\.)*"|[-\w$.]+) = [^\n]*\balias\b[^\n]*@("(?:[^"\\]|\\.)*"|[-\w$.]+)\s*$`)
)

// printFunctions lists the functions a print defines, with the digest of each
// body, and the aliases it declares (alias -> aliasee).
func printFunctions(print string) (defs map[string]string, order []string, aliases map[string]string, module bool) {
	defs, aliases = map[string]string{}, map[string]string{}
	module = strings.Contains(print, "\n; ModuleID = ")
	lines := strings.Split(print, "\n")
	for i := 0; i < len(lines); i++ {
		line := lines[i]
		if m := aliasLine.FindStringSubmatch(line); m != nil {
			aliases[strings.Trim(m[1], `"`)] = strings.Trim(m[2], `"`)
			continue
		}
		m := defineLine.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		name := strings.Trim(m[1], `"`)
		h := sha256.New()
		j := i + 1
		for ; j < len(lines) && strings.TrimRight(lines[j], " \t\r") != "}"; j++ {
			h.Write([]byte(lines[j]))
			h.Write([]byte{'\n'})
		}
		if _, seen := defs[name]; !seen {
			order = append(order, name)
		}
		defs[name] = hex.EncodeToString(h.Sum(nil))
		i = j
	}
	return defs, order, aliases, module
}

// findRenames walks one verified stream in ordinal order.
func findRenames(text string, events []Event) []Rename {
	latest := map[string]string{} // name -> last body digest seen in any print
	var prevDefs map[string]string
	var prevAliases map[string]string
	prevOrdinal := -1
	var out []Rename
	for _, e := range events {
		defs, order, aliases, module := printFunctions(text[e.Ref.Start:e.Ref.End])
		if module {
			if prevDefs != nil {
				for _, to := range order {
					if _, existed := prevDefs[to]; existed {
						continue
					}
					r := Rename{Variant: e.Variant, Phase: e.Phase, Ordinal: e.Ordinal, Pass: e.Pass, To: to, Ref: e.Ref}
					if from, ok := prevAliases[to]; ok && prevDefs[from] != "" && defs[from] == "" {
						at := prevOrdinal
						r.From, r.Method, r.AliasOrdinal = from, "alias", &at
						out = append(out, r)
						continue
					}
					var candidates []string
					for from := range prevDefs {
						if _, still := defs[from]; !still && latest[from] == defs[to] {
							candidates = append(candidates, from)
						}
					}
					if len(candidates) == 1 {
						r.From, r.Method, r.BodySHA256 = candidates[0], "body", defs[to]
						out = append(out, r)
					}
				}
			}
			prevDefs, prevAliases, prevOrdinal = defs, aliases, e.Ordinal
		}
		for name, digest := range defs {
			latest[name] = digest
		}
	}
	return out
}

// Renames lists the function renames of a variant, middle before backend, in
// ordinal order. It reads verified stream bytes and caches the result.
func (a *Archive) Renames(variant string) ([]Rename, error) {
	if !contains(a.variants, variant) {
		return nil, errors.Errorf("unknown variant %q; available: %s", variant, strings.Join(a.variants, ", "))
	}
	out := []Rename{}
	for _, id := range a.order {
		if id.variant != variant {
			continue
		}
		s := a.streams[id]
		text, err := a.verified(id, s)
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		if s.renames == nil {
			s.renames = findRenames(text, s.events)
			if s.renames == nil {
				s.renames = []Rename{}
			}
		}
		renames := s.renames
		s.mu.Unlock()
		out = append(out, renames...)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Phase != out[j].Phase {
			return out[i].Phase == "middle"
		}
		return out[i].Ordinal < out[j].Ordinal
	})
	return out, nil
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}
