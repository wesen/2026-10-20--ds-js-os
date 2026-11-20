---
Title: Matched native sender and receiver route on the physical PicoCalc
Ticket: PICOCALC-RENDER-BINARY
Status: active
Topics:
    - picocalc
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20
WhatFor: ""
WhenToUse: ""
---

# What changes when the sender also runs in C?

**Native producer engineer’s appendix to the joint binary-screen study, 20 November 2026.**

A reader can be fast because somebody else paid to build its index. The physical sender experiment starts one step earlier. It takes the same already resident cJSON screen tree for each treatment. G writes complete unformatted JSON. B measures the tree, builds and sorts the new message’s string dictionary and member directories, and writes PSIX. Neither sender reuses an earlier encoding. The input tree is built once outside both measured intervals.

Each encoded screen then crosses the existing native receiver boundary. G runs JSON preflight, parses a new cJSON tree and validates the shape. B allocates a separately owned packet, copies the complete wire bytes, and validates the structure and shape directly. Each receiver follows the same late path, checks the value, and disposes of its acquired storage. The release clock includes the sender’s output as well. This is a complete native path from **a resident tree to one late field and release**. Application construction, channel retention, real queues, layout, painting and SPI transfer occur outside this experiment.

Seven rotated, matched blocks on one ESP32-P4 boot contributed eight encode-and-consume cycles per treatment per block. Every one of the 56 cells matched both the frozen wire length/FNV and the weighted tree and leaf witnesses. Each native binary encoding also passed a full byte comparison to the independently generated PSIX reference inside the board harness. The native JSON encoding passed a structural equality test on the board and matched the JS reference bytes for all four fixtures in the host qualification. All 448 measured publications used ordinary allocation and deallocation.

| Application | JSON / PSIX bytes | G → B sender, ms | G → B admit, ms | G → B total route, ms | Median paired B/G route ratio |
|---|---:|---:|---:|---:|---:|
| System | 1,919 / 1,850 | 0.525 → 1.328 | 3.660 → 0.125 | 5.175 → 1.484 | 0.287 |
| Chess | 3,443 / 2,761 | 1.816 → 1.850 | 13.117 → 0.162 | 16.915 → 2.027 | 0.120 |
| Snake | 758 / 766 | 0.359 → 0.445 | 1.841 → 0.064 | 2.619 → 0.525 | 0.200 |
| Editor | 3,105 / 2,572 | 1.438 → 1.522 | 10.859 → 0.148 | 14.021 → 1.703 | 0.121 |

Each time in the table is the median block total divided by eight. The route column also includes the late-field access and release. The ratio column pairs the two treatments *within the same block*. The generic receiver’s release alone consumed a median 0.973 ms on System, 1.969 ms on Chess, 0.416 ms on Snake and 1.709 ms on Editor, compared with 0.006–0.007 ms for the binary route. A fresh parser allocates many objects and strings, then releases them individually. The binary checker retains one owned buffer, so release takes two frees in total including the sending buffer.

**Building the binary index took longer on the P4 for every fixture.** The receiver saved more than the encoder spent in every block. Even the eight extra bytes on the Snake wire coexisted with a roughly fivefold reduction in this native route’s elapsed time. Lookup alone is a poor proxy for the result. It took a median 16.6/19.3 µs for G/B on System and 19.4/21.9 µs on Editor. Admission and destruction account for most of the gain.

An independently instrumented 64-bit host run traced requested allocation sizes. Source cJSON was already live for both arms. Above that common resident source, the observed G/B route peaks were 19,196/3,700 bytes on System, 51,701/5,522 on Chess, 9,467/1,532 on Snake and 45,433/5,144 on Editor. B used one additional receiving allocation on each fixture. G’s receiver made 543, 1,360, 260 and 1,181 allocator calls including reallocations. During binary generation, dictionary and object-field scratch occupied 1,176/608/640/392 host bytes. These are explicit heap requests on the host and exclude stack, allocator metadata and any private libc sorting workspace. The separate host timings are in results/host-summary.json.

**Decision.** The measured native path merits an integrated trial where a native producer already has usable structured state and the native consumer can paint without rebuilding a generic tree. The four applications’ existing producers use different representations. Any cost to create that state, bridge runtime boundaries, preserve application effects or drive the painter belongs in that trial. The measured advantage establishes an opportunity for the native transport; it supplies no request to migrate the four applications’ working JSON paths.

The raw device records, per-block paired savings, hashes and firmware identity are in [physical.json](results/physical.json). The exact host output checks are in [verify.log](results/verify.log), the ownership census in [allocation.ndjson](results/allocation.ndjson), and the independent native producer diary in the ticket’s reference/04-native-producer-diary.md. The director owns the shared device and publication.
