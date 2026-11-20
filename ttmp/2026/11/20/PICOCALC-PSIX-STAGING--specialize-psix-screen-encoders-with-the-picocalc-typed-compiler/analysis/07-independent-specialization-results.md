---
Title: "Specializing a binary writer on a handheld processor"
Ticket: PICOCALC-PSIX-STAGING
Status: complete
Topics: [picocalc]
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20
WhatFor: ""
WhenToUse: ""
---

> **Operator’s publication note.** Opus interpreted the first measurement window from the supplied brief. The operator’s scope note after the original bibliography gives the wire corrections, timing units and experiment boundaries.

# What a layout table can teach a handheld compiler

This article is for compiler interns joining the project. It describes one experiment: three implementations that produce the same bytes, what was measured, and what the evidence supports. Where the evidence is narrow, the article says so.

The question was this. Suppose a program on a handheld device must serialize application state into a fixed binary wire format many times per second, and the schema of that state is known before the program runs. Should the compiler generate a specialized native function for that schema? Or should a small, fixed interpreter walk a precomputed **layout table** derived from the same schema? Both approaches use the schema ahead of time. They differ in where the schema knowledge ends up: in emitted instructions, or in data read by a loop that is compiled once.

## The wire format: PSIX v1

All three implementations target the same format, PSIX v1. An intern must know its rules, because most of the difficulty comes from them.

- **One string table per packet.** Every key and every string value appears once in a single packet-global table. The table is sorted, entries are unique, and the encoding is UTF-8 (RFC 3629).
- **3-byte slots.** Each value slot has a 4-bit tag and a 20-bit operand. The operand can be a string index, an inline integer, or an offset.
- **5-byte object entries.**
- **Absolute offsets.** References point to positions measured from the start of the packet, not from the referring slot.
- **Strict preorder.** Content is laid out in preorder. An indirect double, meaning a floating-point value stored outside its slot, may appear before structural content that comes later in the tree.
- **Inline integer range.** A signed 20-bit operand holds values in **[-524288, 524287]**. Any integer outside that range needs a wider representation.

These rules make the bytes canonical: for a given value there is exactly one valid encoding. They also make the bytes non-local. A change in one place can move bytes in another.

### A counterexample every intern should reproduce mentally

An independent check took a packet and changed one string value, the label `zz`, to `aa`. Because the string table is sorted, `aa` moves to a different position than `zz` held. Every slot that refers to a string by index then changes. In that case, **four bytes changed** in places other than the string text itself.

The check then went further. It built a **new, valid header and directory** for the edited packet and paired them with the **stale body** from the old packet. That combination **passed admission** and decoded with `label = 524287`, which is the maximum inline integer. A header check is therefore not proof of body integrity.

The rule for any fast path that patches an earlier packet follows directly: changing a string can renumber references anywhere in the body, and the admission check will not catch a stale body. Whatever guard a patching path uses must cover these indirect effects.

Against that hazard, the residual writer described below produced correct output on **299 cases**.

## Three producers, one byte stream

```
                    closed schema (record / tuple / literal / dynamic field)
                                         |
            +----------------------------+------------------------------+
            |                            |                              |
            v                            v                              v
   generic C PSIX encoder       closed source generator          layout table builder
   input: prebuilt cJSON tree   -> 16,680 B typed source         -> table (data)
   (built outside the clock)    -> P4 production compiler                |
            |                    -> 16,116 B RV32 instructions           v
            |                            |                     GCC-compiled C interpreter
            |                            |                              |
            |          input: 90 packed 16-bit units (pieces, masks, 9 x int32)
            v                            v                              v
      +-------------------------------------------------------------------+
      |  raw contiguous PSIX bytes in a counted, caller-owned buffer      |
      |  (313 bytes per observed Chess state; byte-identical across all)  |
      +-------------------------------------------------------------------+
```

The project already had a typed compiler with this pipeline: lexer, then functions, then WebAssembly (Wasm) or RV32 output. The schema-specialized path reuses that compiler. It does not add a new backend.

## Binding time and hygiene

Two ideas from partial evaluation and macro systems explain why the generator is small.

**Binding time.** A binding-time analysis divides a program's inputs into *static* inputs, known at generation time, and *dynamic* inputs, known only at run time (Jones, Gomard and Sestoft, 1993). Here the schema is static. Field order, key strings, literal fragments, and the order of the sorted string table for fixed keys can all be computed before run time. The packed game state is dynamic. A generated encoder is a residual program: the code that remains after static work is done. A layout table is the same static work stored as data instead of as code. Futamura's first projection (1971) states the general principle: specializing an interpreter to a fixed program yields a compiled form of that program. The table interpreter and the generated function sit at two points along that line.

