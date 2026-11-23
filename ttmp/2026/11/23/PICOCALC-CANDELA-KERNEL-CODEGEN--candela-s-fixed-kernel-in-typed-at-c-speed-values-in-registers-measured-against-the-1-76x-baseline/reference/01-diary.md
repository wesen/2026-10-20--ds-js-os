---
Title: Diary
Ticket: PICOCALC-CANDELA-KERNEL-CODEGEN
Status: active
Topics:
    - compiler
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: tools/gen/candela/typed/program.mjs
      Note: value records, typed parameters, record K and the glue
    - Path: tools/gen/candela/typed/signatures.mjs
      Note: which aggregate leaves each function reads
    - Path: tools/gen/candela/typed/lower-statements.mjs
      Note: aggregate locals, native continue, local arrays
    - Path: compiler/typed/rv32/passes/rows.js
      Note: one check and one base per f32 row; affine forms and buffer fields; dead index stores
    - Path: compiler/typed/rv32/passes/coalesce.js
      Note: f32 copy coalescing
    - Path: compiler/typed/rv32/plan/saved-homes.js
      Note: call-free homes fa1-fa7, ft8, ft9
    - Path: compiler/typed/rv32/emit/calls.js
      Note: pending call-free reads, record-result leaves into their locals
    - Path: compiler/typed/rv32/passes/inline.js
      Note: caller-locals budget, f32 results inline, open inlining of record results
    - Path: tests/compiler/typed-rv32-candela-passes.test.mjs
      Note: tests of rows, coalesce and call-free homes
ExternalSources: []
Summary: "Chronological record of regenerating Candela's Typed kernel with value types, profiling it, and the RV32 compiler changes that took B-01 from 1.79x to about 1.43x C++ in host instructions."
LastUpdated: 2026-11-23T20:00:00-05:00
WhatFor: "Review of the ticket's work: what changed, why, the measurements and what is left."
WhenToUse: "Before continuing the ticket (board study) or reviewing its commits."
---

# Diary

## Goal

Record the work on PICOCALC-CANDELA-KERNEL-CODEGEN: regenerate Candela's Typed kernel with the PICOCALC-TYPED-VALUES
value types, profile where its instructions go, make the compiler changes the profile justifies, and measure. The
board study (step 4 of the design) was paused for this session: the PicoCalc's keyboard I2C was NACKing and needed a
power cycle.

All host counts are RV32 instructions per sample on the reference interpreter (`bench/host/rv32-interp.js`), 16
evenly spaced rows of frame 0 at 160×160 unless a step says 8 rows, measured with `scripts/01-count.mjs`. The C++
column is `bench/reference/candela-gallery/rv32-4-passes.jsonl`'s perSample (all four passes, renderer core
included), so the ratio is a host proxy, not the device's cycle ratio.

## Step 1: Regenerate the kernel with value types

The generator in `tools/gen/candela/typed/` was rewritten to emit WGSL vectors and structs as value records
(`V2f`, `V3f`, `V4f`, `V2i` and one per struct), function results as record results instead of the `r1..ri1` fields of
`K`, native `continue`, `?:` and `u32`, and local arrays (`new Int32Array(N)`). Aggregate parameters are passed as
their leaves, and only the leaves the callee reads (`signatures.mjs`). The images it produces are bit-identical to
the old generator's on all 18 scenes, but the new program was 11.5% slower on the host before any compiler change.

### Prompt Context
**User prompt (verbatim):** "TICKET: PICOCALC-CANDELA-KERNEL-CODEGEN — bring the Typed Candela kernel toward C++ speed on the ESP32-P4: regenerate it with the new value types, profile where its cycles go, make the compiler changes the profile justifies, and measure with a paired board study against the 1.76x baseline (target: geometric mean ≤ 1.3x C++, kernel-bound scenes ≤ 1.5x)."
**Assistant interpretation:** Do the design doc's four steps in order. Keep the three Candela checks and the integer
programs' 84 digests. Run the board study only after the coordinator reports the PicoCalc was power-cycled.
**Inferred user intent:** Make the Typed kernel replace the C++ one: learn which compiler work closes the gap, with
measurements, not guesses.
**Commit (code):** 416e220 — "feat(rv32): an inlining budget for a caller's locals, and f32 record results inline anywhere"; 1c72244 — "gen(candela): the Typed kernel with value records, record results, continue, ?:, u32 and local arrays"

