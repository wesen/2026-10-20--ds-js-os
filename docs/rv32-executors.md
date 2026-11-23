# The RV32 executors and their conformance suite

Three programs in this repository execute RV32 machine code on the workstation. Each exists for a different job,
and one suite of instruction vectors, with floating-point semantics captured on the ESP32-P4 itself, keeps them in
agreement with each other and with the board (PICOCALC-RV32-CONFORMANCE).

## Three executors, three jobs

| Executor | Where | Runs | Its job |
|---|---|---|---|
| The reference interpreter | `bench/host/rv32-interp.js` | images from `typedRv32.compile` | The readable definition. It runs next to the compiler in any JavaScript VM (Node, goja, QuickJS), counts every instruction and checks the calling convention at each call and return. The ray profile and the compiler's tests use it. |
| The Go machine | `pkg/tracerv32` | the same images | A predecoded twin of the reference, about 1,200 times faster than the reference in goja, for counts and profiles in the trace REPL (`rv32.run`). It implements the reference's loop statement by statement, including its fault messages and the order of its checks, and is tested for bit identity against it. |
| rv32emu | `bench/emu` | whole programs: an ELF firmware and its modules | The machine for complete C and Typed programs: it loads executables, relocatable objects and shared modules as the board's `elf_loader` does and answers the firmware library's host calls (output, time, the heap, maths, 64-bit and soft-float helpers). The 24 replays, the Chess oracle, cji's fixtures and Candela's RV32 reference run on it. |

All three execute RV32IMF: the integer base and multiply/divide, the single-precision floating-point extension with
every rounding mode and the exception flags, and the CSR instructions on `fflags`, `frm` and `fcsr`. rv32emu also
executes the compressed extension (including RV32FC's `c.flw`, `c.fsw`, `c.flwsp`, `c.fswsp`) because C compilers
emit it, and answers `ecall` as a host call. The two interpreters do not execute `ecall`, other CSRs, or Espressif's
PIE instructions; a program compiled with `pieLoops` stops at its first PIE word.

rv32emu's sources are split by concern: `machine.h` (state and interfaces), `machine.c` (registers, memory, `die`),
`decode.c` (the compressed extension), `execute.c` (one instruction), `fpu.c` (RV32F), `elf.c` (loading),
`host.c` (the heap, `printf`, host calls), `profile.c` (`RV32_TRACE`, `RV32_PROFILE`) and `main.c`.

### The calling-convention checks

The reference and the Go machine check, by default, that `sp` is 16-byte aligned at every call, that a return goes
to the address its call pushed, and that `sp`, `gp`, `tp` and `s0`-`s11` survive the call. A call is `jal` or
`jalr` linking `ra`; a return is `ret` (`jalr x0, 0(ra)`). `options.checks = false` (Go: `Machine.NoChecks`) turns
them off; the conformance suite runs single instructions that way. `options.registers`, `fregisters` and `fcsr` set
the initial state instead of the default setup (callee-saved patterns, `sp` at the top of memory, arguments in
`a0`...); results carry `registers`, `fregisters` and `fcsr`.

### Why rv32emu is not replaced by the Go machine

The Go machine could take over rv32emu's job, but it would need what rv32emu has and it lacks: the three ELF
loaders, the compressed extension, about sixty host calls (with `printf` formatting from guest memory and the heap's
accounting), watched ranges, and execution from writable guest memory (the Go machine predecodes a separate image).
The replays, the Chess oracle and cji drive rv32emu as a subprocess from shell and Node scripts. Moving all of that
would replace about 900 lines of C with as much Go for no new capability. The decision for now: keep rv32emu, and
let the conformance suite keep the three implementations honest. Revisit it if rv32emu's job grows (for example a
debugger interface) or if a fourth executor is ever proposed.

## The conformance suite

`bench/reference/rv32/vectors.jsonl` holds 15,664 vectors. Each executes one instruction word at pc `0x2000` with
given registers, `fcsr` and a 32-byte memory window at `0x1100`, and states what must change: registers, `fcsr`, the
window, the next pc, or an illegal-instruction fault. Registers a vector does not name start at zero and must not
change; `x10` and `f10` start at `0xdeadbeef`, so a write to the destination is always visible.

