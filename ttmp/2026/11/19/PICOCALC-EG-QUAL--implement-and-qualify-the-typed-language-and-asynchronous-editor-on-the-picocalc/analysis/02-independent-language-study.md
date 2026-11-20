---
Title: "Forward calls and erased types in a two-target compiler"
Ticket: PICOCALC-EG-QUAL
Status: review
Topics:
    - picocalc
    - performance
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Independent Opus High analysis checked against the implementation and its recorded experiments."
LastUpdated: 2026-11-20T00:00:00-05:00
WhatFor: "Read with the implementation team's compiler and application measurements."
WhenToUse: "When studying the completed E and G compiler phases."
---

# Forward calls and erased types in a two-target compiler

## 1. System Overview

The compiler is implemented across three source files, `typed-wasm.js` (lexer, signature scanning, acyclicity checking, function emission, match compilation, and the `compileTyped` entry point), `typed-rv32.js` (native RV32 compilation with internal call relocation), and `typed-world.js` (entry-point enumeration, import resolution, and ABI validation). It consumes a typed source language and produces either WebAssembly bytecode or RV32 native machine code. Each run selects one backend. Both backends share the same frontend, which scans signatures and then visits function bodies in a single pass.

Seven experiment stages (E1–E7) introduced else/else-if, for-loops, break, strict inequality, forward calls with cycle rejection, exhaustive enum matching, and erased distinct integer domains. Production commits `c5e2839` (E1–E5) and `4eb08cb` (E6/E7) contain these stages. The control baseline is commit `289281c`.

## 2. A forward call in source order

This program returns 42.

```typescript
function main(): i32 {
  return double(21);
}

function double(x: i32): i32 {
  return x + x;
}
```

Here `main` calls `double`, but `double`'s definition appears after `main` in the source file. In a streaming compiler that processes declarations in source order, the parser reaches the call to `double` inside `main`'s body before it has parsed `double`'s body. This is a forward call.

The implementation resolves forward calls with a signature pass followed by streamed body emission. First, `scanSignatures` in `typed-wasm.js` performs a lightweight pre-scan of the entire source, collecting every function's name and type signature without parsing any function body. After this scan completes, every function's signature is known to the frontend, and—in the Wasm backend—every function has been assigned a numeric index. Second, `compileTyped` visits each function body in source order. When `FunctionEmitter.call` encounters the call to `double` inside `main`, it already has `double`'s signature from the scan and can type-check the call immediately.

The two backends resolve the actual target reference differently. For Wasm, each function's numeric index was assigned during the signature scan. `FunctionEmitter.call` emits that index directly in the Wasm `call` instruction. For RV32, the native code address of `double` is not yet known when `main`'s body is compiled, because code addresses depend on the byte size of each emitted function body. The RV32 linker in `typed-rv32.js` records a relocation entry and fixes the branch target after `double`'s code has been emitted.

Source order and call graph order are therefore independent. A programmer may place `double` before or after `main`. Reordering definitions can change numeric indices in Wasm output and code addresses in RV32 output while preserving program meaning. Byte-identical output was verified for fixed source revisions and for deliberately erased type casts.

## 3. The Acyclicity Restriction

The `checkAcyclic` function in `typed-wasm.js` traverses the call graph and rejects cycles with a named diagnostic identifying the participating functions. The language requires an acyclic call graph. This lets the compiler enumerate the fixed frames that each async root needs. The professor’s proposed F1 analysis can also use that graph to compute maximum native call-stack use once it knows the frame sizes and SDK stack requirements. The continuation record and the native call stack have different lifetimes.

## 4. Explicit Types and Word Representation

Experiment E7 introduced erased distinct integer domains. Types such as `Units` and `Columns` are semantically distinct during type checking. The frontend rejects an expression that adds a `Units` value to a `Columns` value. Both types erase to bare `i32` operations at code generation.

The measurement confirms total erasure. When the Editor application's source was modified to give units and columns distinct integer types, the Wasm byte count and RV32 instruction count were preserved at 88,255 Wasm bytes and 21,886 RV32 words. This was verified by digest comparison on fixed source. No additional instructions, wrapper functions, or runtime tag checks appear in the output. Explicit types exist only during the checking phase and leave no trace in the emitted code.

An explicit type determines which operations the compiler accepts. A representation determines where and how machine instructions read the resulting value.

## 5. Exhaustive Match and Enum Lowering

A `match` statement over an enum must list every variant. The compiler checks exhaustiveness at compile time by tracking which variants have been handled. The E6/E7 Find-enum checkpoint measured 88,302 Wasm bytes and 21,922 RV32 words, an increase of 47 Wasm bytes and 36 RV32 words relative to the previous Editor. The 71 state fields remained unchanged.

The enum lowering emits direct tests for individual variants and grouped cases where applicable, followed by a final trap for an invalid raw enum tag. This trap provides runtime protection against a value that bypasses the type system. The three invalid-enum trap test cases verify this behavior.

## 6. Interpreting the Two Timing Clocks

**Host clock (QuickJS frontend-only).** This measures the time the JavaScript-implemented compiler frontend takes to execute on a development workstation under QuickJS. The pinned session took 55.89 ms on stock and 49.18 ms on E1–E5. An unpinned repeat placed E5 at 50.04 ms, bracketed by stock measurements of 46.16 ms and 45.86 ms. The absolute historical threshold of 31.4 ms was missed by all runs. The causes of session-to-session variation were not measured and cannot be decomposed into individual factors.

**Cold compiler clock (device, compilation interval only).** This measures specifically the compiler interval during boot on the PicoCalc board, including preparing the typed compiler, compiling the Editor source, and linking. It excludes normal OS initialization before the compiler starts, subsequent module loading after compilation completes, Editor execution, and display rendering. The three control observations were 2,475,846 / 2,475,289 / 2,476,041 μs. The three E1–E5 observations were 2,539,493 / 2,539,880 / 2,541,431 μs. Median shifted from 2,475,846 μs to 2,539,880 μs, an increase of 2.59 percent, inside the prespecified 5 percent device-budget threshold.

These clocks answer different questions. The host clock detects relative regressions between compiler versions within a single development session. The cold compiler clock measures actual compilation cost on the target device in isolation from other boot-time work. A guest execution benchmark measures the work done after either compiler has produced the program.

Peak QuickJS allocator bytes were 1,465,288 for E5 versus 1,410,860 for the control, a difference of 54,428 bytes. This difference reflects the E1–E5 compiler additions (forward-call resolution structures, cycle-checking state, control-flow extensions) compiled against unchanged source. E7 arrived later. Both ELFs occupy the same 240,452-byte reservation. A separate digest comparison checks fixed-source byte identity.

## 7. Test Coverage and Limitations

The verified suite comprises 46 execution cases, 3 invalid-enum trap cases, and 30 diagnostic cases across both targets, plus 24 catalog replay passes on commit `1357545`. Existing full-application artifacts remain unchanged on both targets for unmodified source.

Host timing figures are not reproducible across machines or sessions, and the causes of variation were not measured. Device timing figures are specific to the PicoCalc hardware and its QuickJS-based firmware. The five-percent threshold expresses the project’s engineering budget. All timings were generated by the implementation and integration team; this report reasons about those receipts without claiming independent operation of the device or compiler.

The implementation team supplied the measurements for this independent article. The companion ticket is `PICOCALC-LANGUAGE-E`. [Verified inputs](../sources/verified/language.md) · [Researcher's investigation diary](../reference/02-independent-language-diary.md)
