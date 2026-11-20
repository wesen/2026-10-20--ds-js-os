---
Title: A bounded screen renderer from producer to panel
Ticket: PICOCALC-RENDER-NEXT
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/js/apps/sysmon.js
      Note: Worlds table and its dynamic window
    - Path: repo://picocalc-os/js/system/compositor.js
      Note: Frame receipt, measurement and painting in CJI
    - Path: repo://picocalc-os/nucleus/gfx.c
      Note: Pixel comparison and repair
    - Path: repo://picocalc-os/nucleus/kernel.c
      Note: Comparison, retention and replay
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T10:30:49.584915038-05:00
WhatFor: ""
WhenToUse: ""
---

# A bounded screen renderer, from producer to panel

*Reviewed research proposal awaiting project-owner validation. Opus authored the initial design. Astra checked it against the implementation, and the director incorporated the corrections. The measured production reference is the earlier qualification of firmware `ef0ff95`. The proposed treatments have no device results yet.*

## 1. What this document is

PICOCALC-RENDER-NEXT asks one question. Can the path from "an app describes its screen" to "pixels change on the panel" use less memory and repeat less work, while keeping every safety property the current system has?

The lab will use one corpus for four questions. Can a reader avoid building an object tree? Can a compiler remove repeated screen construction? How often does layout recompute the same size? Which raster work can a renderer skip? Each question has a control and an observation that would justify further work. Follow a Worlds selection change through the seven stages, then use the implementation plan to choose which study to run.

**Conventions**

- A backticked name with a file reference, such as `kernel_publish` in `nucleus/kernel.c`, is code that exists in the checkout today.
- A code block labelled **NEW (proposed)** is pseudocode for something that does not exist. Its names are placeholders.

**Background.** An earlier incident produced two overrun receipts and two out-of-memory receipts. That fix has shipped. A later producer improvement shrank synthetic tree bytes:

- Worlds: 4016 to 1766
- Handles: 2641 to 1529
- Buses: 2678 to 1166

Separately, 134 host drawing comparisons were run, and a corrected 152-second run had no restarts. We have no current evidence that any stage below is a bottleneck. Phase 0 exists to find out.

## 2. The pipeline today

The hardware is an ESP32-P4 with a 320x320 RGB565 panel. At 2 bytes per pixel, a full frame is 204,800 bytes. The compositor has an 80 ms time budget and a 768 KiB memory budget. Its CJI module heap and the device framebuffer have different owners. The CJI graphics call requests a DMA handle. The kernel allocates two planes in PSRAM through `dmabuf_alloc` and `port_big_calloc`, outside the CJI module heap. Account for their combined 409,600 bytes in the device budget while the backing is live.

```text
 PRODUCER   sysmon.js (QuickJS)  |  editor via typedSdkScreen
     |      JSON screen tree
     v
 KERNEL     kernel.c: eng_render -> strcmp vs previous
     |      -> W->frame = new -> frame_message
     |      -> kernel_publish / new_msg (one copy per subscriber)
     |      retained; replay_retained at compositor start
     v
 CJI RECV   world-native.js $message: $decode, JSON.parse
     |      compositor.js frames: check f.app === msg.from,
     |      store last tree/title/hints per sender; mark dirty
     v
 GEOMETRY   measure(n,w), measureStack, rowWidths, stack, drawTable
     v
 PAINT      draw self-event: repaint the screen
     v
 COMMIT     framebuffer.commit -> gfx_commit (16-row bands) -> rects
     v
 DISPLAY    display.js: SPI flush of changed rectangles
```

### 2.1 Producer

- The system monitor is a QuickJS app in `picocalc-os/js/apps/sysmon.js`. It samples every 500 ms and keeps 48 graph points.
- The typed Editor lives in `picocalc-os/worlds/editor/document-view.typed`. Its `editorDocumentFrame` builds a buffer, and `typedSdkScreen` submits it as JSON. The Editor has no `ui.*` AST.

### 2.2 Kernel (`picocalc-os/nucleus/kernel.c`)

What happens when an eligible app finishes a segment successfully:

1. `eng_render` runs.
2. Its output is compared with the previous frame using `strcmp`.
3. `W->frame` is replaced. This happens *before* `frame_message` is built.
4. `kernel_publish` and `new_msg` duplicate the JSON once per subscriber.

Other properties:

