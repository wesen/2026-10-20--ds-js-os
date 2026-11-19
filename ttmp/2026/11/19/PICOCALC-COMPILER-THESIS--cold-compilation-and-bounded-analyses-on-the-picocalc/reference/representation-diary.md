---
Title: Compiler representation investigation diary
Ticket: PICOCALC-COMPILER-THESIS
DocType: reference
Status: active
Topics:
  - picocalc
  - compiler
---

# Compiler representation investigation diary

## Step 1. Locate the exact frontend and backend contract

The supervisor assigned me the representation experiment. I read the shared compiler before choosing an intermediate form. Its parser and type checker emit structured i32 instructions directly. Each returned function retains both its instruction array and a second array containing a length-prefixed Wasm body with a local declaration vector. The native backend reads only the first array, and it builds its own native image from those instructions.

The separate arrays gave the investigation three interventions. Remove unused framing. Skip converting integers to LEB128 and back. Consume one function as soon as it passes the frontend. Each intervention alters a different cost, so I kept a separate compiler lane for each.

### Prompt Context

The [supervisor diary](01-supervisor-investigation-diary.md) preserves the authored prompt verbatim. The representation assignment came from the supervisor. I interpreted it as a controlled narrow change to the compiler's internal handoff, with output identity as the precondition for attributing performance differences. I inferred that a defensible negative result mattered as much as a speedup.

### What I did

- Ran `git show dd69a81:picocalc-os/compiler/typed-wasm.js` and the corresponding command for `typed-rv32.js`. Inspected `FunctionEmitter.function`, `compileFunctions`, `FunctionCode.step`, `FunctionCode.lower` and the native image-writing loop.
- Found the SDK import table in the frozen `typed-world.js` and the Editor concatenation order in `worlds/editor/source.list`. Examined the existing host phase timer as a reference for running the compiler under QuickJS.
- Sent the supervisor the lane design, the rationale for one-function buffering and the intended timing and allocation controls.

### Why

A comparison that replaces both Wasm serialization and the RV32 instruction selector cannot attribute a change to frontend representation. The frozen Git object lets other work modify the checked-out backend while all four lanes continue to use the same instruction selector.

### What worked

The source confirms that the frontend declares a new function after parsing its body. Function calls can resolve imports and previous declarations when the consumer receives that function. Direct functions in the source do not need a pre-pass to collect forward declarations for this experiment.

### What didn't work

An early workspace shell startup hung and eventually returned `bwrap: Can't bind mount /oldroot/ on /newroot/: Unable to apply mount flags: remount "/newroot/mnt/pico": No such device`. Its attempted scratch script creation had not run. I retried a short workspace command and recreated the directory after shell access recovered. No device was accessed.

### What I learned

The production RV32 path never parses a full Wasm module. The work at stake is function-body framing plus local decoding of the unframed code array.

### What was tricky to build

The function requires its final `nlocals` before encoding the locations of RV32 operand stack slots. The frontend increments local counts while parsing, including temporaries for operations such as `Math.min` and buffer literals. Waiting until function completion permits the same frame formula and offset calculations while leaving other source functions unparsed.

### What warrants a second pair of eyes

Check the distinction between function framing and integer encoding, plus the claim that preceding declarations suffice. An undocumented frontend rewrite that allows forward references would change the latter.

### What should be done in the future

Any migration of the production boundary should choose the target-specific operation contract before considering analyses that depend on source-level types.

### Code review instructions

Compare the frozen compilers at `dd69a81cbf91ebf00e1f527bcbbf785697b1c9a4`. Read the changes anchored by `BODY`, `STREAM_HEAD` and `COMPILE_HEAD` in [variants.py](../scripts/representation/variants.py).

### Technical details

The frozen frontend registers each signature with an index of `functionBase + functions.length`. The backend builds `targets` in that same order. Native words, function offsets and unresolved import relocations still pass through the common final image writer in all lanes.

## Step 2. Build the four lanes and differential oracle

I generated temporary compiler variants by transforming only the frozen JavaScript blobs. The packed representation keeps the original opcodes, structured control markers and operand order. It stores each immediate directly as a Number. I split the prepared-input replay into separate generated scripts so the regular full-timing `bytes` lane loads the original compiler texts.

