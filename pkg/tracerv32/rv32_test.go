package tracerv32

import (
	"encoding/binary"
	"errors"
	"math"
	"reflect"
	"strings"
	"testing"
)

type imports map[int]Call

func (m imports) Resolve(index int) (Call, string, error) {
	if c := m[index]; c != nil {
		return c, "", nil
	}
	return nil, "no handler for import " + itoa(index), nil
}

func itoa(i int) string { return string(rune('0' + i)) }

type run struct {
	out    Outcome
	err    error
	x      *[32]int32
	mem    []byte
	counts []uint32
}

func exec(t *testing.T, code []byte, memory []byte, args []int32, m Machine) run {
	t.Helper()
	x, mem := setup(memory, 64, args...)
	m.Image, m.Memory, m.X = code, mem, x
	if m.Counts == nil {
		m.Counts = make([]uint32, len(code)/4)
	}
	if m.Limit == 0 {
		m.Limit, m.LimitText = 50e6, "50000000"
	}
	out, err := m.Run(0)
	return run{out, err, x, mem, m.Counts}
}

func wantFault(t *testing.T, r run, message string) {
	t.Helper()
	var f *Fault
	if !errors.As(r.err, &f) {
		t.Fatalf("want fault %q, got outcome %+v, err %v", message, r.out, r.err)
	}
	if f.Message != message {
		t.Fatalf("fault %q, want %q", f.Message, message)
	}
}

func TestArithmeticAndReturn(t *testing.T) {
	r := exec(t, image(addi(a0, a0, 5), ret), nil, []int32{37}, Machine{})
	if r.err != nil || r.out.Trap || r.x[a0] != 42 || r.out.Steps != 2 || !reflect.DeepEqual(r.counts, []uint32{1, 1}) {
		t.Fatalf("%+v %v a0=%d counts=%v", r.out, r.err, r.x[a0], r.counts)
	}
}

func TestLoopCounts(t *testing.T) {
	r := exec(t, image(li(t0, 10), li(a0, 0), addi(a0, a0, 3), addi(t0, t0, -1), bne(t0, zero, -8), ret), nil, nil, Machine{})
	if r.err != nil || r.x[a0] != 30 || r.out.Steps != 33 || !reflect.DeepEqual(r.counts, []uint32{1, 1, 10, 10, 10, 1}) {
		t.Fatalf("%+v %v a0=%d counts=%v", r.out, r.err, r.x[a0], r.counts)
	}
}

func TestEbreakTraps(t *testing.T) {
	r := exec(t, image(li(a0, 1), ebreak, ret), nil, nil, Machine{})
	if r.err != nil || !r.out.Trap || r.out.At != 4 || r.out.Steps != 2 || r.counts[1] != 1 || r.counts[2] != 0 {
		t.Fatalf("%+v %v %v", r.out, r.err, r.counts)
	}
}

// An import call site compiled the way typed-rv32.js does: ra is saved around it.
var importProgram = image(addi(sp, sp, -16), sw(ra, sp, 12), ebreak, lw(ra, sp, 12), addi(sp, sp, 16), ret)

func TestRelocationIsCheckedBeforeEbreak(t *testing.T) {
	var got []int32
	call := func(x *[32]int32) (int32, error) { got = append([]int32(nil), x[10:12]...); return 7, nil }
	r := exec(t, importProgram, nil, []int32{3, 4}, Machine{Relocations: map[int64]int{8: 0}, Imports: imports{0: call}})
	if r.err != nil || r.out.Trap || r.x[a0] != 7 || r.out.Steps != 6 || !reflect.DeepEqual(got, []int32{3, 4}) {
		t.Fatalf("%+v %v a0=%d args=%v", r.out, r.err, r.x[a0], got)
	}
	if r.x[t0] != 0x76540005 || r.x[a1] != 0x7654000b || r.counts[2] != 1 {
		t.Fatalf("caller-saved registers not clobbered: t0=%#x a1=%#x counts=%v", r.x[t0], r.x[a1], r.counts)
	}
}

