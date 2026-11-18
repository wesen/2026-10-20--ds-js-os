---
Title: Language contracts in the PicoCalc catalog
Ticket: PICOCALC-CJI-DIALECT
Status: active
Topics:
    - picocalc
DocType: analysis
Intent: long-term
---

# Language contracts in the PicoCalc catalog

Use closed records, homogeneous arrays, typed dictionaries, explicit conversion, and compiler-owned suspension in the compiled dialect. Keep external JSON, world messages, dates, capability transfer, and error delivery as explicit boundary contracts. Keep the existing QuickJS sandbox for interactive JavaScript while the dialect and compiler mature. The simulator exercises current behavior and selected source migrations. Dialect performance needs independent measurement.

## What the source uses

The input is every `file` in `picocalc-os/js/system.json` at `c35e75c`, plus a separate parse of `picocalc-os/js/prelude.js`. These counts describe syntax. They give no execution frequencies, value types, escalation costs, heap sizes, or proof of absence in REPL input, Loader data or external apps. A lexical capture is a function with a direct reference to an enclosing function's local, excluding globals and top-level names. The count includes callbacks that an implementation can inline or invoke without allocating an escaping closure. Dynamic bracket access includes arrays and even literal brackets. Spot audit representative sites before asserting a dictionary or aliasing dependency.

| Syntax | World sites | Worlds with use out of 22 | Prelude sites |
| --- | ---: | ---: | ---: |
| Object literals | 575 | 22 | 38 |
| Computed member accesses, including arrays | 535 | 16 | 15 |
| Computed member mutations, included above | 41 | 8 | 7 |
| Object/Reflect calls | 23 | 6 | 20 |
| Number literals / arithmetic operator sites | 2,608 / 1,857 | 22 / 22 | 47 / 20 |
| Math calls / bitwise sites | 318 / 24 | 18 / 6 | 2 / 10 |
| Map/Set constructor sites | 14 | 4 | 2 |
| Function definitions / captures of enclosing locals | 763 / 169 | 22 / 14 | 120 / 95 |
| Strict comparisons / loose comparisons with null | 760 / 21 | 21 / 4 | 34 / 7 |
| Short-circuit AND/OR / optional access, calls or nullish operators | 795 / 23 | 21 / 1 | 43 / 0 |
| Null literals / unshadowed explicit undefined references | 204 / 22 | 14 / 7 | 20 / 14 |
| Direct JSON calls / world event registration and send/ask/publish calls | 7 / 136 | 1 / 22 | 13 / 0 |
| Try / throw sites | 71 / 100 | 15 / 5 | 2 / 2 |
| Async functions / await expressions / Promise and then-like calls | 43 / 75 / 16 | 14 / 14 / 7 | 0 / 0 / 2 |
| Module syntax / classes / direct or indirect eval | 0 / 0 / 1 | 0 / 0 / 1 | 0 / 2 / 0 |
| Regex literals / Date calls and construction | 73 / 11 | 10 / 5 | 1 / 1 |

Some syntax inherits behavior even with a zero count. The prelude's thirteen JSON call sites apply transitively to all initial-state copies, world-to-world messages or replies, screen descriptions, and world stores. Its event implementations are assignments to globals that call `__k`/`__ka`; the events metric counts world calls and handler registrations. Date wrappers also use inheritance and dynamic dispatch, visible in the class count. The audit covers arbitrary syntax for this catalog source and records call names as proxies, without resolving aliases or properties returned by calls. The [per-world TSV](../various/catalog/ast-counts.tsv) includes every file. Run the [audit](../scripts/catalog/audit.cjs) with `--positions` for line and column receipts.

## Dialect decisions and app migrations

