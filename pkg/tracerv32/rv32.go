// Package tracerv32 runs RV32 images of the Typed compiler's RV32 backend
// (compiler/typed/typed-rv32.js) natively, with the semantics of the
// reference interpreter bench/host/rv32-interp.js.
//
// The reference stays authoritative: this package implements its loop
// statement by statement, including its instruction set (RV32IMF and the CSR
// instructions on fflags, frm and fcsr), its calling-convention checks, the
// order of its checks, its fault messages and its per-PC counts. Both pass the
// conformance vectors of bench/reference/rv32 (conformance_test.go), whose
// RV32F expectations were captured on the ESP32-P4; see docs/rv32-executors.md.
//
// The setup that precedes the reference's loop (guest memory size, register
// initialisation, argument conversion) is JavaScript and stays JavaScript: the
// trace REPL's rv32 global runs those statements in the session VM and hands
// this package the resulting registers, memory and counts to update in place
// (see pkg/traceapi/rv32.js).
package tracerv32

import (
	"bytes"
	"encoding/binary"
	"math"
	"strconv"
)

const (
	// ReturnToHost is the return address of the host frame. Reaching it ends a run.
	ReturnToHost = -4
	// Ebreak is the word that traps.
	Ebreak = 0x00100073
	// Ret is the only jalr the reference accepts: jalr x0, 0(x1).
	Ret = 0x00008067
	// PollInterval is how many steps run between calls of Machine.Poll.
	PollInterval = 1 << 20
)

// CalleeSaved lists sp, gp, tp and s0-s11 in the reference's order. A changed
// register is reported for the first one in this order.
var CalleeSaved = [15]int{2, 3, 4, 8, 9, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27}

// CallerSaved lists the registers an import call clobbers.
var CallerSaved = [15]int{5, 6, 7, 10, 11, 12, 13, 14, 15, 16, 17, 28, 29, 30, 31}

// Fault is the reference's Rv32Fault. Message is the complete message,
// including " at 0x…", so it compares equal to the reference's err.message.
type Fault struct {
	Message string
	At      int64 // address of the faulting instruction
	Steps   int64 // steps counted when the fault was raised, including the faulting one
}

func (f *Fault) Error() string { return f.Message }

// RangeError is the error the reference's DataView raises when a word it reads
// extends past the image, with goja's message. It can only happen for an image
// whose length is not a multiple of 4.
type RangeError struct{ Index int64 }

func (e *RangeError) Error() string {
	return "Index " + strconv.FormatInt(e.Index, 10) + " is out of bounds"
}

// Call invokes one import handler with the current registers and returns the
// handler's result already converted with `| 0`.
type Call func(x *[32]int32) (int32, error)

// Imports resolves relocated call sites. Resolve receives the position of the
// relocation in Machine.Relocations' value space (the caller's own index) and
// returns either a Call, or an empty Call and the fault message to raise
// ("no handler for import N" in the reference).
type Imports interface {
	Resolve(index int) (call Call, missing string, err error)
}

// Machine is one run's state. Run updates X, Memory and Counts in place.
type Machine struct {
	Image       []byte        // the program image; read, and re-read after every import call
	Memory      []byte        // guest memory including the stack; its length is the reference's size
	Counts      []uint32      // per-word execution counts, or nil when counting is off
	X           *[32]int32    // registers: initial values in, final values out
	Relocations map[int64]int // call-site offset -> index passed to Imports.Resolve
	Imports     Imports       // nil behaves like an empty import list
	Limit       int64         // a step with steps > Limit faults (see LimitFromFloat)
	LimitText   string        // String(limit) as the reference prints it
	Poll        func() error  // called every PollInterval steps; a non-nil error ends the run with it
	F           *[32]uint32   // f registers as bit patterns, in and out; nil runs with zeros and discards them
	Fcsr        uint32        // fcsr in and out (frm << 5 | fflags)
	NoChecks    bool          // turn the calling-convention checks off (the reference's options.checks = false)
}

// Outcome is how a run that did not fault ended.
type Outcome struct {
	Trap  bool  // an ebreak was executed
	At    int64 // the ebreak's address when Trap
	Steps int64
}

