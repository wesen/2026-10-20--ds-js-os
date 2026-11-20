---
Title: Incremental builds of released Editor and Chess
Ticket: PICOCALC-RELEASE-LAB
DocType: design-doc
Status: active
Topics: [picocalc]
---

# Protocol: Incremental Function-Fragment Builds on ESP32-P4 (QuickJS-hosted Typed→RV32 compiler)

## 0. Claim status

This document contains no measured results. Every statement is tagged:

- **[P] Prior-reported.** A claim from the earlier fragment-compiler study. It is treated as unverified until Phase 2 replicates it on the current commit. Record its provenance: report ID, commit, and benchmark.
- **[H] Hypothesis.** Preregistered with a falsification threshold. Thresholds are fixed before Phase 3 and are not edited after data is seen.
- **[D] Design decision.** A choice made by the PI. It is not an empirical claim.
- **[M] Measured.** Only results produced by this protocol, written into the results log with run IDs.

---

## 1. Scope and definitions [D]

| Term | Definition |
|---|---|
| **Fragment** | Per-function RV32 output from the prior compiler: code bytes, relocation list, per-function diagnostics, and dependency key. |
| **Cache key** | `H(compiler_commit ‖ target_flags ‖ fn_source_bytes ‖ signatures_of_referenced_fns ‖ layout_hashes_of_referenced_globals/types ‖ cache_format_version)`. Record the hash algorithm and full digest length. |
| **Reused** | The fragment was loaded from cache, and its code bytes and relocations were not regenerated. |
| **Placement-stable** | The function's final link address is unchanged from the previous build. Reused and placement-stable are reported separately. |
| **Ground-truth changed set G** | Functions whose fragment differs between clean build(old source) and clean build(new source). Code bytes, relocation records, and diagnostics are all compared. |
| **Invalidated set I** | Functions the incremental build recompiled. |
| **Public build** | The artifact that is flashed or shipped: the final image plus symbol and diagnostic output, after any signing or packaging step. |
| **Module public boundary** | Symbols and types exported between Editor, Chess, and the shared runtime/library. |
| **E1** | The final public image is byte-identical to the clean build (SHA-256 match), and the diagnostic stream is identical in ordered text, spans, and severity. |
| **E2** | Each function's code is identical modulo resolved relocations, the symbol table is set-equal, and behavior on the app test vectors is identical. E2 is a dev-only fallback. Public builds require E1. |

**Soundness condition:** I ⊇ G, together with E1 (or E2 for dev builds).
**Precision measure:** |I \ G| (over-invalidation).

---

## 2. Conditions

| ID | Condition | Edit |
|---|---|---|
| C0 | Clean cold build, cache disabled | none |
| C0c | Clean cold build, cache enabled (populates cache) | none |
| C1 | Warm local-body edit | Change one function body. Signature and referenced globals are unchanged. |
| C2 | Signature edit | Add or retype one parameter of a function with at least 3 direct callers and at least 1 cross-module caller. |
| C3 | Shared global layout edit | Insert a field before existing fields in a struct or global used by at least 2 modules. |
| C4 | Revert | Apply C1, C2, or C3, then revert. The result must equal the original C0 output. |

**Edit selection [D].** Use real Editor and Chess code, two edits per condition per app. Selection criteria:

- **C1:** one leaf function and one function whose code size changes by more than 16 bytes, so the edit can shift placements.
- **C2:** one intra-module function and one function across a public boundary.
- **C3:** one Editor shared state structure and one Chess board/position structure.

Commit every edit as a patch file. Record function names, caller counts, and reference counts from the clean build.

---

## 3. Phases

### Phase 0: Device and environment reset (after prior studies on the P4)

1. Full erase of the cache partition. Reflash the known firmware and verify the image SHA-256 and partition table.
2. Record:
   - compiler commit, QuickJS version, firmware hash, and Editor/Chess source commit
   - CPU frequency, PSRAM mode/size, flash mode/frequency, and cache storage medium (flash FS or SD)
   - free internal heap and free PSRAM at boot, and chip temperature if readable
3. Power-cycle, then idle for 60 s before the first run.

### Phase 1: Determinism gate (prerequisite for every oracle)

