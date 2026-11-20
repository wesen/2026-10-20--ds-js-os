---
Title: Qualifying the portable typed frontend on the historical Editor
Ticket: PICOCALC-PARSER-DISPATCH
Status: active
Topics:
    - picocalc
    - performance
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-PARSER-DISPATCH--measure-predictive-token-dispatch-in-the-typed-compiler-frontend/sources/03-parser-and-portable-fallback.patch
      Note: Exact portable compiler patch
    - Path: repo://ttmp/2026/11/20/PICOCALC-PARSER-DISPATCH--measure-predictive-token-dispatch-in-the-typed-compiler-frontend/various/professor-bounded/portable-reference-wall.jsonl
      Note: Original elapsed-clock session medians and extrema
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T01:27:27.163855457-05:00
WhatFor: ""
WhenToUse: ""
---

The portable typed compiler passed the professor’s **31.4 ms frontend-only gate in all six sessions**. The session medians ranged from **24.89 to 25.68 ms** on the archived pre-E Editor. The benchmark used the professor’s unmodified QuickJS C host and JavaScript driver. With that host, the composed source-span and prepass compiler took **34.57 to 35.42 ms** in the same blocks. The portable compiler’s optional lexical index also ran successfully with the existing native producer. [Unchanged-host timing records](../various/professor-bounded/portable-reference-wall.jsonl)

## What the benchmark measures

The workload is the original Editor from `289281c`, assembled in `source.list` order. It has 70,857 UTF-16 code units and 16,792 tokens according to the benchmark’s tokenizer. The timed line calls `typedWasm.compileFunctions(source, importCount, imports, 96 * 1024)`. This performs signature discovery or lookup, parses and checks function bodies, and emits bytes for ordinary Wasm functions. The historical driver independently times regex tokenization, frontend plus RV32 lowering, and linking a Wasm reactor. The absolute gate applies to only the frontend line, whose clock starts at the call boundary. Benchmark setup, script loading, and optional ELF construction cannot be counted as frontend work.

For every phase the original JavaScript driver performs a warmup, takes 15 measurements, sorts the phase samples, and reports the middle value and the extrema. The C host calls `clock_gettime(CLOCK_MONOTONIC, ...)`. This counts time when the benchmark process has been preempted. It also reflects the CPU frequency of the run. A process CPU clock excludes time spent waiting to be scheduled and still reflects frequency. The process CPU measurements in this study were taken in distinct sessions and cannot be subtracted from the wall measurements to estimate scheduling time. [Staging script and pinned input hashes](../scripts/09-stage-bounded-lanes.sh), [inputs](../various/professor-bounded/inputs.sha256)

## What changes in the frontend

A lexer presents the parser with one current token. Advancing across `x !== 7` yields the identifier `x`, the symbol `!==`, and the integer `7`. Each token records its category, value, start, and end. The scanner must take the whole `!==`, and a bounded lexer must still stop at the caller’s declared end. The parser does a great deal of work on these small records across 120 ordinary functions.

The compact fallback keeps the original token alternatives and their order, including trivia and the multi-character punctuation. Its sticky regular expression uses one capture around the alternatives. After a match, the lexer classifies the capture by its first UTF-16 code unit. For typed identifiers, numbers, and strings, the first unit identifies the same category used by the original capture groups. The fallback keeps the existing matching engine and diagnostic positions. This is the path invoked in the unchanged professor C host and Node without the native registration.

The parser’s short-lived lexer views can also mutate their current token object when advancing. This is valid while code consuming a token uses its primitive values before the next advance. Continuation analysis can retain multiple token objects to resolve identifiers and emit saved variables. The retained path receives independent records. The differential test exercises both error positions and bounded range behavior because token lifetime and offset semantics do more than determine successful parse output.

The indexed path is chosen when the host exposes the lexical producer and the source qualifies for indexing. The byte buffers contain fixed-width token rows and symbols. A full source, sequential parser cursor can consume its next row without the generic seek path. Bounded cursors still use the generic procedure. The optional producer falls back to the JavaScript lexer when it declines a source. The host benchmark with no native registration takes the compact fallback at every lexer site. [Portable patch](../sources/03-parser-and-portable-fallback.patch), [optional C registration patch](../sources/02-professor-native-binding.patch)

Three other changes decrease the work after token retrieval.

- A fixed object maps an infix operator to its precedence and lowering metadata. The parser stops looking up operators as soon as a token has no entry at the current precedence. A statement keyword switch and direct literal lookahead handle local branch selection.
- A known scalar local can be read immediately as an expression. Callable names and record fields follow their existing grammar and type checks, and lookahead for `(` keeps the call diagnostic unchanged.
- A Wasm function body contains a length prefix, locals, and instruction bytes. The frontend computes the length from the component lengths and concatenates the parts once. The original framing formed a complete temporary body and copied it into the prefixed result.

