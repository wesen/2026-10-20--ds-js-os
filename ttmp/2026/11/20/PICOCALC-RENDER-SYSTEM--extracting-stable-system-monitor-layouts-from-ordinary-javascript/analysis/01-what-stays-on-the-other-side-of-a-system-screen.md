---
Title: Restartable screens on the PicoCalc, measured byte by byte
Ticket: PICOCALC-RENDER-SYSTEM
Status: complete
Topics:
    - picocalc
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://apps/js/picocalc/apps/sysmon.js
      Note: Production control and sampling functions
    - Path: repo://ttmp/2026/11/20/PICOCALC-RENDER-SYSTEM--extracting-stable-system-monitor-layouts-from-ordinary-javascript/scripts/08-extract.cjs
      Note: Frozen ordinary-source catalog extractor
    - Path: repo://ttmp/2026/11/20/PICOCALC-RENDER-SYSTEM--extracting-stable-system-monitor-layouts-from-ordinary-javascript/various/summary.json
      Note: Aggregate observations and paired host timing
ExternalSources: []
Summary: Matched System and Keys screens, a frozen JavaScript extractor, and a physical ESP32-P4 comparison of publication and reconstruction.
LastUpdated: 2026-11-20T11:07:38.775149828-05:00
WhatFor: ""
WhenToUse: ""
---

# Restartable screens on the PicoCalc, measured byte by byte

Open the system monitor on a PicoCalc, choose the Worlds tab and move the cursor to the bottom of the list. The frozen sample lists 28 worlds, so the highlighted row is absolute selection 27. The table shows eight rows at a time, centered on the cursor where possible. The visible window therefore holds worlds 20 through 27, and the highlight sits at local selection 7. Now restart the compositor while the monitor is idle. The kernel must replay a message that lets the new compositor repaint the highlighted row, even if the monitor never publishes again. This report measures how small that message can become without giving up that property.

The handheld's processor is an ESP32-P4, called the P4 here. Each application in this study runs in its own world, a separate program runtime with its own heap and globals. System describes its screen through UI constructors, which are SDK functions such as `ui.table` that return plain component nodes. It then publishes the result as a UTF-8 JSON envelope holding `{tree, hints}`. The compositor is the separate process that owns the 320×320 RGB565 framebuffer (16-bit color, 204,800 bytes). It supplies the title and banner itself, runs layout and paints. The kernel keeps a retained screen, the latest complete publication from the app. The compositor reads it on restart. That lets it repaint after an overlay closes or a flush is lost without asking the app for anything. The bytes the producer enqueues on the channel for each publication are the wire bytes. This project tries to shrink them.

The study covers only the component and layout input stage. The experiment runs the production monitor code with deterministic kernel records. The monitor's tabs are Worlds (running worlds), Handles (hardware access tokens and resources) and Buses (I2C and SPI traffic histories). The isolated harness emulates four behaviors. It retains screens, refuses an unknown version before swapping the retained screen, replays into an idle fresh receiver and installs a new valid generation. It does not replace the production kernel, and it does not qualify pipeline timing or latency. The host trials cover the full corpus. A separate physical trial times the same producer and receiver logic on the ESP32-P4.

## Four ways to send the same screen

The control, G, sends the full generic SDK envelope every time and skips a publication when its bytes equal the previous message. Any receiver that holds one G message can paint.

M is a hand-written manual protocol. It sends catalog version 1, a tab tag, the clock string, each table as arrays of cells, the selected window index, the detail strings, and the graph samples, labels and maximum. Column definitions and node structure live in a catalog that both worlds already hold. The M receiver rebuilds real SDK nodes with the original formatting. It reproduces the same centered windows (8 of 28 worlds, 14 of 36 handles), the graph history limit of 48 samples, the handle colors and the graph quantizer, including its half-pixel fallback.