The verifier compares every emitted image byte, the entry table, record layouts, signatures, import count and relocations. I added negative fixtures because lowering during parsing changes when native errors become available. The prototype saves the first native error and continues checking source so the original frontend-first precedence is observable.

### Prompt Context

See Step 1 for the authored prompt and assignment. This step implements the requested controlled compiler experiment.

### What I did

- Added [variants.py](../scripts/representation/variants.py), [driver.js](../scripts/representation/driver.js), the [QuickJS runner](../scripts/representation/quickjs-runner.c) and [run.py](../scripts/representation/run.py).
- Used `git archive` to compile the QuickJS tree at the same immutable revision instead of assuming the working tree or old host objects identify the interpreter.
- Added a wide-operand positive fixture and verified four rejection cases for type mismatch, forward references, native arity and combined native/syntax failure.
- Added a collision probe that compares full frontend function records for two source-local types that erase to the same operations.

### Why

All runtimes perform the same source checking and the same native emission. Separate verification avoids serializing image bytes or walking metadata inside measured intervals. Output equality is stronger than matching native image size alone, especially for function and import branch targets.

### What worked

The first Files verification matched all four images and metadata. After correcting Agenda input assembly, both Agenda and Editor also passed before the synthetic fixture was reached.

### What didn't work

The initial command `python3 -B …/scripts/representation/run.py --verify-only --receipt /tmp/pico-repr-verify.json` put `entry.typed` before `reminder.typed`. Every lane reported `SyntaxError: 21:26: unknown function decimal`. The frozen `port/esp32p4/main/agenda_p4.c` loads reminder first and appends entry, and the comment in `entry.typed` confirms this dependency. The next benchmark attempt used that order and reached the generated wide-operand fixture. All lanes reported `137:2247: expected identifier`. The reported token was a `return` in a braced `if` body. The frozen dialect accepts an unbraced branch return and a final function return. I made the fixture use the unbraced form.

### What I learned

The real corpus has call-order constraints that the frontend checks immediately. Treating source files as an unordered set can invalidate a benchmark while all variants still agree on rejection. Acceptance is asserted separately from agreement.

### What was tricky to build

For a successful function the stream consumer receives its signature and operation array. It creates the function's target record, then lowers immediately. The frontend clears the operation array only after the consumer finishes. Backend `FunctionCode` instances retain their signature references, machine words and fixups until the final image pass. The baseline validates the complete source before lowering, so a streamed implementation must defer native exceptions if it is to keep baseline diagnostic precedence.

### What warrants a second pair of eyes

Check the operand sites for signed constants, large index/offset operands and alignment bytes. Check that the stream consumer does not need code arrays belonging to already lowered callees. Check that replay tests compile the same input through both prepared and normal entry points.

### What should be done in the future

A native-specific binding for the operation boundary could turn the frozen text transformations into explicit interfaces if the measured benefit justifies source changes.

### Code review instructions

Run `python3 -B …/scripts/representation/run.py --verify-only --receipt /tmp/pico-repr-verify.json` from the repository root. In the result inspect `verification`, the generated compiler hashes and `sourceIntentProbe`. The launcher uses only Git objects and scratch outputs.

### Technical details

The wide fixture reaches local and callee indices above 127, large record offsets and buffer write offsets, i32 minimum, short-circuit control, loop backedges, an import relocation and a signed division. The repeated work also covers existing Editor functions, the full frozen Files source and the frozen Agenda reminder-and-entry source as used by its legacy compiler caller.

## Step 3. Validate the timed bundles and measure equal work

The frozen compiler accepted each of the three corpus inputs and the wide-operand fixture. The output comparison covered native image bytes and exact program metadata. I measured compiler time only after that check and kept first calls, repeated calls and allocator high-water observations separate.

The largest result was the difference between execution time and live memory. The packed variant lowered Editor in 49.443 ms median and the stream variant took 51.103 ms. The streamed variant consumed about 708 kB less incremental heap at peak. Packed and streaming are distinguishable options with different resource outcomes.

### Prompt Context

See Step 1 for the authored prompt and assignment. The supervisor asked for literal native equality including relocations, and for clear treatment of serial timing order and fresh-realm versus preloaded startup.

**Commit (code).** `88263e0` — Prototype packed and streamed PicoCalc compiler operations.

### What I did

