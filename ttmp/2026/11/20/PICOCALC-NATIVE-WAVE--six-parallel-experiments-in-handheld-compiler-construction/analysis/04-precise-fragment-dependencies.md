---
Title: "Which native functions survive a changed interface?"
Ticket: PICOCALC-NATIVE-WAVE
Status: complete
DocType: analysis
Topics: [picocalc, compiler]
Intent: long-term
---

# Which native functions survive a changed interface?

Research article by Claude Opus 5.5 (High), the commissioned study lead. The operator implemented the candidate, ran the PicoCalc measurements, and checked the report against the source and evidence. [Authorship receipt](../scripts/04-deps/article-provenance.json)

## 1. Summary

The shipped Typed RV32 compiler rebuilds every function after an edit. An earlier research prototype cached individual functions and invalidated them all when an interface changed. This study compared both controls with a cache that checks the declaration facts each function used. [Earlier prototype and physical measurements](../../PICOCALC-RELEASE-LAB--ship-the-playable-firmware-and-measure-literal-data-incremental-builds-and-chess-search/analysis/03-incremental-builds.md)

On the current Editor and Chess release sources, the replacement retained the following after an interface change:

- **Editor:** 115/119 functions after a signature change and 109/119 after a record-layout change.
- **Chess:** 72/82 after a signature change and 76/82 after a layout change.

Correctness checks:

- The output matched clean compiles byte for byte.
- The retained sets equalled the sets produced by an independent clean-fragment oracle, with nothing missing and nothing wrongly retained.

Timing on a 360 MHz ESP32-P4 and on a host:

- For signature and layout edits, the new arm was faster than both the old cache and a clean compile.
- For body-only edits it was slower than the old cache on the board in every pair. On host Chess the paired ratio was 1.143, which misses the preregistered 10% allowance.

**Recommendation:** pursue an in-session prototype limited to interface edits. Do not adopt it in production without qualification.

## 2. Background for a newcomer

**Function signature.** A function's signature consists of its parameter types, result type, and whether it is awaitable (may suspend). In this compiler, a function's own bound parameter names also affect how its body resolves. Changing `chessFrom(move: i32)` to `chessFrom(move: i32, bias: i32)` is a signature change.

**Record layout.** A record layout maps each field name to a type and a byte offset. In this compiler every field occupies a 4-byte slot. A nested record field holds a one-word reference, not an embedded copy. Swapping two fields changes their offsets. Other four-byte slots keep their old positions.

**IR-to-machine-code step.** The frontend checks a function and emits a numeric intermediate representation (IR) of its operations. The RV32 backend turns those operations into instruction words. Calls are first emitted as placeholders. After all functions are sized, `compile` assigns addresses and patches each call into a `J`/`JAL` instruction. `linkSlot` then places the image inside the reactor ELF's reserved slot. The cache stores each function's words *before* patching, so no stored inter-function call depends on a previous code address.

**Symbolic relocation.** A relocation records "instruction *k* calls *name*" rather than "instruction *k* jumps to address *A*". Because the target is a name, a retained function stays valid when other functions grow, shrink, are inserted, or are reordered. Calls to SDK imports become relocations to import trampolines, which `linkSlot` fills in.

**Call graph.** The call graph is the set of caller→callee edges. The compiler uses it for checks such as rejecting recursive cycles. Cached edges are stored by name and revalidated on reuse.

**Query read set.** While lowering a function, the compiler asks the program questions such as:

- "What is `fn/chessSquare`?"
- "What type and offset does `field/State/cursor` have?"
- "Is `T` an enum?"

The read set is every question asked together with the answer received, including negative answers such as "no such record". A cached function is reused only if its exact body text, parameter names, parameter types and result type match and every recorded question gets the same answer today.

**Actual return endpoint.** In every timed run, the clock stops when the public compiler call has returned the complete linked ELF. It does not stop at an intermediate fragment. Oracle checks ran outside the clock. Edited native code was not loaded or executed on the device.

**Previous global-cache control ("global").** This is the earlier ticket-only cache. It reuses a body only if a whole-program descriptor is unchanged. The descriptor covers all imports, all signatures, all records, enums and distinct types, and the generated async configuration. Any interface edit therefore rebuilds every function.

## 3. What was built

The implementation is [`../scripts/04-deps/03-session.js`](../scripts/04-deps/03-session.js). The preregistered design is [`../design-doc/04-precise-fragment-dependencies.md`](../design-doc/04-precise-fragment-dependencies.md), and the working log is [`../reference/14-dependency-reuse-diary.md`](../reference/14-dependency-reuse-diary.md).

