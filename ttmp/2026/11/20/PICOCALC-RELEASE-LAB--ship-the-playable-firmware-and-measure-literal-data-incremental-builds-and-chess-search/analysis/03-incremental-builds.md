---
Title: Which parts of a handheld build survive an edit?
Ticket: PICOCALC-RELEASE-LAB
Status: complete
Topics: [picocalc, esp32-p4, native, performance]
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-RELEASE-LAB--ship-the-playable-firmware-and-measure-literal-data-incremental-builds-and-chess-search/scripts/incremental/02-fragments.js
      Note: Exact-text reuse and symbolic relocation replay
    - Path: repo://ttmp/2026/11/20/PICOCALC-RELEASE-LAB--ship-the-playable-firmware-and-measure-literal-data-incremental-builds-and-chess-search/scripts/incremental/summary.json
      Note: Host, board, heap and durable checkpoint results
ExternalSources: []
Summary: Retaining native fragments shortened local Editor and Chess recompiles on the PicoCalc. Interface edits rebuilt the full image, and checkpoint writes dominated the measured persistent path.
---

# Which parts of a handheld build survive an edit?

Research article by Claude Opus 5.5 (High). The study operator implemented the candidate, ran the ESP32-P4 measurements and checked the article against the code and receipts. [Commissioned draft](../scripts/incremental/14-opus-article-draft.txt) [Authorship receipt](../scripts/incremental/14-opus-article-receipt.json)

The Editor and Chess applications on the PicoCalc ESP32-P4 are compiled on the device. The compiler turns their Typed source into a native RISC-V ELF image. On one 360 MHz core, a warm full compile takes about 2.2 seconds for the current Editor and about 3.2 seconds for Chess. The experiment asked three questions.

1. Which parts of the previous build can be reused after an edit?
2. How much time does reuse save on the board?
3. What does reuse cost in memory and storage?

Across the measured release sources, three results recur.

- **Body edits.** When only one function body changed, reusing the other compiled functions reduced the measured compile to about 39% of the clean time for Editor and 18% for Chess.
- **Signature and layout edits.** When a function signature or a record layout changed, the prototype reused nothing. It was then 4–8% slower than a clean compile.
- **Persistence.** Writing the reusable state to FAT storage took longer than the clean compile it was meant to replace.

## What survives between builds

A **function fragment** is the compiled form of one function, kept so that a later build can reuse it. Each fragment contains four pieces of information.

- the exact source text of the function body;
- the array of 32-bit instruction words produced for that body;
- a list of call sites inside those words;
- the call-graph edges recorded when the body was first analysed.

The **call graph** records which functions call which. The compiler traverses this graph to reject recursive call cycles. The async transformation separately checks suspension rules. A reused body is not parsed again, so the session replays the stored edges. This keeps the graph complete.

**Relocation** is the step that patches addresses into code after layout. A RISC-V call instruction encodes the distance to its target. That distance is known only after every function has been placed in the image. Each relocation stores four values. These identify the source word, the index of an imported or internal target, an offset for a fixed target when the index is negative, and the destination register. The linker patches these on every build. If a function earlier in the image grows, every later fragment moves. Its words remain valid, but its calls must be re-patched.

The **ABI** (application binary interface) is the set of conventions that compiled code assumes. It includes:

- which registers carry which arguments;
- what each function returns;
- the offset of each field in each record;
- the values of enums;
- how an asynchronous function stores its state across a suspension.

Depending on the operations in its body, a fragment can depend on any of these assumptions. If any of them changes, a fragment can be wrong even though its body text is identical.

A cache of **complete ELF images** can return an earlier binary when the entire source and compilation environment match. Changing one function changes this whole-image key. Fragment reuse keeps per-function code and links a new ELF on every build. The output is new, and on a local body edit most instruction words can come from the preceding in-memory generation. Layout and relocation always run.

## The invalidation rule

The prototype reuses a fragment only when two equality tests pass ([design](../design-doc/03-incremental-builds.md)).

1. **Program descriptor.** At initialisation, the session serialises a descriptor of the program's entire interface:
   - every import, with its parameters, its result, and whether it is awaitable;
   - every function, with its name, parameters, parameter names, and result, in source order;
   - every record with its fields in order;
   - every enum;
   - the distinct types;
   - the async-lowering prefix and the start-record fields.

   If this string differs from the previous build's descriptor by any character, all lookups in the previous root miss for this build. The harness supplies the backend-version and ABI identities.