func TestImportFaultOrder(t *testing.T) {
	ok := func(x *[32]int32) (int32, error) { return 0, nil }
	wantFault(t, exec(t, importProgram, nil, nil, Machine{Relocations: map[int64]int{8: 0}}), "no handler for import 0 at 0x8")
	unaligned := image(addi(sp, sp, -8), ebreak)
	// No handler is reported before the misaligned stack pointer.
	wantFault(t, exec(t, unaligned, nil, nil, Machine{Relocations: map[int64]int{4: 1}, Imports: imports{0: ok}}), "no handler for import 1 at 0x4")
	wantFault(t, exec(t, unaligned, nil, nil, Machine{Relocations: map[int64]int{4: 0}, Imports: imports{0: ok}}), "unaligned sp at import call at 0x4")
	failing := errors.New("handler threw")
	r := exec(t, importProgram, nil, nil, Machine{Relocations: map[int64]int{8: 0}, Imports: imports{0: func(*[32]int32) (int32, error) { return 0, failing }}})
	if !errors.Is(r.err, failing) {
		t.Fatalf("handler error not returned: %v", r.err)
	}
}

func TestDecodeFaultsOnlyWhenExecuted(t *testing.T) {
	cases := map[string]uint32{
		"unsupported system instruction at 0x0":  0x00000073, // ecall
		"unsupported system instruction at 0x0 ": 0x30002573, // csrr a0, mstatus
		"unsupported RV32 opcode 0x5b at 0x0":    0x0000005b,
		"unsupported load at 0x0":                iType(0, a0, 3, a0, 0x03),
		"unsupported store at 0x0":               sType(0, a0, a0, 3),
		"unsupported branch at 0x0":              bType(8, a0, a0, 2),
		"unsupported jalr at 0x0":                iType(0, ra, 1, ra, 0x67),     // funct3 1
		"unsupported F instruction at 0x0":       rType(0, a1, a0, 5, a0, 0x53), // fadd.s with rm 5
	}
	for message, word := range cases {
		wantFault(t, exec(t, image(word, ret), nil, nil, Machine{}), strings.TrimSpace(message))
		r := exec(t, image(li(a0, 1), ret, word), nil, nil, Machine{})
		if r.err != nil || r.x[a0] != 1 {
			t.Fatalf("%s: unexecuted word faulted: %v", message, r.err)
		}
	}
}

// RV32IM beyond what typed-rv32 emits: mulhsu, divu, remu, auipc, jal and jalr with any link register.
func TestFullIntegerSet(t *testing.T) {
	min := int32(math.MinInt32)
	for i, c := range []struct {
		word         uint32
		a, b, result int32
	}{
		{rType(1, a1, a0, 2, a0, 0x33), -1, -1, -1}, {rType(1, a1, a0, 2, a0, 0x33), min, -1, min},
		{rType(1, a1, a0, 5, a0, 0x33), -2, 3, 0x55555554}, {rType(1, a1, a0, 5, a0, 0x33), 7, 0, -1},
		{rType(1, a1, a0, 7, a0, 0x33), -1, 10, 5}, {rType(1, a1, a0, 7, a0, 0x33), 7, 0, 7},
		{0x00001517, 0, 0, 0x1000}, // auipc a0, 1 at 0
	} {
		r := exec(t, image(c.word, ret), nil, []int32{c.a, c.b}, Machine{})
		if r.err != nil || r.x[a0] != c.result {
			t.Errorf("case %d: a0=%#x, want %#x; %v", i, uint32(r.x[a0]), uint32(c.result), r.err)
		}
	}
	// jal t0 links t0 without a frame; jalr x0, 0(t0) jumps back without a return check.
	r := exec(t, image(jType(8, 5), ret, li(a0, 3), iType(0, 5, 0, 0, 0x67)), nil, nil, Machine{})
	if r.err != nil || r.x[a0] != 3 || r.x[5] != 4 {
		t.Fatalf("%+v %v a0=%d t0=%d", r.out, r.err, r.x[a0], r.x[5])
	}
	// jalr ra, 0(t1) is a checked call; with NoChecks a mismatched ret is a plain jump.
	r = exec(t, image(addi(sp, sp, -16), sw(ra, sp, 12), li(6, 28), iType(0, 6, 0, ra, 0x67), lw(ra, sp, 12), addi(sp, sp, 16), ret, li(a0, 4), ret), nil, nil, Machine{})
	if r.err != nil || r.x[a0] != 4 {
		t.Fatalf("%+v %v a0=%d", r.out, r.err, r.x[a0])
	}
	wantFault(t, exec(t, image(li(ra, 8), ret, ret), nil, nil, Machine{}), "return address does not match the call at 0x4")
	r = exec(t, image(li(ra, 8), ret, li(a0, 6), ebreak), nil, nil, Machine{NoChecks: true})
	if r.err != nil || !r.out.Trap || r.x[a0] != 6 {
		t.Fatalf("%+v %v", r.out, r.err)
	}
}