**Hygiene.** Generated code must not capture or shadow names in surrounding code (Kohlbecker et al., 1986). The lab found that, for a *closed* schema, two rules were enough:

1. Every local the generator introduces is fresh. Because the generator controls the whole emitted function, no user name can collide with a generated one.
2. Every runtime value is evaluated exactly once and bound to a fresh local before any use. A field read never appears twice in emitted code. This matters most when one value decides both a width (inline or wide) and an emitted operand.

With those two rules in place, a generic syntax-extension mechanism such as a macro system was **unnecessary** for this task.

The pseudocode below shows the table-interpreter form. It is illustrative and is not the lab's source code. It also includes a detail specific to this compiler: the compiler only supports buffers of 16-bit units. Writing a byte at an odd address therefore sometimes means reading the containing unit and keeping its other byte unchanged.

```text
# STATIC: table built once from the closed schema
# DYNAMIC: state = 90 x u16 units; out = caller-owned u16 buffer of cap bytes

function encode(table, state, out, cap) -> (status, length):
    pos := 0
    for step in table.steps:
        switch step.kind:
        case LITERAL:                         # precomputed byte run
            if pos + step.len > cap: return (REFUSED, pos)
            for b in step.bytes: put_byte(out, pos, b); pos := pos + 1
        case INT_FIELD:
            v := read_i32(state, step.unit)   # evaluated exactly once
            if -524288 <= v and v <= 524287:
                need := 3
            else:
                need := step.wide_len         # width rule fixed by schema
            if pos + need > cap: return (REFUSED, pos)
            pos := emit_int(out, pos, step.tag, v)
        case STRING_REF:
            idx := step.sorted_index          # resolved statically
            if pos + 3 > cap: return (REFUSED, pos)
            pos := emit_slot(out, pos, step.tag, idx)
    return (OK, pos)

function put_byte(out, pos, b):
    u := out[pos / 2]                         # 16-bit unit containing pos
    if pos is even: u := (u & 0xFF00) | b     # keep the other byte
    else:           u := (u & 0x00FF) | (b << 8)
    out[pos / 2] := u
```

A generated encoder contains the same operations, unrolled. Each `step` becomes straight-line code with its own fresh locals.

## What was built and checked

- A **closed source generator** takes a Chess schema made of records, tuples, literals and dynamic fields. It generates **16,680 B** of typed source. The **P4 production compiler** compiles that source to **16,116 B** of RV32 instructions.
- The **entire on-device ELF was verified identical** to a host-built artifact before production ELF relocation and execution.
- **Inputs:** 90 packed 16-bit units holding pieces, masks and nine int32 values. **Outputs:** raw contiguous wire bytes written into a counted buffer owned by the caller.
- **47 real, unchanged application observations** each encoded to **313 bytes**. Output was byte-identical across all 47. A further **121 host Wasm and RV32/emulator cases** also matched, including numeric width choices and refusal when the buffer is too small.
- A separate **automatic derive** reads the compiler's own record table. It handled **four unmodified Chess/Agenda scalar record declarations** on **231 host Wasm values**, including int32 extrema. RV32 code was also emitted. This shows that **flat scalar records need no duplicate schema**. Chess's special projection and alphabet facts **do need extra semantics** that the record table does not carry.

## Steady-state measurement

The physical experiment ran **7 interleaved blocks per candidate × 47 states × 4 encodes each**. Interleaving follows standard practice for reducing drift between candidates (Georges et al., 2007; Kalibera and Jones, 2013).

| Candidate | Input | Median per encode |
|---|---|---|
| Generic C PSIX (malloc included; tree construction and release outside the clock) | prebuilt equivalent cJSON tree | 101.28 µs |
| Schema-generated native function from the typed compiler | packed state | 78.245 µs |
| GCC-compiled C interpreter of a precomputed layout table | packed state | 24.713 µs |

All three produced identical raw bytes.

**How to read this result.** The candidates differ in code placement, native toolchain, and implementation detail. The experiment therefore **cannot isolate dispatch cost** and **cannot establish a lower bound** for either approach. Mytkowicz et al. (2009) showed that changes in code layout alone can move results by amounts of this order. A host x86 emulator counted about **21,496 guest instructions** per representative generated call. There was **no per-instruction time attribution**. The 16-bit-unit read-modify-write is a plausible contributor to that instruction count, but it was not measured separately.