type frame struct {
	pc    int64
	saved [15]int32
}

func savedOf(x *[32]int32) (s [15]int32) {
	for i, r := range CalleeSaved {
		s[i] = x[r]
	}
	return s
}

func hex32(at int64) string { return strconv.FormatUint(uint64(uint32(at)), 16) }

// Run executes from entry until the host frame's return address is reached,
// an ebreak traps, or a fault is raised. A *Fault is returned as the error for
// faults and a *RangeError for a partial trailing word; any other error comes
// from Imports or Poll and is returned unchanged.
func (m *Machine) Run(entry int64) (out Outcome, err error) {
	image := m.Image
	snapshot := bytes.Clone(image)
	code := decodeImage(snapshot, m.Relocations)
	n := int64(len(image))
	whole := int64(len(code)) * 4 // bytes covered by whole words
	mem := m.Memory
	size := int64(len(mem))
	counts := m.Counts
	x := *m.X
	var f [32]uint32
	if m.F != nil {
		f = *m.F
	}
	fcsr := m.Fcsr & 0xff
	defer func() {
		*m.X = x
		if m.F != nil {
			*m.F = f
		}
		m.Fcsr = fcsr
	}()
	checks := !m.NoChecks
	frames := make([]frame, 1, 64)
	frames[0] = frame{pc: ReturnToHost, saved: savedOf(&x)}
	at := entry
	var steps int64
	fault := func(message string) error {
		return &Fault{Message: message + " at 0x" + hex32(at), At: at, Steps: steps}
	}
	call := func(target int64) error {
		if x[2]&15 != 0 {
			return fault("unaligned sp at internal call")
		}
		frames = append(frames, frame{pc: target, saved: savedOf(&x)})
		return nil
	}
	// The rounding mode of an F instruction: its rm field, or frm for rm = 7.
	rounding := func(rm int32) (uint32, error) {
		mode := uint32(rm) & 7
		if mode == 7 {
			mode = fcsr >> 5
		}
		if mode > 4 {
			return 0, fault("unsupported F instruction")
		}
		return mode, nil
	}
	// One comparison per step covers both the step limit and the next poll:
	// checkpoint is the first step at which either needs attention.
	limitAt := int64(math.MaxInt64)
	if m.Limit < math.MaxInt64 {
		limitAt = m.Limit + 1
	}
	pollAt := int64(math.MaxInt64)
	if m.Poll != nil {
		pollAt = PollInterval
	}
	checkpoint := min(limitAt, pollAt)
	for at != ReturnToHost {
		steps++
		if steps >= checkpoint {
			if steps > m.Limit {
				return out, fault("instruction limit " + m.LimitText + " reached")
			}
			if steps == pollAt {
				if err := m.Poll(); err != nil {
					return out, err
				}
				pollAt += PollInterval
			}
			checkpoint = min(limitAt, pollAt)
		}
		if uint64(at) >= uint64(whole) || at&3 != 0 {
			if at < 0 || at >= n || at&3 != 0 {
				return out, fault("instruction address outside program")
			}
			// The trailing bytes of an image whose length is not a multiple of 4:
			// the reference's DataView read throws before the word is counted.
			return out, &RangeError{Index: at}
		}
		in := code[at>>2]
		if counts != nil {
			counts[at>>2]++
		}
		a, b := x[in.rs1&31], x[in.rs2&31]
		next := at + 4
		switch in.kind {
		case kLW:
			address := int64(a) + int64(in.imm)
			if address < 0 || address+4 > size {
				return out, outside(address, fault)
			}
			x[in.rd&31] = int32(binary.LittleEndian.Uint32(mem[address:]))
		case kLBU:
			address := int64(a) + int64(in.imm)
			if address < 0 || address >= size {
				return out, outside(address, fault)
			}
			x[in.rd&31] = int32(mem[address])
		case kLHU:
			address := int64(a) + int64(in.imm)
			if address < 0 || address+2 > size {
				return out, outside(address, fault)
			}
			x[in.rd&31] = int32(binary.LittleEndian.Uint16(mem[address:]))
		case kLH:
			address := int64(a) + int64(in.imm)
			if address < 0 || address+2 > size {
				return out, outside(address, fault)
			}
			x[in.rd&31] = int32(int16(binary.LittleEndian.Uint16(mem[address:])))
		case kLB:
			address := int64(a) + int64(in.imm)
			if address < 0 || address >= size {
				return out, outside(address, fault)
			}
			x[in.rd&31] = int32(int8(mem[address]))
		case kSW:
			address := int64(a) + int64(in.imm)
			if address < 0 || address+4 > size {
				return out, outside(address, fault)
			}
			binary.LittleEndian.PutUint32(mem[address:], uint32(b))
		case kSH:
			address := int64(a) + int64(in.imm)
			if address < 0 || address+2 > size {
				return out, outside(address, fault)
			}
			binary.LittleEndian.PutUint16(mem[address:], uint16(b))
		case kSB:
			address := int64(a) + int64(in.imm)
			if address < 0 || address >= size {
				return out, outside(address, fault)
			}
			mem[address] = byte(b)
		case kADDI:
			x[in.rd&31] = a + in.imm
		case kSLLI:
			x[in.rd&31] = a << (uint32(in.imm) & 31)
		case kSLTI:
			x[in.rd&31] = bool32(a < in.imm)
		case kSLTIU:
			x[in.rd&31] = bool32(uint32(a) < uint32(in.imm))
		case kXORI:
			x[in.rd&31] = a ^ in.imm
		case kSRAI:
			x[in.rd&31] = a >> (uint32(in.imm) & 31)
		case kSRLI:
			x[in.rd&31] = int32(uint32(a) >> (uint32(in.imm) & 31))
		case kORI:
			x[in.rd&31] = a | in.imm
		case kANDI:
			x[in.rd&31] = a & in.imm
		case kMUL:
			x[in.rd&31] = a * b
		case kMULH:
			x[in.rd&31] = int32((int64(a) * int64(b)) >> 32)
		case kMULHSU:
			x[in.rd&31] = int32((int64(a) * int64(uint32(b))) >> 32)
		case kDIVU:
			if b == 0 {
				x[in.rd&31] = -1
			} else {
				x[in.rd&31] = int32(uint32(a) / uint32(b))
			}
		case kREMU:
			if b == 0 {
				x[in.rd&31] = a
			} else {
				x[in.rd&31] = int32(uint32(a) % uint32(b))
			}
		case kMULHU:
			x[in.rd&31] = int32((uint64(uint32(a)) * uint64(uint32(b))) >> 32)
		case kDIV:
			switch {
			case b == 0:
				x[in.rd&31] = -1
			case a == -2147483648 && b == -1:
				x[in.rd&31] = a
			default:
				x[in.rd&31] = a / b
			}
		case kREM:
			switch {
			case b == 0:
				x[in.rd&31] = a
			case a == -2147483648 && b == -1:
				x[in.rd&31] = 0
			default:
				x[in.rd&31] = a % b
			}
		case kADD:
			x[in.rd&31] = a + b
		case kSUB:
			x[in.rd&31] = a - b
		case kSLL:
			x[in.rd&31] = a << (uint32(b) & 31)
		case kSLT:
			x[in.rd&31] = bool32(a < b)
		case kSLTU:
			x[in.rd&31] = bool32(uint32(a) < uint32(b))
		case kXOR:
			x[in.rd&31] = a ^ b
		case kSRA:
			x[in.rd&31] = a >> (uint32(b) & 31)
		case kSRL:
			x[in.rd&31] = int32(uint32(a) >> (uint32(b) & 31))
		case kOR:
			x[in.rd&31] = a | b
		case kAND:
			x[in.rd&31] = a & b
		case kLUI:
			x[in.rd&31] = in.imm
		case kAUIPC:
			x[in.rd&31] = int32(at) + in.imm
		case kBEQ:
			if a == b {
				next = at + int64(in.imm)
			}
		case kBNE:
			if a != b {
				next = at + int64(in.imm)
			}
		case kBLT:
			if a < b {
				next = at + int64(in.imm)
			}
		case kBGE:
			if a >= b {
				next = at + int64(in.imm)
			}
		case kBLTU:
			if uint32(a) < uint32(b) {
				next = at + int64(in.imm)
			}
		case kBGEU:
			if uint32(a) >= uint32(b) {
				next = at + int64(in.imm)
			}
		case kJAL0:
			next = at + int64(in.imm)
		case kJAL1:
			if checks {
				if err := call(next); err != nil {
					return out, err
				}
			}
			x[1] = int32(next)
			next = at + int64(in.imm)
		case kJAL:
			x[in.rd&31] = int32(next)
			next = at + int64(in.imm)
		case kRET:
			target := int64(a &^ 1)
			if checks {
				if len(frames) == 0 {
					return out, fault("return address does not match the call")
				}
				fr := frames[len(frames)-1]
				frames = frames[:len(frames)-1]
				if target != fr.pc {
					return out, fault("return address does not match the call")
				}
				for i, r := range CalleeSaved {
					if x[r] != fr.saved[i] {
						return out, fault("callee-saved x" + strconv.Itoa(r) + " changed across a call")
					}
				}
			}
			next = target
		case kJALR:
			target := int64((a + in.imm) &^ 1)
			if in.rd == 1 && checks {
				if err := call(next); err != nil {
					return out, err
				}
			}
			if in.rd != 0 {
				x[in.rd&31] = int32(next)
			}
			next = target
		case kFENCE:
		case kCSR:
			fcsr = csrOp(fcsr, uint32(in.imm), uint32(a), in.rs1, &x[in.rd&31])
		case kFLW:
			address := int64(a) + int64(in.imm)
			if address < 0 || address+4 > size {
				return out, outside(address, fault)
			}
			f[in.rd&31] = binary.LittleEndian.Uint32(mem[address:])
		case kFSW:
			address := int64(a) + int64(in.imm)
			if address < 0 || address+4 > size {
				return out, outside(address, fault)
			}
			binary.LittleEndian.PutUint32(mem[address:], f[in.rs2&31])
		case kEBREAK:
			return Outcome{Trap: true, At: at, Steps: steps}, nil
		case kIMPORT:
			var call Call
			missing := "no handler for import " + strconv.Itoa(int(in.imm))
			if m.Imports != nil {
				var err error
				if call, missing, err = m.Imports.Resolve(int(in.imm)); err != nil {
					return out, err
				}
			}
			if call == nil {
				return out, fault(missing)
			}
			if x[2]&15 != 0 {
				return out, fault("unaligned sp at import call")
			}
			// The handler gets a copy, so the hot register file never escapes.
			regs := x
			result, err := call(&regs)
			if err != nil {
				return out, err
			}
			for _, r := range CallerSaved {
				x[r] = 0x76540000 + int32(r)
			}
			x[1] = int32(next)
			x[10] = result
			// The reference reads each word from the image as it executes it,
			// so a handler that rewrote the image changes what runs next.
			if !bytes.Equal(image, snapshot) {
				snapshot = bytes.Clone(image)
				code = decodeImage(snapshot, m.Relocations)
			}
		case kFault: // a word the reference rejects when it executes it
			return out, fault(faultMessages[in.imm])
		default: // RV32F arithmetic, moves, compares and conversions
			var rm uint32
			if rounds(in.kind) {
				var err error
				if rm, err = rounding(in.imm); err != nil {
					return out, err
				}
			}
			fcsr |= fpOp(in, rm, &x, &f)
		}
		x[0] = 0
		at = next
	}
	return Outcome{Steps: steps}, nil
}

// LimitFromFloat converts the reference's numeric limit to Machine.Limit. The
// reference faults when `++steps > limit`; steps is a positive integer, so that
// is steps > floor(limit). NaN never compares greater, and neither does a
// limit beyond any reachable step count.
func LimitFromFloat(limit float64) int64 {
	switch {
	case limit != limit, limit >= 9.2e18:
		return math.MaxInt64
	case limit < -9.2e18:
		return math.MinInt64
	}
	return int64(math.Floor(limit))
}

func outside(address int64, fault func(string) error) error {
	return fault("memory access outside guest memory: " + strconv.FormatInt(address, 10))
}

func bool32(b bool) int32 {
	if b {
		return 1
	}
	return 0
}