A is automatic. Its extractor is a build-time pass, built on the Acorn parser, that reads the app's source and finds allowlisted ordinary `ui` calls. From those calls it records closed static nodes and literal argument composites such as column arrays. Each recorded spelling becomes a template. The positions where values change from frame to frame are dynamic slots. The extractor orders the dictionary by length and versions it with the first 16 hex characters of its SHA-256.

S1 is an optional research comparator. It is an unoptimized keyed path-replace diff that sends either a subtree replacement or the full frame, whichever is shorter, and it forces a full reset at frame 50. Unlike the other three arms, its receiver needs prior state.

## One state, four messages

Take the worlds-last state, selection 27. G sends 1,882 bytes. That message holds the table node with its columns, eight row nodes with their cells, the selection, the details pane and the graph. M sends 725 bytes. Its vector carries version 1, the Worlds tag, the clock, eight row arrays for worlds 20–27, window index 7, and the detail and graph fields. Absolute selection 27 stays in the producer world, which owns the cursor. The receiver needs only the local index because it draws exactly the rows it is given. It looks up catalog version 1, rebuilds the column set, fills the eight rows and highlights the eighth. A compositor that restarts and then receives these 725 bytes, with catalog version 1 resident, produces the same tree as the 1,882-byte G message. The pixel receipts below confirm identical RGB565 output.

| Arm | Bytes, worlds-last | Retained message | Fresh receiver also needs |
|---|---|---|---|
| G | 1,882 | Full `{tree,hints}` JSON | Nothing |
| M | 725 | Catalog-v1 vector | Catalog v1 resident |
| A | 1,656 | JSON with template references | Matching dictionary version |
| S1 | 870 | Path edits | The previous screen, or a full frame |

G, M and A each keep one complete current message that survives a restart. S1's 870 bytes mean nothing to a receiver that has just started. If the compositor lacks the M catalog, the producer rebuilds generic JSON from its own M vector with a shared resident function, and the harness measured exact equality with G. A falls back to the ordinary app's G output. The receiver refuses an unknown version or slot before swapping, so a bad message never replaces a good retained screen.

## Where automatic factoring preserves JavaScript effects

The obvious design for A rewrites source so that each static composite becomes a reference to one shared resident object. The table constructor makes that unsafe because it retains the columns object it receives. The condensed Worlds view below shows the hoisted columns, the changing row values and a later mutation. The example shortens the real seven-column descriptor to three columns and adds an illustrative mutation.

```js
// Worlds view, condensed. Selection 27 of 28 worlds.
function worldsTable(s) {
  const top = Math.max(0, Math.min(s.worlds.length - 8, s.sel - 4))            // 20
  const t = ui.table(
    [{ label: "world", w: 72 }, { label: "state", w: 62 }, { label: "turns", align: "right" }], // static composite
    s.worlds.slice(top, top + 8).map(formatRow),                               // dynamic slot
    { sel: s.sel - top })                                                 // 7, dynamic slot
  if (s.sortedBy === "state") t.cols[1].label = "state*"                    // later mutation
  return t
}

// Unsafe eager substitution. The literal becomes one shared resident object.
const t = ui.table(RESIDENT.cols3, rows, opts)
t.cols[1].label = "state*"  // t retains RESIDENT.cols3, so later calls share "State*"

// What A does instead. Constructors run untouched, and only finished bytes are factored.
const json = JSON.stringify({ tree, hints })
const wire = substituteOutsideStrings(json, dictionary)  // complete spellings only
send(hasReservedMarker(json) || wire.length >= json.length ? json : wire)
```

Under eager substitution, the mutation leaks into every later frame, including frames where the user never sorted. A avoids that by working on finished output. The producer executes every original constructor and `JSON.stringify`. A token-aware regular expression then replaces complete matching composite spellings outside quoted strings. After the mutation above, the spelling no longer matches the template, so the original bytes go out. The receiver expands the references and parses a fresh tree. Getters, `toJSON`, string coercion and thrown exceptions therefore behave exactly as in G. Seven observed cases include getter and coercion traces. Ten separate tests cover unsupported literal forms and bindings. Additional probes exercise post-construction mutation, a wrong catalog version and an invalid slot.

