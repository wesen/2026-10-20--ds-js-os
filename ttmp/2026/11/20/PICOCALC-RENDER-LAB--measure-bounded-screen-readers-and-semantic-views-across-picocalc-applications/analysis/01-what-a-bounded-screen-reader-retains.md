---
Title: What a bounded screen reader retains
Ticket: PICOCALC-RENDER-LAB
Status: active
Topics:
    - picocalc
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:33:10.057022834-05:00
WhatFor: ""
WhenToUse: ""
---

# What a Bounded Screen Reader Retains

## Purpose

On a small display device, each application describes its screen as JSON text. The receiving side reads that text, performs application layout, and records a list of draw commands. A lab operator compared two ways of reading the text. This article reports those measurements, explains which costs the second method bounds, and lists what the measurements do not show.

The **control** is the optimized native `JSON.parse`, which builds a complete JavaScript object tree. The **candidate** is a JavaScript reader that does not build that tree. It scans the already decoded string once and writes one eight-byte record per JSON token. Each record holds four values:

- the token's start offset in the source, in UTF-16 code units;
- the token's end offset;
- the index of the first token after the token's subtree;
- the token's arity, meaning the number of children of an object or array.

Lazy object and array views read these records on demand. When a scalar value is requested, the view decodes that slice of the source with native `JSON.parse`. A third configuration, called **cached**, adds same-thread width and node caches, each limited to 96 entries per paint. The reader is implemented in `scripts/10-index-reader.js`, and replay is in `scripts/11-reader-replay.cjs`.

## Which costs are bounded

The candidate refuses any input that exceeds fixed limits. Because of these limits, the following costs have known maxima:

| Limit | Value | Cost it bounds |
|---|---|---|
| Tokens per document | 4096 | Record array: 4096 × 8 = 32768 bytes |
| Encoded text | 16 KiB (16384 bytes) | Wire bytes held per slot |
| Ancestor traversal depth | 40 | Size of the traversal stack |
| Decoded scalar string | 8192 code units | Length of any single decoded value |

These limits also keep every offset and token index below 65536. Each of the four record fields therefore fits in 16 bits.

The record-array figure is an **upper bound only**. It does not include JavaScript storage for decoded strings or view objects. The reader stores offsets, not copies of the text. The immutable input string must therefore remain alive for as long as any view of it is in use. A bounded reader retains two things: its index and its source text.

## Worked example

The largest Snake state in the corpus has 2826 tokens and 11421 encoded bytes.

1. An exactly sized record array would need 2826 × 8 = 22608 bytes. The fixed array is sized for the limit, 32768 bytes, so this state uses 22608 / 32768 ≈ 69% of it.
2. The text, 11421 bytes, is below the 16384-byte limit. It occupies about 70% of the allowance.
3. The operator also modelled a single-lane retained admission scheme (`scripts/16-retained-admission.cjs`). It uses six slots: four publishers, one pinned old generation, and one private candidate. The index storage for six slots is 6 × 32768 = 196608 bytes.
4. The wire text for six slots is at most 6 × 16384 = 98304 bytes.
5. The bounded total is 196608 + 98304 = 294912 bytes, which is 288 KiB. JavaScript storage is in addition to this total.

A developer can therefore state the worst case for index and wire storage before any document arrives. The same statement cannot be made for JavaScript storage.

## Which costs are not bounded by the index

Two costs remain open.

**Repeated decoding.** Views do not memoize what they read. Each access reads the records again and decodes the scalar slice again.

**Indexed access into wide arrays.** To reach element *i*, the view starts at the first child and follows *i* "token-after-subtree" links. One access therefore costs time proportional to *i*. Accessing every element of an *n*-element array in random order can cost time proportional to *n*².

## Measured results

The corpus contains three ordinary applications (System, Snake, and Chess) and two held-out applications (Keys and a typed Editor). In the table below:

- "States" is the number of screen states.
- "Calls" is the number of reader calls.
- "Hits" is the number of cache hits.
- Times are median host microseconds.
- Heap figures are in bytes.