Three arms ran in one process:

| Arm | Reuse rule |
|---|---|
| clean (stock) | No cache; every function is lowered |
| global | Whole-program descriptor equality plus body text |
| precise | Exact body, unchanged own signature and parameter bindings, and an unchanged read set |

The private treatment wraps the emitter's lookup tables and records the answers it observes:

- **Functions:** arguments, return type, awaitable flag, and namespace (internal versus import).
- **Records:** concrete field offsets and types.
- **Enums:** member tables that were consulted.
- **Nominal types:** positive and negative membership.

Calls and graph edges are stored by name and re-resolved through the current symbol index.

Two features are deliberately conservative:

- Any change to the program-wide generated prefix or start-field mapping invalidates every function.
- Session tags are per compiler realm and do not persist across processes. Source, target and SDK were treated as pinned.

A failed build is never published, so a rejected edit cannot poison the cache.

## 4. Worked example: Chess `chessFrom` gains a parameter

The signature step applies these edits:

```
function chessFrom(move: i32)                → function chessFrom(move: i32, bias: i32)
return chessSquare((move / 64) % 64) + 1;    → return chessSquare((move / 64) % 64) + bias;
chessFrom(move)                              → chessFrom(move, 1)              (7 sites)
chessFrom(state.lastMove)                    → chessFrom(state.lastMove, 1)    (3 sites)
```

That makes 10 updated call sites spread across 9 caller functions. Chess has 82 functions in total.

**`chessFrom` itself.** Its own signature string `[params, paramNames, result]` differs from the stored one, so it is rebuilt. Its read set would include `fn/chessSquare`, but the check never gets that far.

**The 9 callers.** Their body text changed, so the `startsWith` check fails and they are rebuilt.

**The other 72 functions.** For each one:

- The body text is identical.
- The own signature string is identical.
- Every recorded key re-evaluates to the same JSON answer.

A function that had queried `fn/chessFrom` would see a new answer, because its value is `[internal, [params, result, awaitable]]`, and would be rebuilt. None of the 72 had made that query. Their stored calls, such as `[from, "chessSquare", 0, rd]`, are remapped by name, and `compile` patches fresh `J` offsets even though `chessFrom`'s size may have changed.

**Result:** reuse 72, build 10, both on host and on device. The clean-fragment oracle lists exactly the same 10 functions as changed and 72 as unchanged. The global arm rebuilt 82/82.

The Editor counterpart works the same way:

- `editorPreviewSlot` gains `stride`, and 3 call sites are updated.
- 4 functions are rebuilt: the callee plus `editorPreviewFinish`, `editorPreviewAppend` and `editorPreviewFrame`.
- 115 of 119 are retained.

## 5. Correctness evidence

### 5.1 Output identity

Each check below compared against its own reference:

- **P4 edits:** each successful device edit was compared byte for byte with an independent stock compile through the public compiler, and by CRC against host clean gold.
- **Host builds:** each host build was compared with the unmodified compiler.
- **Structural pass:** a separate pass compared all public metadata plus the complete native bytes and ELF for 18 rows. These rows include rejected changes and reverse edits.
- **Release examples:** the oracle checks the complete linked ELF.
- **Standalone ten-function program:** the oracle checks the entire internally linked RV32 image and symbol tables, without the SDK.

Release inputs are pinned by hash in [`release-inputs.json`](../various/04-deps/release-inputs.json):

| File | Bytes |
|---|---|
| `editor.typed` | 69,884 |
| `chess.typed` | 61,022 |
| `editor.elf` | 242,124 |
| `chess.elf` | 274,892 |

The application image is `134f3a24…`.

Three rejected steps produced clean-arm errors and were never published:

- Editor `bad` (`730:53: expected ,`)
- Chess `bad` (`146:32: expected ,`)
- The held-out invalid signature (`57:47: expected ,`)

### 5.2 Clean-fragment oracle

[`clean-fragments.json`](../various/04-deps/clean-fragments.json) records the pre-patch words and symbolic calls of a clean compile before layout. A function counts as "unchanged" if both are identical across an edit.

| App / edit | Unchanged | Precise retained | Over-rebuilt |
|---|---|---|---|
| Editor body | 118 | 118 | none |
| Editor signature | 115 | 115 | none |
| Editor layout | 109 | 109 | none |
| Chess body | 81 | 81 | none |
| Chess signature | 72 | 72 | none |
| Chess layout | 76 | 76 | none |

For every primary change, precise retained exactly the oracle set:

- No unchanged function was rebuilt.
- No changed function was retained.

