---
Title: Opus research diary
Ticket: PICOCALC-RENDER-SYSTEM
Status: complete
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:07:37.95550854-05:00
WhatFor: ""
WhenToUse: ""
---

# Research Diary: Retained-Layout Wire Encoding for the System Monitor

**Roles.** *Research principal:* external model `claude-opus-5-5`, effort high, tools disabled. *Test operator:* built the corpus, templates and drivers. *Independent director:* ran the held-out evaluation and owns physical runs and publication. The brief contains no wall-clock timestamps, so commit hashes serve as the chronological anchors.

---

## Step 1 — Commission and preregistration (commit `508dee2`)

The research principal authored a blind design with two parts. The first was a hand-written retained layout for the System monitor (arm **M**). The second was a source extractor (arm **A**) to be evaluated on a held-out ordinary keyboard app, Keys. The baseline (**G**) was the existing complete-JSON screen with equality suppression. The principal also proposed a last-frame diff comparator with one full reset.

The operator wrote a frozen, deterministic 100-state System corpus. The design and the corpus were committed together as `508dee2`.

- **Prompt Context.** The user’s original commission is quoted in Step 1 of the operator diary. The director assigned this study to the System researcher.
- **What I did:** Requested an authenticated commission from the principal.
- **Why:** A blind design and a frozen corpus prevent tuning to observed results.
- **What worked:** Once networking was approved, the commission succeeded.
- **What didn't work:** The first isolated API client failed with `ENOTFOUND`.
- **What I learned:** No empirical results exist at this stage.
- **What was tricky to build:** Making the corpus deterministic across all 100 states.
- **What warrants a second pair of eyes:** Confirm that the design predates any measurement.
- **What should be done in the future:** Record network requirements before commissioning.
- **Code review instructions:** Diff `03-corpus.cjs` at `508dee2`.
- **Technical details:** The model ran with tools disabled.

## Step 2 — Manual template and extractor freeze (commit `958d760`)

The operator built the manual template. It preserves the app's formatters, the 8- and 14-row windows, and graph rounding in all three tabs. The resident rebuild source is 2,041 bytes and the producer is 6,076 bytes.

The extractor catalogs static argument arrays and complete literal UI nodes in the source. It then performs lossless wire substitution after ordinary JSON serialization, which preserves observable coercion, key order and fresh objects.

- **Prompt Context:** The preregistration set a 30% saving as the threshold for releasing the experimental extractor.
- **What I did:** Measured M against G, then froze the extractor and the initial held-out driver.
- **Why:** M's saving exceeded the preregistered 30% threshold.
- **What worked:** M matched every tree and hint, with identical deduplication.
- **What didn't work:** No failures were recorded.
- **What I learned:** M enqueued 64,566 bytes against G's 141,662, a 54.4% reduction, with 82 of 100 states changed.
- **What was tricky to build:** Matching the formatters and rounding exactly in every tab.
- **What warrants a second pair of eyes:** The template's fidelity to the app's formatters.
- **What should be done in the future:** A direct residual emitter would require different compiler work.
- **Code review instructions:** Review `05-manual-producer.js`, `06-manual-receiver.js` and `08-extract.cjs`.
- **Technical details:** Substitution happens after `JSON.stringify`, so the output stays lossless.

## Step 3 — Held-out evaluation and pixel oracle

After the rules were frozen, the director ran Keys. The first driver threw `ReferenceError: ask is not defined` before any scoring. The operator supplied deterministic keyboard stats and time, the actual channel name and an awaited callback. The director's rerun succeeded, and no decision rules changed.

The pixel oracle was first blocked by `spawnSync git EPERM`. An authorized native process then returned status 7 at a malformed banner fixture. The only fix was to the adapter, so that it sends `{text,sub,color}`.

- **Prompt Context:** Holdout integrity was required throughout.
- **What I did:** Fixed only the driver harness and the oracle adapter.
- **Why:** Both failures happened before scoring and were outside the decision rules.
- **What worked:**
  - Both candidate trees matched all 100 System frames (320×320, RGB565).
  - A matched all 26 Keys frames, including one skipped flush per run.
  - 176 extra System states driven from the actual handlers also matched.
- **What didn't work:**
  - Only 9 of 17 System constructor sites and 2 of 8 Keys sites contributed.
  - The extractor rejected 10 exotic literals and one post-construction mutation.
- **What I learned:**
  - System A used 126,278 bytes, recovering 19.95% of the saving M achieved.
  - Keys used 24,379 bytes against 26,227, a 7.05% saving, at 3.33× paired host time.
- **What was tricky to build:** The 7 explicit effect cases.
- **What warrants a second pair of eyes:** Confirm the harness fixes did not alter the scoring paths.
- **What should be done in the future:** Expand literal coverage carefully.
- **Code review instructions:** Review `11-keys-holdout.cjs` and `16-protocol-audit.cjs`.
- **Technical details:** The admission test requires two installed catalog generations and these cases:
  1. A valid version is accepted.
  2. An unknown version is refused, and the prior receipt remains available.
  3. An idle fresh receiver replays.
  4. An unknown receiver gets the generic fallback.
  5. The next valid version is then accepted.

## Step 4 — Host costs, capsule handoff and closure

The host timing used 30 rotating paired blocks. Memory was measured with 64-bit host QuickJS against a shared fixture baseline of 343,904 bytes. The director received a standalone QuickJS capsule for physical runs.

The external service declined the operator's initial combined article-and-diary request. Separate requests for the technical article and for this observable lab record then proceeded. With the principal's independent authoring of the educational report and this record, the host research portion is closed.

- **Prompt Context:** The director owns physical runs and publication.
- **What I did:** Delivered the capsule and the reproduction script.
- **Why:** Production firmware impact and panel latency need evidence that a host cannot provide.
- **What worked:** The decoded receipt checksum was 2164593678 for every arm.
- **What didn't work:** The combined article-and-diary request was declined.
- **What I learned:**
  - Median Node producer-plus-receiver time over 100 System frames was 1,772 µs for G, 984 µs for M and 5,027 µs for A.
  - Malloc high-water above the baseline, on 20 boundary states, was 32,016 / 22,992 / 62,848 bytes (G / M / A).
  - The capsule is 23,710 bytes. Of 20 attempted frames, 17 changed, and wire bytes were 22,072 / 8,002 / 18,980 (G / M / A).
- **What was tricky to build:** Packaging the capsule so it runs standalone.
- **What warrants a second pair of eyes:**
  - The cost of source versus image.
  - The scopes of A and M.
  - That the holdout commit is unchanged.
- **What should be done in the future:** Physical panel-latency runs on the device.
- **Code review instructions:** Review `09-auto-runtime.js`, `12-board-capsule.cjs`, `18-reproduce.sh` and `summary.json`.
- **Technical details:** The source map covers `03`, `05`, `06`, `08`, `09`, `11`, `12`, `16` and `18`.

## Step 5 — Physical measurements

Ran 26-read-board.py to collect results from the ESP32-P4 handheld running the temporary experiment firmware. The board reported five rotating blocks from one boot, each arm running 20 boundary render attempts with 17 changed deliveries per repetition. Arms G, M and A reported physical byte totals of 22072, 8002 and 18980, and every checksum read 2164593678. Combined medians were 101.960 ms for G, 73.345 ms for M and 319.515 ms for A. M measured 28.615 ms below G, and A measured 217.555 ms above G. Paired combined ratio medians were 0.7266 for M and 3.1337 for A. A 320x320 RGB565 pixel comparison was run separately on the host. One live generic System Down press was recorded separately on instrumented experimental firmware.