| Class | Vectors | What they cover |
|---|---:|---|
| `f-arith` | 5,170 | `fadd`/`fsub`/`fmul`/`fdiv` in every static rounding mode: all pairs of special values (zeros, subnormals, normal boundaries, max, infinities, quiet and signaling NaNs with payloads) and random operands that overflow, underflow, cancel or round |
| `f-fma` | 2,698 | the four fused operations: special triples and random ones, including `c` close to `-(a*b)` |
| `f-compare`, `f-minmax` | 2,000 | `feq`/`flt`/`fle`, `fmin`/`fmax` on all pairs of specials, NaNs and signed zeros |
| `f-convert` | 1,600 | `fcvt.w(u).s` around ±2³¹, 2³², halves and NaNs; `fcvt.s.w(u)` with more than 24 significant bits |
| `f-sqrt`, `f-sign`, `f-class`, `f-move`, `f-memory` | 1,100 | `fsqrt`, sign injection (NaN payloads kept), `fclass`, `fmv`, `flw`/`fsw` |
| `f-rm`, `f-csr` | 390 | dynamic rounding through `frm`, a static mode that ignores `frm`, `csrrw/s/c(i)` on each of the three CSRs |
| `f-illegal` | 16 | reserved rounding modes (static 5 and 6, dynamic with `frm` 5-7), double-precision formats, reserved funct fields |
| `i-alu`, `i-m`, `i-memory` | 2,506 | RV32IM arithmetic edge cases (`INT_MIN / -1`, division by zero, shifts), loads and stores with sign extension |
| `i-branch`, `i-jump` | 184 | branches, `jal` and `jalr` with every link register, `auipc`, `x0` and aliased operands |

The floating-point expectations and those of the integer arithmetic and memory vectors come from the ESP32-P4. The
control-flow vectors (their pc is the board's, not the vector's) take theirs from a small RV32I model in
`bench/rv32/generate.mjs`; for every integer vector the board did run, the model and the board agree.

Each executor has a runner in `make test`:

```sh
make test-rv32          # tests/rv32/conformance.test.mjs (the reference) and rv32emu.test.mjs (bench/emu/build/rv32emu-vectors)
go test ./pkg/tracerv32 -run Conformance        # the Go machine (part of make test-go)
node bench/rv32/vectors.mjs --check             # vectors.jsonl is what the generator and the capture give (make test-generated)
```

`pkg/traceapi`'s tests also compare the reference and the Go machine on 4,000 random programs (now with F
instructions and the new options) and on 20,000 random single F instructions.

### Capturing on the board

```sh
bench/board/rv32-build.sh /tmp/rv32-vectors                                  # generate the stubs and build the app
python3 bench/board/rv32-capture.py /tmp/rv32-vectors /tmp/rv32-capture      # run it, restore the playable image
node bench/rv32/vectors.mjs                                                  # rewrite vectors.jsonl from the capture
```

`bench/board/rv32-vectors` is a small ESP-IDF app. `vectors.mjs --board` writes one assembly stub per distinct
instruction word (264 of them): it loads `x10`-`x12`, `f10`-`f13` and `fcsr` from a block, executes the word,
and stores `x10`, `f10` and `fcsr` back. The app runs every board vector (15,454) and prints the results;
`rv32-capture.py` runs it through `device.run_app` under the serial lock, which verifies the playable image first,
captures until `RV32VEC END`, then rewrites the playable image and checks its health. The rows land in
`bench/reference/rv32/p4-captured.jsonl` with a header naming the board (`misa` `0x40901125`: RV32IMAFC plus
Espressif's custom extension, chip revision 1.3) and the input digest; a vector whose inputs changed since the
capture is refused until it is captured again. A new vector needs a new capture.

## What the P4 does

The ESP32-P4's FPU, as captured, follows the RISC-V F specification in every vector, so the three executors
implement the specification and agree with the board:

- Every NaN that arithmetic produces is the canonical `0x7fc00000`, whatever the operands' payloads; sign injection,
  `fmv`, `flw` and `fsw` keep payloads and signaling bits.
- Subnormal operands and results are kept, not flushed to zero.
- Tininess is detected after rounding: a product that rounds up to 2⁻¹²⁶ raises NX without UF. UF needs both tiny
  and inexact.
- `fmin`/`fmax` return the non-NaN operand when one is NaN, the canonical NaN when both are, raise NV only for a
  signaling NaN, and order -0 below +0.
- `fcvt.w.s` and `fcvt.wu.s` saturate (NaN gives 2³¹-1 or 2³²-1) and raise NV alone, without NX. A negative value
  that rounds to zero converts to 0 with NX only, also for `fcvt.wu.s`.
- `fmadd` with ∞ × 0 raises NV even when the addend is a quiet NaN.
- An exact zero sum of opposite operands is +0, and -0 when rounding down.
- `feq` is quiet (NV only for signaling NaNs); `flt` and `fle` raise NV for any NaN.
- `frm` selects the mode for `rm = 7`; a static mode ignores it.

Not captured: misaligned loads and stores (all memory vectors are aligned), and the board's behaviour for the
illegal encodings (they would trap the capture app).