The Editor functions rebuilt by the layout edit include `typedWorldEvent` and the generated `__typed_async_2_editorOpenTask_editorOpenTask_step`.

This oracle was written *after* the implementation was frozen. It is an independent check, but it is not the preregistered oracle, and no preregistered hash exists for it.

### 5.3 Held-out fixture

The delegated director's ten-function program is recorded in [`held-out.json`](../various/04-deps/held-out.json).

| Edit | Global reused | Precise reused |
|---|---|---|
| change correction body | 9/10 | 9/10 |
| reorder fields | 0/10 | 9/10 |
| lengthen literal | 9/10 | 9/10 |
| fresh independent declaration | 0/10 | 9/10 |
| invalid signature edit | 0 hits | 7 hits, then rejected |
| baseline recheck | — | 10/10 |

The program's prequalified execution oracle has 1,603 independently scored return, memory and trap cases, including 101 expected traps. The untouched cached base matched the exact 2,876-byte native image certified by that separate oracle. [Independent execution receipt](../various/05-stack/held-out.json) [Per-edit clean-program comparisons](../various/04-deps/program-oracle.json)

Each submitted edit has its own fresh clean reference. The original fixed behavioral expectations apply to the base program.

### 5.4 Interface controls and generated sources

Results from [`declarations.json`](../various/04-deps/declarations.json) and [`interface-matrix.json`](../various/04-deps/interface-matrix.json):

| Control | Reused / rebuilt | Outcome |
|---|---|---|
| SDK import permutation | 2 / 0 | symbols and relocations remapped |
| import changes awaitable flag | 1 / 1 | |
| former import becomes internal leaf | 1 / 2 | |
| new global shares a local spelling | 1 / 1 | |
| distinct nominal type becomes enum | 0 / 1 | |
| enum exhaustiveness | 0 / 1 | rejected: `match on T does not cover: C` |
| existing async task adds a suspension | 118 / 1 | |
| nested record remains one word | 2 / 0 | |
| field kind changes, following offset kept | 1 / 1 | rejected: `expected bool, got i32` |
| longer literal ahead of used helpers and caller | 2 / 1 | |
| renaming a function a retained caller needs | 0 / 2 | rejected: `unknown function add` |
| removed declaration, unaffected caller order | 2 / 0 | |

A seeded generator (seed 20261120, 64 sources), also written after the freeze, compared every edit class against clean output. All totals are summed over the 64 sources:

| Edit class | Reused | Rebuilt | Rejected |
|---|---|---|---|
| layout | 165 | 348 | 0 |
| signature | 199 | 314 | 0 |
| declaration order | 513 | 0 | 0 |
| body | 449 | 64 | 0 |
| undefined local | 449 | 64 | 64 |
| additional field | 513 | 0 | 0 |

### 5.5 Knockouts

[`knockouts.json`](../various/04-deps/knockouts.json) records six mutants, each disabling one fact class:

- exact body
- own parameter bindings
- used field offset
- enum values
- call signature
- symbolic graph edge

All six were detected. In three of them, the stock compiler rejects the program while the mutant emits an image, so the mutant silently accepted an invalid edit. The three are:

- call signature (`expected ,`)
- graph edge (`recursive call cycle: leaf -> caller -> leaf`)
- own bindings (`unknown local x`)

The design asked for broader per-kind coverage, including lookup misses, nominal membership, async, and symbolic targets. Six detections do not meet that request.

## 6. Timing

### 6.1 Device (P4)

**Setup:**

- 360 MHz ESP32-P4.
- Shipping native lexical index and aligned PSRAM QuickJS allocator, with no JIT.
- All three arms ran in a single process.

**Design:**

- 5 rotated blocks per app, edit and arm, within one boot: 2 × 3 × 3 × 5 = 90 rows.
- The preregistered design asked for 30 blocks. The hardware budget allowed 5.
- No runtime SDK calls and no file persistence were timed.
- Within-boot counts are descriptive. There is no hardware confidence interval and there were no independent reboots.

Source: [`physical.json`](../various/04-deps/physical.json) and [`physical-summary.json`](../various/04-deps/physical-summary.json).

Medians are in milliseconds. The ratios are medians of per-block paired ratios, which is why they need not equal the ratio of the medians. "Wins" counts how many of the 5 blocks precise was faster.

