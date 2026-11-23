---
Title: Diary
Ticket: PICOCALC-TYPED-VALUES
Status: active
Topics:
    - compiler
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Chronological implementation diary of PICOCALC-TYPED-VALUES: continue, ?:, u32, stack parameters, value records, record results and local arrays in Typed, on WebAssembly and RV32."
LastUpdated: 2026-11-23T12:56:25.305072493-05:00
WhatFor: "What was built, in which order, with which gates and failures."
WhenToUse: "Reviewing or resuming PICOCALC-TYPED-VALUES."
---

# Diary

## Step 1: Reading the ticket, the program and the compiler

The ticket adds seven language features to Typed and both of its targets. Before writing code I read the program's
rules, this ticket's design, the compiler guide and the front end, the Wasm backend and the RV32 backend, to check the
design against the code and to find where each feature lands. This step records the prompt and what the reading found;
the decisions go into the design doc's Refinements as each feature lands.

### Prompt Context
**User prompt (verbatim):** (the coordinator's task; the ticket line) "TICKET: PICOCALC-TYPED-VALUES — add to the Typed language and both targets (WebAssembly and RV32): `continue`, the conditional expression `c ? a : b`, a `u32` type, more than 8 parameters per register class (stack parameters, ilp32f), value records (local records scalar-replaced into per-field locals, passed as fields), record results (multiple results), and fixed-size local arrays — so Candela's generator (a later ticket) can drop its memory-heavy workarounds."
**Assistant interpretation:** Implement the seven features in the order continue, ?:, u32 → stack parameters → value records + record results → local arrays, each with differential tests (Wasm vs RV32 vs a JS model) under all five policies, the 84-digest identity harness, `make test`, both host-gate policies, the device lexical index, and one device check of a playable build from the branch, restored afterwards from the main checkout.
**Inferred user intent:** Give PICOCALC-CANDELA-KERNEL-CODEGEN the language it needs to generate Candela's kernel without frame records, result fields and buffer arrays, so that the kernel's values can live in registers.
**Commit (code):** none yet.

### What I did
- `git merge --ff-only main` (main at 6e9c08c).
- Read AGENTS.md, the Typed-next program design ("Rules every ticket follows"), this ticket's design, `docs/typed-compiler.md`,
  `compiler/typed/tape.js`, `frontend/{lexer,declarations,expressions,floats,statements,compile,inspect}.js`,
  `wasm/{encode,module,link}.js`, `typed-world.js`, `rv32/{compile,policy,link}.js`, `rv32/encoding/{registers,tape,selection}.js`,
  `rv32/emit/*.js`, `rv32/plan/{locations,saved-homes}.js`.
- Created this diary: `docmgr doc add --ticket PICOCALC-TYPED-VALUES --doc-type reference --title "Diary"`.

### Why
- The design asks to decide the details after reading the front end and the RV32 planner; several decisions (the spelling
  of value records, the record-result ABI) depend on what the tape and the emitter can already express.

### What worked
- The RV32 emitter already lowers value blocks of type `i32` and `f32` (`begin` in `emit/branches.js`; `&&`, `||` and
  `Math.min` write `if (result i32)`), so `?:` needs no new tape operation.
- Loops are `block; loop; C; eqz; br_if 1; B; [update]; br 0; end; end`: `break` is `br` to the outer block. `continue`
  needs the update to run, which it does not today if it branched to the `loop` label (the update is emitted at the
  end of the body, before `br 0`).

### What didn't work
- No failures in this step.

### What I learned
- Every function ends with a final `return` statement (`FunctionEmitter.function` reads statements until `return`).
- The front end hands each function to the backend before parsing the next (streaming); locals are numbered parameters
  first, then declared locals and temporaries in `nextLocal` order; `fn.localTypes` exists only when a frame local is f32.
- `argumentRegisters` throws "RV32 supports up to eight register arguments" beyond eight per class.

### What was tricky to build
- N/A (reading).

### What warrants a second pair of eyes
- N/A.

### What should be done in the future
- N/A.

### Code review instructions
- N/A.

### Technical details
- Five policies: `interactive`, `balanced`, `default`, `kernel`, `stock` (`rv32/policy.js`).

## Step 2: continue, the conditional expression and u32

The three small features landed together. `continue` needed one real decision: a `br` to the loop label is wrong once
`rotate` moves the condition to the bottom, so a body that continues is wrapped in a block and `continue` leaves it.
The streaming front end decides before parsing the body by scanning its text. `?:` reuses the `if (result T)` form
that `&&` and `||` already write, so neither backend nor any pass changed for it. `u32` added five Wasm opcodes and
one pseudo-op, and selection, the arithmetic emitter and three passes learned them.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Order item 1: continue, `?:`, u32, each on both targets with differential tests.
**Inferred user intent:** As Step 1.
**Commit (code):** 83dadd8 — "feat(typed): continue, the conditional expression and u32 on both targets"

### What I did
- Base digests: copied PICOCALC-TYPED-PIPELINE's harness to `scripts/01-digests.mjs`, `02-compare-digests.sh`,
  `units.mjs` (Files and Agenda as their app.json lists), `git archive -o $S/base.tar HEAD compiler/typed`.
- `tape.js`: rows 0x49, 0x4b, 0x4d, 0x6e, 0x70, 0xb3 and pseudo-op 0xf7 `f32.to_u32`.
- Front end: `lexer.js` (`?` token; `continue`, `u32` reserved; `u32` a type), `expressions.js` (`U32_LITERAL`,
  `UNSIGNED`, `LITERAL_OPERATORS`, `want`, `~`, `i32()`, `f32()`, `u32()`, the binary operators), `floats.js`
  (`Math.min`/`max` on u32), `statements.js` (`bodyContinues`, the continue block, `continue`), new `values.js` (`choice`,
  `unify`). `wasm/encode.js` (`pushTruncateUnsigned`), `wasm/link.js` (`invoke` on u32).
- RV32: `encoding/selection.js` (ALU `divu`/`remu`, predicates `bltu`/`bgeu`, `sltiu`, power-of-two `srli`/`andi`),
  `emit/arithmetic.js`, `emit/floats.js` (`fcvt.s.wu`, `fcvt.wu.s`), `emit/leaf-code.js`, `passes/value-sets.js`,
  `passes/hoist.js` (`dividing`), `analysis/ranges.js`.
- `typed_lex_index.c` learns `?`. `scripts/03-qjs-lex-index.c` and `04-check-lex-index.js` (from TYPED-BITWISE, new
  sources, and a failure when the index declines a source).
- `tests/compiler/typed-values.test.mjs`; `typed-tape.test.mjs` and `typed-rv32-encoding.test.mjs` expectations.

### Why
- See the design doc's Refinements: continue, conditional, u32.

### What worked
- Smoke run (`scratchpad/smoke1.mjs`): Wasm and five policies agree, e.g. `udiv(0xffffffff, 2)` 2147483650,
  `back(NaN)` 0xffffffff.
- Index check: branch `AGREE 7 of 7`; main's C file `INDEX DECLINED values`, `INDEX DECLINED valuesAdjacent`,
  `2 FAILURES` (it declines a source with `?`: correct tokens through the regexp, but the device pays the regexp).
- `node --test tests/compiler/*.test.mjs`: 76 pass. Digests `IDENTICAL 84 of 84`.
- `GOWORK=/tmp/typed-values/go.work make test`: exit 0 (`file length: 922 source files, 95 over 500 lines, all listed`).
- `make test-host`: `default: 4,888,369 instructions, 11964 B image, output 430f0d501659 (reference)`,
  `6981 words match; engine 128,152,624 instructions, 21716 B`, `25/25 workflows passed`. Kernel:
  `custom: 3,239,635 instructions, 11544 B image, output 430f0d501659`, `6981 words match; engine 118,361,847
  instructions, 19892 B`, `25/25 workflows passed`. (Run on the bundles before `values.js` was split out of
  `expressions.js`; the split moves two methods and the digest harness was identical after it.)

### What didn't work
- The worktree sandbox refused compound shell commands (`python3 - <<'EOF' ... EOF` edits, `git archive | tar`):
  "this command is too complex to verify that it stays inside the worktree". Edits went through
  `scratchpad/edit.py SPEC.py` (exact replacements, each asserted to occur once).
- The PIPELINE digest harness failed on main: `SyntaxError: 71:47: unknown type WorldState` (its `files` unit is one
  file of what is now a five-file world); fixed in the copy.
- First test run: `Error [RuntimeError]: unreachable` (the differential helper did not copy the memory into Wasm);
  `97:10: expected identifier` (a generated function named `u32`, now reserved); `23:81: expected u32, got i32`
  (`(5) - (3)` was an i32: literal arithmetic now stays a literal under `+ - * & | ^ << >>>`); `32:110: expected i32,
  got bool` (the generator's comparison operands needed parentheses); `218:251: expected i32, got u32` (`(~(25)) /
  (~(7) | 1)`: a literal divided by a literal is signed by design; the generator wraps dividends in `u32(...)`).
- First `make test`: `compiler/typed/frontend/expressions.js: 521 lines, over 500` -> `frontend/values.js`.

### What I learned
- An index that does not know a character declines the whole source (`nativeIndex(source) === null`) rather than
  mis-tokenizing it, so a missing token in `typed_lex_index.c` costs boot time, not correctness; the check now fails
  on a declined source.

### What was tricky to build
- `continue` and `rotate`: rotated loops are `loop; B; C; br_if 0`, so any `br` to the loop label from B skips C. The
  continue block keeps every branch the front end writes forward.

### What warrants a second pair of eyes
- The literal-typing rule (`1 << 5` fits a u32, `7 / 2` of literals is an i32) and `>>` being an error on u32.

### What should be done in the future
- `continue` in an async function's own body parser (`async/body.js`).

### Code review instructions
- `git show 83dadd8 -- compiler/typed/frontend compiler/typed/rv32 compiler/typed/wasm compiler/typed/tape.js`.
- `node --test tests/compiler/typed-values.test.mjs`; the index check in the header of `scripts/03-qjs-lex-index.c`.

### Technical details
- Code shapes (`default`): `a < b` on u32 is `sltu`; `if (a > b)` fuses to `bltu b, a`; `a < 100` is `sltiu`;
  `a / 8 + a % 16` is `srli 3`, `andi 15`, no divide.

## Step 3: More than eight parameters per register class

ilp32f exactly: an f32 beyond `fa7` takes the next integer register and anything without a register takes the next
stack word. The caller reserves an area at the bottom of its frame and the callee copies its stack words from the
caller's sp, computed by a prologue word patched once the frame size is known.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Order item 2: stack parameters, which value-record parameters make common.
**Inferred user intent:** As Step 1.
**Commit (code):** 57d70b9 — "feat(rv32): more than eight parameters per class, ilp32f's stack words"

### What I did
- `encoding/registers.js` (`argumentRegisters`, `inOwnRegister`), `emit/calls.js` (`call`, `outgoingWords`,
  `callerStack`), `emit/function-code.js` (`lower`: the area, `slotBase`, large-frame offsets, the stack-parameter copy,
  `patchCallerStacks`), `plan/saved-homes.js` (`keeps`), `plan/locations.js` (capacity and pointer homes).
- `tests/compiler/typed-values-calls.test.mjs`: 12 i32; 18 f32 and an i32; 20 of each interleaved; nested calls among
  arguments; a 480-local caller and a 480-local callee (large frames); stores at `sp + 0, 4, 8` (`fsw`, `fsw`, `sw`).
- Tests split for the 500-line limit: `values-helpers.mjs` (realm, `differential`), part one and part two.

### Why
- See the Refinements: more than eight parameters per class.

### What worked
- Differential test, all policies; `IDENTICAL 84 of 84`; `node --test tests/compiler/*.test.mjs` 77 pass;
  `make test` exit 0; host gates default and kernel as in Step 2 (same numbers, 25/25 each).

### What didn't work
- The stack-store shape check first looked for `sw` only: `sw to 0(sp): 108,16,92,8` (f16 and f17 are `fsw`).
- `typed-rv32-registers.test.mjs` expected `argumentRegisters` to throw beyond eight and compared arrays without the
  new `.stack` property (`+ stack: 0`); updated.
- `make test`: `tests/compiler/typed-values.test.mjs: 551 lines, over 500` -> split.
- While the host gates ran on the feature-1 bundles I had already edited five rv32 modules for this step; I saved
  them to the scratchpad, restored them from HEAD for the feature-1 commit, and copied them back after it, so that
  no gate ran on bundles rebuilt mid-run.

### What I learned
- `make test-generated` compares the bundles with their modules: editing a module while a gate run is in flight fails
  that run, so module edits wait for the run or go elsewhere.

### What was tricky to build
- The frame size is known only after the body; the callee's stack parameters are copied in the prologue. Computing
  the caller's sp into t5 with one patched word (`addi t5, sp, frame`; `addi t5, s0, frame - 2032` in a large frame)
  avoids patching every access.

### What warrants a second pair of eyes
- Large frames with an outgoing area: `ra`, `s0` and saved registers at `4 * outgoing + ...`.

### What should be done in the future
- N/A.

### Code review instructions
- `git show 57d70b9 -- compiler/typed/rv32`; `node --test tests/compiler/typed-values-calls.test.mjs`.

### Technical details
- `argumentRegisters([...9 i32, f32, ...9 f32, i32])` = `[a0..a7, -1, fa0..fa7, -2, -3, -4]`, `.stack` 4.

## Step 4: Value records and record results

A value record is replaced by scalars in the front end as it parses, and a record result is several results on the
tape (WebAssembly multi-value); RV32 returns the leaves the way arguments arrive. With both in place a `Vec3` lives in
three f32 registers across calls, and the inline pass inlines a callee with a record result.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Order item 4 and 5 together: value records (spelling, constructors, locals, fields,
parameters) and record results, both targets, with the inline pass taught about several results.
**Inferred user intent:** As Step 1; the generator's frame records and result fields become values.
**Commit (code):** 4a859bd — "feat(typed): value records and record results on both targets"

### What I did
- Front end: `parseValueRecord` and the `values` map in `frontend/declarations.js` (`value record Name {...}`; layout:
  fields with leaf offset and width, leaves, paths); `scanSignatures` flattens value parameters (`fn.params`,
  `fn.paramNames` "v.x", `fn.sourceParams`/`fn.sourceNames`) and sets `fn.results`; `lex.type` takes the values map;
  `frontend/values.js` holds `construct`, `valueRead`, `stackField`, `valueChoice`, `valueLocals`, `pushLeaves`,
  `setLeaves`, `drop`; `statements.js` declares, assigns (`valueAssignment`), drops results by width and binds value
  parameters; `async/scan.js` passes the map.
- Wasm: `signature` writes `(result ...leaves)`; `publicSignature` publishes `results`.
- RV32: `resultLocations`, `calleeResults`, `stackWords` (registers.js); `call` pushes each leaf, loading stack leaves
  from `sp + 4k`; `returnValue` (materialize, then moves, stack leaves through `addi t6, sp|s0, frame`); a frameless
  leaf with stack leaves is declined; `floating` and `floatingFunction` count f32 leaves; `arity.results` in
  inline, commute, hoist (both stacks), ranges and value-sets; the inline pass inlines record-result callees through
  result locals after the callee's own and stops substituting an earlier copy's result reads once a later copy of the
  same callee overwrites them.
- Moved `u32(x)` into `values.js` (`unsignedConversion`): expressions.js had reached 501 lines.
- Tests (typed-values-calls.test.mjs): vector math (add, cross, reflect, normalize, a loop with continue and a
  conditional), 40 random cases per function against a JS model with `Math.fround` per operation; an item record with a
  record reference, an enum, a bool and a u32 field, dropped results and a store through a field, comparing memory
  after each run; a 23-leaf `Hit` like Candela's (9 stack result words, 46 parameters); RV32 shape of `add` and of the
  inlined loop; 14 language-rule errors. `differential` now compares lists of leaves and the memory each run leaves.
- `scripts/05-gallery-digest.mjs`: the Candela gallery's image under three policies, base against tree.

### Why
- See the Refinements: value records and record results.

### What worked
- `node --test tests/compiler/*.test.mjs`: 82 pass. `IDENTICAL 84 of 84`. Gallery: interactive 5720fb56a2c3987e
  199484 B, default ca5e38132482c4d4 402800 B, kernel 7ff1479de429fa8d 402680 B, all IDENTICAL. `make test` exit 0.
  `make test-host`: ray 4,888,369 instructions, 11964 B, 430f0d501659; Chess 6981 words, 128,152,624, 21716 B; 25/25.
  Kernel: 3,239,635, 11544 B, 430f0d501659; 118,361,847, 19892 B; 25/25.
- A vector loop (100 iterations of `acc = add(acc, cross(p, Vec3(1.0, f32(i), 0.5)))`) against the generator's
  workaround (vectors in caller-provided memory records): default 3,020 instructions and 280 B against 5,124 and 508 B;
  stock 10,436 against 13,849.

### What didn't work
- My first model of the item test was wrong, not the compiler: `Wasm use(16, -3)`, `1606 !== 1608` (the third `bump`
  runs after the return expression read the cell).
- The `add` shape check expected four words; it is seven: three `fadd.s` into the operand stack, three `fmv.s` into
  fa0-fa2, `ret`.
- `make test`: `compiler/typed/frontend/expressions.js: 501 lines, over 500` -> `unsignedConversion` moved.

### What I learned
- Without materializing first, `return Vec3(b.x, a.x, ...)` in a leaf could overwrite `fa0` (a's x) with b's x before
  reading it; `returnValue` moves pending direct reads to the operand stack before any leaf move.

### What was tricky to build
- The inline pass shares one local range per callee among all its inlined copies: a copy's result reads are plain
  `local.get r_i` operands that a later inlined call may substitute for a parameter, which is wrong once a later copy of
  the same callee has overwritten `r_i`. The pass now marks those operands opaque at each copy's end.

### What warrants a second pair of eyes
- `inline.js` (result locals, the invalidation), `calls.js` `returnValue`.

### What should be done in the future
- Value records and arrays inside async functions (the async lowering's own parser) are not handled.

### Code review instructions
- `git show 4a859bd`; `node --test tests/compiler/typed-values-calls.test.mjs`.

### Technical details
- `resultLocations(["f32"×17, "i32"×6])`: fa0-fa7, then stack words 0-8 for the other nine f32, a0-a5 for the integers.

## Step 5: Local arrays

`new Int32Array(n)`, `new Uint32Array(n)` and `new Float32Array(n)` as locals: zeroed at the declaration, indexed with
an unsigned check written with existing tape rows, in the RV32 frame and in a static Wasm area.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Order item 7: fixed-size local arrays with checked indexing and an unchecked form.
**Inferred user intent:** As Step 1; Candela's `var stack: array<i32, 48>` without a buffer and bit conversions.
**Commit (code):** f0bdcfd — "feat(typed): local arrays on both targets"

### What I did
- Tape: `array.address offset` (0xf8, pushes an address) and `array.zero offset bytes` (0xf9, STORES).
- Front end: `frontend/arrays.js` (`arrayDeclaration`, `arrayElement`, `arrayRead`, `arrayAssignment`); `new` reserved,
  `[` and `]` tokens; `fn.arrayBytes`.
- Wasm: `pushArray` (`i32.const` of the static address; `memory.fill`); `compileWasmFunctions` gives each function an
  area below the previous one from the top of memory; `linkWorld` refuses arrays.
- RV32: the area between the stack-argument area and the slots (`arrayBase`, `slotBase`; large frames above ra, s0 and
  the saved registers); `frameAddress`, `zeroFrame` (sw zero up to 16 words, else `sw; addi; bne`); passes learn the
  rows; inline keeps calls to functions with arrays.
- P4 lexical index: `[]` in its single-character operators. `scripts/04-check-lex-index.js` adds value-record, array
  and adjacent-bracket sources.
- Tests (typed-values-arrays.test.mjs): a sieve, a DFS stack of 48 (like a BVH traversal), an f32 ring, an insertion
  sort of u32, against JS models; frames with stack arguments, a callee with arrays, a declaration in a loop, a
  40-word zeroing loop and a 300-word array in a large frame; traps on both targets; 14 language errors; RV32 shapes.

### Why
- See the Refinements: local arrays.

### What worked
- `node --test`: 86 pass; `IDENTICAL 84 of 84`; gallery IDENTICAL; `make test` exit 0; both host gates as in Step 4.
- `/tmp/typed-values/qjs-lex-index ... 04-check-lex-index.js`: `AGREE 10 of 10` (index used on every source).
  Negative control, the index of HEAD before this step: `INDEX DECLINED arrays`, `INDEX DECLINED arraysAdjacent`,
  `2 FAILURES`.
- A DFS over 2000 nodes: default 41,153 instructions with an Int32Array, 37,011 with a UTF-16 buffer (the buffer
  path's capacity and pointer homes are older and better tuned; an array access is `addi; slli; add; lw` plus
  `bltu; ebreak`).

### What didn't work
- `typed-tape.test.mjs`: the STORES list and the "every row is used by an app" list needed the two rows.
- `a[-1]` is not a literal on the tape (unary minus), so it is a run-time trap, not a compile error; the test now
  uses `a[0x7fffffff]` for the compile-time error.

### What I learned
- Typed's call graph is acyclic, so a function is never active twice: a static area per function is exact for Wasm.

### What was tricky to build
- Spill slots sit above the locals and their depth is known only after the body, so the array area goes below the
  slots, where its size is known before the prologue.

### What warrants a second pair of eyes
- `function-code.js` `lower()` with both an outgoing area and arrays, in the small and the large form.

### What should be done in the future
- Fold the area offset into the load or store (`slli; add sp; lw off`), one instruction less per access.
- `storeless` and `fields` treat a store into the function's own array as a store anyone may see.

### Code review instructions
- `git show f0bdcfd`; `node --test tests/compiler/typed-values-arrays.test.mjs`.

## Step 6: Counted loops remove their counter's array checks

The design asks for an unchecked form after range analysis proves the index. The front end proves the one shape that
matters, a counted loop's counter, and cuts the checks out when the body ends.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** The unchecked form beyond literal indices.
**Inferred user intent:** As Step 1; `for (k = 0; k < a.length; k++) a[k]` costs no check.
**Commit (code):** 6a64515 — "feat(typed): a counted loop's counter indexes an array without a check"

### What I did
- `countedRange` (header shape), `proveChecks` (scan the body for `local.set k`, remove recorded checks, move later
  positions) in arrays.js; `loop()` records the header's positions and the body's start.
- Test: a proven loop (no check left but the one of `a[k + 1]`), a written counter, a bound above the length, a negative
  start and a negative step (checks kept, traps on both targets), and an RV32 inspection compile with the same image.

### What worked
- `node --test`: 87 pass; `IDENTICAL 84 of 84`; gallery IDENTICAL; `make test` exit 0; both host gates as in Step 4.

### What didn't work
- The first `written(0)` case never terminated (`k = k * 0` keeps k at 0), and the run went on for minutes before I
  stopped it; the case is now `written(1)`.
- A Wasm inspection of the program failed: `unknown tape opcode 252 at 8`. The Wasm inspector decodes the body with the
  tape table, which has no 0xfc-prefixed operations; `function f(x: f32): i32 { return i32(x); }` fails the same way on
  this branch's base, so it predates the ticket. The test inspects through RV32 instead.

### What I learned
- `analysis/ranges.js` cannot prove this: its intervals are per local over the whole function, so a counter's interval
  includes its exit value.

### What was tricky to build
- Nested loops: an inner loop's removal moves the positions of checks the outer loop recorded inside the inner body;
  all recorded checks live in one list and every removal moves the later ones.

### What warrants a second pair of eyes
- The soundness conditions in `countedRange` (signed: start and step not negative, bound and step at most 2^30).

### Code review instructions
- `node --test tests/compiler/typed-values-arrays.test.mjs`.

## Step 7: Compile time on the host, main merged, the firmware built; the board paused

Before the device check: what the new front end costs programs that use none of the features, measured on the host
in V8 and in QuickJS with the P4's lexical index; main merged as the coordinator asked; the playable firmware built
from the branch. The coordinator paused all board work (the keyboard's I2C NACKing every transfer, ~13:10) until the
user power-cycles the PicoCalc, so the device check waits.

### Prompt Context
**User prompt (verbatim):** "Coordinator: the PicoCalc's keyboard I2C is NACKing every transfer (found ~13:10). Pause all board work until I tell you the user has power-cycled it; host work continues. main now has PICOCALC-BOARD-HARNESS merged (bench/board holds the keyboard bus before an install's reset; health reboots a long-up board and checks a 5 s bus window). Merge main before your device check."
**Assistant interpretation:** Host work only; merge main; prepare the device check without touching the board.
**Inferred user intent:** Keep the board free and the wedge undisturbed; be ready when it is back.
**Commit (code):** 71f1478 — "Merge branch 'main' into worktree-agent-a78b28ed420b7fd04"

### What I did
- `scripts/06-compile-time.mjs` (V8, two node:vm realms, base `git archive` of 6e9c08c against the tree, alternating
  order, median; a third argument runs an A/A check).
- The same on a host QuickJS with the P4's index (`/tmp/typed-values/qjs-lex-index`, the bundles, each world's source,
  best of 3 × 10 compiles), base and tree in turn, twice.
- `git merge --no-edit main` (c9f324c), message amended with the trailer.
- `make firmware PROFILE=playable BUILD=/tmp/typed-values-playable-71f1478`.

### Why
- The boot worlds compile on the device at boot within deadlines (Agenda 0.98 s of 1.7 s, Editor 3.35 s of 6 s, Chess
  3.76 s of 6 s, PICOCALC-COMPILE-BUDGET); a front end that every token passes through could move them.

### What worked
- QuickJS with the index (the device's setting), base → tree, ms per compile: agenda 47.5 → 49.0 / 47.6 → 51.0,
  editor 53.0 → 55.1 / 52.7 → 55.4, files 23.9 → 25.3 / 24.5 → 25.5, playable Chess 67.1 → 67.8 / 67.3 → 70.4:
  about +1 to +7 %, half of it in the front end (agenda's front end 17.1 → 18.1 ms). Scaled to the device's numbers,
  Chess 3.76 s would become about 3.9 s, 65 % of its deadline.
- V8: worlds +5 to +13 % (A/A check of the method: within ±1.5 % for the worlds, ±8 % for ray).
- The playable firmware builds from 71f1478: `playable 71f1478 dirty=true app e1f6ac703144aa61...` (dirty: this
  diary was not yet committed), `exit 0`. Not flashed: the board is paused.

### What didn't work
- Returning no `values` map when a program declares no value records (so every `values?.` test stops at once) changed
  nothing measurable (QuickJS agenda 49.7 / 51.4 ms); reverted.
- A V8 CPU profile of the front end spread the difference over `expr`, `statement`, `local` and `scanSignatures`
  without one hot spot.

### What I learned
- The overhead is many small tests (u32 and literal typing in the binary loop, value and array checks at each local,
  the result width of dropped calls), not one cost; on the device it needs the boot measurement.

### What was tricky to build
- N/A.

### What warrants a second pair of eyes
- The device's boot compile times, once the board is back.

### What should be done in the future
- The device check (task ooy6).

### Code review instructions
- `node scripts/06-compile-time.mjs BASE 61` and `node scripts/06-compile-time.mjs BASE 61 BASE` (A/A).
