---
Title: What an index on the wire buys a PicoCalc renderer
Ticket: PICOCALC-RENDER-BINARY
Status: active
Topics:
    - picocalc
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/various/device-summary.json
      Note: Seven-block physical evidence across the two component builds
    - Path: repo://ttmp/2026/11/20/PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/various/host-evidence.json
      Note: Host allocator timing wire and complete RGB565 evidence
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:35:08.682895059-05:00
WhatFor: ""
WhenToUse: ""
---

# What an index on the wire buys a PicoCalc renderer

*Research design and article by Opus High. The experiment operator implemented PSIX and led the QuickJS, raster and conformance replay. An independent engineer from the Snake group built the native reader control. An independent engineer from the System group added the matched native sender. The lab director operated both physical runs.*

## One frame and one value

Every frame on the PicoCalc is a 320×320 RGB565 image. An ordinary app does not send pixels. It emits a complete immutable screen tree. The kernel then stamps the sender and title into NUL-terminated JSON, and the CJI compositor stores the last tree it accepted and paints from it.

Consider a tree whose root holds a kids array with two children. The first is a label and the second is a gap whose h field is 2. In JSON this tree is `{"kids":[{"t":"label"},{"t":"gap","h":2}]}`, which is 42 bytes. Suppose the painter needs the h of the second child late in its pass. A JSON receiver has to parse the whole text before that value exists. PSIX v1 stores offsets in the bytes, so an admitted reader can go straight to the value.

## Following kids[1].h through the bytes

The PSIX packet for this tree is 73 bytes, which is larger than the JSON. Byte 10 of the header holds the root reference. Every reference is three bytes long and consists of a 4-bit tag and a 20-bit operand. The tag distinguishes inline values from offsets to bodies. The UTF-8 dictionary comes after the header. Its strings are deduplicated within the packet, kept in sorted order and located through an offset table that ends in a sentinel. The five strings receive the IDs gap=0, h=1, kids=2, label=3 and t=4. The body follows the dictionary.

The root reference points to an object at byte 39. An object holds a u16 field count followed by (u16 key ID, 3-byte reference) pairs sorted by key ID. The root's only pair is key ID 2, which is kids, and its reference points to an array at byte 46. An array holds a u16 count followed by 3-byte references, so the reference for item i sits at start+2+3*i. In this array those positions are 48 and 51. The slot at 51 points to the second child at byte 61. That child's first pair begins at 63 with key ID 1, which is h. The reference at 65 is an inline integer with operand 2. The pair for t follows, and the packet ends at byte 73.

To resolve the field name, the reader binary searches the object’s ordered entries. Each probe uses the key ID in that entry to locate its UTF-8 bytes and compare them with “h”. The search visits the field directory of that object.

Once the packet is admitted, the first child's body at byte 54 plays no part in this access. Admission does read it. PSIX requires strict body preorder, so during validation each noninline child body offset must equal the next unconsumed body position. As a result the validator makes one forward pass, and no two references can share a body. This is consistent with v1 having no shared subtrees.

## What the three QuickJS controls do with that access

The JS experiment operator ran three controls in the same QuickJS build.

Control P is deployed-style. The producer calls native JSON.stringify, and the receiver calls native JSON.parse and then checks the sender envelope. Reading kids[1].h is an ordinary property read on objects that JSON.parse has already built in full. P has no tree caps matched to PSIX.

Control G adds structural conservation caps after the parse. This makes its admission comparable to PSIX validation.

Control B encodes in JS and validates and copies the bytes at admission. It presents the bytes through a Proxy adapter, so the unchanged production painter source performs layout and draw generation. In B, reading kids[1].h becomes the offset arithmetic and binary searches described above, executed in JS.

## PSIX v1 against the blind proposal

The blind proposal was written before any timing. It described a format called UITB with aligned 8-byte slots, sorted field IDs, block starts indexed during verification, an optional resident dictionary, an exact-F32-or-reject numeric rule, and optional deduplication and typed vectors. It made three predictions. The dictionary arm would be at least 20% larger on the wire in all four workloads. The two-generation peak would be at most 60% of JSON. There would be little gain where paint dominates.

