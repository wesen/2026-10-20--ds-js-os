---
Title: Native interpretation, parameters and results in the compiler workbench
Ticket: PICOCALC-WORKBENCH-NATIVE
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Design of five workbench changes requested by PICOCALC-RAY-PARITY's field notes: a Go RV32 interpreter with the reference interpreter's exact semantics (I1), a per-cell args channel (I2), compiler.at(rev).world for Files and Agenda (I2b), a result store (I5) and per-block detail in stats.paired (I6), plus a proposal for exporting the compiler's opcode table (I3b)."
LastUpdated: 2026-11-21T22:40:00-05:00
WhatFor: "Reviewing or extending the trace-REPL workbench's interpreter, parameter, result and world interfaces."
WhenToUse: "Before changing pkg/tracerv32, the args channel, the result store or compiler.at(rev).world."
---

# Native interpretation, parameters and results in the compiler workbench

## 1. Purpose

PICOCALC-RAY-PARITY made the trace REPL (`cmd/trace-repl`) the place where Typed compiler candidates are compiled, interpreted, compared and scored. Its field notes (`reference/02-workbench-field-notes-the-trace-repl-as-the-center-of-compiler-optimization.md`, entries 1–5) list what stopped that work from staying inside the workbench. This ticket implements the first five items of the notes' "Improvements" list and proposes the sixth:

| Item | Problem in the field notes | Change |
|---|---|---|
| I1 | The RV32 reference interpreter, run by goja, takes about 12.6 s per opening frame. Node takes about 0.5 s. A four-arm sweep takes a minute (entry 3). | A Go interpreter with the reference interpreter's exact semantics, as the session global `rv32`. |
| I2 | Scripts receive parameters as globals prepended on stdin. A stale global from an earlier script was silently used and produced two wrong measurements (entry 5). | `trace-repl eval --arg NAME=JSON` and `--args-file`, delivered to each cell as a fresh `args` object and recorded with jobs. |
| I2b | `compiler.at(rev).world("files")` fails: only worlds with a `source.list` are assembled (entry 5). | Built-in layouts for the single-file Files world and the two-file Agenda world. |
| I5 | Results die with the session; every client redirects stdout and unwraps `{"ok", "value"}`. | `results.save(name, value)`, written with the session, the revision and the script digest, and readable later. |
| I6 | `stats.paired` was thought not to return per-block values (entry 1). | A documented `blocks` array and a `spread` summary. See Section 6: the values were already present as `perPair`. |
| I3b | `tape.js` restates the compiler's operand-cell table (entry 4). | A proposal only: changing `picocalc-os/compiler/` is out of scope here. |

The order is the order of value. I1 removes the largest cost, and I2 removes the most dangerous failure.

## 2. What exists today

The service, its packages and the W1–W7 changes are described in PICOCALC-TRACE-WORKBENCH's design guide. The parts this ticket touches:

- **`pkg/tracerepl/service.go`.** `Service.run(ctx, id, source, what, limit, started)` evaluates one cell or job on the session VM's owner goroutine. A cell's deadline interrupts the VM through `vm.Interrupt`. Per-session state lives in `rt.Values["cellIO"]` (console lines and the result serializer).
- **`pkg/tracerepl/jobs.go`, `http.go`.** `POST /sessions/{id}/eval {"source"}` and `POST /sessions/{id}/jobs {"source", "timeoutSeconds"}`. The decoder refuses unknown fields.
- **`pkg/traceapi/compiler.{go,js}`.** `compiler.at(rev)` evaluates the compiler files of one revision in an isolating scope and returns `{typedRv32, typedWorld, interp, rayBench, read, world, ray, …}`. `interp` is `picocalc-os/tools/rv32-interp.js` of that revision, and `rayBench` is `picocalc-os/tools/typed-ray-bench.js`, whose functions call the bare name `typedRv32Interp`.
- **`pkg/traceapi/stats.js`.** `stats.paired(rows, spec)` returns `{pairs, controlMedian, candidateMedian, medianPercentSaved, percentSavedOfMedians, wins, losses, ties, better, method, perPair}`.

## 3. I1: a native RV32 interpreter

### 3.1 The reference and its exact behaviour

