package tracerv32

import "encoding/binary"

// A minimal RV32 assembler for tests. Register numbers are plain ints.
const (
	zero = 0
	ra   = 1
	sp   = 2
	s0   = 8
	a0   = 10
	a1   = 11
	a2   = 12
	t0   = 5
	t1   = 6
)

func rType(f7, rs2, rs1, f3, rd, op uint32) uint32 {
	return f7<<25 | rs2<<20 | rs1<<15 | f3<<12 | rd<<7 | op
}

func iType(imm int32, rs1, f3, rd, op uint32) uint32 {
	return uint32(imm&0xfff)<<20 | rs1<<15 | f3<<12 | rd<<7 | op
}

func sType(imm int32, rs2, rs1, f3 uint32) uint32 {
	u := uint32(imm & 0xfff)
	return (u>>5)<<25 | rs2<<20 | rs1<<15 | f3<<12 | (u&31)<<7 | 0x23
}

func bType(off int32, rs2, rs1, f3 uint32) uint32 {
	u := uint32(off)
	return (u>>12&1)<<31 | (u>>5&63)<<25 | rs2<<20 | rs1<<15 | f3<<12 | (u>>1&15)<<8 | (u>>11&1)<<7 | 0x63
}

func jType(off int32, rd uint32) uint32 {
	u := uint32(off)
	return (u>>20&1)<<31 | (u>>1&0x3ff)<<21 | (u>>11&1)<<20 | (u>>12&0xff)<<12 | rd<<7 | 0x6f
}

func addi(rd, rs1 uint32, imm int32) uint32 { return iType(imm, rs1, 0, rd, 0x13) }
func li(rd uint32, imm int32) uint32        { return addi(rd, zero, imm) }
func lui(rd uint32, imm uint32) uint32      { return imm&0xfffff000 | rd<<7 | 0x37 }
func lw(rd, rs1 uint32, imm int32) uint32   { return iType(imm, rs1, 2, rd, 0x03) }
func lb(rd, rs1 uint32, imm int32) uint32   { return iType(imm, rs1, 0, rd, 0x03) }
func lbu(rd, rs1 uint32, imm int32) uint32  { return iType(imm, rs1, 4, rd, 0x03) }
func lh(rd, rs1 uint32, imm int32) uint32   { return iType(imm, rs1, 1, rd, 0x03) }
func lhu(rd, rs1 uint32, imm int32) uint32  { return iType(imm, rs1, 5, rd, 0x03) }
func sw(rs2, rs1 uint32, imm int32) uint32  { return sType(imm, rs2, rs1, 2) }
func sh(rs2, rs1 uint32, imm int32) uint32  { return sType(imm, rs2, rs1, 1) }
func sb(rs2, rs1 uint32, imm int32) uint32  { return sType(imm, rs2, rs1, 0) }
func add(rd, rs1, rs2 uint32) uint32        { return rType(0, rs2, rs1, 0, rd, 0x33) }
func sub(rd, rs1, rs2 uint32) uint32        { return rType(0x20, rs2, rs1, 0, rd, 0x33) }
func mul(rd, rs1, rs2 uint32) uint32        { return rType(1, rs2, rs1, 0, rd, 0x33) }
func mulh(rd, rs1, rs2 uint32) uint32       { return rType(1, rs2, rs1, 1, rd, 0x33) }
func mulhu(rd, rs1, rs2 uint32) uint32      { return rType(1, rs2, rs1, 3, rd, 0x33) }
func div(rd, rs1, rs2 uint32) uint32        { return rType(1, rs2, rs1, 4, rd, 0x33) }
func rem(rd, rs1, rs2 uint32) uint32        { return rType(1, rs2, rs1, 6, rd, 0x33) }
func beq(rs1, rs2 uint32, off int32) uint32 { return bType(off, rs2, rs1, 0) }
func bne(rs1, rs2 uint32, off int32) uint32 { return bType(off, rs2, rs1, 1) }
func blt(rs1, rs2 uint32, off int32) uint32 { return bType(off, rs2, rs1, 4) }
func bltu(rs1, rs2 uint32, off int32) uint32 {
	return bType(off, rs2, rs1, 6)
}
func jal(rd uint32, off int32) uint32 { return jType(off, rd) }

const ret = Ret
const ebreak = Ebreak

func image(words ...uint32) []byte {
	b := make([]byte, 4*len(words))
	for i, w := range words {
		binary.LittleEndian.PutUint32(b[4*i:], w)
	}
	return b
}

// setup mirrors the reference's register initialisation for tests that do
// not go through the JavaScript wrapper.
func setup(memory []byte, stack int, args ...int32) (*[32]int32, []byte) {
	size := (len(memory) + stack + 15) &^ 15
	mem := make([]byte, size)
	copy(mem, memory)
	var x [32]int32
	for _, r := range CalleeSaved {
		x[r] = 0x12340000 + int32(r)
	}
	x[2] = int32(size)
	x[1] = ReturnToHost
	for i, a := range args {
		x[10+i] = a
	}
	return &x, mem
}