- The kernel constructs the envelope with the publishing world’s name. Screen admission also needs to authenticate the publisher generation across restart.
- Kernel channels require privileges.
- When the compositor starts, `replay_retained` rebuilds posts from eligible publishers.

Limits:

- At most 32 worlds.
- `RETAIN_MAX` is 4096 bytes for ordinary posts. It explicitly excludes screens.
- `NW_SCREEN_MAX` is 16384 bytes for native screens. JavaScript screens do not inherit this limit.

### 2.3 CJI receiver

- The compositor, `picocalc-os/js/system/compositor.js`, is JavaScript compiled by CJI. It is not built by the RV32 typed app compiler.
- In the generated receiver, `$message` calls `$decode`, which calls `JSON.parse` before the ordinary handler runs. Certain payloads take an additional traversal through `$wire`.
- At the C level, `cji_elf_event` receives the counted payload. The host event API converts the UTF-8 bytes into a managed string when generated code requests that field.
- The native turn is timed before the return code is checked.

### 2.4 Geometry

`measure(n, w)` computes intrinsic height and growth. A column or box calls `measureStack` to measure its children. Later, drawing that container calls `stack`, which measures those children again to distribute spare height. `rowWidths` computes sibling widths. `drawTable` sizes columns and paints visible cells. Font and width constraints affect wrapped text height, so one text change can move subsequent siblings.

Android's view system has the same shape: a measure pass followed by a layout pass. Its documentation notes that a parent may call `measure()` on a child more than once.

### 2.5 Paint

- `dirty` coalesces draw requests.
- The `frames` event stores each sender's last tree, title and hints.
- The `draw` self-event calls `paint` for the whole screen. Pixel comparison happens during commit. Comparing old and new widget bounds *before* painting is the proposed partial-redraw experiment.

### 2.6 Commit

`framebuffer.commit` returns changed rectangles. Underneath it, `gfx_commit` in `gfx.c` compares 16-row bands. A 320-row panel has 20 bands.

### 2.7 Display

`display.js` sends only the changed rectangles over SPI. After a restart, the first render must recover and repaint the whole panel.

## 3. Current guarantees and proposed admission rules

I1 and I2 describe the current message contract. I5 describes required recovery when the panel state is unknown. I3 and I4 are new admission rules for the bounded design. Each has an observable pass condition.

- **I1 Complete snapshots.** Every screen message describes the whole screen and can be replayed on its own. There are no deltas and no patches against a previous frame. `replay_retained` and restart recovery depend on this.
- **I2 Sender identity.** The kernel stamps the envelope with the sender's own name, and the compositor checks `f.app === msg.from`. Any new ingress path must make the same check before it stores data.
- **I3 Last-good atomic replacement.** A new frame either fully replaces the old one or is rejected and leaves the old one intact. Today `W->frame` is replaced before `frame_message`. Validation of size and structure must therefore move *before* retention. Otherwise the last good frame is lost on restart.
- **I4 Oversize diagnostic.** An oversize screen must produce a visible diagnostic attributed to its sender. It must not be silently truncated or crash anything. JavaScript screens currently have no explicit screen limit, so they need one.
- **I5 Full repaint after restart.** The first render after a compositor restart ignores all damage state and repaints everything.

## 4. What "bounded" means here

A per-frame arena is tempting, but it cannot bound memory globally. Retained frames, queued deliveries and subscriber copies all outlive a single frame. Record the peak for each owner and the simultaneous total across owners. Summing independent maxima can overestimate the observed peak. Counting only the incoming frame can underestimate it. For the hard bound, enumerate simultaneous permitted generations and copies, including old views held by deferred draws, and count a shared backing allocation once.

```text
 ledger                       owner        lifetime
 accepted + incoming screens   kernel/view  last accepted or pinned generation
 token index / decoded text    compositor   view or temporary text-call lifetime
 render temp                  compositor   one draw
 wrappers / envelopes         kernel       until delivered
 queued deliveries / gens     kernel       until consumed
 subscriber views or copies   kernel       per subscriber
 retired pinned frames        kernel/CJI   until last reader drops
 framebuffer storage          kernel/gfx   DMA handle/backing lifetime
```

Bounds must cover **work** as well as bytes:

- decoded escapes (for example, `\uXXXX` sequences and surrogate pairs);
- typed values (for example, numbers converted to doubles);
- collections (item counts and nesting depth).

