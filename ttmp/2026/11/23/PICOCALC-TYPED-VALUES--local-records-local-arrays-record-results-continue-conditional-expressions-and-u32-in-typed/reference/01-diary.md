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
