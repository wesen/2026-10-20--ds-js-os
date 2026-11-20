---
Title: Which PSIX facts bind at specialization time?
Ticket: PICOCALC-PSIX-STAGING
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/compiler/typed-wasm.js
      Note: Typed buffer and record implementation
    - Path: repo://ttmp/2026/11/20/PICOCALC-PSIX-STAGING--specialize-psix-screen-encoders-with-the-picocalc-typed-compiler/scripts/review/01-binding-boundary.mjs
      Note: Independent one-runtime-string residual writer
ExternalSources: []
Summary: A one-string differential experiment separates declaring a field order from knowing its packet-local string ID.
LastUpdated: 2026-11-20T12:15:00-05:00
WhatFor: Designing a residual encoder for an unchanged PSIX v1 reader
WhenToUse: When qualifying a template, schema, observed shape, or generator
---

# Which PSIX facts bind at specialization time?

## The observable contract

For an accepted value `v`, a successful specialization returns exactly `reference.encode(v)`. For a value outside its accepted domain it must signal a miss, call the general writer, or reject according to the caller’s contract. A guard miss on a legal value differs from an invalid value. Keep the input and previously published packet alive until success, or take a stable copy if the caller may change them between guard and write. The counterexample uses ordinary data properties, well-formed strings and finite numbers. General JavaScript accessors, proxies and mutation during enumeration would require their own snapshot semantics.

## Design and falsifiers

Declare one record with ordered keys `label`, `score`, and `tail`. Permit any well-formed string of at most 2,048 UTF-8 bytes for the label, and any finite JavaScript number for the score. Fix the tail to `[true, 7, "\ue000"]`. Build two writers for this experiment. The first directly implements the remaining computations for that declaration. The control starts with the correct current header and dictionary and uses body bytes observed on an equally long earlier packet. This gives the control the best possible prefix. Its failure would isolate the dependency in the body.

| Change one fact | Prediction and falsifier |
| --- | --- |
| Replace “zz” with “aa” | Same pool byte length and same record locations. The three key IDs and the label ID change. Matching bytes with the untouched body would refute this prediction. |
| Use “label” as the value | Keys and values share one dictionary. The fifth unique string and its directory entry disappear. The record start must move. |
| Move the score from 524287 to 524288 | The score’s slot stays three bytes. It now points to an eight-byte number, pushing the following tail record eight bytes forward. |
| Insert U+10000 alongside U+E000 | UTF-8 byte order puts the private-use character first. JavaScript default UTF-16 order puts the supplementary character first. The reference decides equality. |
| Give a lone surrogate or a 2,050-byte string | Both the reference and the experimental writer reject. Replacing the surrogate during transcoding would encode a different input. |

Validate every successful case against the unchanged encoder and reader. Include empty and NUL-containing labels, prefix strings, both sides of the signed immediate range, subnormal values, maximum finite binary64, and negative zero (the reference canonicalizes it to integer zero). Distinguish rejection agreement and admissions from byte comparisons. Test shape agreement independently of pointer identity.

## A generator’s input and residual operations

Let `S` be the sorted distinct static byte strings known to occur in *every* output of this plan. A key in an optional child cannot enter this set unconditionally. For one runtime string `x`, calculate its lower bound `r` in `S`. When `x` equals `S[r]`, the dictionary and static IDs are unchanged and `x` receives ID `r`. Otherwise insert it and shift every static ID at or after `r` by one. The relative order of the object’s keys survives either operation. Their literal bytes can be cached even when their IDs and output addresses change. For many runtime strings, validate, deduplicate and order the participating values, then merge them with the sorted static strings and calculate ranks once. This algorithm needs a bound on scratch bytes and the number of distinct strings.

Emit a buffer capacity check using the final directory count, unique UTF-8 byte lengths and indirect value widths. Emit constant blocks at computed positions. In this experiment the eight-byte array prefix is independent of every input and still changes address. Emit the root field IDs, label slot, score slot, absolute container positions, and tail string ID after the merge and sizing steps. An implementation with a numeric-only plan can use exactly the same split, bypassing the dictionary merge when its string set is provably fixed. Declaring an i32 value alone leaves the 20-bit wire width undecided.

| Source of shape information | Evidence required before direct writes | Scope of any shortcut |
| --- | --- | --- |
| Declared, mandatory fields in a typed record | Compiler/linker agreement on field offsets, exact string representation, meaning of enum and range constraints | Read fields by known positions. The input type is insufficient evidence for string ranks or absolute packet addresses. |
| Observed ordinary JavaScript data | Match exact own enumerable keys, array lengths, dynamic value types and every value assumption used by the plan | A guard may deliberately accept more values by leaving dictionary merging and representation choice in the residual routine. Include the cost of translating to the typed input. |
| Previously serialized packet | Verify exact template variant, current ownership and initialization of destination bytes | A successful guard establishes only the facts it checked. Full construction and in-place updates have different cost and ownership contracts. |

## Relationship to the PicoCalc compiler

The Typed frontend records field offsets in four-byte steps. Scalar operations lower through a common frontend to Wasm or a numeric instruction stream consumed by the RV32 compiler. `buffer.setCharCodeAt` bounds-checks and stores a **16-bit** unit after the four-byte capacity header. `writeLiteral` emits individual stores and limits a literal to 1,022 UTF-16 code units. The production SDK converts the screen buffer to UTF-8 text before calling `nw_screen`. Therefore a generated writer needs a byte-oriented sink, packed store/bridge or explicit output conversion, with the cost and ownership stated. Existing text transport cannot carry arbitrary PSIX bytes, which include zero. A host Buffer is appropriate for the independent correctness experiment. Its memory layout and number operations are unavailable as direct Typed primitives. [Typed frontend](../../../../../../picocalc-os/compiler/typed-wasm.js) · [Typed SDK](../../../../../../picocalc-os/sdk/typed/world.c)

A first implementation can emit code for a fresh compilation unit, with positional schema fields and private generated helper names. A source-level macro that inserts free identifiers into a user's program would additionally need lexical binding discipline. Choosing when a value becomes available and preserving which declaration a generated identifier denotes are independent obligations. The local reading prompted this distinction. Flatt formalizes scope-based identifier resolution. Jones, Gomard and Sestoft give the semantic equation for partial evaluation. Rompf and Odersky show how staged types retain operations on future values. Kennedy shows how a single format description can compose products and alternatives. Google's FlatBuffers description illustrates the latitude some formats give their builders to reorder storage, whereas this PSIX oracle fixes byte order. [Flatt](https://www-old.cs.utah.edu/plt/publications/popl16-f.pdf) · [Jones, Gomard and Sestoft](https://raspi.itu.dk/people/sestoft/pebook/pebook.html) · [Rompf and Odersky](https://infoscience.epfl.ch/record/150347/files/gpce63-rompf.pdf) · [Kennedy](https://www.microsoft.com/en-us/research/publication/functional-pearl-pickler-combinators/) · [FlatBuffers internals](https://flatbuffers.dev/internals/)

## Measurement boundary

This arm tests semantics on Node. No generator, native deployment, timing, heap peak or production world transport is implied by the writer. For speed trials, run the generic writer and a plan interpreter over the same input beside generated code, account for guard/packing and fresh-buffer initialization, and include paid compilation. At hit fraction h and positive measured saving per attempted frame, the simplest break-even count is cold cost divided by mean saving per attempt. Weight the hit and miss paths with the observed workload. When the denominator is zero or negative the measured regime has no positive crossover. [Independent source and evidence](../scripts/review/01-binding-boundary.mjs) · [Worked result](../analysis/04-staging-and-binding.md)
