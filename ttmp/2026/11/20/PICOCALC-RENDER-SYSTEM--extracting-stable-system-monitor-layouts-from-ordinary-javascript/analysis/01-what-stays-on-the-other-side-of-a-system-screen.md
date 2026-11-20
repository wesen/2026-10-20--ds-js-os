---
Title: What stays on the other side of a System screen
Ticket: PICOCALC-RENDER-SYSTEM
Status: complete
Topics:
    - picocalc
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/js/apps/sysmon.js
      Note: Production control and sampling functions
    - Path: repo://ttmp/2026/11/20/PICOCALC-RENDER-SYSTEM--extracting-stable-system-monitor-layouts-from-ordinary-javascript/scripts/08-extract.cjs
      Note: Frozen ordinary-source catalog extractor
    - Path: repo://ttmp/2026/11/20/PICOCALC-RENDER-SYSTEM--extracting-stable-system-monitor-layouts-from-ordinary-javascript/various/summary.json
      Note: Aggregate observations and paired host timing
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:07:38.775149828-05:00
WhatFor: ""
WhenToUse: ""
---

# Resident Templates for the System Monitor Screen: A Lab-Notebook Report

## 1. Question and scope

This study asked whether the System monitor screen could send fewer bytes per update by keeping a *resident template* on the receiving side, and whether such a template could be derived automatically from ordinary JavaScript UI code instead of being written by hand. It covers wire format, correctness, host-side timing, host-side memory and code size. It does not report the separate real-board experiment. It makes no estimate about displayed light output or perceived latency.

Four arms were compared:

| Arm | Description |
|---|---|
| **G** | Generic control from the parent project: full SDK tree serialized as JSON |
| **M** | Manual resident template: hand-written producer and receiver, plus a catalog |
| **A** | Automatic: a build-time extractor finds static fragments in the existing UI code |
| **S1** | Optional research comparator: an unoptimized keyed diff against the previous frame |

## 2. The baseline format and the System monitor screen

In the parent project, the control path (G) publishes a complete UTF-8 SDK JSON envelope of the form `{tree, hints}`. It keeps the latest complete envelope. If a newly produced envelope is byte-for-byte equal to the retained one, it is not published again. The screen title and banner are not part of this envelope; the compositor draws them. Every full paint uses the same generic tree, so a receiver that has just started can always rebuild the screen from the one retained message.

G, M and A share that restart property. Each keeps exactly one complete current message, and any fresh receiver can replay it. S1 does not. A diff only makes sense to a receiver that already holds the prior state, so S1 needs a conditional full-frame fallback. It also resets to a full frame on frame 50.

The System monitor has three tabs: Worlds, Handles and Buses. Worlds shows a table, a graph, and details about the selected world. Handles lists hardware resources. Buses shows two traffic histories and counters. The header includes a clock string. Tables show a centered window around the selection: 8 of 28 worlds, or 14 of 36 handles. Several formatting rules must be reproduced exactly:

- the history limit of 48 samples;
- the colors used on handle rows;
- the graph quantizer, including its half-pixel fallback.

Any replacement format must reconstruct the same SDK nodes with the same formatting.

## 3. How a resident template works

A resident template divides the screen into two parts. The *shape* of the screen holds the layout, fixed labels, column definitions and styling. This part rarely or never changes, and it is installed on the receiver once as code plus a catalog. Each update then carries only the *variable data*. The receiver combines the stored shape with the incoming data and builds real SDK nodes, which the existing layout and paint path consumes unchanged.

In arm M, each update message contains:

- catalog version (1);
- a tab tag;
- the clock string;
- tables as arrays of cells;
- the selected window index;
- detail strings;
- graph samples, labels and max.

The receiver checks the catalog version before swapping in a new tree. If it does not recognise the version, it refuses the message rather than guessing. The rule is that either the catalog is present, or the producer explicitly chooses the generic format. M never assumes the receiver has a catalog it might lack.

## 4. Worked example: last world selected

Take the Worlds tab with selection index 27, the last of 28 worlds. The table window holds 8 rows, so centering is clamped at the end of the list. The visible rows are worlds 20–27, and the selected row sits at window offset 7.