`picocalc-os/tools/rv32-interp.js` (213 lines) is the reference. It stays the reference: the Go interpreter is correct exactly when it agrees with it. Its observable behaviour, read line by line:

**Setup.**
- `size = (memoryBytes.length + stackBytes + 15) & -16`, with `stackBytes = options.stackBytes ?? 65536`. The `&` is a 32-bit operation.
- Guest memory is a fresh `Uint8Array(size)` holding a copy of `memoryBytes`. The stack sits above the caller's bytes.
- `counts` is a `Uint32Array(image.byteLength >>> 2)`, or `null` when `options.counts === false`.
- Relocations become `Map(offset → index)`. A later entry with the same offset wins.
- Registers are an `Int32Array(32)`. Callee-saved registers (`x2 x3 x4 x8 x9 x18–x27`) start as `0x12340000 + reg`, then `x2 = size`, `x1 = -4` (`RETURN_TO_HOST`), then `x10 + i = args[i]`. A host frame `{pc: -4, saved}` records the callee-saved values after the arguments are placed.
- `program.entries[entry]` undefined throws a plain `Error("unknown RV32 entry " + entry)`, not a fault.

**The loop**, while `at !== -4`:
1. `++steps > limit` faults with `"instruction limit " + limit + " reached"` (`limit = options.limit ?? 50e6`).
2. `at < 0 || at >= image.byteLength || at & 3` faults with `"instruction address outside program"`.
3. The word is read and `counts[at >>> 2]` incremented, before decoding. A faulting instruction is therefore counted.
4. **A relocation is checked before anything else**, whatever the word is. The import `fn = (options.imports ?? [])[index]` and `handler = fn && options.handlers?.[fn.name]` are looked up; no handler faults (`"no handler for import " + index`), then an unaligned `sp` faults, then `handler(...x.slice(10, 10 + fn.params.length))` is called. Caller-saved registers become `0x76540000 + reg`, `x1 = at + 4`, `x10 = result | 0`.
5. `w === 0x00100073` (`ebreak`) returns `{trap: true, at, steps, counts, bytes, registers}` at once. `steps` includes the `ebreak`, and there is no `result` field.
6. Otherwise the opcode is executed (table below), `x0` is reset to 0 and `at = next`.

| Opcode | Accepted forms | Notes that matter for equivalence |
|---|---|---|
| `0x03` loads | `lb lh lw lbu lhu` (f3 0, 1, 2, 4, 5) | address `a + imm` is a JS number, not a 32-bit sum; bounds `address < 0 \|\| address + width > size`; other f3 fault `"unsupported load"` without a bounds check |
| `0x23` stores | `sb sh sw` | address `a + signed12((f7 << 5) \| rd)`; other f3 fault `"unsupported store"` |
| `0x13` immediate ALU | all eight f3 | `slli` ignores f7; `srai` is chosen by `f7 & 0x20` |
| `0x33` register ALU and M | f7 = 1: `mul mulh mulhu div rem`; else all eight f3 | `sub` and `sra` are chosen by `f7 === 0x20`, any other f7 means `add`/`srl`; `div` is `a / b` truncated by the `Int32Array` store; division by zero gives −1 (`div`) and `a` (`rem`); `MIN / -1` gives `MIN` and `MIN % -1` gives 0; `mulhsu divu remu` fault `"unsupported M instruction"` |
| `0x37` | `lui` | `w & 0xfffff000` |
| `0x63` branches | `beq bne blt bge bltu bgeu` | f3 2 and 3 fault `"unsupported branch"`; the target is not checked until the next step |
| `0x6f` | `jal x0` and `jal x1` | `jal x1` checks `sp & 15` and pushes `{pc: at + 4, saved}`; any other rd faults `"unsupported jal link register"` |
| `0x67` | only the word `0x00008067` (`ret`) | pops a frame; a missing frame or a return address that differs faults `"return address does not match the call"`, a changed callee-saved register faults `"callee-saved xN changed across a call"` (first in list order) |
| anything else | — | `"unsupported RV32 opcode 0x" + op.toString(16)` |