The extractor refuses unsafe literals, prototypes, computed keys, getters, duplicate keys, non-finite numbers, −0, spreads, variables, holes and shadowed bindings. It also skips composites shorter than 12 JSON characters. The result is source-guided wire factoring, a deliberate departure from blind in-place argument substitution. It makes no claim to generate code that avoids materializing nodes.

## System results

The System corpus has 100 cases. They cover every tab, empty, short and full windows, first and last rows, selection crossing, refresh, the inactive state, overlays and their removal, and unrelated state changes. Within those 100 are 50 refreshes that deliberately alternate tabs, 10 selection-only changes, 10 unrelated changes and 5 title cases, repeats included. Another 176 states come from a real start, focus, 50 timer refreshes, down and tab presses, and blur. All three arms publish the same 82 of 100 attempts, and 78 of A's 100 attempts use the factored envelope.

| System, bytes | G | M | A | S1 |
|---|---|---|---|---|
| Attempted | 175,120 | 77,704 | 155,516 | not recorded |
| Enqueued | 141,662 | 64,566 | 126,278 | 119,142 |
| Worlds, enqueued | 80,229 | 38,770 | 72,093 | 62,885 |
| Handles, enqueued | 38,098 | 16,937 | 30,850 | 34,710 |
| Buses, enqueued | 23,335 | 8,859 | 23,335 | 21,547 |
| Saving vs G | — | 54.42% | 10.86% | 15.90% |

Only 9 of the 17 System call sites contribute any factoring. On Buses, A's complete group saves zero enqueued bytes.

Recovery is the fraction of the manual saving that an automatic method achieves. Measured against G, A recovers 15,384 / 77,096 = 19.95%. That baseline is generous because G is the most expensive arm. S1 is a cheaper baseline that needs no catalog. Against S1, M saves 54,576 bytes while A costs 7,136 bytes more, a signed recovery of −13.08%. The resident code can also be priced. Charging two logical resident-source deliveries, such as an install followed by a replacement that includes code, raises M to 68,648 bytes and A to 130,896. S1 stays at 119,142 and G at 141,662. No actual screen-channel install took place, so this charge is scenario accounting.

The pixel check compared native RGB565 framebuffers byte for byte against matched controls. That covered 100 × 204,800 bytes per candidate for System and 26 × 204,800 for Keys. Each run deliberately dropped one flush and recovered it from the retained screen through the director's host oracle. The worst frames issued 225 and 73 paint primitives.

## Predictions against outcomes

The predictions were registered at blind design commit `508dee2`. Extraction rules and the holdout were frozen at `958d760`, and no rule changed afterward.

P1 predicted that S1 would send at most 25%, and M at most 15%, of a maximum-window generic refresh. On the 50 alternating refreshes, G sent 92,464 bytes, S1 sent 91,457 (98.9%) and M sent 45,852 (49.6%). Both fail under this mixed definition because switching tabs defeats deltas. The trace supports no inference about refreshes within one tab.

P2 predicted that M's advantage over S1 on small changes would stay below 1.3×. On selection-only changes, S1/M was 9,592 / 7,312 = 1.312, a narrow miss. On unrelated changes every arm emitted zero bytes, so the ratio is undefined.

P3 predicted that the manual install would break even against S1 within 20 focused attempts per tab, with the whole 2,041-byte catalog charged to each tab. On the observed mixed trace, accumulated break-even came at attempts 9, 9 and 5. These are observations on one trace, not guarantees.

P4 predicted that A would recall at least 70% of M's truly static bytes on System and at most 50% on Keys. No exhaustive semantic ground truth for "truly static" exists, so recall and specificity cannot be scored. Wire-saving recovery is only a proxy.