| Behavior | Why it matters in the catalog | Initial dialect path |
| --- | --- | --- |
| Fixed object shapes and dictionaries | The Files state literal is a record but adds a root handle after startup (`apps/files.js:87–98`). Calc's user variable and function names are runtime strings used in lookup, insert, enumeration, delete and restore (`apps/calc.js:270–291,519–530,1483–1498,1530–1540`). Agenda persists a reminder dictionary keyed by epoch and task title (`apps/agenda.js:172–190`). Agent emits payloads with omitted optional fields (`system/agent.js:224–278`). | Declare optional slots before allocation, use explicit `Dict<String,V>` for runtime names, and decode external JSON to tagged records. Reserve dynamic-key access for arrays, dictionaries and explicit JSON operations. Migrate optional-object edits to typed variants or builders. Preserve object/reference aliasing where updates are shared. |
| General Map and Set semantics | Agenda de-duplicates date strings then sorts (`apps/agenda.js:122–132`). Launcher reserves letters (`apps/launcher.js:39–49`), Loader reserves app names (`apps/loader.js:76–85`), and Calc has ten string-keyed maps plus one duplicate-parameter check. Calc copies a scope while sharing its mutable value cells and compares a cached definition by identity (`apps/calc.js:263–356`). | Use bounded string tables, a short string set, or a sorted unique vector, with no object-key hashing for these apps. A scope map copy must copy references to cells. Use explicit record identity or a definition generation for cache validity. Prelude handle interning needs integer IDs and the pretty-printer needs cycle detection by identity, which can use its bounded path stack. |
| Numeric and bitwise semantics | The keyboard masks device status bits (`drivers/keyboard.js:30–37`), Display splits coordinates to bytes (`drivers/display.js:4`), and Power masks flags and collapses its input through `\| 0` (`drivers/power.js:21,29,46`). Layout uses signed shifts to floor halves (`system/compositor.js:114,119,198`). Prelude xorshift32 uses wrapping and logical shifts, and maps u32 to a fraction (`prelude.js:10–17`). Calc uses fractions, transcendental functions, nonfinite sentinels, power and sensitive graph sampling (`apps/calc.js:50–93,263–327,636–673`). Files uses fractional binary unit conversion (`apps/files.js:8–9`). Epoch milliseconds (`nucleus/vm.c:199–201`, `apps/agenda.js:46–60`) exceed signed 32 bits. | Keep `i32`/explicit `u32` or fixed-width bit intrinsics for drivers, deliberate floor division for layout, and f64 operations or library calls for scientific work. Use a distinct epoch-millisecond type with enough range and civil-date functions backed by the clock service. Handle IDs and counters can use bounded ints when the producing API validates the range. |
| Coercion, strict equality and missingness | Every loose comparison in both populations is against literal null. That makes absence testable independently of numeric zero, empty string and false. Compositor `n.gap ?? 4` must honor zero (`system/compositor.js:54–69`). Files sorts booleans by subtraction (`apps/files.js:11–19`). Calc compares graph samples against missing and formats numbers with strings. Agenda uses unary plus to read regex captures as decimal integers (`apps/agenda.js:22–33,69–86`). | Compile an explicit presence/missing predicate and type-specific equality. Use Boolean conditions, `parseInt` with a documented radix and failure behavior, and templates or explicit formatting for mixed addition. Define exact, tagged numeric equality and identity where reference semantics are needed. Do each conversion at the schema or callsite, where failure and defaulting are visible. |
| Missing versus null | The host distinguishes absent ask data from literal JSON null, and nested omitted fields from present null. Files returns undefined for a focus with no root (`apps/files.js:97`). Agent omits provider effort fields, and a Chat message can intentionally have null content (`system/agent.js:224–278`). Calc saves empty graph samples and omits missing history values (`apps/calc.js:656–665,1488–1490`). | Use an optional slot or tagged option internally. Keep JSON null as explicit data, with separate missing-field and no-payload cases at ingress and egress. Normalize existing array holes/undefined to null only at the JSON codec boundary when preserving the old payload contract. |
| Closures and continuation state | Calc compiles its separate expression language into closures capturing operand functions and argument cells, including save/restore for recursive calls (`apps/calc.js:263–356`). Agent snapshots guarded state and preserves the lifetime of pending notes and callbacks (`system/agent.js:131–139,495–509`). Agenda edit callbacks capture the selected edit (`apps/agenda.js:155–168,223–258`). | Keep lexical closure behavior. Use direct calls for statically known nonescaping functions, by-value immutable captures, and boxed cells for mutable captures that escape. A later explicit expression IR in Calc could replace per-node closures when graph, calculus and recursion tests agree. |
| Exceptions and async | Files narrows a handle, awaits Editor acceptance, and revokes the previous handle only on success (`apps/files.js:22–34`). Agenda re-reads before writing, invalidates stale selections, and reports recoverable failures (`apps/agenda.js:140–168`). Agent yields on restoration, polls transport tickets and waits for successful approved writes before reporting them (`system/agent.js:165–198,495–535`). Display batches transfer completion with `Promise.all` (`drivers/display.js:33–44`). | Keep structured try/catch/finally where it preserves recovery and lower async into event tokens and continuation states. Write errors and cancellation into typed completion values below the surface syntax. Retain an explicit bounded batch operation for Display. Remove general thenable duck typing from compiled code with an intrinsic future type. Keep host network polling separate from scheduling a handler. |
| JSON, events, and wire data | Agent JSON passes opaque provider reasoning/call output into the next request (`system/agent.js:264–278,338–374,420–432`). Inter-world events use a trusted sender identity, as shown by Files and Agent. The compositor consumes tagged UI trees and optional dimensions (`system/compositor.js:42–74`). | Statically closed records for trusted code, a versioned event ID and tagged schema per structured protocol, and explicit opaque JSON values for external documents. Preserve JSON at existing interoperability boundaries. Route kernel-provided sender identity outside application payloads. Keep byte quotas, status codes, and direct ownership checks. |
| Modules, reflection, and dynamic source | There are no class/module declarations or imports in the worlds. Prelude's two classes implement clock and handle behavior (`prelude.js:21–45`). Loader creates and runs source text held in a file (`apps/loader.js:5–20,41–59`), and Sandbox evaluates open-ended REPL text, including values that settle later (`system/sandbox.js:9–23`). | Use statically collected world declarations and static functions for device packages. Bring clock and handles in as built-in types/host imports. Preserve current QuickJS Sandbox and source-spawn paths as explicit execution modes if user-written JS remains supported. A dialect-only REPL is a separate product decision and must retain isolation and response behavior. |

