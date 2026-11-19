---
Title: Methods review notes on compiler representation and cold measurements
Ticket: PICOCALC-COMPILER-THESIS
DocType: reference
Status: complete
Topics: [compiler, picocalc, measurement]
---

# Methods review notes

The review decision is to qualify numeric buffering and function-at-a-time consumption as distinct native compiler candidates. Buffered numeric operands had the lowest cold latency median on this host. Streaming had the lowest measured absolute compiler allocation peak on the same Editor source and linked image. The target policy decision depends on actual P4 resource measurements.

## Observables and exclusions

| Trial | Start and end | Output identity check | Allocation metric |
| --- | --- | --- | --- |
| Resident full call, original lab | QuickJS compiler, source and imports resident at JS call entry, stops at return from native compilation | Raw RV32 image plus entries, layouts, relocations, import count and signatures | Separate cold-call allocation observer, incremental above residency |
| Prepared backend replay, original lab | Starts with prepared functions, stops with raw image | Replay serialization compared to full compiler serialization | No separate prepared-only high-water claim |
| Supervisor cold factorial | Timer starts before source and reactor reads, ends after JS runtime destruction | Byte-identical final ELF for each frontend at fixed backend | Absolute firmware allocator peak, Linux usable bytes for QuickJS allocations |
| Independent cold five-configuration study | Same firmware timer, register backend fixed, fresh compile process for every sample | Single complete ELF digest across all 50 outputs, matches supervisor register candidate | Same firmware allocator peak, with separately rebuilt vendored C engine |
| Independent function-order study | Source resident, one full compile per fresh runtime | Same full image and metadata across generator variants per source shape | Incremental bytes, four rotations of allocation order |

The firmware copy-out, source, and prebuilt reactor have C-owned allocations outside the QuickJS allocator. The ELF file-write performed by the host harness follows the firmware timer. The supervisor's current `fresh-factorial-editor.json` supersedes the legacy prebuilt-engine time series for the rebuilt-boundary claim. Source and reactor digests agree with the independent five-configuration run. `peak_js_bytes` reproduces exactly for shared treatments in these two experiments. Absolute timings vary.

## Effect estimates from matched samples

| Comparison, fresh supervisor receipt | Median within-block saving | Range | Blocks favoring change |
| --- | ---: | ---: | ---: |
| Register backend, original frontend | 4.921 ms | 2.583 to 7.828 ms | 16/16 |
| Register backend, streamed frontend | 4.414 ms | −2.002 to 6.525 ms | 15/16 |
| Streamed package, original backend | 8.665 ms | 7.418 to 12.802 ms | 16/16 |
| Streamed package, register backend | 7.980 ms | 2.972 to 12.089 ms | 16/16 |
| Both changes vs original | 12.982 ms | 10.800 to 16.117 ms | 16/16 |

The within-block register-by-frontend difference of savings has median +0.330 ms. Four values are negative and twelve positive. A term near zero in some summaries does not establish exact independence. Blocks share machine state and a filesystem cache. The sample ranges are descriptive.

In the independent cold study the adjacent matched savings were 0.467, 1.528, 7.220 and −0.985 ms. Counts favoring the next treatment were 8, 9, 10 and 3 of ten. Corresponding peak reductions were 34,736, 751,656, 27,888 and 697,496 bytes. The script-pruning control preserves generation of framed bodies while removing the unused module writer. Operand packing is tested at fixed buffering. Stream consumption is tested with packing already active.

## Assumptions, boundaries and unresolved questions

- For generic evidence about retained input, count both total and largest-live function cells. Complete-module peak also includes growing native word arrays and eventual image construction. The 63 small-body / one large-body stress cases reproduce a change in peak associated with the large function's position while controlling the counts.
- The order probe has a fixed set of functions with the same names and source order. Their bodies are assigned differently. They have the same amount of arithmetic and native image size; cross-shape byte identity or functional equivalence is unnecessary for the memory question. Within each shape output identity is required.
- Calls in the frozen source language can use earlier declarations and imports. A future feature for forward references or mutually recursive functions changes the assumptions of immediate lowering. No such feature was prototyped.
- The native writer receives trusted operations from the checked frontend. This experiment makes no standalone input validation claim for a deserialized intermediate. The two-local-type counterexample in the original experiment shows that keeping integer operands has no bearing on preserving a checked local's source type.
- A source-first error is preserved by storing a native lowering error and finishing checking the remaining source. The original oracle compares class and complete message, including positions on ordinary frontend errors. Stack traces, memory-exhaustion and deadline behavior remain separate surfaces.
- Mixed-engine firmware currently evaluates the same frontend path for both engine selections. The experimental native-only file removes the Wasm module assembly and linking exports. Budget a new measurement for the proposed production loading arrangement. No change to the firmware shipping path was made for this review.
- Independent execution used 64-bit Linux with glibc 2.39. A 32-bit host probe failed because the machine lacks C multilib headers. Same-architecture host ratios, allocator usable bytes and µs each have different transfer limitations.

## Indexed evidence

The experiment code is [cold-stages.py](../scripts/methods/cold-stages.py) and [function-shape.py](../scripts/methods/function-shape.py). Their measured values and provenance are in [cold-stages.json](../various/methods/cold-stages.json) and [function-shape.json](../various/methods/function-shape.json). The comparison with both backends uses [the freshly rebuilt factorial series](../various/supervisor/fresh-factorial-editor.json). The chronological investigation is in [the methods diary](methods-diary.md), and the self-contained explanation is in [the article](../various/reports/methods.md).
