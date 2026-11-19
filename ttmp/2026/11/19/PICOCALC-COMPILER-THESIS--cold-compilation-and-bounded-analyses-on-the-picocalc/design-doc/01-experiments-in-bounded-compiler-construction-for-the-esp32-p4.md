---
Title: Experiments in bounded compiler construction for the ESP32-P4
Ticket: PICOCALC-COMPILER-THESIS
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T15:44:04.523918463-05:00
WhatFor: ""
WhenToUse: ""
---

# Experiments in bounded compiler construction for the ESP32-P4

An application that compiles on the handheld pays for creating its own machine code. Editor's previous native compile took roughly 3.14 seconds. The question here is how much extra compiler work is worth paying for smaller or faster code.

## From source to instructions

The frontend in `picocalc-os/compiler/typed-wasm.js` checks functions in definition order and builds their Wasm instruction bodies. The RV32 backend consumes those bodies, chooses machine instructions and patches control transfers. The world linker inserts the completed program in an executable region reserved in the reactor. Reducing the number of emitted instructions can leave the ELF length unchanged because the file reserves the full region in advance.

```mermaid
flowchart LR
  S[Typed source] --> F[FunctionEmitter]
  F --> W[Checked function bodies]
  W --> R[RV32 lowering]
  R --> I[Machine code and relocations]
  I --> E[Reactor ELF]
```

## Three experiments

1. **Place temporary values in registers.** The baseline backend writes the sum in `(a+b)*c` to a stack slot and reads it back to multiply. Keep it in a register until it is consumed. At a call, preserve values that the caller needs after return. Both paths to a control-flow join must agree on where every live value resides. The first implementation should change the normal compiler entry point and pass both synthetic differential fixtures and all relevant application replays.
2. **Change the representation passed to the backend.** Compare encoded function bodies with an operation stream, and measure the cost of retaining all functions versus consuming them as they become ready. Hold generated code and linkage metadata constant. Cost includes time to produce the representation, consume it and discard it. A format that decodes quickly can still cost more across a complete compile.
3. **Prove bounds at the access.** A branch may establish `i < end` while a prior assignment or guard established `end <= text.length`. An access also needs a valid lower bound and the current length of the same buffer. Search for sufficient facts under a fixed work budget. Preserve the check when an alias, a write, a call, arithmetic wrap or an exhausted budget prevents the proof.

```text
for each access:
    identify current definitions of index and buffer
    search active facts up to the query budget
    if the facts imply both bounds for this buffer:
        emit address and load
    otherwise:
        emit guard, address and load
```

## Controls and reproducibility

Pin the control compiler to dd69a81. Files contributes seven functions, Agenda's typed parser and reminder source contributes 34, and Editor contributes 120. Compare values, memory changes, traps or published frames according to what each experiment changes. Record raw samples, source identifiers, units and aggregation. Compile-time memory, app-world memory, occupied code and total ELF length have different meanings. For a cold comparison, initialize a new compiler runtime for each trial. Device claims require identification of the P4 transport and measurements from the board.

## Prior art

Ertl's static stack caching and Liftoff's virtual stack explain how a fast compiler tracks value locations. Titzer compares baseline compilers across compilation and execution cost. ABCD describes on-demand reasoning at bounds checks. The professor's special issue and NATIVE-NEXT supply the starting compiler measurements and the staged counting model. The experiment investigates how the cost of these techniques changes on a small compiler and a corpus of real applications.

Read [Liftoff](https://v8.dev/blog/liftoff), [Titzer](https://arxiv.org/abs/2305.13241) and [Bodík, Gupta and Sarkar](https://doi.org/10.1145/349299.349342). Reproduction scripts, raw results, and authored diaries accompany the reports in this ticket.