- Ran `python3 -B "$ticket/scripts/representation/run.py" --cpu 6 --rounds 16 --rotations 4 --receipt "$ticket/various/representation/quickjs-results.json"`, with `ticket=ttmp/2026/11/19/PICOCALC-COMPILER-THESIS--cold-compilation-and-bounded-analyses-on-the-picocalc`.
- Timed an initial call then two warmups and 16 repeated serial calls per lane in each of four processes. The first lane rotates each round. Used `clock_gettime(CLOCK_MONOTONIC)` around the QuickJS function invocation and refreshed the host processes between phase groups.
- Measured first-full-call post-allocation high-water under a custom QuickJS allocator using the matching Linux accounting. Recorded initial, peak and result-live bytes.
- Added a verification mode that runs each input through both the ordinary timed bundle and the replay-enabled bundle. Reran all differential cases using `--verify-only`. The normal compile methods kept their earlier behavior and source.
- Sent the measured deltas and receipt location to the supervisor. Wrote the explanatory article and a short reference note with the contracts.

### Why

Separating frontend-only and prepared-input lower-only intervals exposes which costs can account for the full-call improvement. The memory process can instrument every allocation without changing the CPU timing path. Serial rotating rounds limit interference between compiler lanes and distribute order effects across variants.

### What worked

All positive inputs gave identical RV32 bytes and metadata across all lanes and both bundle modes. Editor emitted 175,860 bytes with 145 SDK import relocations. The three buffered lanes also matched their respective ordinary compile output in the replay path. Four rejection fixtures gave the same exception class and message. The local-type collision yielded exactly the same frontend function record for each source variant in all three inspectable lanes.

Across the three corpus inputs, the paired packed speedups by reduction in latency were 12.8%, 13.7% and 17.3%. Editor's prepared lowering comparison attributed 10.2% shorter lower-stage time to native consumption with direct operands. The `unframed` replay ratio was 0.996, close to one. Editor's allocated high-water above preloaded context came down from 3,198,824 to 2,427,040 bytes packed and to 1,719,456 bytes streamed.

### What didn't work

The stream variant produced higher median compile latency than buffered packed on each workload. Editor moved from 49.443 to 51.103 ms. The data do not isolate whether the difference comes from callback overhead, incrementally maintaining the native function tables or object lifetimes. The source-intent fixture also confirmed that a compact stream with the same opcodes cannot recover erased local types.

### What I learned

Most of the measured framing removal's effect is allocated high-water, while direct integer operands provide the larger timing benefit. Peak reflects retained data and allocator behavior, and counts of emitted operation cells alone cannot predict it. Early lower can discard a function body, but output words, calls and metadata survive to final assembly.

### What was tricky to build

The exact verification originally used separate scripts that added a prepared-replay export to the compiler closures. The full timing bundles omit this export, so I exercised both bundles and asserted that their ordinary compile output matches. A verification-only run after adding the check confirmed that the results still hold.

### What warrants a second pair of eyes

Trace the compiler loader to check what is outside the time and heap windows. Inspect the distinctions between the cold invocation, ongoing repeated calls and host allocator simulation before applying numbers to firmware. Review whether the wide fixture hits each critical immediate domain even if future sources use a different instruction mix.

### What should be done in the future

Measure the same candidate boundary with the actual board allocator and compiler job if firmware work proceeds. To isolate why streaming incurs more time use a second factorial experiment with byte and packed variants at both lifetimes and measure callback and target append work. Any new operation annotations should be justified by a concrete transformation whose correctness depends on them.

### Code review instructions

- Confirm the normal baseline is the exact concatenation of `typed-wasm.js` and `typed-rv32.js` at the frozen commit. `generatedCompilerSha256` and `originalCompilerSha256` identify the material in the receipt.
- Check the main `verify` and `measurements` functions in [run.py](../scripts/representation/run.py). Run [the article's reproduction](../various/reports/representation.md#reproduce-the-comparison) with `--verify-only` to check both bundles and all five generated fixtures.
- Inspect raw result samples, not only medians, in [quickjs-results.json](../various/representation/quickjs-results.json).

### Technical details

The source strings, imports and compiler bytecode are resident before timed invocation. The front region excludes native lowering. The lower region reuses prepared frontend function arrays and includes writes into the native output image. The extra heap figure is peak minus initial, with setup followed by `JS_RunGC`. The board allocator, libc internal transient allocations and process RSS are outside that measure. The measured compiler emits raw app images and metadata, with reactor slot linking excluded.
