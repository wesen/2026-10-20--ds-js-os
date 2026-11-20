---
Title: A guarded eight-lane vertex projection from the scalar Typed loop
Ticket: PICOCALC-TYPED-PIE
Status: active
Topics:
    - compiler
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T16:09:28.650307305-05:00
WhatFor: ""
WhenToUse: ""
---

# A guarded eight-lane vertex projection from the scalar Typed loop

## Executive Summary

<!-- Provide a high-level overview of the design proposal -->

## Problem Statement

<!-- Describe the problem this design addresses -->

## Proposed Solution

<!-- Describe the proposed solution in detail -->

## Design Decisions

<!-- Document key design decisions and rationale -->

## Alternatives Considered

<!-- List alternative approaches that were considered and why they were rejected -->

## Implementation Plan

<!-- Outline the steps to implement this design -->

## Open Questions

<!-- List any unresolved questions or concerns -->

## References

<!-- Link to related documents, RFCs, or external resources -->

Typed stores UTF-16 buffer payloads as unsigned halfwords. A vertex projection can use those halfwords for bounded integer coordinates without changing the language. The example projects each vertex into two screen coordinates and a depth key with ordinary reads, arithmetic and writes. The backend selects an eight-vertex native path after the existing type checker has translated the operations. Applications can use the same source with the stock compiler.

## Compile and inspect a function

From this ticket, run the following commands.

```bash
node scripts/03-compile.mjs compile scripts/01-vertices.typed /tmp/project-stock.bin scalar
node scripts/03-compile.mjs compile scripts/01-vertices.typed /tmp/project-portable.bin portable
node scripts/03-compile.mjs compile scripts/01-vertices.typed /tmp/project-pie.bin pie
```

The adapter injects an explicit option into the stock RV32 emitter. It keeps declarations, streamed function boundaries, link entries, and scalar code generation. The portable arm takes the same guards and uses ordinary RV32 instructions for each element of the checked prefix. Its purpose is to measure the benefit of moving repeated checks and address arithmetic out of the loop independently from the benefit of issuing PIE instructions.

The per-function matcher checks the scalar operation stream after parsing. A counted loop starts with a new induction slot set to zero, compares it with an immutable i32 parameter, and increments that slot by one. Inputs are checked reads from buffer parameters at the induction index. An unsigned read followed by remainder modulo a power of two gives a value in a closed interval. For example, `charCodeAt(i) % 256` narrows [0, 65535] to [0, 255]. A store expression can combine those same inputs and constants with addition, subtraction and multiplication by a small positive constant. Each operation derives an interval and must fit in signed 16 bits. The matcher checks every intermediate, since `(x + 32760) - 32760` can overflow the packed addition even if its final result fits.

For the example projection the screen-x interval is [129, 639], the screen-y interval is [130, 1150], and the depth interval is [0, 765]. A coordinate stored as raw i32 by the source and copied to a 16-bit buffer has the same low 16 bits as the computed packed lane. Multiplication is lowered to regular vector additions with a proven bound for every positive partial multiple. The prototype avoids a dependency on the processor's multiply shift and rounding state.

## Run the guarded prefix

The compiler preserves the original scalar initialization, loop and result. After initialization it branches around the new loop if any check fails. The count must be at least eight and below 16,384. The vector prefix has `count & -8` elements. Each participating capacity must cover the prefix and each payload address must be aligned to 16 bytes. A buffer header is four bytes before its payload. For the prototype, align the payload by using a 16-byte-aligned struct with 12 bytes of leading padding.

For every pair that includes an output, the guard compares the memory intervals from each header through the last prefix halfword. The header participates because scalar accesses reread capacity, and a store into an overlapping header could change a later check. Input-only pairs can share read-only intervals. Host callers provide valid Typed buffer objects and exclusive ownership for the duration of the kernel. The guard checks prefix address arithmetic against wrap.

If an output holds only six units and the count is 17, the vector prefix is 16 and the capacity guard sends execution to the original loop at zero. The original loop writes indices zero through five and traps at the same point in iteration six as stock. If it holds 16 units instead, the vector prefix computes the first 16 points. The untouched scalar code resumes at 16, checks the next store and traps in that iteration. This preserves prior writes and the order of checks within the failing iteration.

The generated function uses the existing position slots as temporary stack storage outside of the scalar body. PIE code uses q0, q1, q2 and q4–q7 and preserves the borrowed RV32 s0 register. The installed ESP-IDF 5.4.2 PIE context switch omits q3. Selection is confined to a research target using an ESP32-P4 firmware whose PIE enable and scheduling path is part of the test. [ESP32-P4 Technical Reference Manual, chapters 2 and 4](https://documentation.espressif.com/esp32-p4_technical_reference_manual_en.pdf)

## Extend or review the prototype

Review `Matcher.position`, `Matcher.input`, and `Matcher.expression` together. They rely on the check and address sequence emitted by `FunctionEmitter.codeUnitAddress`. An unexpected instruction, additional induction write, unavailable vector register, or an interval outside signed 16-bit causes an ordinary scalar compilation. The matcher only searches a function's initial loop statement. It accepts no per-iteration helper calls, variable coefficients or cross-vertex dependencies.

The runtime guards implement a conservative form of loop versioning. The two versions share one scalar continuation, which serves both guard failure and a remainder of up to seven elements. LLVM's loop vectorizer uses runtime disjointness checks and scalar execution for portions outside a vectorized path for similar semantic reasons. [Auto-Vectorization in LLVM](https://llvm.org/docs/Vectorizers.html)