- **G** serializes the whole tree: every container, every fixed label, the column definitions, the eight rows, the detail block and the graph. That comes to **1,882 bytes**.
- **M** sends the version, tab tag 0 for Worlds, the clock string, eight rows of cells, the selected window index 7, the detail strings and the graph samples, labels and max. The receiver already holds everything else. That comes to **725 bytes**.
- **A** sends G's JSON, but with recognised static fragments replaced by short references into a catalog. That comes to **1,656 bytes**, a saving of only 226 bytes, because most of this tree is data-dependent.
- **S1** sends the shorter of a keyed subtree diff or a full frame, relative to the previous frame. That comes to **870 bytes**. This number is only meaningful if the receiver holds the right previous frame.

The example captures the overall pattern. Moving the shape out of the message (M) roughly halves the payload or better. Factoring out literal fragments that happen to repeat (A) recovers only a small part of that saving.

## 5. The automatic extractor and how it actually behaved

The extractor (`08-extract.cjs`) is a conservative build-time parser built on Acorn. It inspects only allowlisted ordinary `ui` calls. It recognises two things: closed, complete static nodes, and literal argument composites that are passed through intact, such as column arrays.

It refuses anything it cannot prove static, including:

- unsafe literals, prototype access and computed keys;
- getters, duplicate keys, non-finite numbers and `-0`;
- spreads, variables and array holes;
- bindings that could shadow the expected names.

It also skips composites shorter than 12 JSON characters, where a reference would not pay for itself. The output is a dictionary of the serialized shapes it found, ordered by length. The dictionary version is the first 16 hex characters of its SHA-256.

At runtime (`09-auto-runtime.js`), the producer still executes **every original constructor** and still calls `JSON.stringify`. Only after that does a token-aware regular expression replace complete matching composite spellings that appear outside quoted strings. The receiver expands the references and parses a fresh tree. Three guards apply:

- If the serialized output collides with a reserved marker, or the substituted form is not smaller, the original packet is sent.
- An unknown template, version or slot is refused.
- Nothing is skipped on the producer side, so A makes no claim that code generation saves construction work.

This design deliberately does *not* substitute arguments in place inside the running program. The table constructor retains its columns object, so sharing one object between calls would break any later mutation of it. Factoring at the wire level instead means that all dynamic JavaScript effects happen exactly as before, by construction. That includes getters, `toJSON`, string coercion and thrown exceptions. The tests cover:

- seven explicit effect traces, including coercion and getter cases;
- ten guard tests;
- one post-construction mutation case;
- unknown-version and unknown-slot refusal.

In practice the extractor found static material at 9 of 17 System call sites and 2 of 8 Keys call sites. On the Buses tab, the complete A group saved zero enqueued bytes. On Keys, the column definitions were successfully factored, but the remainder of each view was dynamic. The rules were frozen before Keys was opened and stayed fixed through scoring.

## 6. Evaluation protocol

The design was committed blind at **508dee2**. The frozen rule and the holdout were committed at **958d760**.

The isolated harness (`04-harness.cjs`) emulates four behaviors:

- envelope retention;
- version refusal before swap;
- replay to an idle fresh receiver;
- acceptance of a new valid generation.

It does not replace the production kernel, and it does not qualify pipeline timing or latency.

The corpus (`03-corpus.cjs`) has **100 System cases**. They cover all tabs; empty, short and full windows; first and last selection; selection crossing window edges; refresh; inactive state; overlay and removal; and unrelated state changes. Separate comparator sets cover:

- 50 refresh cases that deliberately alternate tabs;
- 10 selection-only cases;
- 10 unrelated-state cases;
- 5 title cases, including repeats.

A further 176 states come from a realistic sequence: start, focus, 50 timer refreshes, down and tab key presses, and blur.

The **Keys holdout** (`11-keys-holdout.cjs`) was executed independently. It has 26 states with the driver's `ask`/`now` modeled, active key traffic, focus and blur.

Three harness incidents occurred, and each is recorded here:

1. The initial Keys driver fixture failed with `ReferenceError: ask is not defined` before any candidate was scored. Only the harness was repaired. The frozen rule and the event inputs were preserved.
2. The first raster attempt failed in the sandbox with `spawnSync git EPERM`.
3. An approved local run then exposed a real fixture misuse. The raster step exited with code 7 because the banner was passed as a string, whereas real paint expects `{text, sub, color}`. The export adapter was fixed. The wire format was not changed.