func TestMemoryBoundsAndWidths(t *testing.T) {
	// Guest memory is 16 caller bytes + 64 stack bytes = 80 bytes.
	wantFault(t, exec(t, image(lw(a0, zero, -4)), make([]byte, 16), nil, Machine{}), "memory access outside guest memory: -4 at 0x0")
	wantFault(t, exec(t, image(li(t0, 78), lw(a0, t0, 0)), make([]byte, 16), nil, Machine{}), "memory access outside guest memory: 78 at 0x4")
	wantFault(t, exec(t, image(li(t0, 80), sb(a0, t0, 0)), make([]byte, 16), nil, Machine{}), "memory access outside guest memory: 80 at 0x4")
	// The sum is not wrapped to 32 bits: 0x7fffffff + 1 is 2147483648.
	wantFault(t, exec(t, image(lui(t0, 0x80000000), addi(t0, t0, -1), lb(a0, t0, 1)), nil, nil, Machine{}), "memory access outside guest memory: 2147483648 at 0x8")
	r := exec(t, image(li(t0, -2), sb(t0, zero, 79), lb(a0, zero, 79), lbu(a1, zero, 79),
		lui(t1, 0x12345000), addi(t1, t1, 0x678), sw(t1, zero, 0), lh(a2, zero, 2), sh(t0, zero, 4), lhu(t0, zero, 4), ret), make([]byte, 16), nil, Machine{})
	if r.err != nil || r.x[a0] != -2 || r.x[a1] != 254 || r.x[a2] != 0x1234 || r.x[t0] != 0xfffe {
		t.Fatalf("%v a0=%d a1=%d a2=%#x t0=%#x", r.err, r.x[a0], r.x[a1], r.x[a2], r.x[t0])
	}
	if got := binary.LittleEndian.Uint32(r.mem); got != 0x12345678 || r.mem[79] != 0xfe {
		t.Fatalf("memory %x", r.mem[:8])
	}
}

func TestDivisionAndMultiplicationEdges(t *testing.T) {
	min := int32(math.MinInt32)
	cases := []struct {
		word   uint32
		a, b   int32
		result int32
	}{
		{div(a0, a0, a1), 7, -2, -3}, {rem(a0, a0, a1), 7, -2, 1},
		{div(a0, a0, a1), -7, 2, -3}, {rem(a0, a0, a1), -7, 2, -1},
		{div(a0, a0, a1), 5, 0, -1}, {rem(a0, a0, a1), 5, 0, 5},
		{div(a0, a0, a1), min, -1, min}, {rem(a0, a0, a1), min, -1, 0},
		{mul(a0, a0, a1), 0x10000, 0x10000, 0}, {mulh(a0, a0, a1), min, min, 1 << 30},
		{mulh(a0, a0, a1), -3, 5, -1}, {mulhu(a0, a0, a1), -1, -1, -2},
		{sub(a0, a0, a1), 3, 5, -2}, {rType(0x10, a1, a0, 0, a0, 0x33), 3, 5, 8}, // f7 other than 0x20 adds
		{rType(0x20, a1, a0, 5, a0, 0x33), -16, 2, -4}, {rType(0x21, a1, a0, 5, a0, 0x33), -16, 2, 0x3ffffffc}, // sra only for f7 == 0x20
		{iType(0x400|2, a0, 5, a0, 0x13), -16, 0, -4}, {iType(2, a0, 5, a0, 0x13), -16, 0, 0x3ffffffc}, // srai by f7 & 0x20
		{iType(0x7e0|3, a0, 1, a0, 0x13), 1, 0, 8}, // slli ignores f7
		{iType(-1, a0, 3, a0, 0x13), 5, 0, 1},      // sltiu compares with 0xffffffff
	}
	for i, c := range cases {
		r := exec(t, image(c.word, ret), nil, []int32{c.a, c.b}, Machine{})
		if r.err != nil || r.x[a0] != c.result {
			t.Errorf("case %d (%#08x): a0=%d (%#x), want %d; %v", i, c.word, r.x[a0], uint32(r.x[a0]), c.result, r.err)
		}
	}
}