Every fault is `throw new Rv32Fault(message + " at 0x" + (at >>> 0).toString(16))`, where `at` is the address of the executing instruction. The normal result is `{trap: false, result: x[10], steps, counts, bytes: bytes.subarray(0, memoryBytes.length), registers: x}`. `bytes` is a view of guest memory without the stack, so `bytes.buffer.byteLength === size`.

Two consequences of number arithmetic that a Go port must reproduce:
- A branch or `jal` that computes `-4` ends the run as a normal return, because the loop condition compares with `RETURN_TO_HOST` before the address check.
- `div` computes `a / b` in double precision and truncates. For 32-bit operands the double quotient never crosses an integer (its error is below `1/|b|`), so truncating it equals Go's truncating integer division. `mulh` uses `BigInt`; Go's 64-bit product shifted right by 32 is the same value.

### 3.2 Split between JavaScript and Go

The interpreter is split at the loop. A small JavaScript wrapper (`pkg/traceapi/rv32.js`) performs the setup with the reference's own statements, and a Go function (`pkg/tracerv32`) runs the loop:

```text
rv32.run(program, entry, args, memoryBytes, options)       // rv32.js, same signature as typedRv32Interp.run
  size, bytes = new Uint8Array(size), bytes.set(memoryBytes)  // the reference's setup lines, unchanged
  counts = new Uint32Array(words) | null, x = new Int32Array(32), register initialisation
  at = program.entries[entry]; undefined → Error("unknown RV32 entry …")
  outcome = __rv32.run(image, at, x, bytes, counts, relocationOffsets, relocationIndices, limit, String(limit), hooks)
            // Go: reads and writes x, bytes and counts in place (goja exports typed arrays as shared slices)
  fault   → throw new Rv32Fault(outcome.message)   (with .at and .steps added)
  trap    → {trap: true, at, steps, counts, bytes: bytes.subarray(0, memoryBytes.length), registers: x}
  return  → {trap: false, result: x[10], steps, counts, bytes: …, registers: x}
```

Why this split:
- **Setup semantics come for free.** JavaScript conversions such as `ToInt32` of arguments, `Uint8Array.set` of an arbitrary array-like, `&` on the size and `??` on options are executed by the same engine that runs the reference. They do not have to be re-implemented in Go.
- **No copies.** goja exports a `Uint8Array`, `Uint32Array` or `Int32Array` as a Go slice over the same buffer (`typedArrayObject.export` uses `unsafe.Slice`). Go writes the guest memory, counts and final registers directly into the arrays the result returns.
- **Results have the reference's types.** `counts` is a real `Uint32Array`, `bytes` a real `Uint8Array` view, `registers` a real `Int32Array`. Scripts written for `typedRv32Interp` keep working, including `typedRv32Interp.profile(program, result.counts)`.
- **Imports call back into JavaScript.** The wrapper passes two small functions: `lookup(index)` returns `[fn, handler]` or `null` with the reference's expressions, and `invoke(fn, handler, x)` returns `handler(...x.slice(10, 10 + fn.params.length)) | 0`. Go calls them in the reference's order (lookup, no-handler fault, sp check, invoke), so a missing `params` field throws the same `TypeError` at the same point.

**Domain restriction.** Entry offsets must be integer numbers, as `typedRv32.compile` produces them. The reference would also accept a string or a fractional offset and then behave in ways that depend on string concatenation (`"0" + 4`); the wrapper refuses those with a `TypeError` instead of imitating them.

### 3.3 The Go loop

```go
package tracerv32

type Machine struct {
    Image       []byte            // read only
    Memory      []byte            // guest memory, len == size
    Counts      []uint32          // nil when counts are off
    X           *[32]int32        // in/out
    Relocations map[int64]int     // offset -> import index
    Limit       int64             // steps > Limit faults; math.MaxInt64 for NaN or +Inf
    LimitText   string            // String(limit), for the fault message
    Import      func(index int, x *[32]int32) (int32, error) // nil handler → *Fault
    Poll        func() error      // called every 1<<20 steps; returns the session's interrupt
}
type Outcome struct{ Trap bool; At, Steps int64 }
type Fault struct{ Message string; At, Steps int64 } // Error() == Message + " at 0x" + hex(uint32(At))
func (m *Machine) Run(entry int64) (Outcome, error)
```

