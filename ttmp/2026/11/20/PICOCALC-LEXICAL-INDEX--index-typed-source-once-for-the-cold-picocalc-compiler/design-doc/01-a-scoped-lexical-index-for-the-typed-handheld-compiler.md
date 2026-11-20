---
Title: A scoped lexical index for the typed handheld compiler
Ticket: PICOCALC-LEXICAL-INDEX
Status: active
Topics:
    - picocalc
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T00:17:49.405026707-05:00
WhatFor: ""
WhenToUse: ""
---

# A scoped lexical index for the typed handheld compiler

The final async Editor in commit `2e4fee1` cold-compiled to RV32 in 3.817 s in its first physical trial. Three manual pre-await controls at `1357545` had a median of 2.646 s. The ten-percent qualification limit is 2.910 s. A change must therefore save approximately 0.91 s from the measured candidate. The benchmark includes real source input, initialization of QuickJS, its JavaScript compiler, native instruction emission, linking to the reactor, copying the module and teardown. This experiment targets the parts of that interval that repeatedly identify tokens. Device phase measurements in the integration ticket will establish how much time each stage actually consumes.

## What the compiler reads

Take `if (read < stop) { read = read + 1; }`. The source is a sequence of UTF-16 code units in a JavaScript string. A token is a half-open range in that string and a classification such as identifier, integer or punctuation. The three occurrences of `read` have distinct positions, identical spellings and the same token kind. Their bindings depend on the surrounding scope. Sharing their spelling is safe. Sharing a type, binding or generated instruction on that basis would be incorrect.

`picocalc-os/compiler/typed-wasm.js` defines the actual input language. Its `Lexer.next()` consumes comments and whitespace, recognizes one token and returns its spelling, kind and offset. `scanSignatures` reads every function header and skips balanced bodies. `FunctionEmitter` then scans each body to check names and types and emit typed stack operations. A native compilation still runs this frontend. Its streamed callback in `typed-rv32.js` translates a finished function to RV32 and releases the function operations. The async pass in `typed-async.js` also reads the original source, analyzes task bodies and constructs a new source containing ordinary functions and generated steps. These distinct strings must have distinct lexical indices.

Earlier physical profiling on the original Editor measured 648.6 ms of marked regular-expression scanning and 372.2 ms of handling the resulting tokens. A JavaScript cursor reduced their totals and saved about 0.3 s in a clean compile. Its time-to-result on the complete G4 compiler remains a separate benchmark. These figures identify a candidate; they do not establish how much a lexical index will save on the newer program. [Previous phase study](../../../19/PICOCALC-FRONTEND-COLD--measure-cold-typed-compiler-frontend-costs-and-compare-a-cursor-lexer-on-picocalc/analysis/01-where-cold-typed-compilation-time-goes-on-picocalc.md)

## Representation and boundaries

The candidate installs one native QuickJS function in the compiler context. The operating-system kernel calls it only through the compiler. Its data contract is `__typedLexIndex(source) → [rowBuffer, symbolBuffer] | null`. Both buffers contain unsigned 32-bit words. A token row has four words: start offset, exclusive end offset, symbol ordinal, and closing brace row plus one for a matched opening brace. A symbol has three words: first start offset, first exclusive end offset, and kind (1 identifier, 2 integer, 3 string, 4 operator). Repeated spellings share one symbol ordinal. The position of every occurrence remains available. Both host QuickJS and the ESP32-P4 can run the same native helper. The existing JavaScript lexer supplies the reference for behavior.

```text
immutable source string
    │
    ├─ scan once ── token rows [at, end, symbol, matching-close]
    │                    │
    │                    └── symbol table [first-at, first-end, kind]
    │                                  │
    │                         source.slice(first-at, first-end)
    │
    ├─ signature scan ── jump from opening brace to matched close
    ├─ async read ────── keep detail for bodies containing task syntax
    └─ body emitter ──── advance by one row, preserving absolute offsets
```

