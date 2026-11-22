---
Title: Investigation diary
Ticket: PICOCALC-RAY-PARITY
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: picocalc-os/compiler/typed-rv32.js
      Note: planLocations now walks raw tape cells (OPERAND_CELLS)
    - Path: ttmp/2026/11/21/PICOCALC-RAY-PARITY--make-typed-compiler-optimizations-cumulative-and-close-the-ray-tracer-s-gap-to-c/scripts/01-open-compiler-session.py
      Note: Loads the compiler and all Typed inputs into a trace-REPL session
ExternalSources: []
Summary: "Chronological record of making the Typed compiler's qualified optimizations cumulative and starting the work toward a ray tracer competitive with C."
LastUpdated: 2026-11-21T19:45:00-05:00
WhatFor: "Resume and review the PICOCALC-RAY-PARITY implementation"
WhenToUse: "Read the latest step before continuing; earlier steps hold the evidence for each decision"
---

# Investigation diary

## Step 1: Open the ticket and test what the trace REPL can do for compiler work

This ticket follows the retrospective published to go-go-parc at `e01a6a1`, "The Typed ray tracer odyssey". That review found that three days of labs had produced real compiler improvements, but each one lived behind an opt-in option, in a patch file or in a compiler fork pinned to one function. The work here makes those improvements cumulative and starts the compiler changes the review ranked highest. The user also asked me to use the trace REPL wherever possible and to report what would make it more useful. This step established what the REPL can do before I relied on it.

The REPL turned out to be more useful as a persistent JavaScript sandbox than as an evidence query service. Its query language covers three fixed archive formats. Its goja VM, however, can hold the Typed compiler itself. After chunking past a 64 KiB cell limit, I compiled the ray tracer inside a session and timed each compile option there. That located the planner's cold-compile cost within minutes.

### Prompt Context

**User prompt (verbatim):**

> Ok, now address all these things properly, in a new docmgr ticket, and clean things up and get us going for the actual proper compiler improvement. Create  a detailed analysis / design /
>   implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api
>   references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.
>
>   commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)

Follow-up messages during the same turn (verbatim): "once you're done with the report"; "use the REPL whenever possible / give me your verdict on what would make it more useful as you go in a report"; "are you using the REPL to analyze LLVM outputs? or are planning to? what are you using it for?". Earlier in the turn: "basically I want a super fast typed JS raytracer that is competitive with the C version" and "there is no production, this is all full experimental".

**Assistant interpretation:** Create a ticket that turns the retrospective's recommendations into work, starting with making qualified optimizations the default and with the next real compiler improvement. Write an intern guide to the whole system and upload it. Use the trace REPL for analysis and keep a running verdict on it.

**Inferred user intent:** Stop producing isolated studies. Get a compiler whose improvements accumulate, measured against C, with documentation good enough for a newcomer to continue.

### What I did

- Created the ticket with `docmgr ticket create-ticket --ticket PICOCALC-RAY-PARITY`.
- Found five trace-REPL services already running (ports 3791–3795) by probing `POST /sessions` and reading `ps`. The SHADOW-LLVM capture is mounted on 3795; ROW-IR plus PIE-LOOPS on 3791/3792; the two SIMD-lab services on 3793/3794.
- Queried the SHADOW-LLVM capture on 3795: `run.functions()` returned `["checked_read","checked_shadow","kernel"]`; alloca, call and phi changes across the middle timeline of `kernel`.
- Loaded `typed-wasm.js`, `typed-rv32.js` and `typed-pie-loops.js` into a session. `typed-wasm.js` is 70,183 bytes and the direct eval returned `{"ok":false,"error":"source exceeds 64 KiB"}`, so I wrote a loader that appends the file to a global string in 30,000-character cells and evaluates it with `(0, eval)(...)`.
- Compiled `worlds/raytrace/raytrace.typed` in the session and timed each compile option with a median of 15 compiles.

### Why

- The retrospective's plan has many host-only steps: byte-identity checks across apps, compile-cost checks, instruction profiles. Doing them in one persistent session avoids rebuilding the context for each question, which is what the REPL was built for.

### What worked

- The compiler runs unmodified in goja. `typedRv32.compile(raySource, [], 65536)` produced the 9,564-byte stock image, the same size SCALAR-BREAKDOWN recorded for the stock ray image.
- Compile time per option, median of 15 in goja (ms): stock 19.55, guarded 19.05, forward 24.08, capacity 24.08, homes 25.05, `operandLocations: {}` 24.32, all qualified 27.06. `operandLocations: {}` enables no policy and still costs +24%. The planner's analysis is the cost, not any policy. This matches the P4 log of OPERAND-HOMES, where every single policy cost 104–106 ms.

### What didn't work

- `q.run(run.functions())` failed with `[notAPlan] q.run expects a plan or an object of named plans; got an array of 3 values`. This is the same interface error the persona studies recorded. Calling `run.functions()` directly works.
- The SHADOW-LLVM kernel shows zero alloca changes on `kernel`, because SROA ran while the function was still named `checked_shadow`. GlobalOpt renamed it at middle ordinal 17. A timeline is per name, so the promotion is invisible unless one knows the earlier name.
- The help text on port 3795 says "queries over the PicoCalc LLVM row archive" although that service mounts the shadow capture.

### What I learned

- goja exposes the same allocation-heavy compiler costs as QuickJS on the P4. V8 hides them: SHADOW-CODEGEN measured +0.25 ms on Node for a change that cost milliseconds on the board.

### What was tricky to build