## 7. Measurements

### Wire bytes

Over the 100 System cases, all three arms produced 82 publications at identical positions in the trace out of 100 attempts. The remaining attempts were suppressed as equal bytes. A used its automatic envelope on 78 of 100 System attempts and 24 of 26 Keys attempts.

| System (100 cases) | G | M | A |
|---|---|---|---|
| Attempted bytes | 175,120 | 77,704 | 155,516 |
| Enqueued bytes | 141,662 | 64,566 | 126,278 |
| Saving vs G | — | 77,096 (54.42%) | 15,384 (10.86%) |
| Worlds (enqueued) | 80,229 | 38,770 | 72,093 |
| Handles (enqueued) | 38,098 | 16,937 | 30,850 |
| Buses (enqueued) | 23,335 | 8,859 | 23,335 |

The per-tab rows include the inactive control. A recovers **19.95%** of M's saving. On Keys, G enqueued 26,227 B and A enqueued 24,379 B, a saving of 1,848 B (7.05%), with 26 of 26 states enqueued.

The full S1 trace was 119,142 B. As scenario accounting only, the study charged M and A for two logical deliveries of their resident source (for example, an install followed by a replacement that includes code). With that charge, M totals 68,648 B and A totals 130,896 B, compared with 119,142 B for S1 and 141,662 B for G. The deployment did not actually install anything over the screen channel.

### Host timing (Node)

There were 30 paired blocks in rotating order. Each block contained 16 full System traces, or 24 Keys traces. The table gives medians in µs per whole trace.

| | G | M | A |
|---|---|---|---|
| Producer | 1,088 | 530 | 2,969 |
| Receiver | 685 | 464 | 2,056 |
| Sum of stage times | 1,772 | 984 | 5,027 |
| Paired ratio vs G | — | 0.556 | 2.840 |
| p95 receiver ratio, 95% CI | — | 0.709–0.885 | 3.071–3.766 |

The confidence intervals come from a deterministic paired block bootstrap. Running two independently instantiated generic controls gave a median total ratio of 1.022 and a p95 of 1.076, which sets the noise floor. On Keys, the combined time was 302 µs for G and 986 µs for A, a paired ratio of 3.334×.

S1 was timed standalone and unpaired: a median of 5,936 µs to build and 714 µs to apply per 100 frames. No strict paired p95 gate was established for S1. The M/G result above is a different comparison. All of these timings exclude layout, raster, channels and the panel.

### Memory and size

Memory was measured on a host 64-bit QuickJS run of an equivalent 20-boundary-frame capsule. The baseline, measured on a fresh runtime after garbage collection, was 343,904 bytes for all arms. That figure includes all implementations and test data. Allocator usable bytes are counted with +8 overhead.

| | G | M | A |
|---|---|---|---|
| High-water increment (B) | 32,016 | 22,992 | 62,848 |
| Source bytes | 7,550 | 6,076 + 2,041 = 8,117 (+567) | 9,859 (+2,309; catalog 903) |
| QuickJS bytecode | 14,867 | 11,423 + 5,050 = 16,473 | G + 4,773 |
| gzip -9 of whole source | 3,110 | 3,599 | 3,956 |

The memory increments include checksum and evidence overhead and the fresh tree. They are not a per-owner proof. A must have its runtime present on both sides. It is priced once as a shared bundled source asset, and each side instantiates its own state. A's median build time was 1.844 ms. On Keys, A's catalog was 207 B and the extractor median was 0.478 ms.

These figures measure the cost of the representation and its components. They exclude integration glue and compiler or binary alignment, so they are not a claim about linked product flash size.

### Pixels

Pixels were checked by direct byte comparison of native RGB565 output, at 204,800 B per frame. Both System candidates were compared against the control over 100 frames. The automatic candidate was also compared against the Keys control over 26 frames. One dropped flush per run was recovered using the director's host oracle. The worst-case primitive counts were 225 (System) and 73 (Keys). In host rehearsal the portable board capsule ran 20 frames with 17 publications. Its byte counts were G 22,072, M 8,002 and A 18,980, and all three arms produced the same checksum, 2164593678.

