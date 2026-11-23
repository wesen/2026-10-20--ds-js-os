---
Title: 'Diary: f32 end to end'
Ticket: PICOCALC-TYPED-F32
Status: active
Topics:
    - picocalc
    - compiler
    - esp32-p4
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: compiler/typed/tape.js
      Note: the f32 rows and the three pseudo-ops where WebAssembly and RV32F differ
    - Path: compiler/typed/frontend/floats.js
      Note: the f32 operators, Math functions, getF32/setF32
    - Path: compiler/typed/wasm/encode.js
      Note: typed locals, f32.const bytes, the pseudo-op expansions
    - Path: compiler/typed/rv32/emit/floats.js
      Note: RV32F lowering
    - Path: compiler/typed/rv32/passes/fields.js
      Note: one load per f32 field
    - Path: compiler/typed/lib/math.typed
      Note: the math library
    - Path: tests/compiler/typed-f32.test.mjs
      Note: the differential tests
ExternalSources: []
Summary: "Implementation diary of PICOCALC-TYPED-F32: f32 in Typed end to end, the math library, the Candela fragments against GCC, the board study."
LastUpdated: 2026-11-22T23:59:00-05:00
WhatFor: "Reviewing how f32 was threaded through the compiler and what each gate gave"
WhenToUse: "Before extending f32 (PICOCALC-CANDELA-TYPED) or widening the f32-only code-generation changes to integers"
---

# Diary: f32 end to end

## Step 1: Orientation, the baseline and the plan

I read the program's rules, the design doc 02, the compiler guide, the REGISTERS diary (its "left for F32" list: tape
float operations, `fn.localTypes` from the front end, an f operand stack, float emission; leaves accept only integer
parameters) and the BITWISE diary (how a feature crosses lexer, P4 lexical index, tape, Wasm, RV32, passes, tests). I
brought the branch to main (`156e595`) and took the digest baseline from `git archive main compiler/typed`.

### Prompt Context
**User prompt (verbatim):** "TICKET: PICOCALC-TYPED-F32 — f32 in Typed end to end: language (type, literals, explicit
conversions, arithmetic, comparisons, record fields, float buffer access), tape rows, the WebAssembly backend, RV32F
code generation through the register classes, explicit semantics where WebAssembly and RISC-V differ, and a math library
written in Typed — sized for Candela's whole kernel (the next ticket, PICOCALC-CANDELA-TYPED, generates Candela's kernel
in Typed and depends on you)." Work plan (abridged, as given): verify the design and append Refinements (trap vs
saturate — measure; min/max NaN rule; float buffer access form; the float operand-stack strategy); a diary in the
investigation format; language + tape + Wasm with a Wasm-only differential test, then RV32F emission, then the math
library with ulp accuracy, then the three Candela fragments vs GCC -O2 (target within 1.5x), then a paired board study;
gates: differential Wasm vs RV32 on the reference interpreter and the Go machine bit for bit, 84 integer digests
byte-identical, `make test`, `make test-host` default and kernel; board only through bench/board tools under the serial
lock, restore from the main checkout, never write PLAYABLE.json.
**Assistant interpretation:** implement f32 through every layer with gates at each boundary; keep integer output
unchanged; measure against GCC; time on the board.
**Inferred user intent:** Typed can express Candela's kernel natively, without C.
**Commit (code):** none in this step.

### What I did
- `git merge --ff-only main`; copied REGISTERS' digest harness (`scripts/01-digests.mjs`, `02-compare-digests.sh`,
  `units.mjs`); baseline `IDENTICAL 84 of 84` against itself.
- Copied BITWISE's QuickJS lexical-index check (`scripts/03-qjs-lex-index.c`, `04-check-lex-index.js`).
- Worktree setup: a scratch `go.mod` with an absolute go-go-goja replace (`GOFLAGS=-modfile=...`, not committed),
  `bash firmware/tools/wasm-toolchain.sh`.

### Why
- The digest harness is the byte-identity gate; the lexical index must tokenize exactly as the JS lexer.

### What worked
- Baseline digests; toolchain; Go builds with the scratch modfile.

### What didn't work
- N/A.

### What I learned
- Every pass with an abstract operand stack (inline, commute) silently ignored operations it did not know, which would
  have misplaced arguments after an f32 operation; value-sets, hoist, ranges and the PIE loops return null instead.

### What was tricky to build
- N/A.

### What warrants a second pair of eyes
- N/A.