## Setup cost

| Phase | Median |
|---|---|
| Schema to resident callable (total) | 603.790 ms |
| Generation, including loading and disposing its JS realm (partly accounted) | ~51.8 ms |
| Typed frontend plus backend/link | 537.747 ms |
| Qualified native relocation | ~1.53 ms |

The phase medians do not need to sum to the total median. Peak JS allocator use during compilation was **698.9 KB**.

Divide the setup time by the per-encode difference between the generic encoder and the generated function: 603.790 ms ÷ (101.28 − 78.245) µs ≈ **26,200 packets** before the generated function recovers its setup cost. This figure is a sensitivity estimate. It is not a measure of input or paint latency. Against the C table interpreter, **no hot crossover was observed**.

## The observed-shape arm

A separate arm asked a different question: can the encoder learn shapes it observes at run time? It uses an **interpreted plan with structural guards**, in the tradition of inline caches (Deutsch and Schiffman, 1984; Hölzle, Chambers and Ungar, 1991). It does **not** JIT arbitrary objects into native code. It matched **427 full screens** and all held-out outputs, including Keys.

On physical QuickJS, over 5 blocks:

| Workload | Generic | Trained bank | Online (initially empty) | Prefix-warmed |
|---|---|---|---|---|
| 9 held-out System screens | 31.99 ms (no plan) | 28.96 ms (7 hits) | 39.84 ms (4 hits) | 30.17 ms (8 hits) |
| 6 independent Keys screens | 20.24 ms (no plan) | 20.68 ms (0 hits) | 29.99 ms (1 hit) | 29.44 ms (1 hit) |

Training took about 102 ms. Warmup took about 326 ms. When there are few hits, guard checks and startup add cost without benefit. The contrast with host runs made those costs visible in a way the host runs alone did not.

## What this work does not cover

There is **no transport, raster, SPI or optical timing** in these results. **No production firmware was changed.** A director-run follow-up on literal copy and patching is a separate piece of work and may be published on its own. This article makes no claims about its measurements.

## Decision so far

1. Advance a **compact schema descriptor** as the reference form.
2. Use the compiler to **derive** that descriptor wherever the fields are already known from the compiler's records.
3. Investigate generating **shorter native loops**.
4. Investigate **bounded patching** with guards that are correct under the string-reordering hazard described above.

## Primary sources

- Y. Futamura, "Partial Evaluation of Computation Process—An Approach to a Compiler-Compiler," *Systems, Computers, Controls* 2(5), 1971. Reprinted in *Higher-Order and Symbolic Computation* 12(4), 1999.
- N. D. Jones, C. K. Gomard, P. Sestoft, *Partial Evaluation and Automatic Program Generation*, Prentice Hall, 1993.
- E. Kohlbecker, D. P. Friedman, M. Felleisen, B. Duba, "Hygienic Macro Expansion," ACM LFP, 1986.
- W. Taha, T. Sheard, "Multi-Stage Programming with Explicit Annotations," PEPM, 1997.
- L. P. Deutsch, A. M. Schiffman, "Efficient Implementation of the Smalltalk-80 System," POPL, 1984.
- U. Hölzle, C. Chambers, D. Ungar, "Optimizing Dynamically-Typed Object-Oriented Languages with Polymorphic Inline Caches," ECOOP, 1991.
- M. A. Ertl, D. Gregg, "The Structure and Performance of Efficient Interpreters," *Journal of Instruction-Level Parallelism* 5, 2003.
- T. Mytkowicz, A. Diwan, M. Hauswirth, P. F. Sweeney, "Producing Wrong Data Without Doing Anything Obviously Wrong!," ASPLOS, 2009.
- A. Georges, D. Buytaert, L. Eeckhout, "Statistically Rigorous Java Performance Evaluation," OOPSLA, 2007.
- T. Kalibera, R. Jones, "Rigorous Benchmarking in Reasonable Time," ISMM, 2013.
- RFC 3629 (UTF-8); RFC 8949 §4.2 (deterministic CBOR encoding); RFC 8785 (JSON Canonicalization Scheme).
- W3C, *WebAssembly Core Specification*; RISC-V International, *The RISC-V Instruction Set Manual, Volume I: Unprivileged ISA*.

## Operator’s scope note for the first measurement window