P5 predicted zero visual differences. All raster fixtures match. On an idle receiver restart, the retained message also reconstructed the exact expected tree.

P6 predicted that M's receiver would materialize fewer nodes. Every arm's published views contain 3,549 containers. M parses 1,081 incoming containers and builds all 3,549. S1 parses 3,272 incoming containers and performs 173 path writes into existing nodes. These are final-view and parse counts, not allocations. No allocation census exists for S1, so no factor-of-two reduction is demonstrated.

## The held-out program

Keys shows live key state, statistics and recent event history. It has 8 `ui` call sites and was excluded from design. Its 26 states were executed independently, with the driver's `ask` and `now` calls modeled, along with active key traffic, focus and blur. The frozen extractor found 2 contributing sites. It won on the column arrays, but the rest of the screen is dynamic. A used the factored envelope on 24 of 26 attempts, and all 26 were enqueued. A sent 24,379 bytes against G's 26,227, a saving of 1,848 bytes (7.05%).

At freeze time Keys had no manual arm. After the director scored the frozen packet stream, the test operator wrote a manual Keys producer. It sends compact key fields, stats and the most recent event history as arrays. All 26 decoded screens and full RGB565 images (5,324,800 bytes) match, including the lost flush.

| Keys, bytes | Enqueued | Saving vs G |
|---|---|---|
| G | 26,227 | — |
| Manual Keys | 8,515 | 67.53% |
| A | 24,379 | 7.05% |
| S1, midpoint full reset | 15,371 | 41.39% |
| S1, no reset | 14,909 | 43.15% |

The midpoint reset costs S1 462 bytes, which is the price of letting a fresh receiver join. Against G, A recovers (26,227 − 24,379) / (26,227 − 8,515) = 10.43% of the manual saving. Against S1 with reset, manual Keys saves 6,856 bytes while A costs 9,008 bytes more. The signed recovery is (15,371 − 24,379) / (15,371 − 8,515) = −131.39%, which fails the registered 60% minimum. The comparator was written after the blind trial. The extractor and the saved packets are unchanged, so the shortfall was observed, not tuned. P4's claim about truly constant bytes still lacks exhaustive ground truth.

The held-out program changes the conclusion. On System alone, A looked weak but positive, recovering a fifth of the manual saving relative to G. Keys shows that this figure does not transfer. On a screen built mostly from live data, A recovers a tenth relative to G and sends more bytes than an unoptimized diff.

## Time, memory and code size

On a host under Node, 30 paired rotating-order blocks each ran 16 full System traces or 24 Keys traces. Median producer and receiver times per whole System trace were as follows.

| Arm | Producer, µs | Receiver, µs | Paired total ratio vs G |
|---|---|---|---|
| G | 1,088 | 685 | — |
| M | 530 | 464 | 0.556 |
| A | 2,969 | 2,056 | 2.840 |

On Keys, G and A took 302 and 986 µs combined, a paired ratio of 3.334×. Two identical generic controls gave a median ratio of 1.022 and a p95 of 1.076, which sets the noise floor. A deterministic paired block bootstrap put the p95 receiver ratio at 0.709–0.885 for M/G and 3.071–3.766 for A/G. These times exclude layout, raster, channels and the panel.

S1 was later paired directly with M. Three independent or replay host samples gave 95% upper confidence bounds on the p95 M/S1 receiver ratio of 0.798, 1.295 and 1.275, against a registered ceiling of 1.10. The strict tail gate is therefore inconclusive. The first sample's raw blocks were overwritten during the verification rerun, and only its summary survives. Standalone unpaired S1 timing (median 5,936 µs build and 714 µs apply per 100 frames) is diagnostic only.

Memory was measured on a host 64-bit QuickJS build running an equivalent 20-boundary-frame capsule. A fresh, garbage-collected runtime holding all implementations and test data measured 343,904 bytes. High-water increments above that baseline were 32,016 bytes for G, 22,992 for M and 62,848 for A. These count allocator usable bytes plus 8 bytes of overhead, and they include checksum and evidence overhead and the fresh tree. They are peak live bytes, not total allocations, and nothing attributes them to individual owners.