Binary formats contain zero bytes. A binary payload therefore needs a transport path that carries its length. Sending binary through the existing NUL-terminated JSON messages cannot work.

One honest limit applies throughout. A bounded renderer cannot promise anything about allocations inside an arbitrary producer. We can bound only what crosses the kernel and what the compositor does with it.

## 5. Candidate representations

### A. Baseline: current JSON objects

`JSON.parse` builds a full object graph for every message. This path is simple, well tested and already qualified. Every candidate is compared against it.

### B. Read-in-place bounded JSON token index

The receiver validates the raw bytes once and builds a fixed-capacity token array. Index entries hold offsets and lengths into the original bytes. Recording an offset needs no copy of that string. Decoding an escaped label or transcoding text for the font API can still require bounded scratch. Fields are then read lazily. FlatBuffers uses the same idea in a binary format: fields are read at offsets inside the buffer, with no unpack step.

Two conditions make this a real change rather than a cosmetic one:

- Ingress must bypass generic object creation. It must not also call `JSON.parse` "just in case."
- The bytes must stay retained and immutable after event delivery returns, because the compositor keeps each sender's last frame.

```c
/* NEW (proposed): none of these names exist today */
typedef struct { uint32_t off, len; uint8_t kind; uint16_t next; } rn_tok_t;

typedef struct {
  rn_bytes_t *bytes;   /* refcounted, immutable, outlives event delivery */
  uint16_t    ntok;
  rn_tok_t    tok[RN_TOK_MAX];
} rn_view_t;

rn_status rn_validate(const uint8_t *p, uint32_t len, rn_view_t *out) {
  if (len > RN_SCREEN_MAX) return RN_OVERSIZE;          /* I4 */
  /* single pass over p[0..len); reject when any limit trips:  */
  /*   depth > RN_DEPTH_MAX        ntok  > RN_TOK_MAX          */
  /*   decoded string bytes > RN_STR_MAX                       */
  /*   items in one collection > RN_ITEMS_MAX                  */
}
```

Set capacities from the device budget, required widget semantics, maximum concurrent owners and worst permitted shapes. Use M0–M3 to check which real frames fit and how much headroom remains. A largest observed fixture cannot establish a hard bound. The complete implementation also needs schema validation and a success result that owns the indexed storage.

Compare materializing and indexed readers using the same execution engine, call boundary, input, field traversal and text semantics. If the new reader is a C helper, build the matching materializing control at that boundary. Keep the production CJI path as a third measurement. A move from CJI to C combined with an indexed representation would otherwise confound the two causes.

**Why an index can still lose.** Let B be encoded bytes, K indexed tokens and Q field lookups in one paint. A single-pass builder can inspect O(B) bytes and store O(K) records under the fixed caps. A renderer that starts from the root for every lookup can still examine O(QK) entries. Subtree end offsets skip children in one step, but finding a named field can require scanning all siblings. Record actual field visits, repeated string decoding and maximum collection width. Compare both time and space with materializing a frame once and reading its fields cheaply thereafter. A small repeatedly painted screen is a plausible case in which the existing representation wins.

### C. Optional definite-length CBOR (RFC 8949)

A definite-length CBOR string gives its byte length, an array gives its element count, and a map gives its pair count. The reader can reject excessive declared counts immediately. It still has to walk variable-length children to find the end of a container, checking nested bounds and remaining bytes. The proposed trial accepts only definite-length items.

Deterministic encoding (RFC 8949, section 4.2) would let the kernel keep detecting unchanged frames by comparing bytes. However, `strcmp` stops at the first zero byte, so that comparison would have to become length-based.

CBOR depends on a binary-safe transport path. Until such a path is approved, CBOR stays a host-only experiment.

### D. Build-time immutable templates plus complete packed values

This candidate applies partial evaluation to screens. Inside a screen-building function, values fall into two groups:

- **Static** values are known at build time: tree shape, constant labels, fonts and layout kinds.
- **Dynamic** values are known only at run time: numbers, the selected index and user text.

A binding-time analysis separates the two groups.

- The static part becomes an immutable template that is flashed with the build.
- Each frame sends a template id, a template version and a **complete** value vector.

Because the vector is complete every time, I1 still holds: the receiver can rebuild the whole screen from the template and one message, without any previous frame.