## 8. Hypotheses

- **P1 (not supported).** The prediction was that S1 would stay at or below 25%, and M at or below 15%, of a max-window generic refresh. On the 50 alternating-tab refreshes, G sent 92,464 B, S1 sent 91,457 B and M sent 45,852 B, so both failed. Switching tabs defeats diffs. No conclusion about same-tab refreshes is drawn from this set.
- **P2 (narrow miss).** The prediction was that M's byte advantage over S1 on small changes would be under 1.3×. On selection-only changes, S1/M = 9,592/7,312 = 1.312. On unrelated-state changes, every arm emitted zero bytes, so the ratio is undefined.
- **P3 (supported on this trace).** The prediction was that installing M would break even against S1 within 20 focused attempts per tab, even after charging the whole 2,041 B catalog to each tab. On the observed mixed trace, cumulative break-even came after 9, 9 and 5 attempts. This holds for that trace only and is not a guarantee.
- **P4 (not evaluable).** The blind prediction was that A would recover 70% of M's truly static bytes in System, and at most 50% in Keys. The 19.95% of wire saving recovered is only a proxy. There is no exhaustive semantic ground truth and no manual Keys arm, so no recall or specificity claim is made, and the formal 60% held-out recovery gate remains unqualified.
- **P5 (supported).** The prediction was zero divergences. None occurred in any tested case or in idle replay.
- **P6 (not supported).** The prediction was that the template arms would materialize fewer receiver nodes. In fact G, M and A each built 3,549 containers across the full published views. S1 edits some existing nodes, but there was no allocation census for S1, so no factor-of-two difference was demonstrated.

## 9. Why automatic extraction did not qualify

A was correct: no divergences, identical pixels, and every guard behaved as specified. It did not qualify because its costs exceed its benefits:

- It recovers about a fifth of the manual saving.
- It saves nothing on Buses and 7% on Keys.
- It is about 2.8–3.3× slower than G on paired host timing.
- It roughly doubles G's memory high-water increment.
- It adds 2,309 B of source.

The root cause is structural. Wire factoring keeps every constructor call and the full `JSON.stringify` pass, then adds a substitution pass on the producer and an expansion pass on the receiver. Only literal fragments are removed, while the dynamic remainder dominates the payload. **M is therefore eligible for physical evidence, and A is rejected as implemented.** A direct residual emitter with explicit immutability and escape analysis would be a separate experiment.

## 10. Limitations

- All timing and memory figures are host-side. They exclude layout, raster, channels and the panel, and they do not qualify pipeline latency.
- The harness emulates retention and replay. It does not replace the production kernel.
- Resident delivery costs are scenario accounting. The resident code was never actually installed over the screen channel.
- S1 timing is unpaired, and S1 node allocation was not measured.
- Size figures exclude linking and alignment.
- The real-board experiment is reported separately.

## 11. Artifacts

**Scripts:**

| File | Role |
|---|---|
| `01-design-commission.txt` | Blind assignment |
| `03-corpus.cjs` | Test corpus |
| `04-harness.cjs` | Isolated harness |
| `05-manual-producer.js`, `06-manual-receiver.js`, `07-manual-study.cjs` | Manual arm (M) |
| `08-extract.cjs`, `09-auto-runtime.js`, `10-auto-study.cjs` | Automatic arm (A) |
| `11-keys-holdout.cjs` | Keys holdout |
| `12-board-capsule.cjs` | Board capsule |
| `13-comparisons.cjs` | Cross-arm comparisons |
| `14-host-heap.c`, `15-heap.sh` | Host memory measurement |
| `16-protocol-audit.cjs` | Protocol audit |

**Outputs:** `summary.json`, `protocol-audit.json`, `frozen-inputs.sha256`, `extractor-freeze.sha256`, `sysmon-pixel-receipt.json`, `keys-pixel-receipt.json`.

**Commits:** blind design 508dee2; frozen rule and holdout 958d760. The complete host replay is scripts/18-reproduce.sh. The controls and dependencies are documented in reference/04-reproduction.md.
