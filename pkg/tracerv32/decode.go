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
	kMULHSU
	kMULHU
	kDIV
	kDIVU
	kREM
	kREMU
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
	kAUIPC
	kBEQ
	kBNE
	kBLT
	kBGE
	kBLTU
	kBGEU
	kJAL0 // jal x0: a jump
	kJAL1 // jal x1: an internal call
	kJAL  // jal linking another register
	kRET  // jalr x0, 0(x1): a checked return
	kJALR // any other jalr
	kFENCE
	kCSR // imm: csr | funct3 << 12
	kEBREAK
	kIMPORT // a relocated call site; imm is the relocation's index
	// RV32F. For the rounding ones imm holds the rm field; for the fused ones, rm | rs3 << 8.
	kFLW
	kFSW
	kFMADD
	kFMSUB
	kFNMSUB
	kFNMADD
	kFADD
	kFSUB
	kFMUL
	kFDIV
	kFSQRT
	kFSGNJ
	kFSGNJN
	kFSGNJX
	kFMIN
	kFMAX
	kFCVTWS
	kFCVTWUS
	kFCVTSW
	kFCVTSWU
	kFMVXW
	kFCLASS
	kFLE
	kFLT
	kFEQ
	kFMVWX
	kindCount
)

// inst is one predecoded word. imm is the sign-extended immediate, the
// branch or jump offset, the lui value, the relocation index, the index of
// a fault message, a CSR operation or a rounding mode, depending on kind.
type inst struct {
	kind         kind
	rd, rs1, rs2 uint8
	imm          int32
}

// The reference's decode-time faults, raised only when the word executes.
const (
	fLoad = iota
	fStore
	fBranch
	fJalr
	fF
	fSystem
	fOpcode // + opcode: "unsupported RV32 opcode 0x…"
)

var faultMessages = func() []string {
	m := []string{
		fLoad:   "unsupported load",
		fStore:  "unsupported store",
		fBranch: "unsupported branch",
		fJalr:   "unsupported jalr",
		fF:      "unsupported F instruction",
		fSystem: "unsupported system instruction",
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
	pick := func(k kind, ok bool) inst {
		if !ok {
			return bad(fF)
		}
		in.kind = k
		return in
	}
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
			in.kind = [8]kind{kMUL, kMULH, kMULHSU, kMULHU, kDIV, kDIVU, kREM, kREMU}[f3]
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
	case 0x17:
		in.kind, in.imm = kAUIPC, int32(w&0xfffff000)
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
			in.kind = kJAL
		}
	case 0x67:
		switch {
		case f3 != 0:
			return bad(fJalr)
		case w == Ret:
			in.kind = kRET
		default:
			in.kind = kJALR
		}
	case 0x0f:
		in.kind = kFENCE
	case 0x73:
		csr := w >> 20
		if f3&3 == 0 || csr < 1 || csr > 3 {
			return bad(fSystem)
		}
		in.kind, in.imm = kCSR, int32(csr|f3<<12)
	case 0x07:
		return pick(kFLW, f3 == 2)
	case 0x27:
		in.imm = int32((f7<<5)|uint32(rd)) << 20 >> 20
		return pick(kFSW, f3 == 2)
	case 0x43, 0x47, 0x4b, 0x4f:
		in.imm = int32(f3 | (w>>27)<<8)
		return pick([4]kind{kFMADD, kFMSUB, kFNMSUB, kFNMADD}[(op-0x43)/4], f7&3 == 0)
	case 0x53:
		in.imm = int32(f3)
		switch f7 {
		case 0x00:
			return pick(kFADD, true)
		case 0x04:
			return pick(kFSUB, true)
		case 0x08:
			return pick(kFMUL, true)
		case 0x0c:
			return pick(kFDIV, true)
		case 0x2c:
			return pick(kFSQRT, rs2 == 0)
		case 0x10:
			return pick([4]kind{kFSGNJ, kFSGNJN, kFSGNJX, kFault}[f3&3], f3 < 3)
		case 0x14:
			return pick([2]kind{kFMIN, kFMAX}[f3&1], f3 < 2)
		case 0x60:
			return pick([2]kind{kFCVTWS, kFCVTWUS}[rs2&1], rs2 < 2)
		case 0x68:
			return pick([2]kind{kFCVTSW, kFCVTSWU}[rs2&1], rs2 < 2)
		case 0x70:
			return pick([2]kind{kFMVXW, kFCLASS}[f3&1], rs2 == 0 && f3 < 2)
		case 0x50:
			return pick([4]kind{kFLE, kFLT, kFEQ, kFault}[f3&3], f3 < 3)
		case 0x78:
			return pick(kFMVWX, rs2 == 0 && f3 == 0)
		}
		return bad(fF)
	default:
		return bad(fOpcode + int(op))
	}
	return in
}