| App | States | Calls | Hits | Max tokens | Max bytes | Material µs | Indexed µs | Cached µs | base B | ix B | used B |
|---|---|---|---|---|---|---|---|---|---|---|---|
| System | 100 | 943 | 0 | 340 | 2613 | 121.4 | 466.3 | 121.9 | 17872 | 45056 | 15008 |
| Snake | 236 | 944 | 0 | 2826 | 11421 | 18.6 | 91.1 | 25.1 | 8176 | 45056 | 13728 |
| Chess | 47 | 103 | 0 | 1061 | 4944 | 104.4 | 457.0 | 88.4 | 60768 | 45056 | 20672 |
| Keys | 26 | 192 | 48 | 282 | 1484 | 68.5 | 213.5 | 73.2 | 16864 | 45056 | 14256 |
| Editor | 44 | 88 | 0 | 1406 | 5367 | 73.3 | 307.4 | 73.7 | 39088 | 45056 | 18384 |

### Timing

Each timed figure covers four steps: parsing, application layout, draw-command recording, and JSON stringification of the commands. The figures do not include rasterization or SPI transfer.

Each application contributes one state, chosen at the 75th percentile by serialized length. Each figure comes from 25 warm Node trials. Trial order was not rotated. The figures therefore describe these runs and should not be generalized.

Before measuring, the operator recorded blind predictions for the ratio of indexed time to materialized time:

- 0.6–0.9 across the table;
- 0.8–1.1 for Chess;
- a Snake difference inside measurement noise.

The observed ratios were:

| App | Indexed / materialized |
|---|---|
| Keys | 3.1 |
| System | 3.8 |
| Editor | 4.2 |
| Chess | 4.4 |
| Snake | 4.9 |

None of the predictions held. In these trials the JavaScript index was slower than native materialization for every application.

The cached configuration recorded hits only for Keys, with 48 hits. Even there, its median was not lower than the materialized median. Where calls do not repeat, the caches provide no benefit. The Chess cached median was lower than the materialized median, but Chess recorded zero hits. Because trial order was not rotated, that difference is not attributed to the cache.

### Memory

The heap figures come from `scripts/17-quickjs-memory.py`. Each figure is the increase in a fresh 64-bit QuickJS heap while the reader's data structure is held. The meter counts allocator usable size plus 8 bytes per allocation. The input text was already resident, so it is excluded from every figure. The three columns mean the following:

- **base** is the actual object tree produced by materialization.
- **ix** is the fixed-size index. It is 45056 bytes in every application.
- **used** is a two-pass variant. The first pass counts tokens exactly, and the arena is then sized to that count. This variant does extra work.

The fixed index was larger than the object tree in four of five applications. Chess was the exception, at 60768 bytes for the tree against 45056 bytes for the index. The two-pass arena was smaller than the object tree in four of five applications. Snake was the exception, at 13728 bytes against 8176 bytes. These figures are host measurements. They are not measurements of total memory in a live application.

### Correctness

Across all 453 states, the control and the candidate produced identical full command output under deterministic conditions. For all 44 Editor states, the operator also verified the raw RGB565 output independently. The operator additionally tested a skipped panel delivery followed by a retry.

### Retained admission

The six-slot admission model refused inputs in six distinct classes. It coalesced the full mailbox over 160 replacements. It refused messages with a producer-epoch mismatch and messages with a sender mismatch. After a reader restart, the last accepted generation was A, and generation C was accepted later.

This is a model of the intended kernel boundary. In the current production code, a new message still replaces the old one before the receiver runs.

## When a typed cursor or a C matched control would be justified

A **typed cursor** decodes numbers and booleans directly from the records instead of calling `JSON.parse` on each slice. It would be justified if profiles showed that time was dominated by repeated scalar decoding over dense arrays of primitives.