```text
 NEW (proposed) wire shape
 +--------+---------+-------+-----------------------------+
 | tpl_id | tpl_ver | nvals | v0 | v1 | ... | v(n-1)      |
 +--------+---------+-------+-----------------------------+
 resolver(tpl_id, tpl_ver) -> template | MISS
 MISS -> reject before replacing the last good screen
```

The producer and admission path must agree on the installed template catalog. In the experiment a producer emits a complete generic snapshot when that catalog has no matching entry. Admission verifies the version before retention. During restart an idle producer may never send again, so the retained snapshot must be resolvable from the installed catalog alone.

Not every program's shape is known statically. Loops over variable-length data and conditional panels are common examples. The extractor must therefore:

- rely only on explicit constants;
- fall back conservatively to the full tree whenever it is unsure;
- version template ids, so a stale resolver never misreads values.

### Helpers E and F

Two optional helpers are evaluated separately, so their effects are not confused with the choice of representation:

- **E. Bounded measure/layout scratch** (section 7).
- **F. Optional early damage tiles** (section 7).

## 6. A Down key in System’s Worlds table

Open System, select Worlds, freeze its samples and press Down. In `worldsTab`, the producer selects a window of up to eight worlds. For each one it constructs seven cells. A graph appears above the table and a key–value panel below it shows CPU, mailbox, limits, claims and last error for the selected world. The compositor owns the outer chrome, clock and notifications. The first test holds those inputs constant. A second test changes a notification independently.

```text
Worlds app                             Compositor
  graph from 48 samples                  clock and banner
  seven column headers                   active world and title
  up to eight rows, selected index       allotted screen rectangle
  details for the selected world         hints and chrome
                 \                      /
                  layout -> paint -> commit -> display
```

**Producer and kernel.** Moving the selection within the current window changes the selected index and usually the details. Crossing the window boundary can also change every row. The app submits the complete current tree. The kernel compares it with the previous serialized tree, stores the replacement and builds a sender-labelled envelope for subscribers. Count both the logical payload and all physical copies alive together.

**Proposed admission.** Validate bytes, shape and resource capacity before replacing the last accepted generation. Keep the old one while the candidate is being checked. If validation or reservation fails, report the reason to the publisher and replay the old generation after compositor restart. On success, transfer ownership of an immutable byte span; the incoming mailbox allocation is freed after dispatch. This order allows a later draw to dereference a view safely.

**Geometry.** Moving only the table highlight leaves row sizes unchanged in the current renderer. Selection-dependent detail strings may differ. In other widgets wrapped text can move all following siblings when available width or font changes. Track intrinsic measurement separately from final placement.

**Paint and commit.** The current compositor paints the entire screen. A partial renderer would need to consider both row highlights, the details and any other affected layer. Scrolling changes the table body. Removing a banner exposes underlying pixels. For illustration, a rectangle spanning y = 64 through 103 touches bands 4, 5 and 6. Touching a band does not establish that every pixel changed or predict the rectangles returned by commit.

**Display test.** Compare the reference RGB565 image before and after each input to find the pixels that changed. The proposed dirty region must include those pixels. Apply only the candidate’s actual successful transfers to a simulated panel and compare its complete image with the reference after settlement. A larger rectangle may correctly contain unchanged pixels. A skipped flush may leave the panel stale even though the CPU’s front buffer already matches the intended image. Test the subsequent resynchronization.

## 7. Geometry scratch and early damage tiles

### Bounded scratch

Recursive container measurement and later placement in `stack` can revisit a subtree under the same constraints. The proposal is a fixed-capacity scratch table per draw, with explicit overflow behavior:

```text
 NEW (proposed)
 measure_cached(node, w, font):
   key = (node_id, w, font_id)
   if scratch.has(key): return scratch[key]
   r = measure(node, w)                 # existing function, unchanged
   if scratch.full():
       stats.overflow += 1
       return r                         # still correct, just uncached
   scratch[key] = r
   return r
```

Overflow may change cost but must never change output. The scratch table belongs to the render-temp ledger (section 4) and is freed after each draw.

Before building any cache, add counters that record how often subtrees are actually remeasured.

### Early damage tiles

After layout, compare the old and new boxes of changed slots and produce a tile set before painting. This is safe only if the prediction is conservative: the predicted set must cover every pixel that actually changes.

The check is mechanical:

- On every corpus transition, each reference pixel whose value changes must fall inside a predicted tile. Verify the final full framebuffer and the panel reconstructed from the candidate transfers.
- A single miss on any recorded frame is a correctness failure and disables the feature.
- The first render after a restart bypasses prediction entirely (I5).

## 8. What a screen compiler can actually remove

A compiler can determine the seven Worlds table headers from the source. It cannot determine the names, CPU shares or number of running worlds at build time. The number of columns is static even when the number of rows varies. This is the useful intermediate case for specialization: **a repeatable row shape with dynamic extent and contents**. The compiler can describe the row once and leave a loop to obtain current values.

```text
Proposed template, simplified to the table subtree
  Table(columns = constant column descriptors,
        rows = Repeat(count_slot, Row(name, state, color, turns,
                                      share, cpu_ms, memory, restarts)),
        selection = selection_slot)

Proposed residual producer when this source shape is supported
  window = tableWindow(current.worlds, current.selection, 8)
  write the row count
  for w in window.items in source order:
      evaluate the original cell expressions in source order
      emit the resulting text and colors
  write window.sel
  finish the complete snapshot, including graph, details, title and hints
```

The example preserves the existing functions that format counters. Hoisting `short(w.turns)` would freeze a changing value. Dropping or reordering a user function called in a cell expression could change observable behavior even when it returns the same string. Begin with recognized constructors and immutable constant descriptors. Keep dynamic expression evaluations at their source positions, including conditional evaluation. Where effects, object mutation, variable field names or builder identity cannot be established, record the reason and use the original complete snapshot for that site or screen. Tests should count evaluations as well as compare pixels. An empty collection, a window shift and a change of conditional branch exercise three distinct contracts.

**How to test the compiler claim.** Compare the existing complete generic snapshot, a hand-authored template with complete values, and the automatically extracted template. Hold deduplication, layout, painting, inputs and catalog version constant. Include unchanged events, edits to dynamic slots, structural changes and fallbacks. If the manual arm wins but automatic extraction frequently falls back, we have evidence for the representation and a limit on the compiler. If the manual arm barely improves end-to-end cost, a smarter extractor has little opportunity on this workload.

For a cost metric such as microseconds per transition, let G, M and A be the paired costs of generic, manual and automatic production. Report G − M and G − A with uncertainty before reporting a fraction. When G − M is positive and clearly above noise, (G − A)/(G − M) estimates how much of the manual improvement automation recovered. Report flash and build cost separately. A manual implementation is a comparator for this encoding, with no claim of theoretical optimality.

Freeze the extractor before testing **Keys**, an ordinary constructor-based producer. **Typed Editor** writes its own UTF-16 JSON and calls the screen SDK. Reserve it as an independent held-out workload for the reader, layout and painting. An extractor’s applicability and a decoder’s generality are separate claims.

## 9. How the lab executes the work

The [lab phase guide](02-lab-phases-independent-studies-and-device-qualification.md) is the authoritative task list. The letters label separate questions and stay fixed across host and device work.

```text
M0-M3  captured inputs, pixel oracle, stage timings, ownership budgets
  |-- R0-R2  bounded admission, indexed JSON, restart and rejection
  |-- T0-T3  manual template, extractor, frozen Keys trial, device test
  |-- L0     measure repeated layout   -> L1 if worthwhile
  |-- D0     measure avoidable paint   -> D1 if worthwhile
  |            D1 may use existing full layout
  |-- R3     optional binary representation if syntax remains costly
  v
P4     independent device replay, interaction trial and disposition
```

One experimentalist owns the common corpus and board schedule. Representation and compiler researchers can begin ownership design and manual-template work while the renderer researcher instruments the control. Candidate measurements start after the control replays. The [consolidated literature survey](03-research-families-primary-sources-and-promotion-criteria.md) gives the conditions for advancing a reserve technique.

## 10. Benchmarks

All arms use the same frozen corpus, the same stages and the same instrumentation.