### Ports of five applications

1. **Agent.** Decode stable provider envelope fields, keeping each opaque reasoning item as a raw JSON value. Validate a tool call's exact argument schema before changing state. Store the run ID, transport ticket, approval ID, deadline, and pending note in separate fields. Stage the write only for a matching decision from Chat. On successful file completion, emit the tool response and continue the same run. Use an app-supplied deadline in addition to native cancellation.
2. **Agenda.** Give `Task` explicit optional date, time and lead fields. Sort its validated ISO date strings and deduplicate neighboring values. Keep the text file read-modify-write check so an external task edit causes a reload. Compute calendar days through civil date operations. Compare reminder deadlines using epoch milliseconds in the device timezone and preserve a bounded fired-key dictionary over restarts.
3. **Files.** Declare `root: Option<FileDirectory>` and `given: Option<File>` in app state and decode list rows into `Entry` and `Truncated` cases. Sort entries by directory status and then name. Preserve the selected name after refresh. Narrow a new file, await Editor acceptance, and revoke and release the old handle before saving the accepted replacement. On failure revoke and release only the candidate.
4. **Calc.** Keep its user-facing calculator grammar and f64 evaluator. Tie each variable/function name to a bounded symbol table entry. Model `let` and function parameters as reference cells where compiled graph code can observe updates. Use tagged finite samples and gaps in plotting. Persist serialized source and settings, then rebuild the expression from source on restore.
5. **Sandbox.** Keep the dialect app's REPL UI and send only source plus an attached execution-mode choice to a dedicated evaluator world. Keep completion output, prior-session definitions, warnings and reject/throw reporting. For QuickJS mode the existing world remains the evaluator. If a dialect evaluator is added, meter its allocation, compile work, and execution separately while preserving the same capability boundaries.

Use short-circuit conditions and defaults deliberately. The 795 short-circuit nodes include real boolean conditions and fallback values, so a mechanical conversion to eager boolean operators changes evaluation and values. Similar caution applies to `String`, `Number`, regex captures and Unicode behavior. Provider byte limits count UTF-8 bytes (`system/agent.js:48–63,266–278`); editor cursor operations count display text or code points depending on the call. Keep conversion, string indexing, and regex behavior as library contracts or migrate the corresponding algorithms explicitly.

## The boundary the compiler must implement

- **Dispatch.** The QuickJS prelude decodes input, passes mutable world state and message metadata to a handler, and either packages a synchronous reply or registers asynchronous completion. The kernel tracks one active turn, drains continuation work on settlement, and applies deferred effects at a successful segment boundary. A fault drops that segment's staged effects. Stale settlements must stay tied to the world epoch, and a reply must complete at most once. For a dialect, compile direct event-ID dispatch plus per-await continuation state, preserving success, failure, reject-without-handler, restart and render timing. See `prelude.js:164–174,195–233`, `nucleus/kernel.c:213–262,419–452,683–762`, `nucleus/vm.c:1003–1047`.
- **Payloads.** Keep no payload distinct from a JSON null value. Preserve false, zero, and empty text. For interoperating worlds, retain JSON's omission of undefined record fields and its conversion of undefined, NaN and infinity array entries to null. At typed boundaries choose an explicit error or normalization policy for nonfinite values. Epoch milliseconds and Unicode must round-trip. World frames remain tagged UI data with optional fields. See `prelude.js:75–87,132–173,229–259` and `nucleus/vm.c:1007–1040`.
- **Capabilities.** QuickJS serializes a handle as a reserved singleton marker and carries a side list of grants. The handle wrapper cache preserves repeated-handle identity. The kernel validates ownership, grants on delivery, and enforces revocation. The current bundled CJI native ingress validates strict UTF-8 JSON (maximum nesting 64), collects distinct allowed capability markers (maximum eight), and checks grantability. Generic native messages reject reserved capability keys. Retained posts carry no grants. Represent handles as opaque typed values in compiled code and use the existing kernel authority and lifetime checks for all encodings. See `prelude.js:36–87`, `nucleus/native.c:125–252,375–386,513–550,590–605`, `nucleus/nucleus.h:44–55`.
- **Services and errors.** Files operations finish later. Preserve coherent state after a rejected request, and give code a stable error category for missing-file cases that currently check textual messages. Keep monotonic duration separate from wall-clock epoch and local timezone. Store writes are quota-bound and staged, with an error visible on later I/O failure. Agent network tickets are validated, world-owned and consumed once. See `prelude.js:18–31,129–162`, `nucleus/vm.c:196–201,653–736`, `nucleus/native.c:398–424`.