PSIX v1 keeps the direct array slots and sorted maps. It uses 3-byte slots, binary64 fidelity for real floating values and strict body preorder. It has no app-specific resident dictionary, no shared subtrees and no delta, and typed transport is unimplemented. Its memory figures also use different baselines from the proposal. The results below therefore do not test the proposal's predictions as they were stated. The FlexBuffers internals (https://flatbuffers.dev/internals/) are the official precedent for direct vectors and sorted maps. FlexBuffers uses variable widths and offset directions of its own.

PSIX caps a packet at 32768 wire bytes, 24 levels starting at depth 0, 8192 values, 1024 items or 64 fields per collection, 4096 unique strings and 2048 UTF-8 bytes per string. Validation covers structure and the sender envelope only. A receiver view cannot outlive the owned immutable bytes it reads.

The failure handling was tested in several ways. A host last-good test kept the accepted bytes when faced with a wrong sender, a malformed candidate and a stale generation. During that test an old view stayed pinned while a new frame replaced it. The JS fuzzer made 30,000 deterministic small mutations. Of these, 26,696 were rejected and 3,304 stayed valid and re-encoded to equivalent values. All 23 conformance cases passed. A separate native suite under its own allocator and sanitizer rejected 56 crafted replacements and preserved last-good. Widget-level limits and a real ownership ledger still need work.

## Correctness across four workloads

The four workloads are traces of real System, Chess, Snake and Editor screens. The Editor trace was held out from design and from the choice of representative cases until the rule was frozen. All 427 trees and their draw command streams were equivalent. Independent executions of production gfx compared every RGB565 byte. That is 87,449,600 bytes across unique frame observations, which equals 427 full frames. Each trace also recovered after a simulated skipped flush partway through. None of this is a hardware panel measurement.

## Bytes and time on the host

Wire figures count complete receipt payloads in bytes, including sender, title and frame structure. Timings are x86 medians in microseconds. The QuickJS column covers encode, admit and one paint without raster or SPI. The native reader column covers admit, full walk and release. The native sender column covers encode, admit, one lookup and release.

| App | Frames | JSON | PSIX raw | Base64 only | Base64 + envelope | QuickJS P / G / B | Reader G / B | Sender G / B |
|---|---|---|---|---|---|---|---|---|
| System | 100 | 179,330 | 163,672 (−8.7%) | 218,388 | 225,598 (+25.8%) | 634.57 / 926.41 / 2821.71 | 28.11 / 7.25 | 40.25 / 21.84 |
| Chess | 47 | 183,891 | 144,822 (−21.2%) | 193,188 | 196,478 (+6.8%) | 450.60 / 804.14 / 2240.46 | 71.88 / 21.45 | 85.00 / 29.34 |
| Snake | 236 | 200,508 | 196,787 (−1.9%) | 262,688 | 279,208 (+39.3%) | 160.75 / 277.14 / 831.31 | 14.32 / 4.69 | 18.53 / 6.78 |
| Editor | 44 | 95,708 | 76,321 (−20.3%) | 101,836 | 105,004 (+9.7%) | 514.70 / 881.87 / 2225.90 | 61.91 / 18.95 | 74.97 / 22.13 |

Raw PSIX is between 1.9% and 21.2% smaller than JSON. Base64 alone makes each payload 1.33 times its raw size, which already puts every workload above JSON. With the JSON envelope added, PSIX is between 6.8% and 39.3% larger than JSON. Snake saves the least in raw form and ends up worst. The modeled text wrapper costs more than the packed fields save.

The representative frames were chosen by median JSON size among eligible frames. Each case uses the first and last entry of its largest array. The cases are System select-3 (graph points 0 and 47), Chess castle-long/003 left (canvas op 0 and 100), Snake auto-79 (op 0 and 13) and Editor replace-search/query unit 5 (a frozen path manifest). Their raw JSON and PSIX sizes are 1919 and 1850, 3443 and 2761, 758 and 766, and 3105 and 2572 bytes. The Snake frame is therefore 8 bytes larger in PSIX.

## QuickJS

Each QuickJS figure is the median of five fresh realms, and all three controls feed the same command hash sink. For the full frame, B takes 4.3 to 5.2 times as long as P and 2.5 to 3.0 times as long as G. This trial deliberately shows the cost of this particular integration. The JSON side uses built-in native routines, while the PSIX side is JS running behind a Proxy.

