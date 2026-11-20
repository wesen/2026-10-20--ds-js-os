---
Title: Reuse ordinary source spans across async lowering
Ticket: PICOCALC-LANGUAGE-E
Status: active
Topics:
    - picocalc
    - native
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T00:33:07.214220863-05:00
WhatFor: ""
WhenToUse: ""
---

# Reuse ordinary source spans across async lowering

G4 runs a source-to-source pass before ordinary emission. For Editor at `2e4fee1`, the pass scans source headers, reads and checks the functions with task operations, plans continuation state and builds text for regular emission. The regular emitter then scans the declaration prefix and all rewritten function headers before parsing each body. The earlier header reuse experiment isolated ordinary signature and brace scanning. This experiment keeps that control and asks whether the same emitter can read untouched bodies directly from the original source while building only the changed bodies and appended continuation functions.

## Source contract

The async pass already knows each function's signature, the location of its opening brace, and the end offset found by the brace scanner. It also knows every operation that it rewrites. Build a small emission plan from these facts. An untouched ordinary body points to the original text and its bounded range. An ordinary body with operations uses a short materialized range from the rewrite writer. A generated function uses a position in the appended suffix. Each plan record retains its function's position in the original rewritten output, so the compiler's exported descriptors, callable indexes, naming and effect order remain comparable.

The writer can store copied portions as original spans. It still collects generated text at the existing source positions. For instance, when a call changes inside `typedWorldEvent`, materialize just the range from its opening brace to its closing brace. A requested full `asyncSource` still returns the exact string the original writer generated. The manifest stores the original UTF-16 offsets instead of translating them to bytes.

```text
ordinary declaration metadata + untouched original body spans
modified ordinary body text from the rewrite writer
generated function suffix
                -> one declaration table
                -> same bounded FunctionEmitter and Wasm or RV32 backend
```

The emitter installs the already-read record and nominal declarations and appends the same scalar WorldState fields that the writer inserts into the text. It reads and validates generated headers from their suffix, adds import bases to all callable indexes, and emits functions in their existing logical order. The old source-scan path remains the baseline for synchronous inputs. The emitter still checks each ordinary and generated body and the fully lowered call graph. The prototype retains the earlier source call scan, async parse, liveness and frame allocation. Their diagnostic precedence and graph behavior depend on inspection before rewriting.

## Diagnostics and fallback

A lexical or type error in an untouched body has an original position, while an error in an emitted body segment has a segment-relative position. The old compiler reports the diagnostics obtained by parsing the complete generated text and remapping that result. Preserve that behavior in the experiment with a canonical replay on an emission error. The replay materializes whole text and runs the ordinary checker with no callbacks, so it delivers the historical error without lowering partial functions a second time. If the canonical checker accepts an input that the prototype rejects, treat it as an implementation mismatch rather than an ordinary source rejection. Positive tests must prove that the ordinary path has no dependency on materializing the full rewrite. Public source and layout output must remain identical when explicitly requested.

## Comparison

Create three G4 variants from `2e4fee1`: stock, header reuse alone, and header reuse with original source spans. Keep the pre-G control `1357545`. Compare the linked Wasm and native ELF, raw RV32 words, source/layout export and exact diagnostics for Editor and an interleaved async fixture. Run the existing continuation and E suites in isolated snapshots. Use a fresh QuickJS runtime per compile and the same reactor for all linked native measurements. Record loading and compiler-call wall and CPU clocks separately, and measure tracked memory under the existing 4 MiB compiler ceiling.

Source-span treatment may reduce whole-string allocation and duplicate scanning, while it adds metadata and range setup. An isolated result must establish the benefit before considering a production interface. The [previous signature-only experiment](../analysis/02-measuring-signature-reuse-in-the-asynchronous-editor-compiler.md) is the controlling comparison. The [continuation design](../../PICOCALC-CONTINUATION-G--compile-typed-await-into-static-picocalc-continuations/design-doc/01-typed-await-and-the-lifetime-of-a-picocalc-continuation.md) defines the state layout and source-level safety guarantees.