These changes have fixed dispatch tables and per-token work. They do not require a second syntax tree or allocate work proportional to the number of repeated lookahead probes. The already composed asynchronous prepass and source-span reuse are the common starting point for the matched control and portable compiler. On the pre-E input there is no asynchronous lowering.

## Matched wall-clock results

The timing runner pins the host to CPU 7. Each launch waits for two startup load readings 250 ms apart with at most three runnable processes. The three lanes run in forward order in odd blocks and in reverse order in even blocks. Every completed trial appears in the receipt. The startup condition reduces contention, and the exact numeric gate still applies to elapsed wall time.

| Block | Historical compiler at `289281c` | Composed spans and prepass | Portable composed parser |
| --- | ---: | ---: | ---: |
| 1 | 29.85 | 34.75 | 24.99 |
| 2 | 30.73 | 34.57 | 24.89 |
| 3 | 30.40 | 34.77 | 25.25 |
| 4 | 30.58 | 35.29 | 25.34 |
| 5 | 30.85 | 35.13 | 25.68 |
| 6 | 30.79 | 35.42 | 25.55 |

The columns are in milliseconds, and each cell is the middle of 15 measurements. The median of the six reported medians is 25.295 ms for the portable compiler and 34.950 ms for its composed control. The median-of-medians reduction is about 28%. The three optional C registration blocks gave portable medians of 18.42, 19.23, and 28.62 ms, with interleaved controls at 23.68, 29.09, and 29.21 ms. A separate process CPU check preserved the direction of the no-binding change, with portable medians of 34.42, 34.94, and 35.22 ms and historical controls of 41.57, 41.62, and 41.47 ms. Those runs were later than the qualifying wall-clock series. Timing gains are reported for this combined patch and hardware workload. The trial does not assign a standalone percentage to each edit. [Wall receipts](../various/professor-bounded/portable-reference-wall.jsonl), [optional C wall receipts](../various/professor-bounded/portable-native-wall.jsonl), [process CPU receipts](../various/professor-bounded/portable-reference-cpu.jsonl)

## Checking exact behavior

The differential oracle tested 13 compiler variants, seven positive programs, six exact graph and span cases, and 35 diagnostic cases, including 34 rejected programs. It also ran 6,151 lexical differential cases for each of three JavaScript lexer variants and compiled the full asynchronous G4 Editor under pure Node without a C provider. The linked Wasm, RV32 code words, and ELF match the reference. The continuation layout has 70 fields. [Differential receipt](../various/professor-bounded/dispatch-parity.jsonl)

The historical E suite exercised 46 successful results, three traps and 30 rejected sources. The continuation fixture ran 29 events and normalized 10,000 units on Wasm, streamed RV32 and buffered RV32. The historical Editor tests exercised UI and I/O interleavings on both targets. These three output receipts were byte-identical to the historical baseline both with and without the optional C provider. [Historical suite receipt](../various/professor-bounded/portable-history.jsonl), [E outcomes](../various/professor-bounded/language-e.json), [continuation outcomes](../various/professor-bounded/continuation-g.txt), [Editor outcomes](../various/professor-bounded/editor-g.jsonl)

| G4 artifact | SHA-256 |
| --- | --- |
| Linked Wasm | `5dfeb5713680bc2c475ed5c530209a98cea40ce152faae5fb11c7de1fff04c65` |
| RV32 code words | `06de33310bcf5f10013e7e6eb605105c5b334063b37197d503444358ade1f9a4` |
| Linked ELF | `7c182547f28e7e6d9921f2a7df7472c6a44df184b7e5eb0543b40c523e6253bd` |

The benchmark establishes the historical **host frontend** gate. End-to-end on-device G4 qualification uses the real app, a different processor, device allocator and launch path, and belongs to the integration study.

## Reproduce the result

From the repository, with the vendored QuickJS object files and Wasm reactor built under `picocalc-os/build`:

```bash
ticket=$(find ttmp/2026/11/20 -maxdepth 1 -name 'PICOCALC-PARSER-DISPATCH--*')
work=$(mktemp -d /tmp/picocalc-professor-portable.XXXXXX)
"$ticket/scripts/09-stage-bounded-lanes.sh" "$work"
"$ticket/scripts/10-time-professor-bounded.sh" "$work" 7 wall reference quiet 6 \
    pre-e composed composed-portable
```

Choose an available host CPU if CPU 7 is outside its allowed affinity. The stage script uses lexical overlays 02 and 10, source-span overlays 13 and 14, and the parser recipe to generate the tested application sources. In an already composed compiler, the exact portable change is `patch --fuzz=0 -p1 < 03-parser-and-portable-fallback.patch` from the repository root. The patched `typed-wasm.js` SHA-256 is `d6dc04692d29596a43b6c15414745023aaa8fa4280353a434b8820e65dab9a0b`. Neither Professor C nor JS is modified for the primary command. [Exact compiler patch](../sources/03-parser-and-portable-fallback.patch), [reproduction runner](../scripts/10-time-professor-bounded.sh)
