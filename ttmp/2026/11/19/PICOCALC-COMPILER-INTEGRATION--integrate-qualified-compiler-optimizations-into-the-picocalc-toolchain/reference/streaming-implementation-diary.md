---
Title: Production per-function streaming integration diary
Ticket: PICOCALC-COMPILER-INTEGRATION
DocType: reference
Status: complete
Topics: [picocalc, native, performance]
---

# Production native per-function streaming

## Step 1. Choose the ownership and callback boundary

The production frontend checks one function at a time and has its final local count, signature and operation array when it registers that function. I added an optional callback at this point in the shared parser. When requested, the native compiler lowers that function and disconnects the input array from its descriptor before the parser begins another function. The same frontend continues to produce framed Wasm bodies for Wasm consumers.

### Prompt context

The owner clarified the first two compiler experiments to the supervisor. The supervisor's implementation assignment was:

> User confirmed numeric operands + streaming meant as the first two. Own implementing the production streaming selection now. I revert e082ec3 on main to 4452064 code; wait for that revert before committing or base work on 4452064. Implement optional native per-function streaming in shared production compileFunctions/typedRv32.compile pipeline, keep default buffered and preserve rejection order for late frontend vs early backend errors (defer/report first backend failure after frontend validation), complete wrapper propagation where appropriate. Parent owns firmware option/build/qualification, docs/publication. New integration ticket already exists, add streaming parity/fixtures and technical diary and commit scoped paths. Coordinate with me on public compiler option signature quickly; suggest fourth parameter {streamFunctions:true} for typedRv32.compile, optional third for world wrappers. Do not put back bounds. Notify when source compiles; prioritize.

The public JavaScript interface agreed with the supervisor is `typedRv32.compile(source, imports, maxSourceLength, {streamFunctions: true})`. Each public native world wrapper takes `options` after its ordinary source and reactor arguments. Callers omitting it use buffered numeric operations.

### What I did and why

- Based edits on the source tree after `3785155` reverted the separate bounds transformation. Inspected both the numeric function emitter introduced by `4452064` and every native world wrapper. Files and Agenda use the default source length and imports, and the typed world wrapper passes the Editor-specific limit and SDK signatures.
- The parser invokes its optional `onFunction` immediately after checking the reserved name, uniqueness and declaration index. RV32's individual lowering step now builds its targets and callable table in declaration order for both modes. The language allows calls to imports and earlier functions; every target referenced while lowering exists. The native output retains symbolic jump targets until every function's final address is available.
- RV32's stream callback catches the first native failure, continues source checking and suppresses later native work. The parser can still report a later type, syntax or duplicate declaration error first. At the end of a successful parse the compiler throws the stored native error if one exists. In buffered mode native lowering starts only after the entire source is valid.
- The stream callback clears `fn.code` after consumption even if lowering failed or a previous native error is pending. The frontend preserves signatures, names and record layouts. Native `FunctionCode` objects point to those descriptors; leaving their code property populated would retain all input arrays. Output words and jump records must remain live until assembly.

### What worked

An initial public `compileFilesRv32` call produced the same 24,424-byte ELF in both modes. The production entry scripts became available to the supervisor for the firmware build as soon as that check passed.

### What was tricky to build

Changing declaration order, frame sizing or the public result format would increase the scope of this feature. The solution uses a callback after the source function is complete and shares the link and image assembly code. Suppressing a native throw until frontend checking concludes preserves the observable class and message from the buffered compiler.

### What didn't work

The first full differential test, `node "$TICKET/scripts/check-streaming.mjs" /tmp/p4-production-integration.8lS0KwKZ/build/esp-idf/main`, hit `Error: spawnSync git EPERM` from Node v24.18.0 while reading the immutable control. A scoped approved rerun of the same command completed all fixtures.

### What I learned and what warrants another pair of eyes

The metadata-only need for later declarations and linking is narrower than the original function descriptor, whose operation array is the expensive part. A future language with forward calls would need a different declaration protocol. The firmware's time and memory limits can cause resource-dependent failures, even when ordinary language and backend diagnostics agree. The supervisor owns physical qualification and requested an independent implementation review.

### Review instructions

Read `compileFunctions` in `picocalc-os/compiler/typed-wasm.js`, the `lower` and `consume` functions in `picocalc-os/compiler/typed-rv32.js` and the three public native wrappers. With the linked reactors from the integration ESP-IDF build, run `node "$TICKET/scripts/check-streaming.mjs" "$BUILD/esp-idf/main"`. The test invokes the real public world linkers, compares exact image and metadata and verifies that the streamed callback cleared the actual operation array before returning.

## Step 2. Check real compilers, resources and rejection order

I verified both native options against the historical production compiler and exercised the existing Wasm consumer of the same frontend. These checks distinguish byte-identical output from accidentally testing the buffered path twice. The test observes the real requested callback at each completed function and asserts it released the operations synchronously.

### What I did and what worked

Files, Agenda and Editor invoked the callback 7, 34 and 120 times, respectively. Buffered mode invoked none. All three native worlds produced the same machine image, entries, record layouts, signatures, relocations and linked executable as the frozen control. The public Wasm wrappers produced byte-identical validated modules.

A 136-function source tests a call to function 134, an imported call with a relocation, a high-numbered local, a high record field offset and the minimum signed integer constant. All images and metadata matched. Eight deliberately rejected calls test arity, excessive frame size, the first of two native errors in both orders, later source type and duplicate errors, forward calls and the maximum source length. Both modes produced the control's exact class and message.

### What remains outside this checkpoint

The test uses Linux Node to run ordinary JavaScript and existing reactor inputs. Cold compiler memory and latency must be measured using the integrated firmware selection on the physical P4. The supervisor handles the board and the independent examiner reviews the production change.

## Step 3. Pin the qualification receipt

The production JavaScript, test and initial diary were committed as `2317696`, “Allow native PicoCalc compiles to consume one function at a time.” I reran the entire parity fixture with `2317696` as its explicit source argument. The resulting [streaming parity receipt](../various/streaming-parity.json) records the native and linked ELF hashes and the corresponding Wasm module hashes for all three worlds.

The independent examiner also reported that the working implementation passed its diagnostic, fixup, artifact and retained-heap probes. I supplied the committed revision for its separate final qualification. The supervisor owns the report of physical firmware behavior.