### What I did
- `values.mjs`: `VREC` (vec2f → `V2f` ...), `zeroOf(P, t)` (a value record's zero), `u32` and the array
  constructors in `RESERVED`.
- `signatures.mjs` (new): `leafUses` and `analyse(P)` compute, to a fixpoint, which leaves of each aggregate
  parameter a function reads (member and swizzle reads, leaves passed on to user calls); dispatchers pass their uses
  to the scene functions. `f.sig = {params: [{name, type, leaves}], ret, needsK, touchesState, impure}`.
- `program.mjs`: `typedParams(sig)` (`q_k`, then the used leaves as `p__x`), `resultType(sig)`, value records per
  vector and struct, `record K` without the result fields; the arena is K, the emissive table and the sky buffer.
- `lower.mjs`, `lower-calls.mjs`, `lower-statements.mjs`: aggregate bindings, constructors, selects per leaf
  (eager `choose`, simple `?:`, lazy temporaries), `userCall` binding a record result as `const q_tN: REC = f(...)`,
  native `break`/`continue`, local arrays, partial stores into aggregate locals.
- `apps/typed/candela-gallery/{types,kernel,scenes,glue}.typed` and `layout.json` regenerated:
  `node tools/gen/candela/regenerate.mjs`. Source 302 KB (was 372 KB); arena 12,563 words (was 13,557).
- Compiler (`passes/inline.js`): `INLINE_DEFAULTS.callerLocals = 400`, and `floating(callee)` also counts an f32
  result or f32 leaves of a record result, so `oRow` (a `V4f` result, no f32 parameters) inlines.

### Why
- Value records replace the frame records the old generator kept in the arena; record results replace the `K.r*`
  result fields. Both were what the design named as the source of the gap (memory traffic).
- Pruning unread leaves keeps the parameter lists short: most functions read two or three of a struct's fields.

### What worked
- Bit identity with the old generator: all 18 scenes' frame-0 and accumulation digests equal PICOCALC-CANDELA-TYPED's
  (`scripts/03-digests.mjs`).
- E_rel against the C++ arm (`scripts/06-compare.mjs /tmp/candela-kernel-codegen/cppref 1`): all 18 ≤ 0.02; B-01
  7.849e-8, R-04 4.317e-4, G-03 2.039e-4; seven scenes exact.
- Wasm vs RV32 (`--rv32 rows:2`, all 18 scenes): 0 floats differ.
- Integer programs: `scripts/04-compare-digests.sh` IDENTICAL 84 of 84.
- Deepest stack (`scripts/10-stack.mjs`): `cdlRenderSpan` 8,752 bytes (was 9,120), under the 24 KB gallery worker.

### What didn't work
- First RV32 compile of the new program: `RV32 function frame exceeds the instruction range` (s3_evalMaterial had
  1,163 locals after inlining). Fixed by the caller-locals budget (400).
- `oRow` stayed a call (43 calls per sample on B-01): the inliner's floating test looked only at `callee.types`.
  Fixed with `floating()`.
- The lazy select path returned `v => v` instead of its temporaries; caught by E_rel, fixed.
- `lower-statements.mjs` importing `zeroOf` from `program.mjs` was a circular import; `zeroOf` moved to `values.mjs`.

### What I learned
- The regenerated program was slower on the host: B-01 10,278.9 → 11,463.5 instructions per sample (16 rows),
  R-01 22,000 → 23,327.6, V-02 29,804.9 → 32,071.8. Arena loads and stores fell; frame loads and stores, `fmv.s` and
  `fmv.x` rose. Value records turn arena traffic into copies of leaves through frame slots.
- The large, interpreted scenes got faster (R-04 675,580 → 610,946; G-03 878,537 → 774,944): their gain is fewer
  arena round trips in the scene code.

### What was tricky to build
- A leaf the signature prunes must never be read: `coerce` fails with "internal: a leaf the signature does not pass"
  instead of emitting a read of an undefined local. Shadowed names count as reading every leaf.

### What warrants a second pair of eyes
- `signatures.mjs`'s fixpoint through dispatchers (`cdlEval*` → scene functions): a scene function receives the
  union of what its dispatcher's callers pass.

### What should be done in the future
- N/A for the generator; the slowdown is the compiler's to remove (steps 2–6).

### Code review instructions
- `tools/gen/candela/typed/signatures.mjs`, `program.mjs` (`typedParams`, `resultType`), `lower-statements.mjs`
  (`declare`, `assign`).
- `node tools/gen/candela/regenerate.mjs --check`; `node ttmp/.../scripts/06-compare.mjs /tmp/candela-kernel-codegen/cppref 1 --rv32 rows:2`.

### Technical details
- Glue: `const o: PixOut = renderPixel(q_k, <px leaves from f32(x), f32(y)>, u32(frame));` then `out.setF32(at + i, o.f)`.

## Step 2: Profile before changing the compiler

I profiled B-01 and R-01 per function and per instruction class on the step-1 build, and annotated the hot functions
instruction by instruction. The cost was not in the floating-point work: it was in moving value-record leaves through
frame slots, and in the address arithmetic and range checks of every `getF32`.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Find where the instructions go before any compiler change and write it down.
**Inferred user intent:** Compiler work chosen by evidence.
**Commit (code):** none (scripts in the ticket's `scripts/`, committed with the docs)

### What I did
- `node scripts/01-count.mjs --rows 16 --top 25 --dump /tmp/candela-kernel-codegen/step1 B-01 R-01`: per class and
  per function (inlined callees count in their callers).
- `python3 -I scripts/02-annotate.py DUMP B-01 hitObj --min 1`: executions per instruction of one function.
- Later, `scripts/11-patterns.mjs DUMP B-01`: instructions per sample in named wasteful shapes (store then reload of
  one slot, move chains, result moves after calls, callee-saved saves and restores, f32 constants, capacity checks).

### Why
- The design's candidates (fs registers across calls, inlining budget, f32 ranges, frame work) needed a ranking.

### What worked
- B-01 on the step-1 build, 11,463.5 instructions per sample: classes `alu.imm` 2,078.5, `flw.frame` 1,521,
  `fsw.frame` 1,447.9, `fmv.s` 1,044.9, `branch` 718.4, `fmv.x` 522.2, `lw.mem` 484.5, `alu` 455.7; the
  floating-point arithmetic (`fmul` 420.5, `fadd` 350.7) is under 7%.
- Functions: tracePath 1,232.5, traceAll 1,215.2, xfP ~1,190, hitObj ~1,030, xfD ~990, cameraRay 867, neeAt 834.
- Annotation of hitObj and xfP showed three patterns:
  1. a `getF32(E)` costs about 8 instructions besides its load (E·2 + 1, a capacity load, a branch, the address);
     `oRow` reads four in a row, and xfP calls it four times with the same `i`;
  2. a value-record copy (`let w: V = v`, a record result stored into locals) is a chain of `flw`/`fsw` or `fmv.s`
     through slots that coalescing would remove;
  3. calling functions keep few f32 values in registers: only fs0–fs11 survive a call, and fa1–fa7, ft8, ft9 are
     unused even where no call intervenes.

### What didn't work
- `02-annotate.py ... | head` ends with a BrokenPipeError (harmless).

### What I learned
- The design's premise (memory use, not single-function code) holds, but the memory is the frame, not the arena.

### What was tricky to build
- Inlined callees count in their callers; `01-count.mjs` attributes by the RV32 function entry table.

### What warrants a second pair of eyes
- The host ratio is a proxy: the device's PSRAM-backed frames make frame traffic costlier there, so the ranking
  should hold, but the ratio will not match.

### What should be done in the future
- Re-profile after each change (done: steps 3–6).

### Code review instructions
- `scripts/01-count.mjs`, `scripts/02-annotate.py`, `scripts/11-patterns.mjs`.

### Technical details
- `getF32(E)` on the tape: `E; i32.const 1; i32.shl; i32.const 1; i32.add; local.set p; text.checked_address b p;
  f32.load 2 2` (unit 2E + 1 checked; the load reads b + 4 + 4E).

## Step 3: rows and coalesce

Two new kernel passes, run only on f32 functions so integer programs keep their images. `rows` turns three or more
`getF32` reads of one buffer and index local in a straight stretch into one exact two-sided range check and one base
address; `coalesce` merges an f32 copy's source and destination when the source dies at the copy and the destination
is born there. Together they took B-01 from 11,247 to 9,248 instructions per sample on 8 rows.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** The first two profile patterns.
**Inferred user intent:** see Step 1
**Commit (code):** 1fc5528 — "feat(rv32): kernel passes rows (one check and one address per f32 row) and coalesce (f32 copies)"

### What I did
- `passes/rows.js` `groupRowReads(fn)`; `passes/coalesce.js` `coalesceCopies(fn, arity, origin)` and `walkCopies`.
- `passes/registry.js`: both after `split`, `observe: "changed"`; `compile.js` observes such a stage only when it
  returns `"changed"`; `passes/loops-group.js` runs them for `floatingFunction(fn)`; `policy.js` adds them to kernel.
- `tests/compiler/typed-rv32-candela-passes.test.mjs`; `tests/compiler/typed-tape.test.mjs` now walks the Candela
  gallery's kernel tapes, with record results counted.

### Why
- A trap in a group moves to the group's start; with no store, call or branch between, the memory a trap leaves is the
  same, so the rewrite is exact (see the pass comment).

### What worked
- B-01/R-01/V-02, 8 rows: 11,247/21,294/33,017 → 9,248/16,664/26,333. IDENTICAL 84 of 84. Wasm vs RV32 agree on
  `rows:6` of B-01, R-01, V-02, G-01, W-02, S-02, X-04, R-05. `node --test tests/compiler/*.test.mjs` 90/90.
- Mutation: dropping the group's first check makes `three(-1)` read out of range, and the test fails.

### What didn't work
- My first trap test expected `rows(at, 0x40000000)` to trap in Wasm: 2·(4i) + 1 wraps there and does not; 0x3fffffff.
- The tape-table walk assumed one result per function: `pow2i after inline at cell 9: block result is not 127`. The
  walk now takes the function's result count and type.

### What I learned
- `walkCopies` must skip dead code after `br`/`return`/`unreachable`, or the abstract stack is wrong after it.

### What was tricky to build
- Exactness of the two checks: P = 2E_min + 1 <u cap and P + 2d <u cap together cover every unit in between because
  cap < 2^31, so P + 2d does not wrap once P passed.

### What warrants a second pair of eyes
- `coalesce`'s interval widening must match `planLocations`' (loops widen intervals of locals that occur before them).

### What should be done in the future
- See steps 4–6.

### Code review instructions
- `compiler/typed/rv32/passes/rows.js`, `coalesce.js`; `node --test tests/compiler/typed-rv32-candela-passes.test.mjs`.

### Technical details
- Literal groups need only the check of the largest index and load from b at 4 + 4k.

## Step 4: call-free homes, open inlining of record results, set-get forwarding

The third profile pattern: in a calling f32 function, fa1–fa7, ft8 and ft9 now home locals whose live interval
contains no call, at no save cost; a pending read of one is moved to the operand stack before a call sets up its
arguments. A callee with a record result and no early return inlines without its block, leaving its leaves on the
operand stack instead of storing them into result locals. `local.set x; local.get x` of a slot local reuses the
stored register.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** The design's "keep fields in registers across calls", refined by the profile.
**Inferred user intent:** see Step 1
**Commit (code):** e096e70 — "feat(rv32): call-free f32 homes, open inlining of record results, set-get forwarding"

### What I did
- `plan/saved-homes.js`: `CALL_FREE_HOMES`, `callFree` offsets; a local whose interval crosses a call cannot take or
  share a call-free register. `plan/locations.js` collects the calls (not those a return follows) and gives up when
  an emitter-inlined call is present. `emit/calls.js` and `emit/homes.js` `materializeAt(d)`.
- `passes/inline.js`: `inlineCandidate` records `returns`; `open` copies skip the block and the result stores.
- `emit/function-code.js`: the set-get forwarding in `LOCAL_SET`.
- Test: `pick()` calls `bump()` (a local array keeps it a call) and `spread()` with eight f32 arguments.

### Why
- More fs registers would cost a save and a restore per call: lowering `SAVED_MARGIN` (a run with
  `globalThis.Q_MARGIN`) gave no measurable gain and was reverted.

### What worked
- B-01/R-01/V-02, 8 rows: 9,248/16,664/26,333 → 8,641/15,369/24,560. IDENTICAL 84 of 84; Wasm and RV32 agree on six
  scenes' sampled rows; 92/92 tests.
- Mutation: removing the materialization before a call fails the `pick()` test once `spread()` fills fa0–fa7.

### What didn't work
- The first `pick()` test passed with the materialization removed: no call there wrote a register a pending read
  held. Adding `k + spread(...)` (eight f32 arguments) made it fail as it should.

### What I learned
- Calls followed at once by `return` need not end a call-free interval: nothing reads the local after them.

### What was tricky to build
- Record results land in fa0–fa7: a local homed in fa3 born right after a call is fine because the interval starts
  after the call, but the call's own result moves must come first (step 5 keeps that order).

### What warrants a second pair of eyes
- `guarded` (an emitter-inlined call) disables call-free homes for the whole function; the math library expansions
  may use fa registers.

### What should be done in the future
- f32 constants (lui + addi + fmv.w.x, about 560 instructions per sample on B-01) could live in call-free homes too.

### Code review instructions
- `compiler/typed/rv32/plan/saved-homes.js` (`planSavedHomes`), `emit/calls.js` (`call`).

### Technical details
- Call-free registers: fa1–fa7 (43–49) and ft8, ft9 (60, 61).

## Step 5: record-result leaves go straight to their locals

After a call with a record result, the `local.set` operations that follow take their leaves directly from the result
registers and stack words. Before, a stack leaf took four memory operations: a load from the outgoing area, a spill to
its operand slot, a reload and the local's store.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** tracePath's profile (flw/fsw pairs between offsets 1496 and 1564 of its frame).
**Inferred user intent:** see Step 1
**Commit (code):** 0cb1e3e — "feat(rv32): record-result leaves go straight to the locals that store them"

### What I did
- `emit/calls.js`: the run of fused leaves stops at a `local.set` the plan treats specially (forward, skips, pointer
  writes) or at a local homed in a result register still to be read.

### Why
- tracePath and finishHit receive records of more than eight f32 leaves (hits, materials) once per bounce.

### What worked
- B-01/R-01/V-02, 8 rows: 8,641/15,369/24,560 → 8,451/15,073/24,011. IDENTICAL 84 of 84; six scenes agree; 92/92.
- Mutations: a wrong stack offset fails one record-result test, a wrong leaf register four.

### What didn't work
- No failures observed.

### What I learned
- The existing record-result tests (PICOCALC-TYPED-VALUES) already cover stack-passed leaves under kernel.

### What was tricky to build
- Ordering: leaves not fused are pushed first (to operand registers), then the fused ones are written top-down.

### What warrants a second pair of eyes
- The `pending` set: a fused leaf's local may not be homed in the register of a lower leaf not yet read.

### What should be done in the future
- N/A.

### Code review instructions
- `compiler/typed/rv32/emit/calls.js` (`call`, the `fused` loop).

### Technical details
- Applies only with `plan.direct` (kernel) in f32 functions.

## Step 6: rows by affine index and buffer field; dead index stores

The profile after step 5 still had 296 instructions per sample of capacity checks alone on B-01 (148 checks). xfP
reads `oRow(q_k, i, 1..3)`: three index locals, each `(i·6 + k)·4`, and three loads of `q_k.bO`, so step 3's groups
(keyed by buffer local and index local) split into three. `rows` now follows i32 values as affine forms a·X + c and
buffers by the record field they came from, and removes the stores the grouped reads no longer need.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** The largest remaining profile item that a compiler change can remove exactly.
**Inferred user intent:** see Step 1
**Commit (code):** 6b1f2e3 — "feat(rv32): rows groups reads by affine index and buffer field, and drops dead index stores"

### What I did
- `passes/rows.js`: `findGroups` (abstract stack of `{form, field, local, start}` within a stretch; `written(L)` ends
  forms, fields and groups that depend on L), `combine` (+, −, × and << by literals, modulo 2^32), `deadStores`
  (a local nothing reads loses every store of a pure value, repeated), `balanced`.
- Tests: `affine` (two index locals, one root; a shift), `rebased` (an index local rewritten between reads), `moved`
  (a root written between two groups).

### Why
- The forms are computed with the reads' own ring operations modulo 2^32, so the group's P equals each read's checked
  unit: the rewrite stays exact without range facts.

### What worked
- B-01/R-01/V-02, 8 rows: 8,451/15,073/24,011 → 8,041/13,705/22,183; B-01 capacity-check instructions 296 → 174 and
  `mul` 94 → 66 per sample. IDENTICAL 84 of 84; Wasm and RV32 agree on eight scenes' sampled rows; 92/92.
- Mutations: removing `written()` on a set, or shifting the constant by one more bit, fails the tests.

### What didn't work
- The first version of the tests did not catch the shift mutation (no `<<` in an index); `affine` now uses one.

### What I learned
- Generated code repeats the same field load and index product in every inlined copy; a stretch-local value
  numbering of index expressions was enough for Candela.

### What was tricky to build
- An index expression must contain only form operations between its start and the read (checked by `only()`), so
  the header inserted at its start sees the same root and buffer values as the read.

### What warrants a second pair of eyes
- `deadStores` removes `value; local.set L` only when every operation in the value is pure and the value is
  `balanced`; locals read by `text.checked_address`, `text.unchecked_address` and `text.literal_stores` count as read.

### What should be done in the future
- A general common-subexpression pass for f32 functions (field loads, index products) outside row reads.

### Code review instructions
- `compiler/typed/rv32/passes/rows.js`; `node --test tests/compiler/typed-rv32-candela-passes.test.mjs`.

### Technical details
- Group key: buffer identity (`f<q>:<off>` or `l<r>`), root X and coefficient a; offsets c within 500 of each other.

## Step 7: Final host measurements, Candela checks and gates

With the compiler at 6b1f2e3, I ran the host counts on all 18 scenes, the three Candela checks and the gates. The
board study was not run: the coordinator had paused it until the PicoCalc is power-cycled, and no resume came during
the session.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Measure before/after on the host, keep the Candela checks, pass the gates, and leave the
board work as the remaining task.
**Inferred user intent:** see Step 1
**Commit (code):** none (docs commit follows)

### What I did
- `node scripts/01-count.mjs --rows 16 --top 3 --json /tmp/candela-kernel-codegen/counts-final.json <18 ids>`;
  base (`--repo` a `git archive` of the base commit) and step-1 counts were taken the same way.
- `python3 -I scripts/12-table.py base=... step1=... final=...` for the table below.
- `node scripts/06-compare.mjs /tmp/candela-kernel-codegen/cppref 4 --rv32 all --json ...` in four parallel groups;
  `--rv32 rows:16` for R-08, X-03, R-04 and G-03.
- `python3 -I scripts/07-typed-ref.py /tmp/candela-kernel-codegen/typedref 4 /tmp/candela-kernel-codegen/typed-4-passes.jsonl`.
- `GOWORK=/tmp/candela-kernel-codegen/go.work make test`; `make test-host`; `make test-host OPTIONS='{"policy":"kernel"}'`.
- `node scripts/10-stack.mjs`.

### Why
- The host counts are the before/after measure the ticket asked for on the host; the board study measures cycles.

### What worked
- Host instructions per sample (16 rows of frame 0):

| Scene | C++ | base | ratio | step1 | ratio | final | ratio |
|---|---|---|---|---|---|---|---|
| B-01 | 5,743.6 | 10,278.9 | 1.790 | 11,463.5 | 1.996 | 8,193.0 | 1.426 |
| R-01 | 11,061.5 | 22,000.0 | 1.989 | 23,327.6 | 2.109 | 14,966.8 | 1.353 |
| L-03 | 4,567.3 | 8,036.0 | 1.759 | 9,045.8 | 1.981 | 6,666.4 | 1.460 |
| G-01 | 9,785.6 | 18,041.5 | 1.844 | 19,173.8 | 1.959 | 12,883.7 | 1.317 |
| E-02 | 5,517.2 | 7,981.8 | 1.447 | 8,730.9 | 1.582 | 5,696.7 | 1.033 |
| W-02 | 16,004.6 | 29,264.3 | 1.828 | 31,406.9 | 1.962 | 21,025.3 | 1.314 |
| F-01 | 6,795.6 | 12,779.0 | 1.880 | 14,065.1 | 2.070 | 9,898.1 | 1.457 |
| V-02 | 14,333.6 | 29,804.9 | 2.079 | 32,071.8 | 2.238 | 21,566.8 | 1.505 |
| G-02 | 18,686.9 | 21,316.6 | 1.141 | 22,625.3 | 1.211 | 17,373.8 | 0.930 |
| X-04 | 40,442.0 | 21,081.5 | 0.521 | 24,670.0 | 0.610 | 21,058.2 | 0.521 |
| S-02 | 25,566.9 | 32,833.9 | 1.284 | 35,402.8 | 1.385 | 25,521.9 | 0.998 |
| R-05 | 17,583.4 | 29,208.5 | 1.661 | 30,870.6 | 1.756 | 21,046.1 | 1.197 |
| V-03 | 53,164.7 | 61,661.3 | 1.160 | 57,389.8 | 1.079 | 52,244.2 | 0.983 |
| V-04 | 100,950.1 | 107,801.6 | 1.068 | 99,533.9 | 0.986 | 91,938.6 | 0.911 |
| R-08 | 122,808.0 | 66,684.4 | 0.543 | 66,402.8 | 0.541 | 60,133.8 | 0.490 |
| X-03 | 396,477.5 | 330,167.6 | 0.833 | 317,839.9 | 0.802 | 305,382.9 | 0.770 |
| R-04 | 650,101.2 | 675,580.3 | 1.039 | 610,945.6 | 0.940 | 584,574.5 | 0.899 |
| G-03 | 791,855.0 | 878,537.1 | 1.109 | 774,943.5 | 0.979 | 746,977.3 | 0.943 |
| geometric mean, 18 scenes | | | 1.290 | | 1.334 | | 1.034 |
| geometric mean, kernel-bound | | | 1.885 | | 2.054 | | 1.410 |

- Candela checks on the final compiler: E_rel within 0.02 on every scene (B-01 7.849e-8, V-02 8.204e-10, R-04 4.317e-4,
  G-03 2.039e-4, X-03 0); Wasm vs RV32: 14 scenes bit-identical over every pixel
  output of four passes (frame-0 and accumulation digests equal, 0 floats differ); R-08, X-03, R-04 and G-03 agree on
  16 rows of frame 0 (0 floats differ). Largest E_rel 4.317e-4 (R-04).
- Typed reference digests through the renderer core (newlib replay in the counting interpreter): the regenerated
  `typed-4-passes.jsonl` is byte-identical to `bench/reference/candela-gallery/typed-4-passes.jsonl`, as expected:
  the generated program's pixel outputs did not change, and the reference is built from its WebAssembly output.
- `make test`: exit 0. `make test-host`: ray 4,888,369 instructions, output 430f0d501659; Chess oracle 6,981 words;
  25/25 replays. With `{"policy":"kernel"}`: ray 3,239,635 instructions, 11,544 B (unchanged: the ray tracer's
  functions have no row groups or record results), 430f0d501659; Chess 6,981 words; 25/25.
- Deepest stack: `cdlRenderSpan` 6,288 bytes (step 1 8,752; base 9,120), under the 24 KB gallery worker stack.
  Largest frames: sampleLobe 1,760, tracePath 1,712.

### What didn't work
- The first `make test-host` ran while `make test` was building the host binary in the same tree:
  `undefined reference to 'wasm_loader_load'` ... `make: *** [Makefile:64: test-host] Error 2`. A build race, not a
  code failure; run alone afterwards, it passed.
- `--rv32 all` on R-04, G-03 and X-03 would take hours on the reference interpreter (60,000 to 750,000 instructions
  per sample, 25,600 samples each at 80×80 over four passes); those four large scenes were compared on 16 rows of frame 0 instead.

### What I learned
- The host ratio understates the device's: the base build's host geometric mean is 1.29 where the device measured
  1.76, and the kernel-bound scenes 1.89 where the device measured 2.49–2.79. The device result has to come from the
  board.

### What was tricky to build
- N/A.

### What warrants a second pair of eyes
- Whether the host improvement carries to the device in proportion: the removed instructions are mostly frame loads
  and stores, moves and integer address arithmetic, which cost more than average on the device (PSRAM-backed frames).

### What should be done in the future
- The paired board study (design step 4), then the next profile items: f32 constants (about 560 instructions per
  sample on B-01), callee-saved saves and restores (about 510), and the frame traffic left in tracePath, neeAt and
  cameraRay.

### Code review instructions
- `python3 -I scripts/12-table.py base=/tmp/candela-kernel-codegen/counts-base.json step1=/tmp/candela-kernel-codegen/counts-step1.json final=/tmp/candela-kernel-codegen/counts-final.json`.

### Technical details
- Final kernel image 434,996 bytes (step 1 542,920; base 402,680), 332 functions.