| App / edit | Clean | Global | Precise | Precise ÷ global | Precise ÷ clean | Wins vs global |
|---|---|---|---|---|---|---|
| Editor body | 2265.6 | 888.2 | 1009.3 | 1.135 | 0.444 | 0/5 |
| Editor signature | 2271.4 | 2464.5 | 1079.6 | 0.439 | 0.475 | 5/5 |
| Editor layout | 2271.0 | 2474.4 | 1300.6 | 0.526 | 0.573 | 5/5 |
| Chess body | 3220.9 | 582.8 | 645.5 | 1.107 | 0.201 | 0/5 |
| Chess signature | 3223.8 | 3364.9 | 970.0 | 0.288 | 0.301 | 5/5 |
| Chess layout | 3224.0 | 3362.6 | 891.1 | 0.265 | 0.277 | 5/5 |

What the device numbers show:

- Precise beat clean in 5/5 blocks in every cell.
- On interface edits, global was slower than clean, because it pays for the descriptor and still rebuilds everything.
- On body edits, precise lost every block to global.

**Cold first compile.** This is a fresh single realm, timed from before runtime creation (including frontend evaluation and the embedded source/runtime copy) until the first full linked ELF is returned. There was one observation per app and arm, and only stock and precise were measured.

| App | Arm | Time | Peak memory | CRC |
|---|---|---|---|---|
| Editor | clean | 2.574 s | 2,554,092 B | 3763014618 |
| Editor | precise | 3.234 s | 3,369,376 B | 3763014618 |
| Chess | clean | 3.579 s | 3,186,424 B | 178518363 |
| Chess | precise | 3.961 s | 4,074,036 B | 178518363 |

The warm harness holds several compilers and two roots. Its recorded memory figures (27,953,356 B for Editor and 7,094,500 B for Chess) therefore cannot be attributed to a single resident session.

This research ignored the shipping caps of 4 MiB and 6 s. Nothing here certifies the product against those caps.

Device provenance:

- Research image: `b3ad52ac…`
- Partition: `72721dc3…`
- Afterwards, the operator restored the ordinary release `134f3a24…`, the matching partition, and a healthy painter, as recorded.

### 6.2 Host

Source: [`host-summary.json`](../various/04-deps/host-summary.json).

**Setup:** Node/V8 pinned to CPU 6, with 30 rotated blocks per cell. The bootstrap interval is a paired, within-run 95% interval on the precise−global difference in milliseconds.

| App / edit | Clean median | Global median | Precise median | Paired ratio vs global | 95% interval, ms |
|---|---|---|---|---|---|
| Editor body | 14.81 ms | 9.27 ms | 8.52 ms | 0.986 | [−2.65, 1.76] |
| Editor signature | 11.20 ms | 12.78 ms | 5.35 ms | 0.466 | [−8.25, −5.44] |
| Editor layout | 9.27 ms | 8.93 ms | 6.18 ms | 0.646 | [−3.94, −2.12] |
| Chess body | 6.27 ms | 1.77 ms | 2.10 ms | 1.143 | [0.21, 0.30] |
| Chess signature | 6.12 ms | 7.04 ms | 3.23 ms | 0.440 | [−4.16, −3.72] |
| Chess layout | 5.86 ms | 7.00 ms | 2.72 ms | 0.390 | [−4.44, −4.12] |

Medians are of total time, compile plus link. Cell medians for linking ranged from about 0.03 to 0.13 ms.

Prediction P4 concerns elapsed time. The 30-block host trial and five-block device trial provide separate evidence.

- **Signature and layout:** the interval excludes zero in favour of precise in all four cells. This supports the host interface-speed prediction.
- **Editor body:** the interval includes zero, so no difference was detected.
- **Chess body:** the interval excludes zero against precise, and the ratio of 1.143 exceeds the 10% allowance. The body clause of P4 is **falsified** on host.
- **Precise versus clean:** no host cell has a precise median above the clean median. Paired precise-versus-clean ratios were computed on device only.

An additional 7-block host correctness experiment is part of the host record.

## 7. Preregistration status

| Item | Status |
|---|---|
| P1 byte identity | Met for every compared row (§5.1) |
| P2, weak (precise retains more than global on interface steps) | Met. The falsifier did not fire. |
| P2, strong (equals oracle) | Met on all 6 primary changes, but the oracle was post-freeze |
| P3 per-kind knockouts | Partial: 6 kinds detected, several requested kinds absent |
| P4 interface speed-up | Host intervals excluded zero. All five device blocks favored precise in every structural cell. The planned hardware CI remains unmeasured. |
| P4 body allowance ≤10% | **Not met**: host Chess 1.143; device point ratios 1.135 and 1.107 |
| P4 "never slower than clean" | Its falsifier did not fire in any reported median |
| 30 device blocks | Not met (5 blocks, one boot) |
| ABI identity in key | Replaced by a per-realm session tag; no persistence |
| Held-out coverage | Body, layout, literal, declaration and invalid edits only |
| Universal soundness | Not claimed. There is no proof over compiler extensions. |

