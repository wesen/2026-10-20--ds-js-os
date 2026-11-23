package tracerv32

import (
	"encoding/binary"
	"strconv"
)

type kind uint8

const (
	kFault kind = iota // imm indexes faultMessages
	kLB
	kLH
	kLW
	kLBU
	kLHU
	kSB
	kSH
	kSW
	kADDI
	kSLLI
	kSLTI
	kSLTIU
	kXORI
	kSRAI
	kSRLI
	kORI
	kANDI
	kMUL
	kMULH
	kMULHU
	kDIV
	kREM
	kADD
	kSUB
	kSLL
	kSLT
	kSLTU
	kXOR
	kSRA
	kSRL
	kOR
	kAND
	kLUI
	kBEQ
	kBNE
	kBLT
	kBGE
	kBLTU
	kBGEU
	kJAL0 // jal x0: a jump
	kJAL1 // jal x1: an internal call
	kRET
	kEBREAK
	kIMPORT // a relocated call site; imm is the relocation's index
	kindCount
)

// inst is one predecoded word. imm is the sign-extended immediate, the
// branch or jump offset, the lui value, the relocation index or the index of
// a fault message, depending on kind.
type inst struct {
	kind         kind
	rd, rs1, rs2 uint8
	imm          int32
}

// The reference's decode-time faults, raised only when the word executes.
const (
	fLoad = iota
	fStore
	fM
	fBranch
	fJal
	fJalr
	fOpcode // + opcode: "unsupported RV32 opcode 0x…"
)

var faultMessages = func() []string {
	m := []string{
		fLoad:   "unsupported load",
		fStore:  "unsupported store",
		fM:      "unsupported M instruction",
		fBranch: "unsupported branch",
		fJal:    "unsupported jal link register",
		fJalr:   "unsupported jalr",
	}
	for op := 0; op < 128; op++ {
		m = append(m, "unsupported RV32 opcode 0x"+strconv.FormatInt(int64(op), 16))
	}
	return m
}()

// decodeImage predecodes every whole word. The reference reads the word at
// `at` when it executes it, checks relocations first and ebreak second, then
// dispatches on the opcode; decode follows the same order.
func decodeImage(image []byte, relocations map[int64]int) []inst {
	code := make([]inst, len(image)/4)
	for i := range code {
		w := binary.LittleEndian.Uint32(image[4*i:])
		if index, ok := relocations[int64(4*i)]; ok {
			code[i] = inst{kind: kIMPORT, imm: int32(index)}
			continue
		}
		code[i] = decode(w)
	}
	return code
}

func decode(w uint32) inst {
	if w == Ebreak {
		return inst{kind: kEBREAK}
	}
	op := w & 0x7f
	rd, f3 := uint8((w>>7)&31), (w>>12)&7
	rs1, rs2 := uint8((w>>15)&31), uint8((w>>20)&31)
	f7 := w >> 25
	imm := int32(w) >> 20
	in := inst{rd: rd, rs1: rs1, rs2: rs2, imm: imm}
	bad := func(message int) inst { return inst{kind: kFault, imm: int32(message)} }
	switch op {
	case 0x03:
		switch f3 {
		case 0:
			in.kind = kLB
		case 1:
			in.kind = kLH
		case 2:
			in.kind = kLW
		case 4:
			in.kind = kLBU
		case 5:
			in.kind = kLHU
		default:
			return bad(fLoad)
		}
	case 0x23:
		in.imm = int32((f7<<5)|uint32(rd)) << 20 >> 20
		switch f3 {
		case 0:
			in.kind = kSB
		case 1:
			in.kind = kSH
		case 2:
			in.kind = kSW
		default:
			return bad(fStore)
		}
	case 0x13:
		switch f3 {
		case 0:
			in.kind = kADDI
		case 1:
			in.kind = kSLLI // the reference ignores f7 here
		case 2:
			in.kind = kSLTI
		case 3:
			in.kind = kSLTIU
		case 4:
			in.kind = kXORI
		case 5:
			if f7&0x20 != 0 {
				in.kind = kSRAI
			} else {
				in.kind = kSRLI
			}
		case 6:
			in.kind = kORI
		default:
			in.kind = kANDI
		}
	case 0x33:
		if f7 == 1 {
			switch f3 {
			case 0:
				in.kind = kMUL
			case 1:
				in.kind = kMULH
			case 3:
				in.kind = kMULHU
			case 4:
				in.kind = kDIV
			case 6:
				in.kind = kREM
			default:
				return bad(fM)
			}
			break
		}
		switch f3 {
		case 0:
			if f7 == 0x20 {
				in.kind = kSUB
			} else {
				in.kind = kADD
			}
		case 1:
			in.kind = kSLL
		case 2:
			in.kind = kSLT
		case 3:
			in.kind = kSLTU
		case 4:
			in.kind = kXOR
		case 5:
			if f7 == 0x20 {
				in.kind = kSRA
			} else {
				in.kind = kSRL
			}
		case 6:
			in.kind = kOR
		default:
			in.kind = kAND
		}
	case 0x37:
		in.kind, in.imm = kLUI, int32(w&0xfffff000)
	case 0x63:
		in.imm = int32(w)>>31<<12 | int32((w>>7)&1)<<11 | int32((w>>25)&63)<<5 | int32((w>>8)&15)<<1
		switch f3 {
		case 0:
			in.kind = kBEQ
		case 1:
			in.kind = kBNE
		case 4:
			in.kind = kBLT
		case 5:
			in.kind = kBGE
		case 6:
			in.kind = kBLTU
		case 7:
			in.kind = kBGEU
		default:
			return bad(fBranch)
		}
	case 0x6f:
		in.imm = int32(w)>>31<<20 | int32(w&0xff000) | int32((w>>20)&1)<<11 | int32((w>>21)&0x3ff)<<1
		switch rd {
		case 1:
			in.kind = kJAL1
		case 0:
			in.kind = kJAL0
		default:
			return bad(fJal)
		}
	case 0x67:
		if w != Ret {
			return bad(fJalr)
		}
		in.kind = kRET
	default:
		return bad(fOpcode + int(op))
	}
	return in
}