2. **Body text.** For each function, the stored body text must appear verbatim at the function's body offset in the new source.

Because the descriptor fixes the order of the function list, a stored target index always refers to the same function.

## Setup and what each clock covers

The board was a PicoCalc ESP32-P4 running on one 360 MHz core. Both arms used the same components:

- matching checked compiler sources;
- the production native token index;
- the async transformer;
- an aligned PSRAM JavaScript allocator;
- the SDK reactors;
- the full current release sources for Editor (69,884 bytes) and Chess (61,022 bytes).

The measurement task had an 80 KiB internal stack and a 56 KiB JavaScript stack guard. Both arms ran on the same QuickJS engine. The shipping compile policy for Editor and Chess is 4 MiB of heap and 6 seconds.

| Measurement | Starts | Ends | Included | Excluded |
| --- | --- | --- | --- | --- |
| Warm pair | Compiler call with edited source | Complete linked ELF | Lookup, lowering, linking | Correctness checks, executing the app |
| Fresh trial | JS runtime construction | Complete linked ELF | Compiler evaluation; building source and reactor inputs from embedded bytes | Storage fetch of the bundle; executing the edited app |
| Checkpoint | Serialisation | ELF of the first body edit | Encode, exclusive write, read, decode, child build | A second checkpoint; power loss; editor UI latency |

Each app and edit received three alternating warm pairs within one boot. Each pair compared two compilers on the same edited source:

- the stock compiler;
- a fragment session holding the retained root of the preceding revision.

After the clock stopped, the harness compared the output bytes exactly and checked them against a trusted CRC from a clean host build.

## A worked example: one body edit in Editor

The base Editor revision is first compiled by a fragment session with no prior state. That session compiles all 119 functions and commits a root containing their fragments.

The edit changes the return expression in `editorPreviewSlot` from `(row % 36) * 100` to `(row % 36) * 99 + 1`. [Edit generator](../scripts/incremental/04-edits.js) Signatures, records and enums are untouched. The session then proceeds as follows.

1. **`init`** builds the descriptor. It matches the stored one, so the prior root becomes available.
2. **`lookup`** runs once per function, in source order.
   - For 118 functions, the stored body text matches at the new body offset. The offset itself may have shifted, because text before it changed. The session pushes the stored call-graph edges and marks the fragment reusable.
   - For the edited function, the comparison fails. The lexer skips the new body to record its text, and the function is marked for rebuilding.
3. **`lower`** produces code for each function.
   - For reused functions, it copies the stored words. It turns each stored call index back into a reference to the current target function.
   - For the edited function, it runs the real lowering. It then saves the new words, with each call target converted to an index.
4. **The linker** places all 119 functions and assigns addresses. It patches every call, including the calls inside reused fragments, and emits the complete ELF.

The result is a 242,124-byte image with SHA-256 `3a2a453f…d858`, identical to the clean host build. [Host identities](../scripts/incremental/host.json)

On the board, the fragment session's median was 878.3 ms. The stock compiler's median was 2,231.8 ms. The fragment session was faster in all three pairs.

## Board results

Data: [physical](../scripts/incremental/physical.json), [summary](../scripts/incremental/summary.json).

| App | Edit | Clean median (ms) | Fragment median (ms) | Ratio of medians | Median paired ratio | Pairs faster | Reused / rebuilt |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Editor | Body | 2,231.8 | 878.3 | 0.3935 | 0.3926 | 3 of 3 | 118 / 1 |
| Editor | Signature | 2,243.1 | 2,427.8 | 1.0824 | 1.0840 | 0 of 3 | 0 / 119 |
| Editor | Layout | 2,247.1 | 2,430.6 | 1.0816 | 1.0817 | 0 of 3 | 0 / 119 |
| Chess | Body | 3,235.9 | 591.3 | 0.1827 | 0.1826 | 3 of 3 | 81 / 1 |
| Chess | Signature | 3,231.8 | 3,367.9 | 1.0421 | 1.0421 | 0 of 3 | 0 / 82 |
| Chess | Layout | 3,241.5 | 3,377.2 | 1.0419 | 1.0394 | 0 of 3 | 0 / 82 |

The table gives two aggregates, which answer different questions.