B admission was faster than G. The G and B admission times were 321 and 172, 438 and 221, 131 and 94, and 384 and 205 microseconds. B then gives that advantage back in drawing, lookup and producer work.

The two-generation consumer live increments exclude input and C allocations. For P and B they were 30,608 and 40,432 bytes for System, 74,192 and 38,144 for Chess, 12,272 and 46,384 for Snake, and 61,792 and 45,920 for Editor. B is smaller for Chess and Editor and larger for System and Snake. The baseline includes fixtures and code that were already loaded, and these figures should not be extrapolated to the P4. The trial used zero shared catalog bytes and zero template bytes. The codec text is 15,426 bytes and the serialized QuickJS host bytecode is 52,541 bytes. Neither figure isolates production firmware flash.

## The native reader control

The native reader engineer from the Snake group put both receivers in one C build. In G, cJSON materializes the tree, runs the cap and sender checks, and releases. In B, PSIX runs full validation into one owned wire copy and then releases. Both read the same late path, alternate the two paths 32 times in a separate loop and walk the full tree. Every witness agreed with JS. The shared C domain also rejects embedded NUL and caps string occurrences at 4096. This control does not paint and does not include the producer.

The timings are medians of 12 alternating blocks of 64 repetitions. PSIX was 3.1 to 3.9 times faster. Its requested payload allocation peak equals the wire size. For G and B the peaks were 17,276 and 1,850 bytes for System, 48,257 and 2,761 for Chess, 8,708 and 766 for Snake, and 42,327 and 2,572 for Editor. These peaks exclude allocator metadata, stack and source. cJSON made 543, 1360, 260 and 1181 allocation calls, while PSIX made one in each case. Two pinned Chess generations requested 96,514 bytes for G and 5,522 for B. The build and verification are in `scripts/native`, and full details are in `reference/03-native-measurement-diary.md` and `various/native-host.json`.

## The native sender control

The native sender engineer from the System group wrote a PSIX encoder over an already-resident cJSON tree. They compared it with cJSON_PrintUnformatted on the same tree in the same binary. Each sender was followed by the same checked receiver, one late lookup and release. The four specimens reproduce the JS PSIX packets byte for byte, and the cJSON output length equals the ordinary JSON specimen. This control includes no drawing and no transport.

The timings are medians of 9 alternating blocks of 32 per group. Sender-only times for G and B were 12.59 and 18.94 microseconds for System, 30.69 and 25.31 for Chess, 6.19 and 5.66 for Snake, and 26.00 and 18.63 for Editor. System is the only workload where the PSIX encoder was slower. B used a temporary string directory and field-sorting scratch, both released before admission. For the matched path, B was 1.8 to 3.4 times faster.

Peak requested allocations above the resident input include the wire and the receiver allocations. For G and B they were 19,196 and 3,700 bytes for System, 51,701 and 5,522 for Chess, 9,467 and 1,532 for Snake, and 45,433 and 5,144 for Editor. Each B figure is exactly twice the representative wire size. Receiver allocation counts were 543, 1360, 260 and 1181 for G and one for B. Raw results are in `scripts/producer/results`. Build details are in `scripts/producer` and `reference/04-native-producer-diary.md`. A JS producer time should not be added to a C decoder time to make a causal comparison.

## What the host evidence leaves for the board

On the host, a native receiver validated each frame once, kept one owned copy and reached late values without materializing the tree. In every workload it was faster and requested far less memory than cJSON. In QuickJS behind a Proxy, the same format made the full frame several times slower. On the current transport, base64 and the JSON envelope turn the raw savings into a net increase. The two device controls can test whether the native admission gains survive on the ESP32-P4 and whether the Proxy cost remains large.

An integrated trial would then need to time the path through the kernel, production raster and display transfer, and count the memory of every pinned generation.

## The same four screens on the ESP32-P4

The PicoCalc ran the same four frozen specimens on its ESP32-P4.

Each fixed device family rotated workloads and treatment orders over seven interleaved blocks. JavaScript used one run per block. Each native test used eight cycles per block. The three families ran on two separate board test images, and the director restored and verified the playable image afterwards.

The receipts total 84 for JavaScript, 56 for the native reader and 56 for matched native publication. No trial failed, and every arm produced the same witnesses for the same frozen specimens.

