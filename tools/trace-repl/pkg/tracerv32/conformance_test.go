package tracerv32

import (
	"bufio"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"testing"
)

// The conformance suite (bench/reference/rv32/vectors.jsonl, written by
// bench/rv32/vectors.mjs): one instruction per vector, integer and RV32F, with
// the RV32F expectations captured on the ESP32-P4. The constants are the
// suite's (bench/rv32/generate.mjs).
const (
	vectorPC     = 0x2000
	vectorImage  = 0x4000
	vectorWindow = 0x1100
	windowBytes  = 32
	vectorMemory = 0x2000
)

type vectorState struct {
	X    map[string]string `json:"x"`
	F    map[string]string `json:"f"`
	Fcsr string            `json:"fcsr"`
	Mem  string            `json:"mem"`
	Next string            `json:"next"`
}

type vector struct {
	ID    string `json:"id"`
	Class string `json:"class"`
	Word  string `json:"word"`
	vectorState
	Expect struct {
		vectorState
		Fault string `json:"fault"`
	} `json:"expect"`
}

func num(s string) uint32 {
	if s == "" {
		return 0
	}
	v, err := strconv.ParseUint(s, 0, 32)
	if err != nil {
		panic(err)
	}
	return uint32(v)
}

func registers(m map[string]string) (r [32]uint32) {
	for k, v := range m {
		i, _ := strconv.Atoi(k)
		r[i] = num(v)
	}
	return r
}

func loadVectors(t *testing.T) []vector {
	t.Helper()
	f, err := os.Open("../../../../bench/reference/rv32/vectors.jsonl")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	var out []vector
	s := bufio.NewScanner(f)
	s.Buffer(make([]byte, 1<<20), 1<<20)
	for s.Scan() {
		var v vector
		if err := json.Unmarshal(s.Bytes(), &v); err != nil {
			t.Fatal(err)
		}
		out = append(out, v)
	}
	if err := s.Err(); err != nil {
		t.Fatal(err)
	}
	return out
}

// runVector executes one vector and returns its differences from the expectation.
func runVector(v vector) []string {
	image := make([]byte, vectorImage)
	for at := 0; at < vectorImage; at += 4 {
		binary.LittleEndian.PutUint32(image[at:], Ebreak)
	}
	binary.LittleEndian.PutUint32(image[vectorPC:], num(v.Word))
	memory := make([]byte, vectorMemory)
	initial, _ := hex.DecodeString(v.Mem)
	copy(memory[vectorWindow:], initial)
	xs, fs := registers(v.X), registers(v.F)
	var x [32]int32
	for i, r := range xs {
		x[i] = int32(r)
	}
	f := fs
	m := Machine{Image: image, Memory: memory, X: &x, F: &f, Fcsr: num(v.Fcsr), NoChecks: true, Limit: 2, LimitText: "2"}
	out, err := m.Run(vectorPC)
	var fault *Fault
	if v.Expect.Fault != "" {
		if !errors.As(err, &fault) {
			return []string{fmt.Sprintf("expected a fault, got %+v %v", out, err)}
		}
		return nil
	}
	if err != nil {
		return []string{"unexpected error: " + err.Error()}
	}
	if !out.Trap {
		return []string{"returned to the host"}
	}
	var problems []string
	wantX, wantF := xs, fs
	for k, val := range v.Expect.X {
		i, _ := strconv.Atoi(k)
		wantX[i] = num(val)
	}
	for k, val := range v.Expect.F {
		i, _ := strconv.Atoi(k)
		wantF[i] = num(val)
	}
	wantX[0] = 0
	for i := 0; i < 32; i++ {
		if uint32(x[i]) != wantX[i] {
			problems = append(problems, fmt.Sprintf("x%d %#x != %#x", i, uint32(x[i]), wantX[i]))
		}
		if f[i] != wantF[i] {
			problems = append(problems, fmt.Sprintf("f%d %#x != %#x", i, f[i], wantF[i]))
		}
	}
	if m.Fcsr != num(v.Expect.Fcsr) {
		problems = append(problems, fmt.Sprintf("fcsr %#x != %#x", m.Fcsr, num(v.Expect.Fcsr)))
	}
	wantMem := v.Expect.Mem
	if wantMem == "" {
		wantMem = v.Mem
	}
	if got := hex.EncodeToString(memory[vectorWindow : vectorWindow+windowBytes]); wantMem != "" && got != wantMem {
		problems = append(problems, "memory "+got+" != "+wantMem)
	}
	next := uint32(vectorPC + 4)
	if v.Expect.Next != "" {
		next = num(v.Expect.Next)
	}
	if uint32(out.At) != next {
		problems = append(problems, fmt.Sprintf("next pc %#x != %#x", out.At, next))
	}
	return problems
}

func TestConformanceVectors(t *testing.T) {
	vectors := loadVectors(t)
	if len(vectors) < 10000 {
		t.Fatalf("only %d vectors", len(vectors))
	}
	failures := 0
	for _, v := range vectors {
		if p := runVector(v); len(p) > 0 {
			if failures++; failures <= 20 {
				t.Errorf("%s: %v", v.ID, p)
			}
		}
	}
	if failures > 0 {
		t.Fatalf("%d of %d vectors fail", failures, len(vectors))
	}
}