| Code size, bytes | G | M | A |
|---|---|---|---|
| Plain source | 7,550 | 8,117 (6,076 + 2,041 receiver) | 9,859 |
| gzip-9 source | 3,110 | 3,599 | 3,956 |
| Terser 5.19.2 minified | 4,852 | 5,407 | 6,405 |
| gzip-9 minified | 2,210 | 2,466 | 2,821 |
| Host QuickJS bytecode | 14,867 | 16,473 (11,423 + 5,050) | G + 4,773 |

The P4 build bundles plain JS source, so the first row is the deployed representation. M adds 567 source bytes over G, and A adds 2,309. A needs its runtime in both worlds. That runtime is priced once as a shared bundled source asset, and each world instantiates its own state. A's catalog is 903 bytes for System and 207 for Keys. Median extractor build time on Node was 1.844 ms for System and 0.478 ms for Keys. The size figures exclude cross-world dispatch and catalog negotiation glue as well as compiler and bin alignment, so none of them is a linked flash size.

The 20-frame capsule prepared for the board contains 17 publications. It carries 22,072, 8,002 and 18,980 bytes for G, M and A, all with checksum 2164593678. The physical trial below uses these counts to validate every repetition.

## Evidence gaps

- **Ground truth for static bytes.** No exhaustive ground truth exists for truly static bytes.
- **Post-hoc comparator.** The manual Keys comparator was written after the blind trial.
- **S1 tail timing.** The paired M/S1 tail gate is unresolved, and one sample's raw blocks are lost.
- **Allocations.** S1 has no allocation census, and the heap figures have no per-owner attribution.
- **Install cost.** No resident install crossed a real screen channel.
- **Size and timing coverage.** The size figures omit integration glue. The host and physical stage clocks both exclude live publish-to-panel latency.
- **Same-tab refresh.** P1 supports no conclusion about same-tab refresh.

## What the physical handheld measured

The measurements came from a real handheld ESP32-P4 running a temporary experiment firmware. Each of the three arms, labelled G, M and A, ran inside a fresh QuickJS realm. Every arm replayed the same 20-state trace of boundary render attempts, and 17 of those attempts produced changed deliveries. The trace ran once per block, and five rotating blocks on the same boot varied the order of the arms, so each arm contributed five repetitions under shared conditions.

The clock covered two kinds of work. Producer time covers building each publication plus the equality check that suppresses unchanged ones. Receiver time covers parsing and reconstructing the tree for each changed publication. Source parsing finished before timing began. Outside the timed region, the caller tallied bytes and hashed every fully expanded tree. G, M and A reported their expected physical totals of 22072, 8002 and 18980 bytes, and every checksum equalled 2164593678, matching the digest obtained from the independently checked host trees. A 320x320 RGB565 pixel comparison used the native host rasterizer in the separate pixel trial.

All times are in milliseconds.

| Arm | Producer median | Receiver median | Combined median | Combined range | Paired combined ratio median | Worst producer segment | Worst receiver segment |
|---|---|---|---|---|---|---|---|
| G | 80.003 | 21.559 | 101.960 | 99.114–103.016 | 1.0000 | 6.483 | 1.870 |
| M | 39.395 | 34.149 | 73.345 | 71.106–74.084 | 0.7266 | 3.793 | 2.802 |
| A | 223.504 | 96.103 | 319.515 | 317.201–321.654 | 3.1337 | 16.417 | 9.268 |

M saves 28.615 ms against G per repetition. A costs 217.555 ms more than G.

M moves work from the producer to the receiver. Its producer median falls by 40.608 ms while its receiver median rises by 12.590 ms. The worst producer segment drops from 6.483 to 3.793 ms, but the worst receiver segment grows from 1.870 to 2.802 ms. Stage medians do not add up to combined medians, because each median comes from its own distribution. G's stages add to 101.562 ms and M's to 73.544 ms, which is why the table reports the measured combined values directly.

