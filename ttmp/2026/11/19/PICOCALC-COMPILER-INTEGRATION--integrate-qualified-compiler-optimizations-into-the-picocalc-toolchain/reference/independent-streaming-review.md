---
Title: Independent review of per-function native compilation
Ticket: PICOCALC-COMPILER-INTEGRATION
Status: complete
DocType: reference
Topics: [picocalc, native, performance]
---

# Independent review of per-function native compilation

**Verdict.** I found no blocking defect in the JavaScript compiler integration at `2317696`. Compared with buffered revision `3785155`, the optional streaming path produced identical native images, public metadata, world artifacts and tested JavaScript error diagnostics. A live-object measurement confirmed that completed operand arrays were collectible by the time the next tested function finished parsing. The review concerns the production JavaScript entry points. It uses host V8 for heap observation and leaves ESP32-P4 memory and timing qualification to the integration supervisor.

## What streaming releases

Each numeric function body contains an array of JavaScript numbers representing opcodes and decoded operands. The native lowerer reads the array once and builds machine instruction words. When streaming is selected, `compileFunctions` calls its supplied consumer after a function has passed its frontend checks. The consumer lowers the function and clears the descriptor's `code` field. The same descriptor can remain in the list of declarations or lowered functions without retaining its original array.

The compiler still retains the source, function signatures, record layouts, target labels, machine words and unsettled jumps until it can assemble a complete image. In particular, its function metadata grows with the number of functions. Only the measured intermediate operand arrays have the lifetime shown here.

I substituted a tagged Array subclass for the ordinary body allocation in a test-only copy of the compiler and sampled V8's live object count immediately before the numeric emitter returned each selected function. This was a separate instrumented run. The artifact and diagnostic comparisons used unmodified compiler sources.

| Calls into the numeric emitter | At body 1 | At body 8 | At body 16 | At body 32 |
|---|---:|---:|---:|---:|
| Buffered, successful source | 1 | 8 | 16 | 32 |
| Streamed, successful source | 1 | 1 | 1 | 1 |
| Buffered, native arity error in the third function | 1 | 8 | 16 | 32 |
| Streamed, same native error | 1 | 1 | 1 | 1 |

The current function's array is necessarily live at each observation. The error case matters because lowering stops after the first backend failure, while the frontend must keep parsing. Clearing the operand reference for subsequent functions prevents outstanding data from accumulating on that path. These counts characterize reachability at the four sampled points. Actual byte usage also depends on array sizes, implementation metadata, allocator accounting, and engine garbage collection.

## What must survive until assembly

A call to a previously declared function can be lowered before the callee's final position in the joined image is known. The compiler records which target a jump refers to and fills the displacement after computing all function starts. Imported calls need a relocation describing the import's index; the linker later connects the generated call to its runtime entry. The frontend still makes a declaration visible after its body, which preserves the existing rejection of forward calls and unannounced recursion.

The independent fixture crossed index 127 with 130 imports and 138 definitions. It included ordinary backward calls, branch-dependent returns, and valid source names `__proto__` and `constructor`. Its entire 7,252-byte machine image matched the buffered image. Both backends reported import index 129 at code offset 20 and index 0 at offset 84. Entry offsets, record layouts, signatures and relocation arrays matched, and the two special names remained own entries in the public mapping. Running the same valid compilation again after rejected inputs produced the same image and metadata.

## Which error reaches the caller

Buffered compilation gives any frontend rejection precedence over a backend error because it parses all functions first. The streaming consumer records the first lowering error and continues parsing. If the frontend succeeds it reports the recorded error. If the frontend fails its own error reaches the caller. A change that immediately threw on an early unsupported native function would alter diagnostics, even though successful images could still agree.

Thirteen cases compared exact JavaScript error class and message, including source line and column where emitted. These cover a later type error after an earlier nine-argument function, a later unknown function after a frame-size failure, a reserved export, duplicate or colliding declarations, a self-call and forward call, malformed syntax, empty and comment-only input, an explicit source limit, and both orderings of two backend errors. Error order matched in the buffered and streaming modes. The Wasm compiler still validated a nine-argument function, a signature the native backend rejects.

## Public entry points

All three native world wrappers forwarded `{streamFunctions:true}` to the real frontend consumer. Omitting that option selected buffering. I observed consumer selection directly because equal artifacts alone could not establish which path ran. The tracked Wasm and native wrappers linked against the same corresponding reactor bytes in each comparison.

| World | Native linked ELF bytes, either mode | Comparison with buffered baseline |
|---|---:|---|
| Files | 24,424 | Both native modes and the Wasm output matched byte for byte. |
| Agenda | 66,364 | Both native modes and the Wasm output matched byte for byte. |
| Editor | 240,452 | Both native modes and the Wasm output matched byte for byte. |

The source hash maps, all six output hashes, reactor identities, the exact diagnostics and the live counts are in `various/examiner-streaming.json`. The earlier `examiner-comparison.json` belongs to the reverted direct-bounds experiment. Its oracle now verifies all six labeled compiler-module hashes before evaluating the historical snapshots.

## Reproduction

Run from the repository root with Bash, Node v24.18.0 and the three native reactor ELFs from the integration build. The `native_reactors` variable in the command is the path used for this experiment.

```bash
tickets=(ttmp/2026/11/19/PICOCALC-COMPILER-INTEGRATION--*)
ticket=${tickets[0]}
native_reactors=/tmp/p4-production-integration.8lS0KwKZ/build/esp-idf/main
snapshot_dir=$(mktemp -d)
for revision in 3785155 2317696; do
  for module_file in compiler/{typed-wasm,typed-rv32,typed-world}.js worlds/{files,agenda}/compile.js; do
    mkdir -p "$snapshot_dir/$revision/${module_file%/*}"
    git show "${revision}:picocalc-os/$module_file" > "$snapshot_dir/$revision/$module_file"
  done
done
node --disable-warning=ExperimentalWarning "$ticket/scripts/examiner-stream.mjs" \
    "$snapshot_dir" "$native_reactors" 2317696 > "$snapshot_dir/result.json"
cmp "$snapshot_dir/result.json" "$ticket/various/examiner-streaming.json"
```

Other integration builds can provide the three native reactor files. To reproduce the stored hashes, their contents, the three Wasm reactors under `picocalc-os/build`, and the world sources must match the captured run.