func TestZeroRegisterAndLui(t *testing.T) {
	r := exec(t, image(addi(zero, zero, 5), add(a0, zero, zero), lui(a1, 0xfffff000), ret), nil, []int32{9}, Machine{})
	if r.err != nil || r.x[a0] != 0 || r.x[a1] != -4096 || r.x[zero] != 0 {
		t.Fatalf("%v a0=%d a1=%d", r.err, r.x[a0], r.x[a1])
	}
}

// main saves ra, calls f, restores ra; f sets a0 and returns.
func callProgram(f ...uint32) []byte {
	main := []uint32{addi(sp, sp, -16), sw(ra, sp, 12), jal(ra, 16), lw(ra, sp, 12), addi(sp, sp, 16), ret}
	main[2] = jal(ra, int32(4*(len(main)-2)))
	return image(append(main, f...)...)
}

func TestInternalCallChecks(t *testing.T) {
	r := exec(t, callProgram(li(a0, 9), ret), nil, nil, Machine{})
	if r.err != nil || r.x[a0] != 9 || r.out.Steps != 8 {
		t.Fatalf("%+v %v a0=%d", r.out, r.err, r.x[a0])
	}
	wantFault(t, exec(t, callProgram(li(s0, 1), ret), nil, nil, Machine{}), "callee-saved x8 changed across a call at 0x1c")
	wantFault(t, exec(t, callProgram(addi(ra, ra, 4), ret), nil, nil, Machine{}), "return address does not match the call at 0x1c")
	wantFault(t, exec(t, image(addi(sp, sp, -8), jal(ra, 8), ret, ret), nil, nil, Machine{}), "unaligned sp at internal call at 0x4")
	// The first return to the host frame ends the run; a second ret is never reached.
	r = exec(t, image(li(a0, 2), ret, ret), nil, nil, Machine{})
	if r.err != nil || r.out.Steps != 2 {
		t.Fatalf("%+v %v", r.out, r.err)
	}
}

func TestControlFlowEdges(t *testing.T) {
	// A branch whose target is RETURN_TO_HOST ends the run as a return.
	r := exec(t, image(beq(zero, zero, -4)), nil, []int32{11}, Machine{})
	if r.err != nil || r.out.Trap || r.out.Steps != 1 || r.x[a0] != 11 {
		t.Fatalf("%+v %v", r.out, r.err)
	}
	r = exec(t, image(jal(zero, 4096)), nil, nil, Machine{})
	wantFault(t, r, "instruction address outside program at 0x1000")
	if f := r.err.(*Fault); f.Steps != 2 {
		t.Fatalf("steps %d", f.Steps)
	}
	wantFault(t, exec(t, image(blt(a0, a1, -8)), nil, []int32{0, 1}, Machine{}), "instruction address outside program at 0xfffffff8")
	r = exec(t, image(beq(zero, zero, 0)), nil, nil, Machine{Limit: 10, LimitText: "10"})
	wantFault(t, r, "instruction limit 10 reached at 0x0")
	if f := r.err.(*Fault); f.Steps != 11 || r.counts[0] != 10 {
		t.Fatalf("steps %d counts %v", f.Steps, r.counts)
	}
	r = exec(t, image(bltu(a0, a1, 8), li(a0, 5), ret), nil, []int32{-1, 1}, Machine{})
	if r.err != nil || r.x[a0] != 5 {
		t.Fatalf("bltu treated -1 as small: %v %d", r.err, r.x[a0])
	}
}