Route timings are medians of per-block means. The four specimens sample different workload shapes. Repaint and repeated lookup reuse one admitted generation. Full end-to-end timing would also include the production event bus and display transfer.

## Three QuickJS arms

The P arm uses the QuickJS built-in JSON parser plus the sender and envelope check. The G arm keeps P and adds the matched structural cap check. The B arm uses the PSIX JavaScript codec, the owned-byte validator and Proxy access from the renderer.

The paint stage times production layout and draw commands delivered to an identical checksum sink. The separate host replay measured equality of RGB565 pixels.

**Table 1. QuickJS on the P4, milliseconds per screen, medians**

| Specimen | Route P / G / B | Admit P / G / B | Encode G / B | First paint G / B | 32 lookups G / B |
|---|---|---|---|---|---|
| System | 35.969 / 53.934 / 168.723 | 2.573 / 20.526 / 9.894 | 2.853 / 43.034 | 30.533 / 115.897 | 1.338 / 12.719 |
| Chess | 26.687 / 51.114 / 134.457 | 4.390 / 29.087 / 13.008 | 3.803 / 34.999 | 18.261 / 86.450 | 1.601 / 12.146 |
| Snake | 9.934 / 17.576 / 48.328 | 1.612 / 9.607 / 5.192 | 1.705 / 14.833 | 6.291 / 28.226 | 1.595 / 13.410 |
| Editor | 32.855 / 55.317 / 133.166 | 4.137 / 26.687 / 11.964 | 3.949 / 29.749 | 24.669 / 91.382 | 1.388 / 12.426 |

The route column covers encode, admit and paint. It excludes the separately timed sparse lookups and traversal.

P has the fastest route on all four screens. Its admit stage is also the cheapest. That shows the native built-in parser inside QuickJS can beat even a bounded PSIX reader written in JavaScript.

The difference between the G and P admission medians estimates the cost of an interpreted structural cap walk on this board. It adds 17.953 ms on System, 24.697 ms on Chess, 7.995 ms on Snake and 22.550 ms on Editor. B admits faster than G on every screen. So when a full structural check is required inside JavaScript, the PSIX validator does that check more cheaply than walking parsed objects.

B loses the route because of encode and paint. The JavaScript encoder costs between 7.5 and 15.1 times the G encoder. Proxy-mediated paint costs between 3.7 and 4.7 times plain-object paint. Even the separate direct binary-access loop, which bypasses the Proxy, takes 12–14 ms for 32 indexed lookups, compared with under 2 ms for plain objects.

B paint alone exceeds 80 ms on System, Chess and Editor in this fixed command-sink experiment. Production CJI has a separate calibrated budget. The trial measures the JavaScript adapter and binary access path. Native PSIX paint remains a separate experiment.

## Native reader on the board

The independent native reader engineer from the Snake group built a receiver control. Source bytes are already available to both arms.

- In G, cJSON converts the bytes to native objects and then checks the caps and the envelope.
- In B, PSIX checks the caps and the envelope and copies one bounded byte span.

Both arms read one late field, alternate first and late paths for 32 queries, walk the full tree and release.

The native test domain matches what cJSON accepts. It restricts NUL bytes and string occurrences, and it was set independently of the JavaScript tests.

B completes admission, traversal and release in 10–15% of G's time across the four specimens. The full walk and the 32 queries are nearly equal between arms, and PSIX is slightly slower on the Chess and Editor walks.

The main saving comes from retaining one byte copy and avoiding object materialization. Lookup and traversal are similar. The clock boundary is the consumer alone.

## Matched native sender and receiver

The native sender engineer from the System group built a matched publication route. Both variants start from the same cJSON snapshot tree, already resident in memory.

- G serializes it with `cJSON_PrintUnformatted`.
- B builds PSIX using a temporary directory.

Each variant encodes a real frozen full wire payload, validates the sender and structural caps, performs one late field lookup, and releases. Wire lengths and FNV-1a hashes agree with the frozen host arms. A full walk verified correctness outside the route clocks. The design gives 448 publications in total, from seven blocks of eight cycles per arm across four screens.

**Table 2. Native C on the P4, medians**