A **C matched control** would compare a C index reader against a C materializer. Such a control would be needed before drawing any conclusion about native index readers. The jsmn tokenizer is one example of a C index reader: it writes tokens with start, end, and size into a caller-supplied array.

The present comparison sets a JavaScript candidate against a native parser. Its result therefore depends on both the interface and the implementation. It does not establish a property of index readers in general.

## Limits

The measurements do not establish physical board timings. They do not establish live application memory. A physically paced full panel transfer is a separate cost from every cost reported here.

## Sources

- jsmn: https://zserge.com/jsmn/
- https://arxiv.org/abs/2312.17149
- Local sections: `scripts/10-index-reader.js`, `scripts/11-reader-replay.cjs`, `scripts/16-retained-admission.cjs`, `scripts/17-quickjs-memory.py`

## Reading one complete screen on the ESP32-P4

This experiment asks what it costs, on an ESP32-P4 running QuickJS, to read every scalar of one complete screen payload through a bounded scanner written in JavaScript, compared with QuickJS's built-in `JSON.parse`. It also asks whether reading only part of a screen changes the result.

**Workloads.** There are three workloads: `sysmon`, `snake` and `chess`. Each was measured on its representative screen.

**Arms.**

- **native**: `JSON.parse`, then a recursive scalar checksum in JavaScript.
- **index**: the JavaScript bounded scanner builds an index, then a sequential walk reads and converts every stored scalar.
- **both**: the same scanner, followed by materialization of the full tree, then the checksum.
- **key**: `JSON.parse`, then a read of the widget kind only.
- **sparse**: the scanner builds the index, then decodes that one top-level key only.

**Schedule and timing boundary.** The operator ran five rotating blocks with two repetitions per block. The timed interval excludes index array reservation, screen lifecycle, paint, wire transfer and panel output. Every arm passed its checksum gate on every workload.

| Workload | native | key | index | sparse | both | paired index/native |
|---|---:|---:|---:|---:|---:|---:|
| sysmon | 5.248 | 2.032 | 30.849 | 23.614 | 36.379 | 5.88 |
| snake | 3.482 | 1.649 | 15.630 | 12.432 | 20.409 | 4.50 |
| chess | 16.363 | 7.806 | 87.825 | 69.203 | 105.246 | 5.37 |

*Median milliseconds per screen. The last column is the median of paired full-cost ratios.*

**Full read.** Reading every scalar through the JavaScript index cost 4.50 to 5.88 times the native arm, as a median of paired ratios. The ratio of medians agrees with the paired figure to within 0.01 on each workload: 5.878, 4.489 and 5.367. Only the index/native comparison was paired. The other comparisons below are computed from medians of separate arms. They describe the size of differences, not paired effects.

**Shared-scanner control.** The index and both arms run the same scanner over the same screen. They differ only in what follows the scan.

- The both arm adds 5.530 ms on sysmon, 4.779 ms on snake and 17.421 ms on chess over the index arm.
- Put the other way, the index arm runs at 0.85, 0.77 and 0.83 of the both arm.

Within one language and one scanner, avoiding materialization therefore saved 15 to 23 percent. This control separates two effects that the index/native ratio mixes together:

1. the cost of tree construction versus a scalar walk;
2. the cost of scanning in interpreted JavaScript versus parsing in QuickJS's C implementation.

The second effect dominates. On every workload, the extra cost of materializing on top of the JavaScript scanner (both − index) exceeds the entire native arm. The comparison is 5.530 ms against 5.248 ms on sysmon, 4.779 against 3.482 on snake, and 17.421 against 16.363 on chess. The large index/native ratios are therefore mostly a statement about where the scanning is done. They say much less about whether a non-materializing access pattern is sound.

**Why sparse access did not recoup construction.** The sparse arm decodes one key, yet it still cost 0.77, 0.80 and 0.79 of the full index arm. Skipping the walk-and-convert of the remaining scalars saved 7.235 ms (23 percent), 3.198 ms (20 percent) and 18.622 ms (21 percent).

