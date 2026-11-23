package tracerv32

// rounds reports whether an F instruction takes a rounding mode from its rm
// field (for the others funct3 selects the operation).
func rounds(k kind) bool {
	switch k {
	case kFMADD, kFMSUB, kFNMSUB, kFNMADD, kFADD, kFSUB, kFMUL, kFDIV, kFSQRT, kFCVTWS, kFCVTWUS, kFCVTSW, kFCVTSWU:
		return true
	}
	return false
}

// csrOp executes a CSR instruction on fflags (1), frm (2) or fcsr (3); op is
// csr | funct3 << 12. It stores the old value in *rd and returns the new fcsr.
func csrOp(fcsr, op, a uint32, rs1 uint8, rd *int32) uint32 {
	csr, f3 := op&0xfff, op>>12
	var old uint32
	switch csr {
	case 1:
		old = fcsr & 31
	case 2:
		old = fcsr >> 5
	default:
		old = fcsr
	}
	source := a
	if f3&4 != 0 {
		source = uint32(rs1)
	}
	if f3&3 == 1 || rs1 != 0 {
		v := source
		switch f3 & 3 {
		case 2:
			v = old | source
		case 3:
			v = old &^ source
		}
		switch csr {
		case 1:
			fcsr = fcsr&0xe0 | v&31
		case 2:
			fcsr = fcsr&31 | (v&7)<<5
		default:
			fcsr = v & 0xff
		}
	}
	*rd = int32(old)
	return fcsr
}

// fpOp executes one RV32F arithmetic, move, compare or conversion instruction
// with the rounding mode rm and returns the fflags it raises.
func fpOp(in inst, rm uint32, x *[32]int32, f *[32]uint32) uint32 {
	p, q := f[in.rs1&31], f[in.rs2&31]
	var r, flags uint32
	var v int32
	toX := false
	switch in.kind {
	case kFMADD, kFMSUB, kFNMSUB, kFNMADD:
		var negP, negC uint32
		if in.kind == kFNMSUB || in.kind == kFNMADD {
			negP = 1
		}
		if in.kind == kFMSUB || in.kind == kFNMADD {
			negC = 1
		}
		r, flags = fma(p, q, f[(in.imm>>8)&31], negP, negC, rm)
	case kFADD:
		r, flags = fadd(p, q, rm)
	case kFSUB:
		r, flags = fadd(p, q^sign32, rm)
	case kFMUL:
		r, flags = fmul(p, q, rm)
	case kFDIV:
		r, flags = fdiv(p, q, rm)
	case kFSQRT:
		r, flags = fsqrt(p, rm)
	case kFSGNJ:
		r = p&0x7fffffff | q&sign32
	case kFSGNJN:
		r = p&0x7fffffff | ^q&sign32
	case kFSGNJX:
		r = p ^ q&sign32
	case kFMIN:
		r, flags = fminmax(p, q, false)
	case kFMAX:
		r, flags = fminmax(p, q, true)
	case kFCVTWS, kFCVTWUS:
		v, flags = toInt(p, rm, in.kind == kFCVTWUS)
		toX = true
	case kFCVTSW, kFCVTSWU:
		r, flags = fromInt(x[in.rs1&31], rm, in.kind == kFCVTSWU)
	case kFMVXW:
		v, toX = int32(p), true
	case kFCLASS:
		v, toX = fclass(p), true
	case kFLE, kFLT, kFEQ:
		v, flags = fcompare(p, q, uint32(in.kind-kFLE))
		toX = true
	case kFMVWX:
		r = uint32(x[in.rs1&31])
	}
	if toX {
		x[in.rd&31] = v
	} else {
		f[in.rd&31] = r
	}
	return flags
}