An independent project reviewer checked the original article above against the source and receipts. Opus wrote its design before seeing results and its article after receiving the first-window results brief. The later cache and code-placement trials belong to the director’s synthesis. [Design commission](../scripts/01-opus-design-brief.txt) · [Results brief](../scripts/03-opus-results-brief.txt) · [First-window receipt](../various/physical.json)

**Wire identity.** The reference writer produces one deterministic encoding for a value. The reader also admits a structurally legal packet containing an unused string. For example, the canonical packet for `null` occupies 15 bytes. The reviewer verified that an 18-byte packet containing the same root and an unused dictionary entry `"x"` also admits as `null`. For the `zz` → `aa` control, *three field IDs and one value ID* change in the body. Other string references retain their rank. The control copied the old body after constructing the complete correct prefix, including the UTF-8 string bytes. Full reader admission succeeded. It checked the new tree’s structure correctly, while the tree represented a different application value. Exact differential encoding catches that error. [Codec](../../PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/scripts/02-binary-screen.js) · [Counterexample](../scripts/review/02-binding-results.json)

**Which design assumptions survived.** The source-blind design’s hypothetical 16-bit number payload, child ordinals, section-relative addresses, and separate numeric area differ from actual PSIX v1. An object entry is a two-byte key ID plus a three-byte value slot. An array has a two-byte count and three-byte slots. A container or indirect binary64 reference holds an absolute byte address, while a string reference holds an ID. A finite integer outside the signed 20-bit interval requires an eight-byte binary64 body at its preorder position. The reference encodes minus zero as zero and rejects nonfinite values and unpaired surrogates. Caps include 32,768 packet bytes and 4,096 distinct strings. Repeated ordinary subobjects serialize by value. The observed study covers inert JSON data. The project implemented a generator in ordinary JavaScript and reused the Typed compiler’s record layouts and two targets. Its frontend supplies no general hygienic macro facility. [Wire rules](../../PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/scripts/02-binary-screen.js) · [Record derivation](../scripts/review/07-derive-typed-record.mjs)

**How the writers actually ran.** The figure shows a common byte result. The generic C writer allocates its own returned packet. The native and table writers receive caller-supplied storage. The C table was a separately written, schema-specific interpreter. The Typed writer used generated code and helper loops. Both determine live string ranks and the total size before writing. A `STRING_REF` can use a constant rank only with a proof about the entire dictionary. The article’s illustrative per-step capacity checks would permit a partial write on refusal. Both specialized implementations tested here check capacity before the first output write. Chess binds its nine numeric inputs to locals, but its rank and output helpers can reread stable board/mask data. The derive writer can read one field for sizing and again for emission. Single evaluation is a requirement if reads can have effects. These experiments used stable, disjoint buffers. [Generator](../scripts/static/01-specialize.js) · [Derived writer](../scripts/review/07-derive-typed-record.mjs)

**Counts and cost.** The 121 host vectors include the 47 recorded observations, each 313 bytes, and 74 additional inputs. Candidates matched one another for each observation. Chess states can differ across observations. The 299 cases concern a separate single-string host writer. The 231 derive tests ran generated Wasm on the host, with RV32 compilation. For the first native window each timing is the median of seven block means, each averaging 188 verified calls. The 16,116-byte RV32 instruction image sits inside a 33,964-byte ELF. The 537.747 ms phase included Typed compilation and linking. Preparation took a separate median 12.686 ms, generation 51.808 ms and qualification/loading 1.531 ms. That last phase includes full artifact comparison, ELF relocation and obtaining the entry. Seven compiler-reported peaks ranged from 698,872 to 698,912 bytes. Dividing 603,790 µs by the measured generic-minus-generated difference gives about 26,209 encodes. The estimate assumes these first-window costs recur and excludes building the cJSON input. The 21,496 is a median guest instruction count over recorded frames on the emulator. No measurement attributes a share of the first-window gap to store width, placement or dispatch. [Device receipt](../various/physical.json) · [Host receipt](../scripts/review/06-independent-static-replay.json)

**Observed-shape times.** Each number in the System/Keys table is **milliseconds per screen**, computed by dividing the median stream time by 9 or 6. Each hit count covers a complete stream. Training and prefix warming are additional setup costs. The 427 application frames form the host qualification. The separate physical check covers nine System and six Keys frames. [Board summary](../scripts/runtime/results/physical-summary.json) · [Curated bibliography and audit diary](../reference/07-opus-research-diary.md)
