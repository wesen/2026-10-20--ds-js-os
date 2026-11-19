---
Title: Independent review of the production operand and bounds integration
Ticket: PICOCALC-COMPILER-INTEGRATION
Status: complete
DocType: reference
Topics: [picocalc, native, performance]
---

# Independent review of the production operand and bounds integration

**Historical qualification.** The direct bounds integration was reverted in `3785155`. This archived comparison uses compiler inputs from `e202e94`, `4452064`, and `e082ec3`, verified against their recorded digests. The subsequent streaming review is a separate experiment.

**Verdict.** I found no blocking correctness defect in the buffered numeric handoff at `4452064` or the direct bounds pass at `e082ec3` for the supported typed frontend and its ordinary runtime contract. Pinned snapshots reproduced byte-identical native code and metadata and identical Wasm bytes for the numeric change. The subsequent bounds change altered the selected instruction sequences and preserved application results, object checks, and observable memory throughout the review workload.

## Implementation and test boundaries

The numeric emitter writes a JavaScript number for each opcode and operand, including signed constants and indices. The native lowerer consumes one cell for each. Wasm emission still writes variable-width integers. The direct pass shares the parser and inserts or omits a complete check sequence in whichever representation the caller selected. A deferred interval uses offsets in its own function's code array, so its length can differ between the two representations. Decoding both representations and comparing instruction tuples verifies that each retained or removed interval denotes the same operations.

The 20 fixture functions combine early returns, branch merges, short-circuit effects, loop-carried values, and object reads and writes. Sixty argument combinations per function vary the header length, index, branch choice and whether a record aliases the buffer header. Each of 1,200 invocations runs under four configurations. The original and candidate Wasm binaries run in Node's Wasm engine. The corresponding original and candidate RV32 images run in the earlier research ticket's instruction interpreter. The comparison covers return value or object trap and all 1,024 application bytes initialized by the fixture. There were 246 trapping inputs. This exercise does not execute a P4 trap, link a full app reactor, or measure device performance.

| Boundary | Observation |
|---|---|
| `e202e94` → `4452064` | Entire native image and metadata matched, and the standalone Wasm binary matched. The native image SHA-256 was `1eb1897e0ff6f6922fbf6db412014fb9156dbe82f59d00da9d63ff68538ff9d7`. |
| `4452064` → `e082ec3` | All 1,200 inputs matched in both engines. The candidate retained exactly the independently expected guards in each function. |
| Variable-width operands | A successful loop proof with a local index above 127 produced identical decoded Wasm and numeric instruction tuples. |
| Deferred compaction | A proved interval between two rejected intervals preserved the surrounding checks. A loop with 17 eligible sites removed 16 and retained one. |
| Bound on live facts | An induction variable introduced after many unrelated nonnegative constants could lose its candidate lower bound. Both targets retained the original check. |

## Why the three control transfers work

**Branches.** An early `if (...) return ...` falls through only on its false path. A call that clears a header while evaluating the *return value* affects the returning path. The false edge still has its original facts. An ordinary `if (...) { ... }` can fall through its true arm, so only facts shared by both continuing paths survive. In the fixture one form drops the later check and the other retains it. Reversing a short-circuit test so the potentially mutating call precedes the length comparison permits a removal. Placing that call after the comparison requires the reload.

**Loops.** Facts about the incoming state refer to first entry. The compiler discards them before evaluating the repeated condition. It can tentatively carry a known nonnegative scalar into the loop body when the true condition directly establishes `i < receiver.length`. If a single body-level assignment advances `i` by one, this strict signed bound excludes `INT32_MAX` before the increment. Neither multiple assignments nor an assignment nested in a conditional can justify that induction here. An admitted check stays in the stream until the rest of the function has confirmed the candidate. A conditional assignment after an access, a write in an inner loop, and an inclusive guard at signed wrap all retained the original guard.

**Effects and ordering.** A local reassignment forgets facts for the assigned local as index or receiver. A store through a record or buffer can alias the counted object's header. Calls include effects through the SDK; for example, `picocalc-os/sdk/typed/world.c` writes a new length in `typedSdkView`. The compiler invalidates facts after the call or store. For `setCharCodeAt(index, value)`, the production emitter performs the check before evaluating the value expression. The review cases independently check both outcomes. An already proved check can be removed even when the RHS then mutates the header. An unproved invalid position still traps before the RHS has any effect. An empty literal can still evaluate a mutating position expression.

## Native execution boundary

The object check compares the supplied position with the counted object's length. A proof uses the typed runtime contract for the receiver and the current header under ordinary single-threaded evaluation. The same computations can run in Wasm or in native ELF code while their execution environments provide different protection. The Wasm engine performs linear-memory checks. The P4 native backend calls trusted machine code on the kernel task, accounts for its allocations, and observes a time overrun after control returns. Local object-range optimizations confer no cross-world memory isolation or preemption.

The machine-mode execution contract appears in `picocalc-os/port/esp32p4/optional/native_elf/native_elf_p4.c`, especially `elf_event`. Its opening comment's manifest-only origin description predates a development path. In `picocalc-os/port/esp32p4/compiler/install.c`, the compiler can stage an artifact and call `kernel_develop` to activate it, tracking source, firmware and artifact identities. The two integrated compiler revisions change neither mechanism. Treat the qualified semantic claim and native module admission as separate properties when describing this work.

## Reproduction

From the project root, run the following in Bash. All compiler code is extracted by revision, and the test stores its temporary snapshots in a fresh directory.

```bash
tickets=(ttmp/2026/11/19/PICOCALC-COMPILER-INTEGRATION--*)
ticket=${tickets[0]}
snapshots=$(mktemp -d)
for revision in e202e94 4452064 e082ec3; do
  for module in typed-wasm typed-rv32; do
    git show "${revision}:picocalc-os/compiler/${module}.js" > "$snapshots/$revision-$module.js"
  done
done
node "$ticket/scripts/examiner-compare.mjs" "$snapshots" > "$snapshots/result.json"
cmp "$snapshots/result.json" "$ticket/various/examiner-comparison.json"
```

The receipt records Node and all six compiler-source digests. The observed native instruction counts belong to this synthetic assignment and trap mixture. The source and dynamic histograms are small enough to inspect by function. Full application and board qualification are recorded by the integration supervisor.