- The cell limit applies to data as well as code. The assembled Editor source is larger than 64 KiB and returned `HTTP Error 413: Request Entity Too Large`. `scripts/repl_client.py` binds long strings in chunks.

### What warrants a second pair of eyes

- Compile timings in goja are a proxy. The P4 numbers must be measured on the board before any claim about cold compile.

### What should be done in the future

- The REPL observations are collected in the analysis document of this ticket.

### Code review instructions

- `scripts/repl_client.py` and `scripts/01-open-compiler-session.py`.

### Technical details

- Session setup: `python3 scripts/01-open-compiler-session.py 3795 --baseline HEAD` prints a session ID. Bindings: `raySource`, `worlds.{chess,editor,agenda,files}`, `sources[path]`, `typedRv32`, `typedRv32Base`, `typedWorld`.

## Step 2: Remove the planner's tape-decoding cost with byte-identical output

`planLocations` in `typed-rv32.js` called `typedWasm.decodeNumericOperations(fn.code)`, which builds a record object, an operand array and a copy of a source span for every operation. It also allocated `[0x36,0x3b,0xf2]` once per operation. I replaced the decode with a direct walk over the raw tape cells, using a 256-entry table of operand cell counts. The forwarding pattern, a `local.set` followed by a checked address that consumes the same local, is now detected during the walk. It is resolved after the walk, once the read counts are final.

The result is byte-identical on every input that compiles: 98 compiles across 14 inputs and 7 option sets, with zero mismatches. In goja, the planner overhead on the ray tracer fell from +9.1 ms to +1.3 ms per compile.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Fix the 37% cold-compile cost before making the operand-location policies the default for every app.
**Inferred user intent:** Defaults must not make cold builds of Editor and Files noticeably slower.
**Commit (code):** recorded in Step 3.

### What I did

- Added `OPERAND_CELLS` (an `Int8Array(256)`) and rewrote `planLocations` (`picocalc-os/compiler/typed-rv32.js`). Unknown opcodes and truncated operations raise the same errors as the decoder.
- Wrote `scripts/02-planner-equivalence.{js,py}`: for every input, compile with `typedRv32Base` (HEAD) and `typedRv32` (working tree) under seven option sets (stock; forward; capacity; homes; all three; all three plus guarded returns; the same buffered) and compare image bytes or error messages.
- Inputs: the ray tracer, the assembled Chess, Editor, Agenda and Files worlds compiled with `typedWorld.imports`, and all 33 `.typed` files standalone.
- Wrote `scripts/03-compile-cost.py`: interleaved base/candidate × stock/qualified compiles, one compile per cell, medians.
- Ran the five affected node test files: `node --test tests/typed-rv32.test.mjs tests/typed-pie-loops.test.mjs tests/typed-inspect.test.mjs tests/typed-wasm-inspect.test.mjs tests/sysapps.test.mjs`.

### Why

- The P4 measured +37% cold compile on the ray tracer for any operand-location policy. Making these policies the default without fixing it would slow every app's cold build.

### What worked

- Equivalence (`various/01-planner-equivalence.json`): 38 inputs, 14 compile, 98 identical images, 168 identical errors, 0 mismatches. Editor compiled after loading `typed-async.js`, and its images are identical in all seven arms (75,812 B stock, 74,188 B qualified).
- Tests: 36 pass, 0 fail.
- Compile cost in goja (`various/02-compile-cost-goja.json`, medians, ms):

| Input | Base stock | Base qualified | Candidate stock | Candidate qualified |
|---|---:|---:|---:|---:|
| Ray tracer (n=9) | 26.5 | 35.6 | 28.5 | 29.8 |
| Chess (n=5) | 306.2 | 334.3 | 316.8 | 310.7 |
| Editor (n=3) | 743.9 | 840.9 | 744.7 | 811.2 |

An earlier run in another session gave ray 19.0/24.3/19.3/21.0, Chess 214.8/252.2/218.7/223.7 and Editor 563.1/610.6/568.4/584.2. Host load changes the absolute values. The reduction in planner overhead is consistent across both runs.

### What didn't work

- Running the whole equivalence in one cell stopped with `cell stopped at its evaluation deadline (at most 15s, including the wait for this session)`. The driver now evaluates one input per cell.
- My first Editor assembly failed in both compilers with `569:1: expected function`. Editor uses `async function`, which needs `typed-async.js` loaded before compiling.

### What I learned

- Only 9 of the 33 `.typed` files compile standalone. The rest are parts of multi-file worlds (`worlds/chess/source.list`, `worlds/editor/source.list`) or need SDK imports. Equivalence tests must compile assembled worlds.

### What was tricky to build

- Forwarding needs each candidate's final read count. The old code ran a second loop over the decoded records. The walk records candidates (local id and the tape offset of the producing constant or set) and filters them after the walk. Insertion order into `scores` is unchanged, which matters because `homes` sorts by score and ties keep insertion order.

### What warrants a second pair of eyes

- Editor still shows +66 ms (n=3) for the qualified options with the new planner in the second run, against +16 ms in the first run. The remaining overhead may come from guarded-return summaries or from noise. The P4 trial decides.

### What should be done in the future

- Measure cold compile on the P4 for stock and qualified with the new planner.

### Code review instructions

- `git diff` on `picocalc-os/compiler/typed-rv32.js`, function `planLocations`.
- Reproduce: `S=$(python3 scripts/01-open-compiler-session.py 3795 --baseline <rev-before-change>)`, then `python3 scripts/02-planner-equivalence.py 3795 $S out.json`.

### Technical details

- Operand cells per opcode are taken from `inspectOperations` in `typed-wasm.js` (numeric mode reads one cell per operand format).