func TestPartialTrailingWord(t *testing.T) {
	code := append(image(addi(a0, a0, 1)), 0x13, 0)
	r := exec(t, code, nil, nil, Machine{Counts: make([]uint32, 1)})
	var outside *RangeError
	if !errors.As(r.err, &outside) || r.err.Error() != "Index 4 is out of bounds" || r.counts[0] != 1 {
		t.Fatalf("%v counts %v", r.err, r.counts)
	}
}

func TestCountsOffAndPoll(t *testing.T) {
	x, mem := setup(nil, 64)
	m := Machine{Image: image(li(a0, 3), ret), Memory: mem, X: x, Limit: 100, LimitText: "100"}
	if out, err := m.Run(0); err != nil || out.Steps != 2 || x[a0] != 3 {
		t.Fatalf("%+v %v", out, err)
	}
	stop := errors.New("interrupted")
	polls := 0
	x, mem = setup(nil, 64)
	m = Machine{Image: image(beq(zero, zero, 0)), Memory: mem, X: x, Limit: math.MaxInt64, Poll: func() error { polls++; return stop }}
	if _, err := m.Run(0); !errors.Is(err, stop) || polls != 1 {
		t.Fatalf("poll: %v after %d polls", err, polls)
	}
}

// The reference reads each word as it executes it, so an import handler that
// rewrites the image changes the next instruction.
func TestImageRewrittenByImport(t *testing.T) {
	code := image(addi(sp, sp, -16), sw(ra, sp, 12), ebreak, lw(ra, sp, 12), addi(sp, sp, 16), li(a0, 1), ret)
	call := func(*[32]int32) (int32, error) { binary.LittleEndian.PutUint32(code[20:], li(a1, 2)); return 0, nil }
	r := exec(t, code, nil, nil, Machine{Relocations: map[int64]int{8: 0}, Imports: imports{0: call}})
	if r.err != nil || r.x[a0] != 0 || r.x[a1] != 2 {
		t.Fatalf("%v a0=%#x a1=%d", r.err, r.x[a0], r.x[a1])
	}
}

func TestLimitFromFloat(t *testing.T) {
	for _, c := range []struct {
		in   float64
		want int64
	}{{50e6, 50000000}, {1.5, 1}, {0.5, 0}, {-0.5, -1}, {math.NaN(), math.MaxInt64}, {math.Inf(1), math.MaxInt64}, {math.Inf(-1), math.MinInt64}} {
		if got := LimitFromFloat(c.in); got != c.want {
			t.Errorf("LimitFromFloat(%v) = %d, want %d", c.in, got, c.want)
		}
	}
}

func TestClassifyAndProfile(t *testing.T) {
	capacity, bounds := lw(t0, a0, 0), bltu(a1, t0, 8)
	if got := Classify(capacity, W(bounds), W(ebreak)); !reflect.DeepEqual(got, []string{"load", "capacityLoad"}) {
		t.Fatalf("capacity load: %v", got)
	}
	if got := Classify(bounds, W(ebreak), W(0)); !reflect.DeepEqual(got, []string{"branch", "boundsTest"}) {
		t.Fatalf("bounds test: %v", got)
	}
	for word, want := range map[uint32][]string{sw(ra, sp, 12): {"spStore"}, lw(ra, sp, 12): {"spLoad"}, jal(ra, 8): {"call"},
		mul(a0, a0, a1): {"mul"}, rem(a0, a0, a1): {"div"}, ret: {}} {
		if got := Classify(word, W(0), W(0)); !reflect.DeepEqual(got, want) {
			t.Errorf("%#08x: %v, want %v", word, got, want)
		}
	}
	code := image(capacity, bounds, ebreak, ret, mul(a0, a0, a1), ret)
	rows, err := Profile(code, []Start{{"f", 0}, {"g", 16}}, []uint32{3, 3, 0, 3, 2, 2})
	if err != nil || len(rows) != 2 {
		t.Fatal(rows, err)
	}
	f, g := rows[0], rows[1]
	if f.Bytes != 16 || f.Steps != 9 || f.Kinds["capacityLoad"] != 3 || f.Kinds["boundsTest"] != 3 || *f.Entries != 3 {
		t.Fatalf("f %+v", f)
	}
	if g.Bytes != 8 || g.Steps != 4 || g.Kinds["mul"] != 2 || *g.Entries != 2 {
		t.Fatalf("g %+v", g)
	}
}