A developer can conclude that, within the measured stages, M does less total work than G for this trace while sending 8002 bytes instead of 22072 and rebuilding the same trees. M's highest combined time stays below G's lowest across all five repetitions. A is slower in every column. The capsule did not paint, queue or update the real display, and it did not exercise concurrent event dispatch, so it says nothing about frame time or responsiveness under load.

Separately, a single live generic System Down press on the physical production path, in instrumented experimental firmware, recorded 602 µs for the sysmon key, 7113 µs for render and publish with 1780 bytes, 15600 µs for a compositor frames event, 24557 µs for a deferred compositor draw, 4292 µs for a nested graphics commit of 3 rectangles, and 5057 µs for one SPI pixel-send sample of 18240 bytes among several. These are single observations of a different path. Candidate packets never travelled through it, and the figures should not be summed or treated as a latency estimate.

M merits a live publication-boundary trial with G as the fallback. A fails the measured performance gates. The live trial should check the compositor’s turn allowance because M increased the receiver cost and its worst observed single receiver segment.

## Decision

The physical stage result qualifies M for an integrated publication trial with the existing generic painter. Shipping that change would require a live cross-world comparison and recovery tests.

- **M** keeps one restartable complete message, falls back to exact generic JSON when the catalog is missing, and costs 567 source bytes over G.
- **A is rejected as implemented.** It recovers 19.95% (System) and 10.43% (Keys) of the manual saving relative to G. It sends more bytes than S1 on both programs and runs roughly three times slower on the host.
- **S1** remains a research comparator because its receiver needs prior state and its tail timing against M is unresolved.
- **G** remains the fallback path.

A direct residual emitter that generates materialization-saving code would need explicit immutability and escape analysis, and it is a separate experiment.

## Reproducing the work

The clean-copy script `18-reproduce.sh` regenerated the following byte-identically:

- all five primary wire streams
- both pixel receipts
- `protocol-audit.json`
- the minified size report

Two failures occurred during the trial.

1. The first Keys driver fixture stopped with `ReferenceError: ask is not defined` before any candidate was scored. Only the harness was repaired, and the rule and event inputs were preserved.
2. The first raster attempt failed with `spawnSync git EPERM` in the sandbox. An approved local run then exposed a fixture misuse that caused raster exit 7. The banner had been passed as a string where the real paint expects `{text, sub, color}`. The export adapter was fixed, and the wire format did not change.

| Purpose | Files |
|---|---|
| Blind assignment | `01-design-commission.txt` |
| Corpus and harness | `03-corpus.cjs`, `04-harness.cjs` |
| Manual arm | `05-manual-producer.js`, `06-manual-receiver.js`, `07-manual-study.cjs` |
| Automatic arm | `08-extract.cjs`, `09-auto-runtime.js`, `10-auto-study.cjs` |
| Holdout and board | `11-keys-holdout.cjs`, `12-board-capsule.cjs` |
| Comparisons | `13-comparisons.cjs`, `16-protocol-audit.cjs`, `22-paired-diff.cjs`, `24-keys-normalization.cjs` |
| Cost | `14-host-heap.c`, `15-heap.sh`, `23-source-cost.sh` |
| Reproduction | `18-reproduce.sh` |
| Results | `summary.json`, `protocol-audit.json`, `paired-diff.json`, `keys-normalization.json`, `sysmon-pixel-receipt.json`, `keys-pixel-receipt.json` |
| Freezes | `frozen-inputs.sha256`, `extractor-freeze.sha256` |

This report is dated 20 November 2026 and was prepared by the commissioned Opus researcher (Opus High) against blind commit `508dee2` and frozen extractor `958d760`. The complete reproduction guide is reference/04-reproduction.md, with the physical importer in scripts/26-read-board.py.