- The **ratio of medians** divides the typical fragment time by the typical clean time.
- The **median paired ratio** computes a ratio inside each pair, from two runs taken close together in the same boot, and then takes the middle of the three ratios.

The two agree when pair-to-pair variation affects both arms equally. Chess layout is the clearest case where they differ: 1.0419 against 1.0394. Neither number is pooled across apps. "3 of 3" is a count of observations, not a confidence interval, and three pairs support no interval claim.

In absolute terms, a body edit saved 1.35 s for Editor and 2.64 s for Chess. A signature or layout edit added 185 ms for Editor and 136 ms for Chess.

## Why signature and layout edits now cost more than in LAB2

The earlier LAB2 prototype used a selective rule. [Earlier physical Editor study](../../../19/PICOCALC-EDITOR-FRAGMENTS--bound-native-function-fragments-and-time-real-picocalc-editor-edits/analysis/01-what-it-costs-to-rebuild-the-typed-editor-after-a-real-edit.md) Each function was fingerprinted against the interfaces it used, and a whole-record fingerprint stood in for each record it touched. Under that rule, some interface edits still allowed partial reuse:

- **Signature edit.** Changing one helper's signature, along with its three callers, rebuilt 4 of 120 functions.
- **Record-layout edit.** Changing a record layout rebuilt 77 of 120.

Measured on the board, the first-boot signature case took 576.1 ms against a 2,309.7 ms clean build. The first-boot file-handle layout case took 2,135.4 ms. The current rule compares the entire interface as one string. Any signature or layout change therefore discards all fragments.

The conservative rule costs more than a clean compile for a simple reason: the session still does its bookkeeping even when nothing can be reused. It:

- serialises the descriptor;
- re-scans every body to capture its text;
- copies the instruction words;
- converts call targets to indices;
- keeps the old and new roots alive together.

The measured total of this work is about 8% of the Editor compile and 4% of the Chess compile. The run did not break that total down by component.

The reason for accepting this cost is correctness. A selective rule must find every dependency of every function:

- a function that reads a field depends on that field's offset;
- a caller depends on the callee's argument registers;
- an async caller depends on whether the callee can suspend.

If the rule misses one of these, the result is a fragment that links without error and computes wrong values. The whole-descriptor rule invalidates every body whenever any recorded interface fact changes. Its correctness still depends on the descriptor covering every relevant assumption and on faithful replay of calls and dependencies. Clean-build comparisons exercise those conditions for the edits in this study.

The two sets of timings cannot be compared directly. LAB2 differed in several ways:

- It used an older source revision, with 120 functions and a 240,452-byte ELF.
- It used different edits.
- It ran on two boots.
- Its clock stopped at native return, after relocating the ELF and calling into it.
- It capped retained native payload at 256 KiB or 40 KiB. The current prototype retains every fragment.

LAB2's body edit (487 ms) was also faster than the current one (878 ms), even though LAB2's clock covered more steps. This data does not explain that difference. What the comparison does establish is the count: 4 or 77 rebuilt functions under the selective rule, against all of them under the current rule.

## Cold builds and attributable memory

Each fresh trial ran one observation per arm per app. Both arms produced the same output CRC (3763014618 for Editor, 178518363 for Chess).

| App | Clean (ms) | Fragment-recording (ms) | Time change | Clean peak (bytes) | Fragment peak (bytes) | Peak change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Editor | 2,552.4 | 2,768.2 | +8.5% | 2,554,092 | 3,066,112 | +512,020 (+20.0%) |
| Chess | 3,577.5 | 3,717.0 | +3.9% | 3,186,424 | 3,908,360 | +721,936 (+22.7%) |

A first build that records fragments is slower and uses more memory. These fresh peaks are the attributable numbers. Each covers one compiler, from runtime construction to the complete ELF.

All four peaks are below the 4,194,304-byte policy, and all four times are below 6 s. The Chess fragment peak leaves 285,944 bytes of margin.

The warm harness peaks were 18,745,176 bytes for Editor and 8,938,604 bytes for Chess. These peaks cannot be assigned to a single session, because the harness held all of the following at once:

- two compilers;
- both roots;
- spare correctness images.

The warm harness also enforced no heap or time cutoff. The data therefore does not show that a warm retained session fits the shipping 4 MiB policy.

## Persisting fragments on the device