## Evidence and scope

| Run | Observed result |
| --- | --- |
| [QuickJS host and existing app logic tests](../various/catalog/host-suites.txt) | The offline Agent integration exercised Chat and Responses endpoints, calculator result, authenticated approval, note write/read, session restoration and migration, cancellation and a 53 KiB provider reply. The existing host app, Agent, Fs, Clock, Sys and Loader suites passed. |
| [Independent QuickJS host baseline](../various/catalog/host-oracle.txt) | Nine focused boundary assertions and three app outcomes passed. Boundary cases include no payload versus null and falsy values, Unicode and epoch JSON, suspend and resume, missing handler, repeated references to a real delegated file, revocation, plus Sandbox print, persistent session global, Promise fulfillment/rejection and synchronous throw. The catalog simulator wrote an Editor file from Files, normalized Agenda dates and persisted a fired reminder, and saved Calc's fraction and user-defined function output. |
| [Staged source simplifications](../various/catalog/source-rewrites.txt) | The same twelve host outcomes and 113 existing Node cases passed after replacing all 28 loose comparisons, all fourteen generic collection constructors in the worlds, and the Files boolean sort coercion. Ten maps became string tables, three sets became string sets, and Agenda took sorted unique date strings. The prelude's ID cache and identity set stay intact in this experiment. |
| [CJI machine-code checks](../various/catalog/native-source-fixtures.txt) | The local numeric-policy compiler emitted the unchanged function slices from Agenda and Files. Both matched the Node oracle as x86-64 machine code and as assembled RV32 in the emulator. Agenda covered timed task parsing, 15-minute lead, and invalid leap date. Files covered asynchronous list/info completion, directory ordering, preserving the selected file on reload, and fractional size formatting. The fixture supplied the filesystem rows. |
| [Native Wasm wire probes](../various/catalog/native-wasm-wire.txt) | Six targeted tests passed under the actual host kernel: request/reply including async completion and rejection, strict JSON, JS/Wasm message round trips, retained posts, screen schema, and storage. |

The staged code uses JavaScript to isolate observable migration choices. It measures portability of those choices under the exercised workloads. Its tables use ordinary JavaScript objects, leaving memory, cycle cost, complexity bounds and compiler code generation to separate experiments. The native slices isolate app functions. The full OS flows and capability boundary were exercised by the QuickJS and Wasm lanes above. The AST census leaves loaded scripts and REPL input outside its sample. Loader templates and REPL user input use a different execution boundary from catalog source.

### Reproduce

From the repository root, build the host as needed with `make -C picocalc-os`. Resolve the ticket path and run the scripts below. The audit and rewrite scripts need Acorn. The preserved run used Node 24.18.0 and Acorn 8.15.0. The host experiments used the x86-64 QuickJS simulator with the deterministic filesystem seed and no provider traffic.

```sh
ticket=$(find ttmp/2026/11/18 -maxdepth 1 -name '*CJI-DIALECT*')
node "$ticket/scripts/catalog/audit.cjs" picocalc-os/js
python3 "$ticket/scripts/catalog/host-oracle.py"
python3 "$ticket/scripts/catalog/host-oracle.py" --rewrites
python3 "$ticket/scripts/catalog/native-oracle.py" --rv32 --compiler /tmp/cji-dialect-numeric-local-r1/source/cji.js
make -C picocalc-os test-apps test-agent test-fs test-clock test-sys
python3 picocalc-os/tests/test_native_worlds.py \
  WasmWorldTests.test_asks_replies_rejections_and_later_answers \
  WasmWorldTests.test_payloads_must_be_strict_json_without_handles \
  WasmWorldTests.test_messages_to_and_from_javascript \
  WasmWorldTests.test_a_retained_post_reaches_a_listener_that_starts_later \
  WasmWorldTests.test_screens_are_json_objects_and_presentation_is_declared_at_start \
  WasmWorldTests.test_storage
```

The CJI machine-code check uses the probe sources in `scripts/catalog/native-*-driver.js`, the local-policy compiler from the ticket's [numeric build](../scripts/numeric/build.sh), and the saved CJI snapshot's assembler and RV32 test firmware. The scratch compiler path is a parameter. The receipt preserves SLIR SHA-256 for the x86-64 run and object SHA-256 for RV32. These are emulator and host results.

The broad Linux native-process test target was stopped after multiple errors. The selected Wasm cases completed through the real kernel and supply the wire evidence in this report.
