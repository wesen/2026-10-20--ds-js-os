---
Title: Independent evaluator and physical integration diary
Ticket: PICOCALC-CANDELA
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T23:42:02.904472029-05:00
WhatFor: ""
WhenToUse: ""
---

# Independent evaluation and physical integration diary

## Step 1. Freeze the control and choose independent observations

I verified the previous playable application's full SHA against its retained binary and preserved its earlier physical handoff and four frame references. This step made no board write. I froze the numeric and measurement design before adding the new loader or examining new target outputs.

### Prompt Context

**User prompt (verbatim)** See the [user commission](../sources/commission.txt). **Delegated assignment (verbatim)** “New PICOCALC-CANDELA Team 4 independent reviewer, exclusive board owner. Read ticket sources/commission.txt and shared design-doc/01 at c065dc2. Freeze live ray firmware and references. Independent graph evaluator, fixtures, invalid handles, f32 vs fixed boundary accuracy and device agreement, cold compile/scene build/param update/frame/peak memory. Integrate staged milestones with teams; qualify final playable live scenes. Use Claude CLI Opus high researcher and document provenance; maintain own full diary, intern design, detailed textbook article, commit. Director publishes batch. No board writes until host implementations ready.”

**Assistant interpretation** Establish an independent oracle and a physical P4 implementation of the compiler/loader measurement boundary. **Inferred user intent** Distinguish a programmable live material graph from a generic static demo. **Commit (code)** See the ticket's first independent review checkpoint.

### What I did

Froze prior release efc93872… and launched the requested tool-free Opus High numerical-methods consultation from an empty directory. Prepared the design with exact-domain, quantized-input and hardware cases. Warmed a separate normal release build at c065dc2. [Frozen control](../various/review/frozen-prior.json)

### Why

The prior physical RGB565 images and application digest make the rollback identity reproducible. Separate observations of implicit sharing, material values and final pixels narrow the cause of disagreements.

### What worked

Claude returned one successful tool-free turn using claude-opus-5-5 at high effort. The retained prompt, response and model usage contain no project code or measurements. The research note contributed the separation between a numerical error budget, independent oracle and timing boundaries. I kept exact checks for the subset provably representable in binary32 despite the note's generic advice about tolerances.

### What didn't work

Automatic approval review rejected the original transfer of an internal scene-graph design to Anthropic, since authorization did not cover that specific private payload. I submitted only a generic numerical-methods question from an empty directory with disabled tools and project settings, then applied it to the private specification locally. The raw CLI response is a list of events; the first parser assumed an object and raised `AttributeError: 'list' object has no attribute 'keys'`. I extracted only the result event and retained a raw-response digest. [Public-topic prompt](../scripts/review/01-opus-design-prompt.txt) [Consultation](../various/review/opus-provenance.json)

### What I learned

Agreement at a threshold can be exact for Q8-addressable inputs. Nonrepresentable prospective inputs must be studied separately to measure the actual policy cost of snapping to Q8.

### What was tricky to build

Several workstreams touch one final image. Separate fixture source stages, one production renderer and isolated timing boundaries preserve attribution without changing the original ray-tracer geometry.

### What warrants a second pair of eyes

Inspect the raw scope of memory counters, the material sharing test, and the source digests of each assembled stage. The numerical researcher supplied a method, not device measurements.

### What should be done in the future

Run the host oracle before programming the board; then qualify all physically staged sources and restore the previous release upon failure.

### Code review instructions

Begin with the [independent protocol](../design-doc/05-independent-material-agreement-and-handheld-measurements.md); compare the control receipt to PICOCALC-RAYTRACE.

### Technical details

Prior application SHA-256 efc938724492f1de8f2a0911abd05d09e8692b80872f5da707da1f92dd08a0c9. The prior partition table is 72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30.

## Step 2. Compile three authored programs and test independent geometry and arithmetic

### Prompt Context

**User prompt (verbatim)** [Commission](../sources/commission.txt), Team 4 row. **Assistant interpretation** Compare meanings of built graphs and final frames, then identify precisely when binary32 and Q8 agree. **Inferred user intent** Keep the original handheld operational and attribute any later change to a measured stage. **Commit (code)** 24818ec and e9a4969.

### What I did

I wrote a Python wire interpreter, a second ray evaluator with signed dot products and exact integer roots, separate malformed descriptor tests, and a comparison of the original compiler to the modified compiler. I integrated the SDK ELF loader with the ordinary kernel's bundled Typed compiler, fresh heap and quiescent publication. I ran a full ordinary image build from the committed source and read back the physically installed old application before any candidate write.

### Why

A common C ray implementation can hide a geometry error in two otherwise agreeing shaders. A checksum from two runs of one program can also conceal accidental loss of sharing. Here every tested ray had an independently predicted color and shared node identity had a distinct graph test.

### What worked

Seven independent 25,600-pixel images matched production C geometry with an independent Python color callback. Thirty-eight descriptors agreed, including four accepted controls. Each malformed graph left a filled target untouched. The original compiler at c065dc2 and the final compiler produced byte-identical hand-stage Wasm, RV32 and linked ELF. Four original physical viewports matched the frozen release and the board passed normal health checks.

### What didn't work

The sandbox Node runtime rejected a local Git child-process spawn with EPERM. I reran the identical read-only comparator with approved process access. A naive claim of exact agreement across chained fixed-point scale operators failed at three of 480 tested coordinates. At x=50 with 252/256, 251/256 and 250/256, Q8 gave 47+31/256 and f32 gave 47.1264114; the inclusive 1/8 mask classified these differently.

### What I learned

The direct tile expression gives exact agreement for all 41,120 pairs on one axis. Authoring a nonrepresentable frequency or truncating at multiple intermediate scales creates a threshold error that the same one-operation proof cannot bound.

### What was tricky to build

The SDK uses a linked ELF containing a bounded text slot. Its four typed entry trampolines must match the order used to pass the constructor, color sampler, row sampler and parameter setter back to C. The independent linker test covered both compiler output and final ELF bytes.

### What warrants a second pair of eyes

The physical PSRAM high-water delta counts concurrent system allocation. The compiler's own peak is a separate allocator measurement. Geometry validation applies to arrays of capacity at least 303 and ignores spare cells outside declared counts. Scalar and row paths share the real PIE intersection code.

### What should be done in the future

Use final graph and framebuffer receipts to identify any gap between native C, host Wasm, modeled RV32 and actual loaded RV32. Compare every stage for at least two complete parameter states of both scenes.

### Code review instructions

Inspect [host validator and pixel differential](../scripts/review/03-host.py), [numeric probe](../scripts/review/02-numeric.py) and [link comparison](../scripts/review/04-loader.mjs). The renderer reconstructs the scene in a separate node allocation order.

### Technical details

Run the Python host script under CPython with a system C compiler; run the Node comparator with the SDK build's esp-idf/main directory containing the three assembled sources and slot template. Results are retained in [host](../various/review/host.json), [numerical](../various/review/numeric.json), [loader](../various/review/loader.json) and [physical preflight](../various/review/preflight.json).