- **Board.** We have one physical P4. Run paired, interleaved trials (A B B A, and so on) so that drift, temperature and run order affect both arms equally. Record the build id, corpus hash, arm and seed for every trial.
- **Host.** Independent researchers replay the corpus on host builds and report separately. Host results never substitute for board results.
- **Per stage.** Measure time and bytes for producer encode, kernel publish, receiver ingress, measure, paint, commit and display flush.
- **Memory.** Record owner peaks, correlated device-wide high-water, queue occupancy and logical versus physical bytes per frame. State which memory populations each probe covers.
- **Correctness.** Require equal final pixels, a simulated panel repaired by the candidate transfers, and passing contract and recovery tests. Rectangle lists can differ for the same final picture. Use the completion of the final matching SPI transfer when making claims about the device transfer endpoint.
- **Reporting.** Report distributions: median, high percentiles and maximum. Pay particular attention to worst-case turns against the 80 ms budget.

## 11. Falsification and stop rules

The experimentalist freezes tolerances, corpus and observation endpoints before candidate results are available.

- **Indexed JSON.** A valid frame that escapes the documented resource bound or a rejected frame that destroys the last good screen fails qualification. Measure the separate performance hypothesis with paired trials. A proven bound may justify a measured time or space trade.
- **Alternative encoding.** Promote R3 only if parsing textual syntax remains material after indexing. Charge producer cost and every transport change as well as decoder savings.
- **Templates.** Compare generic, manual and automatic generation on mixed transitions under identical deduplication. Low automatic coverage on frozen Keys limits the generalization claim. A losing manual arm is reason to defer extraction for that workload.
- **Layout scratch.** Use L0 to estimate the maximum time removable by avoiding repeated measurements. Defer L1 if even that ceiling is negligible.
- **Partial redraw.** A single missed changed pixel or an unrepaired stale panel fails the candidate. Correctness is necessary; compare raster, commit, transfer and total time to learn where the work went.

## 12. Rejected-result retention

Negative and inconclusive results are kept. They are not deleted, and runs are not repeated until they look better.

- Every run, including aborted ones, gets a ledger entry with the date, build, corpus hash, arm, raw receipts and a one-line verdict.
- A rerun must cite the run it replaces and the reason for replacing it.

## 13. Designs considered and rejected

- **Delta or patch messages.** They break I1 and restart replay.
- **Indefinite-length CBOR.** Streaming validation with cumulative caps is possible, but supporting both forms adds another code path to the first encoding comparison.
- **Binary payloads in NUL-terminated messages.** Zero bytes truncate them.
- **A per-frame arena as the only memory bound.** Several lifetimes exceed one frame.
- **Assuming a transport refactor or production deployment.** Neither is approved.

## 14. Reading the source

From the repository root, follow one Worlds update in this order. The source references are implementation anchors; the types prefixed with `rn_` in this guide are proposed APIs.

| File | Entry point | What to verify |
|---|---|---|
| `picocalc-os/js/apps/sysmon.js` | `worldsTab`, `tableWindow`, `lineGraph` | Static headers, windowed rows and graph encoding |
| `picocalc-os/worlds/editor/document-view.typed`, `picocalc-os/sdk/typed/world.c` | `editorDocumentFrame`, `typedSdkScreen` | The typed producer constructs and submits its own serialized view |
| `picocalc-os/nucleus/kernel.c` | `eng_render` call site, `frame_message`, `kernel_publish`, `replay_retained` | Order of comparison, replacement, fan-out and replay |
| [CJI receiver source](../../../17/PICOCALC-CJI--cji-workspace-import-and-picocalc-integration-analysis/sources/cji/src/world-native.js) | `$message`, `$decode`, `$wire` | The allocations incurred before an ordinary frame handler |
| `picocalc-os/js/system/compositor.js` | `frames`, `dirty`, `measure`, `stack`, `paint`, `draw` | Receipt and drawing occur on different events |
| `picocalc-os/nucleus/hw.c`, `picocalc-os/nucleus/gfx.c` | `dmabuf_alloc`, `gfx_commit`, `gfx_invalidate` | Framebuffer ownership, changed-band comparison and recovery |
| `picocalc-os/js/drivers/display.js` | `attach`, `flush` | Panel ownership, skipped transfers and settled SPI jobs |

### Primary references

- RFC 8949, Concise Binary Object Representation (CBOR): https://www.rfc-editor.org/rfc/rfc8949
- FlatBuffers internals: https://flatbuffers.dev/internals/
- Android, "How Android draws views": https://developer.android.com/guide/topics/ui/how-android-draws
- Jones, Gomard and Sestoft, *Partial Evaluation and Automatic Program Generation* (on binding-time analysis): https://raspi.itu.dk/people/sestoft/pebook/pebook.html