## 8. Corrections to my own critique

My post-implementation critique made four points that the evidence now changes:

1. **Literal pools.** I said literal pools were emitted. They are not. The release `writeLiteral` (in `typed-wasm.js`, `bufferLiteral`) emits unrolled immediate constants and one halfword store per code unit. The held-out label "pooled literal" was wrong: the 300-byte growth is inline code, not a shared pool. A separate research-only pooled variant would need its own relocation and cache contract, and was not studied. The displacement concern was exercised by the "longer literal ahead of still-used helpers and caller" control.
2. **Record size.** I worried about a dependency on record size. That concern does not apply to the current field model, in which every field is a 4-byte slot and nested records are one-word references. The "additional field" class retained 513/513.
3. **Publishing failed builds.** My concern here is resolved, because failed builds are never published.
4. **P1.** I reported P1 as unevaluated. It has now been evaluated (§5.1).

Two points remain open:

- A sync↔async toggle on a function's *own* signature with an unchanged body is not among the reported controls.
- Distinct types were tested only through nominal membership, by converting a distinct type to an enum.

## 9. Disposition

**Pursue an in-session prototype, gated to interface edits.**

The measured advantage is selective rebuilding after a signature or layout change:

| Comparison | Signature/layout result |
|---|---|
| Host, paired ratio vs global | 0.39 to 0.65 |
| Device, paired ratio vs global | 0.27 to 0.53 |

For the measured Editor and Chess edits, at most ten functions required rebuilding. The earlier cache rebuilt all of them.

Costs that must be addressed before wider use:

- **Body-only edits:** host Chess paired ratio 1.143 against global.
- **Cold start, Editor:** +0.66 s and +815 KB peak in a single observation.
- **Cold start, Chess:** +0.38 s and +888 KB peak in a single observation.

One untested design would keep the last global descriptor as a cheap first comparison. If that descriptor still matches, exact body equality can decide a hit. If a declaration changed, the per-function read sets can decide which compiled bodies survive. Such a compiler would still have to maintain valid read sets whenever it rebuilt a function.

Work still required before any production claim:

- Reboot-replicated device timing with a confidence interval.
- A preregistered oracle hash.
- The missing knockout kinds.
- The open controls listed in §8.

Nothing here supports unqualified production adoption, or a claim that every edit type benefits.

## 10. Reproduction

Run from `scripts/04-deps`:

```
python3 -B 04-stage.py /tmp/native-wave-deps /tmp/mobile-painter-chess3d/build/esp-idf/main
node 05-host.mjs /tmp/native-wave-deps /tmp/edits.json
```

**Sources.**

- Design: [`../design-doc/04-precise-fragment-dependencies.md`](../design-doc/04-precise-fragment-dependencies.md)
- Session implementation: [`../scripts/04-deps/03-session.js`](../scripts/04-deps/03-session.js)
- Diary: [`../reference/14-dependency-reuse-diary.md`](../reference/14-dependency-reuse-diary.md)
- Evidence under [`../various/04-deps/`](../various/04-deps/):
  - [`host-summary.json`](../various/04-deps/host-summary.json)
  - [`physical-summary.json`](../various/04-deps/physical-summary.json)
  - [`physical.json`](../various/04-deps/physical.json)
  - [`held-out.json`](../various/04-deps/held-out.json)
  - [`clean-fragments.json`](../various/04-deps/clean-fragments.json)
  - [`program-oracle.json`](../various/04-deps/program-oracle.json)
  - [`knockouts.json`](../various/04-deps/knockouts.json)
  - [`declarations.json`](../various/04-deps/declarations.json)
  - [`interface-matrix.json`](../various/04-deps/interface-matrix.json)
  - [`release-inputs.json`](../various/04-deps/release-inputs.json)

**Acknowledgement.** The operator carried out all on-device work: flashing the research image, running the 90-row P4 session and the cold compiles, and restoring the release image, partition and painter afterwards.

The 90-row serial receipt can be independently audited from this ticket. The staged gold values are generated by the original stock compiler.

```sh
node ../../../PICOCALC-RELEASE-LAB--ship-the-playable-firmware-and-measure-literal-data-incremental-builds-and-chess-search/scripts/incremental/08-gold.mjs /tmp/native-wave-deps
python3 24-physical-audit.py ../../various/04-deps/physical-rows.txt ../../various/04-deps/physical.json /tmp/native-wave-deps/gold.json
```