The remaining 77 to 80 percent is index construction. Construction must cover the whole screen before any key can be located, and it is paid in full regardless of how many keys are later read. As a result:

- Sparse access remained 4.50, 3.57 and 4.23 times the native full-read arm.
- Sparse access remained 11.62, 7.54 and 8.87 times the key arm.

The key arm shows that `JSON.parse` followed by one property read costs 0.39 to 0.48 of the native full read. A consumer that needs one key already has a cheaper route on the native path. A built index can only pay for itself when construction is cheaper than the parse it replaces, or when one construction is amortized over many reads. Neither condition held here.

**Scope.** These trials ran in QuickJS. The shipping compositor runs compiled CJI. A separate live trace of one 4935-byte Chess publication on that compositor recorded:

- 44.984 ms in the frames handler;
- 26.794 ms in draw, including a 4.273 ms commit;
- 1.019 ms of pixel SPI.

The QuickJS figures above make no claim of a speedup or a regression in that production path. They differ from it in language, in parsing implementation and in timing boundary. The trace shows where time is spent in the live path. The trials show the relative costs of access patterns under one interpreter.

## Which experiment is worth funding next?

**What is and is not established.** The measurements above show two things under QuickJS:

1. A scanner written in the interpreted language does not compete with the runtime's native parser on full or sparse reads of these screens.
2. Behind a shared scanner, a scalar walk costs less than tree materialization.

The measurements do not determine the alternative under consideration: a scalar or row cursor placed inside the existing CJI ingress. Such a cursor would not add a second scanner. It would expose the existing scan's output without first constructing a tree. The cost that dominated the QuickJS comparison would therefore be absent by construction. The quantity that remains to be measured is the one isolated by the shared-scanner control: cursor reads against materialization, in the same language, over the same scan.

**Experiment design.**

1. **Hypothesis.** For a complete screen, reading every scalar through a cursor inside the CJI ingress costs less time and less peak heap than the existing materializing path, with identical checksums.
2. **Arms, all compiled CJI over the same ingress.**
   - (a) The existing ingress materializes the tree, then a full scalar checksum runs. This is the same-language materializing control.
   - (b) The ingress drives a cursor that visits every scalar or row and computes the same checksum.
   - (c) The cursor reads only the widget kind, paired against the control reading only the widget kind.

   Arm (c) tests whether sparse access gains anything once construction is not a separate stage.
3. **Workloads.** Use the representative `sysmon`, `snake` and `chess` screens. Add the 4935-byte Chess publication from the live trace, so that bench results can be placed next to a known production payload. Record the byte length of every screen.
4. **Timing boundary.** Use one boundary for all arms, starting at ingress entry and ending at checksum completion. Any reservation a cursor arm needs is reported as its own measured component, not excluded. Lifecycle, paint, wire transfer and panel output stay outside the interval. They are reported separately if captured.
5. **Heap.** For each screen and arm, sample allocator state at three points: before ingress, at the highest point during the read, and after the read with the consumer's references still held. Report live heap (the bytes retained after the read) and peak heap (the high-water mark during the read), both relative to the pre-ingress state. A cursor that saves time but raises peak heap does not meet the hypothesis on a memory-constrained target.
6. **Schedule and statistics.** Rotate arm order across blocks, as in the QuickJS trials, and pair every arm with the control within each block. Report:
   - the median paired full-cost ratio against arm (a), with an interval, for each workload;
   - the number of blocks and repetitions behind each interval.
7. **Gates.** Every arm must reproduce the control's checksum on every screen. An arm that fails any gate yields no timing result.
8. **Decision rule, fixed before measurement.** Adoption is supported only if both of the following hold on every workload: the interval for the paired time ratio of (b) against (a) lies below 1, and the peak heap of (b) does not exceed that of (a). Otherwise the existing materializing path stands.

**What the experiment will not decide.** It will not show the effect on end-to-end frame time. That requires repeating the live trace with the cursor in place, using the same frames-handler, draw, commit and SPI markers, on the same publication.