- **Decode once.** The image cannot change during a run (stores go to guest memory, not to the image), so every word is decoded before the loop into a fixed-size record `{kind, rd, rs1, rs2, imm}`. A word whose decoding would fault becomes `kind = fault` with its message, and faults only if executed, which is when the reference faults. This replaces the per-step `DataView` read, the shifts and the nested `switch` of the reference with one `switch` on a small integer.
- **Address arithmetic in `int64`.** `a + imm` and `at + offset` are computed in 64 bits, so no sum wraps where the reference's number would not.
- **Registers in a local array.** `X` is copied into a local `[32]int32` before the loop and back afterwards, and around every import call, so the Go compiler keeps the hot state out of the shared slice.
- **Interrupts.** The Go loop cannot see goja's private interrupt flag. Every 2²⁰ steps it calls `Poll`, which the bridge implements as a call of an empty JavaScript function. goja checks its interrupt flag on every JavaScript instruction, so a pending `vm.Interrupt` surfaces as an `*goja.InterruptedError` from that call. The bridge re-panics it, which goja treats as uncatchable, and the cell ends with the deadline message as before. Without this, `limit: Infinity` on a looping program would hold the session forever.

### 3.4 Session interface

```js
rv32.run(program, entry, args, memoryBytes, options)   // typedRv32Interp.run, native
rv32.profile(program, counts)  rv32.classify(word, next, after)   // the reference's helpers, same results
rv32.Rv32Fault                                           // thrown on faults; err.at, err.steps added
rv32.help()

const c = compiler.at(rev)
c.native.interp      // === rv32, under the name the revision's tools use
c.native.rayBench    // this revision's tools/typed-ray-bench.js, with typedRv32Interp bound to rv32
```

`c.native.rayBench` evaluates the revision's own `typed-ray-bench.js` text in a scope whose `typedRv32Interp` is `rv32`. The memory layout, arguments and checks of `openingFrame` therefore stay those of the revision being measured, and only the interpreter changes. `c.rayBench` keeps the JavaScript reference, so a script can compare the two in one cell. At revisions without the bench file `c.native.rayBench` is `null`, as `c.rayBench` is.

`profile` and `classify` are also provided natively. They cost little in JavaScript, but a Go `profile` over a 3,000-word image avoids building ten counters per word in goja.

### 3.5 Conformance

The gate is: identical `trap`, `result`, `at`, `steps`, `bytes`, `registers` and per-PC `counts`, and identical fault messages, between `rv32.run` and the reference.

1. **Hand-written programs** (`pkg/tracerv32`): every opcode and every fault path, including the order of checks (a relocation on an `ebreak` word, an unaligned `sp` at an import with no handler, `MIN / -1`, a branch to `-4`).
2. **Randomized differential programs** (`pkg/traceapi`): generated instruction sequences, run by the reference in goja and by `rv32.run` in the same VM, compared field by field. Seeds are fixed so a failure reproduces.
3. **The opening frame** (`typedRayBench.openingFrame`) compiled at a pinned commit with the default options and with `{policy: "stock"}`: steps, the SHA-256 of `bytes` (430f0d50… in both), of `counts` and of `registers`, recorded from Node's run of the reference, compared with `rv32`. A slow test also runs the reference in goja in the same VM when the race detector is off.

### 3.6 Expected performance

Node runs the reference's default opening frame (4,888,369 steps at `2712684`) in 152 ms and the stock frame (15,532,634 steps) in 385 ms. goja runs it about 25 times slower than Node. A predecoded Go loop should execute between 100 and 400 million instructions per second, so the default frame should take 15–50 ms, roughly 250–800 times faster than the reference in goja, and faster than Node.

## 4. I2: a parameter channel

**Protocol.** `POST /sessions/{id}/eval` and `POST /sessions/{id}/jobs` accept an optional `"args"` field holding one JSON object of at most 64 KiB. A job's view (`GET …/jobs/{job}`) reports the `args` it was submitted with and the SHA-256 of its source.

**CLI.**