| Specimen | Reader admit+walk+release G / B (ms) | Full walk G / B (µs) | 32 queries G / B (µs) | Encoder G / B (ms) | Sender route G / B (ms) | Paired route ratio B/G |
|---|---|---|---|---|---|---|
| System | 4.930 / 0.495 | 362.625 / 349.250 | 179.000 / 193.750 | 0.525 / 1.328 | 5.175 / 1.484 | 0.287 |
| Chess | 13.203 / 1.815 | 1572.625 / 1627.500 | 106.750 / 95.625 | 1.816 / 1.850 | 16.915 / 2.027 | 0.120 |
| Snake | 2.481 / 0.362 | 285.500 / 286.125 | 90.500 / 90.250 | 0.359 / 0.445 | 2.619 / 0.525 | 0.200 |
| Editor | 11.428 / 1.445 | 1257.375 / 1270.125 | 200.375 / 195.500 | 1.438 / 1.522 | 14.021 / 1.703 | 0.121 |

The ratio column uses a paired binary-to-JSON ratio within each block and reports the median of those ratios.

On the P4, the binary encoder is slower than cJSON printing on all four screens. The gap is 0.803 ms on System and under 0.1 ms on the others. The full baseline route takes 3.5–8.3 times as long as B because admission and release dominate.

The clock starts once the sender already has the native tree and ends before layout and paint.

## What changed relative to the blind predictions

The original UITB proposal used eight-byte slots, a resident dictionary arm, typed vectors and optional subtree sharing. Its size and dictionary predictions apply to that design. PSIX beat raw JSON on aggregate payload bytes and lost those savings when wrapped in text. Its JS heap benefit depended on the workload, while its native owned bytes were substantially smaller than cJSON objects in the host census. Large paint costs in Chess and Snake and the slow PSIX Proxy painter support the qualitative prediction that faster admission alone would not fix a paint-heavy route. The trials timed whole stages and leave the fraction spent on tag checks open.

## Decision and the Chess gate

Keep JSON on the current complete-screen path. The native PSIX implementation and fixtures go to one narrow integrated Chess trial. The JavaScript PSIX encoder and Proxy painter stay in the experiment.

That trial should use a compiler or native writer working from a representation that already exists, and it should charge any extra staging needed to create that representation. The measured native result justifies an integration trial.

**Proposed Chess integration gate.** Fix every numeric threshold before the first block runs.

1. **Same input.** Both arms start from the actual Chess producer input and make-view step. Any staging that B needs is inside B's clock.
2. **Full boundary.** The clock covers the following steps.
   - Complete byte-channel ownership and delivery.
   - The CJI or native draw bridge.
   - Production layout.
   - Paint.
   - Commit.
   - Presented RGB565.

   Carry the measured message as raw counted bytes.
3. **Equality.** Presented RGB565 frames and observable effects match between arms for every trial frame. One mismatch fails the gate.
4. **Last-good.** Each of the following cases leaves the last-good screen correct and visible.
   - Replay after restart.
   - A pinned prior generation.
   - A cap failure.
   - A stale publisher generation.
   - Interleaved activity.
   - A dropped flush.
5. **Paired improvement.** In one paired, interleaved run, B's end-to-end median improves on JSON by at least the pre-registered margin.
6. **Full load.** B shows no regression beyond the pre-registered practical limit at full Chess load.
7. **Pinned copies.** The trial establishes a known upper bound on simultaneous pinned copies, measured on the board.
8. **Flash.** The trial measures the isolated flash increment from the native PSIX code and fixtures.

Apply the [Chess integration handoff](../design-doc/02-native-chess-integration-handoff.md) before deciding whether to extend the pilot.

## Raw transport bodies

The other groups used the same reader to match 100 System views, 236 Snake views and 47 Chess input states directly from binary.

Relative to those application-specific JSON bodies, binary used 2.73% fewer bytes for System, 5.40% more for Snake and 18.10% more for Chess. The [body-only evidence](../../PICOCALC-RENDER-LAB--measure-bounded-screen-readers-and-semantic-views-across-picocalc-applications/various/semantic-binary-consumers.json) describes a separate boundary from the complete generic frame.

## Reproduce the results

The [reproduction guide](../README.md) regenerates the four specimens, verifies all traced host frames and summarizes the recorded device trials. The independent [native reader appendix](../reference/04-native-reader-evidence.md) and [matched native producer appendix](../scripts/producer/02-physical-appendix.md) document their exact boundaries and controls.
