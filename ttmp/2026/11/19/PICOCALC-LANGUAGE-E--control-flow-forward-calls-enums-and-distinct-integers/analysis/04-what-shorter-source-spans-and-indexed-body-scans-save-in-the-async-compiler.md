---
Title: What shorter source spans and indexed body scans save in the async compiler
Ticket: PICOCALC-LANGUAGE-E
Status: active
Topics:
    - picocalc
    - native
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/19/PICOCALC-LANGUAGE-E--control-flow-forward-calls-enums-and-distinct-integers/scripts/13-stage-span-reuse.py
      Note: Source and signature stage
    - Path: repo://ttmp/2026/11/19/PICOCALC-LANGUAGE-E--control-flow-forward-calls-enums-and-distinct-integers/scripts/14-indexed-prepass-overlay.mjs
      Note: Native records and ordinary source call edges
    - Path: repo://ttmp/2026/11/19/PICOCALC-LANGUAGE-E--control-flow-forward-calls-enums-and-distinct-integers/scripts/16-run-span-studies.sh
      Note: Paired compile and heap timing
ExternalSources: []
Summary: "Paired compiler time, allocation, and output parity for the staged source-span and indexed-prepass arms."
LastUpdated: 2026-11-20T00:55:28.263993232-05:00
WhatFor: ""
WhenToUse: ""
---

# What shorter source spans and indexed body scans save in the async compiler

The composed compiler took 154.838 ms of CPU time to link G4 on the host. The indexed reference with borrowed tokens took 169.852 ms in the same batch. The candidate also lowered tracked allocator peak by 124,992 bytes. It reused the original source index during ordinary emission, indexed only the changed and generated code, and read call edges from native token rows in ordinary bodies without task syntax.

## Keep the original body and its signature

The async frontend already knows each function's header and opening and closing brace. Most ordinary bodies in Editor contain no task-operation replacements. Their emitter can seek to the original opening brace. The public function descriptors retain positions in the virtual complete rewrite and emitted function order stays the same.

A changed body is materialized as a source segment. Generated continuation functions share a suffix with its own signature scan. The call table combines them. The compiler appends saved scalar fields to the validated WorldState record layout. Requesting the asyncSource option still yields the complete generated text. A syntax error during span emission triggers the canonical full-text checker without backend callbacks and returns that diagnostic through the existing source map.

In composed G4, the native provider indexes the 69,884-unit original once. It then indexes the 14,946-unit generated suffix and edited bodies of 262, 108, 591, 1,394 and 1,197 units. Their sum is 18,498 units. The full rewritten source is 81,233 units. A test that throws when the emitter requests the full string still compiles the positive fixture with source export disabled.

## Read call edges from indexed tokens

The native lexer supplies token rows after validating lexical boundaries. In an ordinary body, symbol ordinals identify the six task keywords and possible function names. A known function name followed by an opening parenthesis contributes a call edge, unless its preceding token is a dot. This inspection records edges in source order. A body containing task syntax still goes through the original candidate gate and operation scanner.

The fallback matters for malformed source. In the invalid expression `1work(state, 0)`, the lexer sees a number followed by an identifier and the old ordinary-call regex requires a word boundary before the name. A comment mentioning await can select a different path in the old compiler. The indexed inspector delegates ambiguous numeric adjacency to the previous scanner. Native lexical rejection similarly delegates the whole input to the original lexer. Semantic errors from indexed call edges still occur in scanOperations.

The same arm retains ordinary type signatures as the existing arrays. Only async functions need fresh parameter descriptors for liveness and ambient references.

## Linked measurements

Each row reports nine fresh vendored QuickJS runs on one host CPU. Lane order was reversed every other trial. The allocator used a 4 MiB cap and counted index buffers and native scratch allocation. Compiler module load time was measured separately from the interval for analysis, emission and linking.

| Lane | Linked CPU median, ms | Linked wall median, ms | Load CPU median, ms | Peak tracked bytes |
| --- | ---: | ---: | ---: | ---: |
| Pre-G control | 168.606 | 172 | 10.211 | 2,039,544 |
| Stock G4 | 228.499 | 235 | 17.314 | 3,052,176 |
| Reused headers | 211.706 | 216 | 17.579 | 3,076,208 |
| Original source spans | 214.785 | 220 | 18.492 | 2,947,544 |
| Native index with borrowed token | 169.852 | 175 | 18.137 | 3,496,512 |
| Index and indexed prepass | 158.068 | 158 | 18.928 | 3,541,680 |
| Index and original spans | 167.570 | 168 | 19.177 | 3,418,216 |
| Index, original spans and indexed prepass | 154.838 | 156 | 19.502 | 3,371,520 |

Header reuse ran faster than the plain source-span arm in this batch. The span arm used 128,664 fewer peak bytes than header reuse. Within the indexed lanes, the prepass provided most of the CPU savings. Source spans reduced the amount of additional text sent to the index and lowered allocator peak. Together they reduced linked CPU time by 8.8% and peak allocation by 124,992 bytes against the indexed reference.

A separate five-run phase probe compared the indexed reference and prepass arms. The signature measurement is included in readProgram.

| Phase | Indexed reference, ms | Indexed prepass, ms |
| --- | ---: | ---: |
| Original signatures | 4.439 | 4.022 |
| readProgram | 18.981 | 15.838 |
| scanOperations | 10.749 | 1.227 |
| analyze | 10.320 | 9.228 |

The physical G4 trace measured roughly 440 ms in readProgram, 181 ms in scanOperations, and 161 ms in analyze. The host probes identify which costs this candidate changes. The physical cold trial determines whether it clears the ten-percent target.

## Parity and device recipe

All seven compile variants matched six positive inputs, five exact call graph traces, and output or diagnostics for 35 further inputs. Thirty-four of those inputs were rejected. Cases include file-scope errors, malformed ordinary syntax, conflicting declarations, direct async calls, invalid task operations, and mixed sync/task cycles. The oracle compares raw RV32, linked ELF and Wasm, records, signatures, entries, relocations, state layout and explicitly requested rewritten source. The E, G and Editor execution receipts were identical across the source-span, indexed-prepass and composed lanes.

The board recipe starts at 2e4fee1. Apply 02-index-overlay and 10-reuse-token-overlay from the lexical-index ticket first. Then apply the two scripts from this ticket to the compiler directory.

~~~sh
python3 scripts/13-stage-span-reuse.py "$compiler_dir" --apply-existing
node scripts/14-indexed-prepass-overlay.mjs "$compiler_dir"
~~~

The expected full Editor ELF digest for the compared reactor is 7c182547f28e7e6d9921f2a7df7472c6a44df184b7e5eb0543b40c523e6253bd. Editor retains 70 WorldState fields. The measurements and comparison receipts are in [the span study evidence](../various/span-studies/).