```sh
trace-repl eval --session "$sid" --arg rev='"worktree"' --arg arms='{"base": {}, "split": {"operandLocations": {"split": true}}}' < frame-profile.js
trace-repl eval --session "$sid" --job --args-file arms.json --arg rev='"eaf0872"' < frame-profile.js
```

- `--arg NAME=JSON` is repeatable. `NAME` must be a JavaScript identifier other than `__proto__`; the value must be valid JSON. Giving a name twice is an error.
- `--args-file PATH` reads one JSON object. `--arg` values are applied on top of it.

**In the session.** Every cell and every job sees a global `args`, set before its first statement:
- the object sent with it, freshly parsed in the session VM, or
- a fresh empty object when none was sent.

So a cell never sees the previous cell's parameters. The binding is defined once per session as a **non-configurable accessor** on the global object, whose getter returns the current cell's object and whose setter replaces it for the rest of that cell. The accessor form matters:
- A top-level `let args`, `const args`, `class args` or `function args` in a cell is refused by the engine (a global lexical declaration may not shadow a non-configurable global property). A lexical `args` would otherwise survive into later cells and shadow every later cell's parameters, which is the leak entry 5 describes.
- The existing convention `globalThis.args = {...}; <script>` keeps working inside that one cell.
- `delete globalThis.args` and `Object.defineProperty(globalThis, "args", …)` fail, so a script cannot freeze the binding for its successors.

## 5. I5: a result store

```js
results.save("ray-frame-native", value)          // → {name, path, sha256, bytes, saved}
results.load("ray-frame-native")                  // → the whole record
results.list()                                    // → [{name, bytes, saved, sha256}]
```

Each record is one file `NAME.json` in the service's results directory:

```json
{"name": "ray-frame-native", "saved": "2026-11-21T…Z", "session": "…", "unit": "job", "job": "job-…",
 "script": {"sha256": "…", "bytes": 2048}, "args": {…},
 "repo": {"root": "…", "head": "<commit at save time>"},
 "compilers": [{"requested": "worktree", "revision": "worktree", "key": "<digest of the loaded files>"}],
 "value": …}
```

- The directory is `serve --results DIR`, by default `$XDG_CACHE_HOME/picocalc-trace-repl/results` (`os.UserCacheDir`). `GET /info` reports it.
- Names match `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$` and may not contain `..`. A save replaces an existing record of the same name, written to a temporary file and renamed, so a reader never sees half a record.
- The value is serialized with the session's `JSON.stringify` and capped at 32 MiB.
- `compilers` lists every revision the session loaded with `compiler.at`. For `"worktree"` the key is the digest over the file digests at load time, so a record made from uncommitted compiler edits still identifies the exact files.
- `GET /results` and `GET /results/{name}`, and the CLI `trace-repl results [--name NAME]`, read the store without a session.

## 6. I6: per-block detail from `stats.paired`

Reading `stats.js` showed that `stats.paired` has returned the per-pair values since W5, as `perPair: [{key, control, candidate, percentSaved}]`, sorted by key. Entry 1's complaint is therefore one of discoverability, not of missing data: the help text names `perPair` without its fields, and the RAY-PARITY score script drops it. The change:

- `blocks: [{key, control, candidate, savedPct, outcome}]`, with `outcome` `"win"`, `"loss"` or `"tie"` relative to `better`. It is the same data as `perPair` under the name the notes ask for.
- `spread`: `stats.summary` of the per-block `savedPct` (`n, min, q1, median, q3, max, mean`), the spread the notes wanted to judge.
- `perPair` stays, so no existing script changes, and the help text lists the fields of both.

## 7. I2b: worlds without a `source.list`

`compiler.at(rev).world(name)` assembles `picocalc-os/worlds/NAME/source.list` when it exists. Otherwise it uses a built-in layout taken from the firmware:

| World | Files, joined with `\n` | Source of the layout |
|---|---|---|
| `files` | `files/files.typed` | `port/esp32p4/main/files_p4.c` reads `files/files.typed` alone |
| `agenda` | `agenda/reminder.typed`, `agenda/entry.typed` | `agenda_p4.c: read_source` appends `'\n'` and `entry.typed` to the reminder source |

The result gains `layout: "source.list" | "builtin"`, so a report can say how the text was assembled. A world with neither is still an error, now listing the worlds that have layouts.

