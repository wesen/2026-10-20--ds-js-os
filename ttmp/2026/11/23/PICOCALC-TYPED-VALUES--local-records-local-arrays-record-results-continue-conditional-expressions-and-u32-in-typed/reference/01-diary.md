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
