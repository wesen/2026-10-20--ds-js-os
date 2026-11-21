---
Title: Experimental design and implementation guide
Ticket: PICOCALC-COMPILER-INSPECT
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T00:24:58.398694294-05:00
WhatFor: ""
WhenToUse: ""
---

# Experimental design and implementation guide


The frontend parses functions into a stream of operations. The Wasm path encodes a module containing local declarations and Wasm instructions. The native path consumes numeric operations, assigns temporary values to registers or frame slots, emits words and patches branch and call destinations after computing function sizes. A dump taken before that final step can show zero where the delivered image contains a jump. Observe the existing stages in place and read bytes from the finished artifacts.

    source -> frontend event (names, types, locations, operations)
                         |-> Wasm body -> offsets in final module
                         |-> RV32 lowering -> fixups -> offsets in native image
                                                          ^ join PC counts here

Use an optional, exact-function-filtered observer. When it is absent, streaming continues and the compiler releases each function as usual. Synthetic frame setup, teardown and compiler-generated source need explicit origin labels. Consecutive source operations may fuse; a mapping must allow a range of inputs to produce one range of instructions, including an empty range. Native image offsets and Wasm module offsets have distinct units from frontend cell indices. A profile must name the exact native image it executed. Reject a hash mismatch.

Compare observed and unobserved builds byte for byte, including imported calls, control flow, checked memory, leaf and framed functions. Compare syntax and backend error messages. Test readable and JSON Lines output through the CLI. Count the default ray frame, check its reference image and use the joined profile to identify the hottest source-associated stack access in the shadow routine.