- Run C0 three times on the host QuickJS and three times on the P4.
- **[H0]** All six outputs are E1-identical, including host vs. device.
- **Stop rule SR-1:** if [H0] fails, halt. Disposition: *oracle invalid*. Fix the nondeterminism source (iteration order, timestamps, address-dependent hashing) before continuing.

### Phase 2: Prior-work replication

- Rerun the prior study's fragment-reuse benchmark on the current commit.
- **[H-prior]** Reuse ratio and warm/clean time ratio fall within ±10% of the [P] values, and prior equivalence claims hold under E1.
- **Failure outcome:** the prior claims are recorded as *not replicated on current commit*. Phase 3 still proceeds, but no prior number is cited as current fact.

### Phase 3: Edit matrix

Per app and per edit:

1. Run C0c to establish the warm cache.
2. Apply the edit and run an incremental build.
3. Run C0 on the edited source; this produces the oracle.
4. Compute G by diffing the C0 per-function fragments of the old and new source.
5. Compare I with G and run the E1 check.
6. Run C4.

**Repetitions:**
- **Timing:** n = 10 on device per cell. Reboot before each cold run. Randomize the order of edits.
- **Correctness:** every run is checked. A correctness check is never sampled.

### Phase 4: Negative and positive controls

| ID | Control | Expected |
|---|---|---|
| N1 | Comment/whitespace-only edit | Source hash changes. G = ∅ if spans are not embedded, otherwise G = the functions with shifted diagnostic/debug spans. I = G. E1 holds. |
| N2 | No-op rebuild (no edit) | I = ∅, 0 fragment writes, E1 holds. |
| N3 | Compiler-version bump in key, no source change | I = all functions, because stale cache must be rejected. |
| N4 | **Oracle sensitivity:** test build whose dependency tracker omits signature dependencies | The C2 run must fail E1 or I ⊇ G. If it passes, the oracle is blind. Disposition: *oracle insufficient*, and stop. |
| N5 | **Oracle sensitivity:** test build with a truncated or constant key hash | Must be detected as a collision or fail E1. |
| N6 | Diagnostic-bearing function left unedited, a neighbor edited | The cached diagnostic is replayed, and E1 holds on the diagnostic stream. |
| P1 | **Positive:** edit with a known semantic change | Output differs from the pre-edit build, which confirms the comparison is not vacuous. |

### Phase 5: Persistence, regeneration, recovery (device only)

| ID | Test | Pass criterion |
|---|---|---|
| R1 | Delete the cache, then build | E1 vs. C0. Time within C0c ±5%. |
| R2 | Torn write: reset at write offset k, with k ∈ {0, 25%, 50%, 99%} of the cache commit, using an instrumented reset hook; also one manual power-pull | On next boot the corruption is detected, only the affected entries are discarded (or the whole cache, per design; record which), and the build is E1. |
| R3 | Single-bit flip in a fragment payload | Detected by entry checksum, entry regenerated, E1. |
| R4 | Bit flip in the index or metadata | Detected, cache rebuilt, E1. |
| R5 | Cache from different source with identical function names | Key mismatch, with no reuse across the mismatched keys. |
| R6 | Full partition (fill the FS to within 1 fragment of capacity) | The build completes, either with no caching or with eviction, and E1 holds. No crash. |

**Stop rule SR-4:** any undetected corruption, meaning output that is not E1 with no error raised, halts Phase 5. Disposition: *recovery unsound*.

---

## 4. Measurements (per run)

**Timing.** Wall time split into hash, lookup, invalidation, compile, link, persist-read, and persist-write. Use the cycle counter on device and the monotonic clock on host.

**Counts:**
- N_fn total, |I|, |G|, |I \ G|, |G \ I| (must be 0)
- reused count
- placement-stable count
- relocations re-patched

**Storage:**
- metadata bytes per function
- total cache bytes
- bytes read and bytes written per build
- flash erase-block count per build (wear proxy)

**Lookup.** p50 and p99 latency per key, measured with the cache at full app size.

**Memory.** Peak QuickJS heap (`JS_GetMemoryUsage`), peak internal SRAM, and peak PSRAM.