The checkpoint path tests whether retained state can survive the end of a session. The sequence was:

1. Serialise the root.
2. Write it to an exclusive temporary file on FAT, then fsync and close it.
3. Reopen the file and read it back.
4. Compare the readback CRC with the serialized bytes.
5. Decode the JSON in QuickJS and check the compiler, reactor and application identity.
6. Build the first body edit from it.

| Checkpoint measurement | Editor | Chess |
| --- | ---: | ---: |
| Checkpoint size (bytes) | 292,438 | 681,313 |
| Encode (ms) | 180.9 | 319.0 |
| Write (ms) | 3,151.4 | 7,431.7 |
| Read (ms) | 54.1 | 124.1 |
| Decode (ms) | 173.0 | 342.6 |
| Child build (118/1, 81/1) (ms) | 874.0 | 589.6 |
| Not attributed to a component (ms) | 189.1 | 195.8 |
| Total, checkpoint to edited ELF (ms) | 4,622.5 | 9,002.9 |

The child builds match the in-memory results, so a restored root gives the same reuse as a retained one. The write, however, dominates the total. It accounts for 68% of the Editor path and 83% of the Chess path, at an effective rate of about 92 kB/s.

The full path took 2.07 times the warm clean Editor compile and 2.78 times the warm clean Chess compile. It is also longer than the fresh clean compile for both apps.

The read-side components (read, decode and child build) sum to 1,101 ms for Editor and 1,056 ms for Chess. The unattributed time could belong to either the write side or the read side, so these sums are a lower bound on the read-side cost. The measurement does not determine whether the write could be moved off the edit path.

The physical run wrote no second checkpoint for the child build. It does not establish recovery after power loss.

## Host results

Data: [host](../scripts/incremental/host.json). The host ran Node/V8 in five rotated blocks. Every arm includes the public compile plus hashing of the ELF and its async metadata.

The arms differ as follows:

- **Clean** is the stock compiler.
- **RAM** retains the previous root in memory.
- **Disk** adds a durable path: read the input checkpoint, hash and decode it, compile, write the new checkpoint, fsync it, rename it into place, and fsync the directory. This is an atomic commit. The device test, by contrast, was an exclusive temporary-file round trip without a rename.
- **Cold-cache** records fragments starting from nothing.
- The **base** row means recompiling unchanged source against a valid previous version.

All values are medians in milliseconds.

| App | Edit | Clean | RAM | Disk | Cold-cache |
| --- | --- | ---: | ---: | ---: | ---: |
| Editor | Base | 15.99 | 9.73 | 21.51 | 17.52 |
| Editor | Body | 20.03 | 9.82 | 20.48 | 20.08 |
| Editor | Signature | 17.66 | 18.06 | 26.37 | 17.00 |
| Editor | Layout | 15.74 | 15.03 | 27.12 | 13.89 |
| Chess | Base | 11.12 | 3.31 | 16.70 | 15.88 |
| Chess | Body | 8.33 | 4.85 | 16.95 | 9.99 |
| Chess | Signature | 8.83 | 9.99 | 23.34 | 9.89 |
| Chess | Layout | 8.53 | 9.42 | 22.47 | 9.93 |

Three patterns stand out:

- RAM was faster than clean for unchanged and body-edited sources in both apps.
- RAM was slower than clean for signature edits in both apps.
- Disk was slower than clean in all eight cells.

The Editor layout edit finished sooner on the host in both the RAM arm (15.03 ms) and the empty-cache arm (13.89 ms) than in the clean arm (15.74 ms). Both arms rebuilt every function. The measurements do not establish a cause for this host ordering. On the physical board all three pairs favored the stock compiler for this edit.

The host integrity controls rejected checkpoints with a stale identity and checkpoints that had been truncated.

## Correctness controls

Data: [controls](../scripts/incremental/controls.json), [fragment correctness](../various/fragment-correctness.json).

**Byte identity.** Each accepted timed edit matched a separate full board build byte for byte, and its CRC matched the trusted clean host result. The host gold images are 242,124 bytes for Editor and 274,892 bytes for Chess, and each has a recorded async-metadata hash.

**Diagnostics with no reuse.** The diagnostic revision "bad" changes a signature, so no fragment can be reused. In the board diagnostic check it produced the clean compiler's error message:

- Editor: `SyntaxError: 730:53: expected ,`
- Chess: `SyntaxError: 146:32: expected ,`

