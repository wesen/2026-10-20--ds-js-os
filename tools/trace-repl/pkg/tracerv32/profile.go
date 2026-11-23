package tracerv32

import "encoding/binary"

// Kinds are the profile counters in the reference's row order.
var Kinds = []string{"spLoad", "spStore", "load", "store", "branch", "boundsTest", "capacityLoad", "call", "mul", "div"}

// Word is a classify operand as the reference sees it: its bits after
// ToUint32, and whether the JavaScript value was exactly the ebreak word
// (the reference compares the following words with ===, not after ToUint32).
type Word struct {
	Bits     uint32
	IsEbreak bool
}

// W is a Word for a plain unsigned image word.
func W(bits uint32) Word { return Word{Bits: bits, IsEbreak: bits == Ebreak} }

// Classify is the reference's classify(word, nextWord, afterWord): the
// profile kinds of one instruction, in the reference's order. Checked-access
// shapes follow FunctionCode.checkedAddress: an unsigned branch over an
// ebreak is a bounds test, and a word load at offset 0 feeding that branch is
// a capacity load.
func Classify(word uint32, next, after Word) []string {
	op, rs1, rd := word&0x7f, (word>>15)&31, (word>>7)&31
	kinds := []string{}
	if op == 0x03 {
		kinds = append(kinds, pick(rs1 == 2, "spLoad", "load"))
	}
	if op == 0x23 {
		kinds = append(kinds, pick(rs1 == 2, "spStore", "store"))
	}
	if op == 0x63 {
		kinds = append(kinds, "branch")
		if (word>>12)&7 == 6 && next.IsEbreak {
			kinds = append(kinds, "boundsTest")
		}
	}
	if op == 0x6f && rd == 1 {
		kinds = append(kinds, "call")
	}
	if op == 0x33 && word>>25 == 1 {
		kinds = append(kinds, pick((word>>12)&7 == 0, "mul", "div"))
	}
	if op == 0x03 && (word>>12)&7 == 2 && int32(word)>>20 == 0 && rs1 != 2 &&
		next.Bits&0x7f == 0x63 && (next.Bits>>12)&7 == 6 && after.IsEbreak && (next.Bits>>20)&31 == rd {
		kinds = append(kinds, "capacityLoad")
	}
	return kinds
}

func pick(c bool, yes, no string) string {
	if c {
		return yes
	}
	return no
}

// Start is one function entry, in the order the reference's profile visits
// them: Object.entries(program.entries) sorted stably by offset.
type Start struct {
	Name   string
	Offset int64
}

// Row is one function's profile. Counters are sums of uint32 counts; Entries
// is the count of the function's first word, or nil where the reference reads
// past the end of counts (undefined).
type Row struct {
	Name    string
	Start   int64
	Bytes   int64
	Steps   uint64
	Kinds   map[string]uint64
	Entries *uint32
}

// Profile is the reference's profile(program, counts): execution counts
// attributed to the functions of a program. Functions are laid out
// contiguously in entry order, so each one ends where the next begins.
func Profile(image []byte, starts []Start, counts []uint32) ([]Row, error) {
	n := int64(len(image))
	word := func(at int64) (uint32, error) {
		if at < 0 || at+4 > n {
			return 0, &RangeError{Index: at}
		}
		return binary.LittleEndian.Uint32(image[at:]), nil
	}
	count := func(at int64) (uint32, bool) {
		i := uint64(uint32(at)) >> 2
		if i >= uint64(len(counts)) {
			return 0, false
		}
		return counts[i], true
	}
	rows := make([]Row, 0, len(starts))
	for i, s := range starts {
		end := n
		if i+1 < len(starts) {
			end = starts[i+1].Offset
		}
		row := Row{Name: s.Name, Start: s.Offset, Bytes: end - s.Offset, Kinds: map[string]uint64{}}
		if c, ok := count(s.Offset); ok {
			row.Entries = &c
		}
		for at := s.Offset; at < end; at += 4 {
			c, ok := count(at)
			if !ok || c == 0 {
				continue
			}
			row.Steps += uint64(c)
			w, err := word(at)
			if err != nil {
				return nil, err
			}
			var next, after uint32
			if at+4 < n {
				if next, err = word(at + 4); err != nil {
					return nil, err
				}
			}
			if at+8 < n {
				if after, err = word(at + 8); err != nil {
					return nil, err
				}
			}
			for _, k := range Classify(w, W(next), W(after)) {
				row.Kinds[k] += uint64(c)
			}
		}
		rows = append(rows, row)
	}
	return rows, nil
}