**Equivalence:**
- E1 result
- diagnostic diff
- for C3, an E2 result additionally if E1 fails, recorded for diagnosis only

---

## 5. Hypotheses and falsification thresholds

| ID | Hypothesis | Falsified if |
|---|---|---|
| H1 | C1: I = {edited fn}, reused ≥ N_fn − 1, device warm time ≤ 25% of C0 | I ≠ {edited fn}, or ratio > 25% (median) |
| H2 | C2: I = G = edited fn ∪ direct callers ∪ address-taking users. No transitive non-direct callers are recompiled. | G ⊄ I (soundness), or \|I \ G\| > 0 |
| H3 | C3: I = G = static reference set of the changed layout. Warm time ≤ C0 time. | G ⊄ I, or warm time > C0. If warm > C0, the policy must fall back to a clean build, and this is recorded as the cost of incremental mode. |
| H4 | E1 holds for 100% of non-fault runs in all conditions, including C4 revert = original C0 | Any single mismatch (see SR-2) |
| H5 | Link placement is not proportional to reuse: in a size-changing C1, placement-stable count < reused count | placement-stable = reused across all size-changing C1 edits. This would indicate the linker preserves layout via padding or slots; record which mechanism applies. |
| H6 | Persist-write bytes scale with \|I\|, not N_fn. Metadata ≤ 64 B/function. Lookup p99 ≤ 1% of C1 total time. | Write bytes in C1 > 2× (fragment size of edited fn + index delta), or either threshold exceeded |
| H7 | Cache-on cold build (C0c) costs ≤ 15% over C0 | C0c / C0 > 1.15 |
| H8 | 100% detection in R2–R5, with E1 after recovery | Any undetected case |

All numeric thresholds above are [D] placeholders. The PI confirms or changes them, then signs and timestamps them before Phase 3.

---

## 6. Public-build boundary rules [D]

1. A public build may consume the cache only if H4 holds across the full matrix. Otherwise public builds are forced clean, and the disposition says so.
2. Scan the public artifact for cache leakage: cache paths, entry IDs, build timestamps, or host-specific strings. Any occurrence is an E1 failure even if behavior is identical.
3. Cross-module C2/C3 edits must invalidate across the public boundary. G is computed over the whole image, not per module.

---

## 7. Stop rules

| Rule | Trigger | Action |
|---|---|---|
| SR-1 | Determinism gate fails | Halt all phases |
| SR-2 | Any E1 failure, or G ⊄ I, in a non-fault run | Halt timing work. Minimize to the smallest reproducing edit. Disposition for that condition: *unsound*. |
| SR-3 | Device fault (brownout, OOM, watchdog) | At most 2 retries per run. If a third occurs, mark the cell *not measurable on device*. The host correctness result still stands. |
| SR-4 | Undetected corruption | Halt Phase 5 |
| SR-5 | N4 or N5 not detected | Halt. The oracle is insufficient, so no correctness claim can be made. |
| SR-6 | Device time budget exhausted (set by the operator after the preceding studies) | Prioritize in this order: Phase 1 → C1/C2 correctness → R2 → timing. Report the unrun cells as *not tested*. |

---

## 8. Dispositions

Each hypothesis receives exactly one of:

- **Supported**: within threshold, with all checks passing.
- **Refuted**: threshold violated. Report the run IDs.
- **Unsound**: a correctness failure. This overrides any timing result.
- **Inconclusive**: insufficient runs, or variance where the IQR crosses the threshold.
- **Not tested**: blocked by a stop rule or the time budget. State which.

Report timing as median and IQR with n. Report every correctness count as an exact fraction, for example 40/40 E1. Prior [P] values appear only in a "replication" column next to the corresponding [M] values.

---

## 9. Known limitations [D]

- A single P4 unit means no inter-device variance is measured.
- The device has prior-study history, which Phase 0 mitigates but cannot eliminate.
- Four edits per condition per app sample the real code rather than exhausting it.
- G is defined by clean-build differencing. It therefore inherits any nondeterminism that Phase 1 fails to expose.
- R2's instrumented reset points do not cover all physical power-loss timings. The manual power-pull runs are a small supplementary sample.