### What should be done in the future
- N/A.

### Code review instructions
- `bash scripts/02-compare-digests.sh BASE SCRATCH` with BASE from `git archive main compiler/typed`.

### Technical details
- Candela's kernel calls: sqrt 37, max 80, i32( 63, f32( 31, abs 27, clamp 26, min 24, sin 21, cos 21, floor 18,
  mix 16, exp 12, atan2 10, fract 7, acos 4, log 3, u32( 3, pow 1 (grep of `cdl_kernel.cpp`).

## Step 2: f32 through the language, the tape, WebAssembly and RV32F

The f32 type, its literals, conversions, operators, Math functions, record fields and buffer access, as tape rows that
the Wasm backend serializes and the RV32 backend lowers to RV32F on an f operand stack. The first differential run of a
hand-written program agreed on all 3,400 cases under five policies; the generated-expression test found one real
semantic hole (copysign of an arithmetic NaN), fixed by a rule rather than code.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** the coherent first part: language, Wasm, RV32F, differential tests.
**Inferred user intent:** f32 programs that run identically on the oracle and the device.
**Commit (code):** `b2773a5` — "feat(typed): f32 end to end: language, tape rows, WebAssembly and RV32F emission"

### What I did
- `tape.js`: `F32 = 0x7d`, `ANY` (the type of a local, callee or function), operand format `"f"` (an f32.const cell
  holds the bits; Wasm bytes are four little-endian bytes; `decode(..., true)` reads them), 23 f32 rows and three
  pseudo-ops: `f32.to_i32` (0xf4), `f32.min_num` (0xf5), `f32.max_num` (0xf6). 66 rows.
- Lexer: float tokens `\d+\.\d+([eE][+-]?\d+)?|\d+[eE][+-]?\d+`, kind `"float"`, `floatValue()` (an infinity is an
  error); `f32` reserved and a type. `typed_lex_index.c`: kind `FLOAT` (5), the same two forms.
- Front end (`expressions.js`, new `floats.js` mixed into `ExpressionParser`, `statements.js`): f32 binary operators
  (FLOAT_BINARY), unary minus (removes the `i32.const 0` it wrote first; a literal's sign bit flips in place), `f32(i)`
  (a literal folds), `i32(x)`, `Math.*` (FLOAT_MATH, min/max on either type, bitsOf/fromBits), f32 record fields
  (`f32.load`/`f32.store`), `buf.getF32(i)`/`setF32(i, x)`, `fn.localTypes` when a frame local is f32.
- Wasm: `valueType` signatures, typed local groups, `f32.const` bytes, expansions of the pseudo-ops with two f32 scratch
  locals; `invoke` accepts f32.
- RV32: `OPERAND_STACKS` (x `t0`-`t4`, f `ft0`-`ft4` at first), `pop(scratch)` picks the class of the scratch,
  `classes[d]` for call spills, `localClass`, value blocks of type F32, RETURN/END pop with the return register;
  `emit/floats.js` (FloatMethods); leaves accept f32 parameters and f32 operations (not loads/stores).
- Passes: `FLOATING`/`tapeRow` in `encoding/tape.js`; inline and commute model f32 operations by their rows; block
  values `a !== VOID` in inline, commute, hoist, value-sets, ranges; inline carries callee types into
  `fn.localTypes` and opens `BLOCK F32` for an f32 callee; split copies the origin's type (on a copy of the array).
- Tests: `tests/compiler/f32-cases.mjs` (generator, JS model, hand programs), `typed-f32.test.mjs`,
  `typed-f32-fixture.mjs` → `tools/trace-repl/pkg/traceapi/testdata/f32-differential.json`, `f32_test.go` (the Go
  machine under goja with `compiler.at('worktree')`); `typed-tape.test.mjs` accepts ANY and F32 blocks; Makefiles.

### Why
- RV32F's rules where the targets differ: one instruction on the device, an expansion on the oracle (Refinements).
- An f operand stack instead of crossing classes with `fmv` on every operation (REGISTERS' open question).

### What worked
- Hand program (`f1.typed`): `AGREE 3400` on the first run. Generated: 240 functions x 12 inputs x 5 policies =
  14,400 RV32 runs, each against Wasm and the JS model; NaN 266, infinity 158, finite 1,736 results; 805 fsw and
  1,361 flw in the stock image (spills exercised).
- Go machine: `3360 f32 cases agree`. QuickJS lexical index: `AGREE 7 of 7` (BITWISE's sources plus float adjacency
  "1.5 1. .5 1e5 1e+5 1e- 1.5e 1.5e-3x 0x1e5 2E10 1.2.3 07.5 1e5e5 ..." and an f32 program).
- `IDENTICAL 84 of 84`; `node --test tests/compiler/*.test.mjs` 64/64; `make test` exit 0; `make test-host`: ray
  4,888,369 instructions, 11964 B, `430f0d501659`; Chess 6,981 words, 128,152,624, 21716 B; 24/24. Kernel: 3,239,635,
  11544 B, `430f0d501659`; 118,361,847, 19892 B; 24/24.

### What didn't work
- First Wasm smoke: `CompileError: WebAssembly.instantiate(): Compiling function #4 failed: Invalid opcode 0xf4 @+229`:
  the `n === 0` short path wrote the pseudo-op as a byte; the pseudo-ops are now checked first.
- `encodeFunction`'s one-byte path also caught `f32.const` with a cell below 128 (and every negative bit pattern);
  excluded.
- `typed-bitwise.test.mjs`: `SyntaxError: 97:10: expected identifier` — its generated functions are named `f0`..`f299`,
  and `f32` is now reserved; renamed `e<i>`.
- `typed-tape.test.mjs`: `ray/stock typedRayStride after inline at cell 2: i32.load pops 0, expected 127` (local.get now
  pushes ANY); the walk accepts ANY.
- Generated differential: `stock g1(3.0112..., -0.0064..., 0.0430..., 2147483647): rv32 0.0064 (0x3bd30a6a), wasm -0.0064
  (0xbbd30a6a)` — `Math.copysign(b, sqrt(negative))`: the NaN's sign differs (V8 gives a negative NaN, RV32F the
  canonical positive one). Rule: NaN sign and payload unspecified; the generator passes only parameters and literals as
  copysign's sign.
- `make test`: `compiler/typed/frontend/expressions.js: 542 lines, over 500`; split into `frontend/floats.js`.

### What I learned
- Unary minus is written before its operand is parsed, so an f32 negation needs the two cells removed; the inspection
  tape keeps spans in a parallel array (`removeCells` splices both).
- `compiler.at('worktree')` in the trace REPL's provider loads the working tree's compiler into goja, so the Go
  machine's test needs no Node.

### What was tricky to build
- The operand stack's class: the emitter never knew value types. The class of a pop is the class of the scratch the
  consumer passes (`ft10`/`ft11` or `t5`/`t6`); a push records its register's class per depth, which only call spills
  read. LOCAL_SET peeks at its local before popping.
- `fn.localTypes` sharing: the inline pass's library copy may share the array with the function; split mutated it in
  place, which could have re-typed an inlined integer callee's locals. Split now copies.

### What warrants a second pair of eyes
- `buf.getF32(i)` checks unit 2i+1; for i >= 2^30 the doubled index wraps and reads another (in-bounds) element.
- `Math.min`/`max` on f32 still allocates the two i32 temporaries of the integer form (to keep integer tapes identical).

### What should be done in the future
- Fused compare-and-branch for f32 (`flt` + `bnez` is already two instructions; nothing to gain without a branch on
  flags).

### Code review instructions
- `tape.js` rows, `frontend/floats.js`, `wasm/encode.js` (pushTruncate, pushMinMax, localGroups), `rv32/emit/floats.js`,
  `emit/stack.js` (pop/push), `passes/inline.js` (FLOATING fallback, types); run `node --test tests/compiler/typed-f32.test.mjs`.

### Technical details
- Wasm `f32.to_i32`: `local.set s; i32.const 0x7fffffff; local.get s; i32.trunc_sat_f32_s; local.get s; local.get s;
  f32.ne; select`.
- RV32 floor (rm = rdn; ceil rup, trunc rtz): `fmv.s out,x; fmv.x.w t6,x; slli t6,t6,1; lui t5,0x96000; bgeu t6,t5,+16;
  fcvt.w.s t6,x,rm; fcvt.s.w ft11,t6,rm; fsgnj.s out,ft11,x`.

## Step 3: The math library in Typed and its accuracy

`compiler/typed/lib/math.typed` with Cephes's single-precision polynomials, evaluated in f32 without fused operations.
The first accuracy run found a real bug (cos used the wrong octant polynomial) and a documentation question (sin and cos
of large arguments near their zeros).

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** the library Candela's kernel needs, with measured ulp accuracy.
**Inferred user intent:** the next ticket can call sin, exp, atan2... from Typed and get the same bits on both targets.
**Commit (code):** `88d11bd` (with Step 4).

### What I did
- Functions: sinf, cosf, tanf, expf, exp2f, logf, log2f, powf, atanf, atan2f, asinf, acosf, fract, mix, clamp, saturate,
  step, sign, smoothstep, ldexpf, pow2i.
- `compiler/typed/lib/accuracy.mjs`: Wasm against `Math.fround(Math.f(x))`, 200,000 samples per domain plus edges, max
  and mean ulp and max absolute error; `README.md` holds the table.
- `f32-cases.mjs` `MATH`, `MATH_FUNCTIONS`, `mathInputs`; the test runs every function under five policies (14,000+
  RV32 runs) and checks documented edges (sin(-0) = -0, sin(2^23) = 0, exp(-200) = +0, log(0) = -inf, atan2(0, -0) = pi,
  clamp(NaN, 0, 1) = 0, ...); the Go fixture gained 600 math cases (6,360 in all).

### Why
- In Typed, the library compiles to the same bits on both targets; C's libm would differ from Wasm's.
- No records in the library: a program's declarations must come before every function, so a concatenated library
  with a record would break any program that declares its own.

### What worked
- Max ulp: sinf/cosf 1 on [-pi, pi] and [-100, 100]; tanf 3; expf, exp2f, logf, log2f 1 (subnormals included); atanf,
  atan2f 3; asinf, acosf 2; powf 21-48 (amplified by y log2 x). Edges 0-1 ulp.

### What didn't work
- First run: `cosf` max 2,120,878,567 ulp — `sinCosReduced(z, 3 - j)` picked the wrong polynomial for octants 0 and 3;
  the octant's other function is `j ^ 1`.
- First draft used a `record LogParts` for log's two parts: `171:27: expected ;` from `const ay = Math.abs(y), ax = ...`
  (Typed declares one binding per statement), and the record would have broken concatenation; rewritten with
  logExponent/logFraction/logTail.
- `sinf` on [-51000, 51000]: max 262,156 ulp at 26524.47 (a result next to zero). Reported on [-8192, 8192] (33 ulp,
  absolute error 7.5e-8) with an absolute-error column; arguments from 2^23 give 0 (sin) and 1 (cos), documented.

### What I learned
- Ulps mislead near a function's zeros: the README gives the absolute error too.

### What was tricky to build
- Signed zeros and NaN without ternaries or `isNaN`: `!(x === x)`, `Math.bitsOf(x) < 0` for the sign bit, `(x - x) /
  (x - x)` for a NaN, `-1.0 / 0.0` for -infinity.

### What warrants a second pair of eyes
- powf's accuracy is enough for Candela's one gamma-like call; a hi/lo log2 would bring it to a few ulps.

### What should be done in the future
- A two-part log2 for powf; Payne-Hanek reduction if a kernel needs sin of arguments beyond 51,000.

### Code review instructions
- `node compiler/typed/lib/accuracy.mjs`; the math test in `tests/compiler/typed-f32.test.mjs`.

### Technical details
- See `compiler/typed/lib/README.md`.

## Step 4: The Candela fragments against GCC -O2

The three fragments of CANDELA-P4's numeric bench in Typed (`scripts/fragments.typed`) against the same C
(`scripts/fragments.c`) compiled by GCC -O2 (rv32imaf, ilp32f), both counted on the reference interpreter over the
bench's 2,000 inputs (`scripts/05-fragments.mjs`). Typed started at 2.19x, 2.64x and 1.83x of GCC; seven f32-only
changes brought it to 1.49x, 1.31x and 1.30x, bit-exact with GCC -ffp-contract=off and with Wasm.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** within 1.5x of GCC -O2's instruction counts.
**Inferred user intent:** Typed f32 code close enough to C that the kernel need not stay in C.
**Commit (code):** `88d11bd` — "feat(typed): an f32 math library in Typed and f32 code within 1.5x of GCC -O2 on
Candela's fragments"

### What I did
Instructions per call (kernel policy) after each change:

| Change | sphere | ggx | norm3 |
|---|---:|---:|---:|
| GCC -O2 (contracts to fmadd) | 25.45 | 58.00 | 23.00 |
| GCC -O2 -ffp-contract=off | 33.45 | 66.00 | 26.00 |
| first RV32F emission | 55.65 | 153.00 | 42.00 |
| inline f32 candidates anywhere | 55.65 | 106.00 | 42.00 |
| fields pass (one load per f32 field) | 43.65 | 109.00 | 36.00 |
| f stack ft0-ft7, ft8/ft9 leaf homes, f32 constant homes | 45.21 | 95.00 | 36.00 |
| returned value computed in fa0, fa0 parameter kept | 42.97 | 91.00 | 35.00 |
| frameless f32 functions | 38.97 | 91.00 | 31.00 |
| a0 kept without scratch use; unused f stack registers as leaf homes | 37.97 | 76.00 | 30.00 |

Ratios to GCC -O2: 1.49, 1.31, 1.30; to GCC without contraction 1.14, 1.15, 1.15. Every change is limited to functions
with an f32 parameter, local or result, so the integer digests stay 84/84.

### Why
- GCC's advantages were CSE of field loads, inlining, constants in registers, no frame in leaves; the remaining gap is
  mostly fmadd (8 per sphere call), which Typed refuses by rule.

### What worked
- `typed = gcc -ffp-contract=off bit for bit: {"sphere":true,"ggx":true,"norm3":true}`, `typed = wasm` likewise.
- `typed-f32.test.mjs` keeps the bounds (1.5x GCC + 0.5) on its own inputs.
- `IDENTICAL 84 of 84`; `make test` exit 0; host gates as in Step 2 (same numbers).

### What didn't work
- The first frameless attempt never fired: `dropsFrame` read `usesFrame` after the epilogue had reloaded `ra`; the
  body's value is now kept (`bodyUsesFrame`).
- f32 constant homes with weight 1 made sphere slower (43.65 → 45.21): 0.0002 is used once unconditionally and once
  in an if, and its home is made on every call. Weight 0.6 per use: two unconditional uses, or one in a loop.
- `typed-rv32.test.mjs` "policies are pass lists": the default list now has `fields`; the stage list gained it.
- The fragments script's Wasm check: `RuntimeError: memory access out of bounds` and then `Maximum memory size exceeded`
  (the module has one page): it copies one input at a time to 0x100.

### What I learned
- GCC -O2 contracts `a*b + c` into fmadd by default; Typed's no-contraction rule costs about 25% on dot products.

### What was tricky to build
- Keeping a parameter in fa0 (and a0): safe because fa0 is written only by a return, and a0's scratch uses (capacity,
  division check) are absent from the function.
- The deepest operand stack of a leaf from the tape (`deepestStack`): the f stack registers above it are free homes.

### What warrants a second pair of eyes
- `fields` hoists nothing; it only reuses the first top-level load, so it is exact when the function and its callees
  store nothing. Its storeless answer needs the start hook (as hoist's).
- `dropsFrame` re-emits the function frameless (twice the emit time for those functions).

### What should be done in the future
- Widen the f32-only changes to integer functions (frameless functions, a0 kept, constant homes, returned values in
  a0) with a board study: they change the pinned images.
- An fmadd under an explicit opt-in (`Math.fma`) if a kernel wants GCC's contraction.

### Code review instructions
- `node scripts/05-fragments.mjs 2000`; `passes/fields.js`, `plan/saved-homes.js` (floatingFunction, deepestStack,
  a0Free), `emit/floats.js` (floatResult/floatDone), `emit/function-code.js` (dropsFrame), `compile.js`.

### Technical details
- GCC flags: `-O2 -fno-math-errno -march=rv32imaf_zicsr -mabi=ilp32f -msmall-data-limit=0 -mno-relax -nostdlib`, text at
  0, rodata at 0x8000 (a linker script), run on the reference interpreter with the inputs at 0x9000.

## Step 5: The board study and the compile-time cost

The three fragments in three arms on the ESP32-P4: GCC -O2 (contracting), GCC -O2 -ffp-contract=off, Typed kernel.
bench/board's harness times ray, Chess and compiles only, so the study is a standalone app in the ticket
(`scripts/board/`, staged by `06-stage-board.mjs`, built by `07-build-board.sh`, run and scored by `08-run-board.py`
through `bench/board/device.py`'s `run_app` of the main checkout: serial lock, health before, restore of the main
checkout's PLAYABLE.json image, health after). Typed runs at 1.17-1.33x GCC -O2's cycles and is bit-exact with GCC
-ffp-contract=off on all 6,000 results.

### Prompt Context
**User prompt (verbatim):** see Step 1 ("a paired board study of the fragments in Typed vs their C versions").
**Assistant interpretation:** measure on the device that the instruction-count ratios hold in cycles.
**Inferred user intent:** evidence on the device, not only on the reference interpreter.
**Commit (code):** this step's commit (see the changelog).

### What I did
- `board/main/main.c`: before timing, arms 1 and 2 are checked against the host's Typed results (inputs.h) for all
  2,000 inputs per kernel; then 6 blocks x 3 kernels x 3 arms, the arm order rotating (each arm in each position twice,
  odd blocks reversed), a warm-up run before each timed run, `esp_cpu_get_cycle_count`, FNV hash of every result.
- The Typed image is `.incbin`'d into `.text` at a 16-byte boundary; its entries are symbols at image offsets (the
  fragments import nothing, so no relocation).
- Capture `sources/board-2026-11-22/` (bench.log, score.json, health before and after, manifest).
- Compile time of integer programs, base (main) vs tree, one boot compile in a bare QuickJS realm under callgrind
  (REGISTERS' `03-qjs-measure.c`), and per stage in `node --jitless`.

### Why
- Instruction counts ignore the P4's FPU latencies (fdiv, fsqrt) and dual issue; cycles settle the ratio.
- The compile-time check: f32 adds branches on every operation of the emitter and front end, paid by integer programs.

### What worked
- `F32FRAG HASH sphere 2b6082ab e7716b1a e7716b1a` (likewise ggx, norm3): no mismatch, Typed = GCC -ffp-contract=off.
- Cycles per call (median of 6 blocks, 2,000 inputs):

| Kernel | GCC -O2 | GCC -O2 -ffp-contract=off | Typed kernel | Typed / GCC -O2 | Typed / no contraction |
|---|---:|---:|---:|---:|---:|
| sphere | 75.13 | 78.90 | 100.00 | 1.331 | 1.267 |
| ggx | 290.04 | 306.04 | 364.04 | 1.255 | 1.190 |
| norm3 | 104.04 | 104.04 | 122.04 | 1.173 | 1.173 |

  GCC won all 6 paired blocks of every kernel; the spread is below 0.1% except sphere against no contraction
  (1.18-1.27, one block).
- Restore: `after.json` sha256 `4b0d5499...` (the main checkout's PLAYABLE.json had moved on to 06e8d55 while I
  worked), 8 worlds healthy, nothing restarting.

### What didn't work
- First build: `inputs.h:2002: error: expected expression before 'float'` — `__builtin_bit_cast` is C++/C23 only in
  GCC 14's C mode; the inputs are now a union of `uint32_t` and `float` arrays.

### What I learned
- On the device the gap is smaller than in instruction counts (1.17-1.33 vs 1.30-1.49): the FPU latencies of fdiv and
  fsqrt dominate ggx and norm3, which both compilers pay alike.

### What was tricky to build
- Getting the board app's inputs bit-identical to the host's: generated in JS with the same LCG, written as bits.

### What warrants a second pair of eyes
- Compile time. Callgrind, one boot compile in QuickJS: Editor (interactive) 732.2M -> 757.1M instructions (+3.4%),
  Chess (balanced) 723.8M -> 751.8M (+3.9%). Of this, loading (parsing) the larger compiler is about +15M (a one-line
  program: 107.3M -> 122.3M); the compile itself is about +1.6% (Editor) and +2.1% (Chess). Before two fixes it was
  +4.1% and +4.3%: one number alternative in the lexer's regexp instead of three (no backtracking for an integer),
  `localClass` answering 0 at once in an integer function, the call spill loops without a closure, the fields pass's
  storeless start only for functions with f32 values. The host lexer's regexp does not run on the P4 (it reads the C
  lexical index), so the device's cost is lower than the host's; a cold-compile board study would settle it.

### What should be done in the future
- A cold-compile board study of this branch against main (Editor, Chess), and, if the cost shows, a per-function
  integer fast path in the emitter's dispatch.

### Code review instructions
- `node scripts/06-stage-board.mjs OUT && scripts/07-build-board.sh OUT && python3 scripts/08-run-board.py OUT CAPTURE`;
  `python3 scripts/08-run-board.py --score sources/board-2026-11-22` re-scores (it reads `bench.log`).

### Technical details
- Typed image 179 words, sha256 `0a1e8617...`; app `b975863a...`; GCC -O2 with `-fno-math-errno` (ESP-IDF's
  `CONFIG_COMPILER_OPTIMIZATION_PERF` plus per-file `-O2`).