## 8. I3b proposal: export the compiler's opcode table

`scripts/workbench/tape.js` restates two internal tables of `typed-rv32.js`: opcode names and the number of operand cells after each opcode (`OPERAND_CELLS`). A new opcode must be added in both places, and a tape listing at an older revision uses today's table. The proposal, for whoever next changes `picocalc-os/compiler/typed-rv32.js`:

```js
// in typed-rv32.js, next to the existing exports
globalThis.typedRv32 = {compile, linkSlot, policies: POLICIES,
    tape: Object.freeze({
        // opcode -> {name, cells}: the mnemonic tape.js prints and the operand cells that follow the opcode
        ops: Object.freeze({0x02: {name: "block", cells: 1}, /* … */ 0xf1: {name: "checked", cells: 2}, 0xf3: {name: "unchecked", cells: 3}}),
        phases: Object.freeze(["inline", "commute", "rotate", "version", "split"]),   // the observeTape phases
    })};
```

- It is data only, so it cannot change any image. The compiler's own decoder should read from the same object, so the export cannot drift from the code.
- `tape.js` would then use `c.typedRv32.tape ?? FALLBACK`, keeping its restated table only for revisions before the export.
- The workbench needs no change: `compiler.at(rev).typedRv32.tape` appears with the revision that adds it.

## 9. Design decisions

- **D1. The JavaScript interpreter remains the reference.** The Go interpreter is tested against it and against nothing else; no RISC-V specification is consulted for behaviour the reference defines differently (for example, `jalr` accepts only `ret`).
- **D2. Split at the loop, not at the function.** The setup lines are copied from the reference into `rv32.js` so their JavaScript conversions need no Go re-implementation.
- **D3. Poll for interrupts through the VM** rather than threading the cell's context into `traceapi`. It needs no change to `tracerepl` and costs one empty JS call per million instructions.
- **D4. `args` is a non-configurable accessor**, not a plain property, because it is the only form a cell can neither shadow nor freeze.
- **D5. Results go to a directory outside the repository by default**, so saving never dirties a working tree. A ticket can point `--results` at its own `various/` directory.

## 10. Alternatives considered

- **Running the reference interpreter in a faster JavaScript engine** (Node through a subprocess). Rejected: the workbench's value is one VM holding the compiler, its output and the measurement, and a subprocess would need the program serialized each time.
- **A Go RV32 emulator library.** Rejected: it would implement RISC-V, not the reference's subset and ABI checks, and conformance would be harder to prove.
- **Freezing `args` instead of resetting it.** A frozen object still leaks if a later cell does not receive new parameters. Resetting per cell is what prevents the entry 5 failure.

## 11. Implementation plan

1. `pkg/tracerv32`: decoder, loop, faults, `Profile`, `Classify`; hand-written tests.
2. `pkg/traceapi/rv32.{go,js}`: the bridge and wrapper, installed in every session; `compiler.at(rev).native`; differential and opening-frame tests.
3. Workbench measurement: a job that times the reference and `rv32` on the same compiled frames.
4. I2: `tracerepl` (args per cell and job), `http.go` (decoder), `cmd/trace-repl` (`--arg`, `--args-file`); tests for every leak path.
5. I5, I6, I2b, each with tests.
6. README, this document's as-built notes, the diary and the vault report.

## 12. Open questions

- Should `results.save` refuse to replace a record that another session wrote? The first version replaces and records the writer; a sweep that is re-run should not need a new name each time.
- Should jobs record the full `args` or only a digest? Full `args` are at most 64 KiB and a session keeps 16 finished jobs, so the first version records them in full.

## 13. References

- `picocalc-os/tools/rv32-interp.js`, `picocalc-os/tools/typed-ray-bench.js`: the reference interpreter and the opening-frame workload.
- PICOCALC-TRACE-WORKBENCH `design-doc/01-turning-the-trace-repl-into-a-compiler-workbench-an-intern-guide.md`: the service architecture.
- PICOCALC-RAY-PARITY `reference/02-workbench-field-notes-the-trace-repl-as-the-center-of-compiler-optimization.md`: the requirements.