**Diagnostics after reuse.** On the host, two further errors were placed after reusable functions: a body type error and invalid syntax. In both cases the session reused the earlier fragments (54 in Editor, 4 in Chess), rebuilt the faulty function, and reported the correct position. For example, Editor reported `726:36: unknown local undefinedIncrementalName`.

**Async rejection.** A synchronous caller that used an async result was rejected with `call async function editorPreviewSlot with start or await`. The rejection happened before any fragment lookup took place.

**Async acceptance.** An extra suspension added to an existing async function was accepted. The session rebuilt one function, reused 118, and recorded image `19e20d00…4125` and metadata `09496dae…cfbc`.

**Root rollback.** After the edits were discarded, all fragments were reusable (119 for Editor, 82 for Chess) and the output verified. Failed builds had not replaced the root.

**Poisoned word.** One instruction word was deliberately damaged in memory, and the clean-ELF oracle detected it. This shows that the verification step is sensitive enough to catch a single corrupted fragment.

**Relocation.** The director enlarged a function between an unchanged caller and its unchanged callee. The callee moved from byte offset 84 to 144, and the retained caller still produced a clean-identical image. A separate edit closed a cycle through its cached edge and produced the exact clean rejection. Reordering the declarations triggered three misses.

## Disposition and limits

The experiment used a private compiler variant. The evidence supports keeping the cache experimental.

- **Positive.** In-memory reuse for body edits is the only configuration with a positive result. It won every pair in both apps and passed every correctness control.
- **Negative: interface edits.** Signature and layout edits cost 4–8% more than a clean compile.
- **Negative: cold builds.** A first build that records fragments needs 20–23% more peak heap.
- **Negative: persistence.** On-device persistence took 2.1–2.8 times a warm clean compile.

The next comparisons should use the same edits, identity checks and clocks to test two changes:

- a dependency rule that is selective but still verifiable;
- a cheaper checkpoint format or write path.

The data has the following limits:

- **One boot.** All results come from a single boot, with three pairs per edit and one fresh observation per arm. A single boot does not compare independent restarts.
- **Direct compiler entry.** The harness entered the compiler directly. The timer ends at the linked ELF. It excludes loading the edited image, invoking the edited native function and updating the Editor UI.
- **Narrow coverage.** Two apps and four edit types do not describe all workloads. No saving is claimed beyond these cases.
- **Memory attribution.** The warm harness had no heap or time cutoff, and its peaks are not attributable to one session.
- **Release slot.** The operator restored and verified the ordinary application (SHA-256 `134f3a249589a860a1a85311e361498a9e6ba4f14bef34ca2397ea26ca86ebc1`) and its matching partition. All eight required native worlds were healthy, and the production painter reported one installation and zero rejects. [Physical receipt](../scripts/incremental/physical.json)
- **Evidence format.** The archived evidence includes machine-readable receipts and the measured serial records used for the independent audit. [Serial results excerpt](../scripts/incremental/uart-results.txt)

## Reproduction

From the ticket’s `scripts/incremental` directory, these commands reproduce the host arms using the qualified release build and verify the published board results against the serial evidence.

```sh
python3 -B 03-stage.py /tmp/inc-replay /tmp/mobile-painter-chess3d/build/esp-idf/main
node 05-host.mjs /tmp/inc-replay /tmp/inc-replay-host
node 12-control.mjs /tmp/inc-replay /tmp/inc-replay-controls.json
python3 -B 15-audit.py uart-results.txt physical.json gold.json
python3 -B 13-summary.py physical.json /tmp/inc-replay-summary.json
cmp summary.json /tmp/inc-replay-summary.json
```

To repeat the physical trial, supply the qualified shipped build directory, a matching ESP-IDF 5.4.2 installation, and an unused output directory. The runner takes the shared device lock, verifies the release before overwriting the application slot, and restores it after the trial.

```sh
bash 09-build-board.sh /tmp/inc-replay /tmp/inc-replay-device
python3 -B 11-device.py /tmp/inc-replay-device/build /tmp/mobile-painter-chess3d/build /tmp/inc-replay/gold.json /tmp/inc-replay-physical
```

The study diary records staging dependencies, correctness controls, device recovery and the authorship commissions. [Investigation diary](../reference/04-incremental-build-diary.md)