Token spelling is interned by kind and the complete sequence of code units. A hash collision requires an equality comparison. The native implementation may scan ASCII and consume multibyte CESU-8 sequences for content inside string literals and comments; a JavaScript string counts supplementary characters as two UTF-16 code units. If the fast grammar cannot establish precise boundaries, it returns null for the entire source. The reference scanner then supplies all diagnostics and their original precedence. A malformed ordinary function body must not produce a new lexical diagnostic before the signature pass would have reported a duplicate function later in the module.

A JavaScript `Lexer` borrows one index for its input when present. Its public `token.value`, `token.kind`, `token.at`, `offset`, `end` and `skipBody()` retain their exact meaning. Scanning from a bounded start inside a known token, comment or escape may behave differently from the original whole-file match. Such a start uses the reference path until a known legal boundary is reached. The correct EOF offset includes the distinction between the last token end and trailing whitespace. An index can fail to allocate within the 4 MiB Editor limit. The measurement must include every live QuickJS-owned buffer and native temporary. On the P4 the allocator uses the same accounting as the rest of the compiler.

## Algorithm

```text
scan(source):
    for each token in source order:
        skip trivia according to the language grammar
        determine the complete token, its kind, and its UTF-16 offsets
        id = find or insert (kind, spelling) in the symbol table
        append [start, end, id, 0] to the occurrence table
        for an opening brace, remember this row
        for a closing brace, resolve its opening row
    return both buffers

compile(source):
    start an index lifetime scoped to this compilation
    share a source index among its bounded Lexer instances
    allow a separate index for the generated continuation source
    for each token, resolve a symbol spelling once and reuse its value
    release all indices at return, including errors
```

Keep syntax, type checking, source maps, enum exhaustiveness, await liveness and relocation in their existing compiler implementations. CPU time bought by this change has to come from how input is represented and read. The compiler must still accept edited source and compile it from scratch on the board. No saved application output participates.

## Implementation and verification

1. Start from detached `2e4fee1`. Stage the experimental files under this ticket’s scripts directory. Keep Node and vendored QuickJS reference configurations available for differential testing.
2. Implement the native record producer, compiler-context binding and host test harness. Construct arrays under QuickJS memory accounting and clean up on every partial allocation or exception. Review UTF-16 offsets, escapes, integer and identifier boundaries, case-sensitive operators and trailing comments.
3. Add the indexed cursor in a staging overlay of `typed-wasm.js`. Reuse token values without introducing mutation of tokens retained by the async parser. Preserve the reference constructor’s arbitrary start/end inputs and the signature pass’s balanced-body behavior.
4. Run lexical, diagnostic and output comparisons on the full Files/Agenda/Editor corpus plus malformed and randomized inputs. Include the full E and G fixtures, both native lowering modes, whole Wasm and RV32 artifact digests, and identical source-mapped diagnostics. Check the 4 MiB limit with fresh QuickJS contexts and reclaim state across repeated compilations. Attempt a small post-edit compile in the same runtime to exercise index ownership.
5. Only an equivalent candidate earns a board trial. Compare its native compile, three cold boots, to both `1357545` and `2e4fee1`. Measure peak bytes and record the entire image digest. If it clears the timing target, repeat the six interactive G4 trials with that compiler before selecting a production change. If it misses, record the measured costs in the main report.

An intern should begin with `Lexer.next`, `Lexer.skipBody`, `scanSignatures` and `emitFunctions` in `typed-wasm.js`. Then read `readProgram` in `typed-async.js` and `p4_typed_compile` in `port/esp32p4/main/typed_p4.c`. In the QuickJS C API, `JS_ToCStringLen2` with CESU-8 conversion exposes source bytes. `JS_NewArrayBuffer` can transfer an allocated data block to an object with a release callback. Verify allocator ownership across that boundary. [E/G integration and device qualification](../../../19/PICOCALC-EG-QUAL--implement-and-qualify-the-typed-language-and-asynchronous-editor-on-the-picocalc/index.md)
