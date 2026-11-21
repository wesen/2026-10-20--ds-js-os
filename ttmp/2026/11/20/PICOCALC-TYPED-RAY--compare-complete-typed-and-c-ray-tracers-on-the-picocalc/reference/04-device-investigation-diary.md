---
Title: Physical complete-frame comparison investigation diary
Ticket: PICOCALC-TYPED-RAY
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
LastUpdated: 2026-11-20T23:51:27.413194279-05:00
WhatFor: ""
WhenToUse: ""
---

# Physical complete-frame comparison investigation diary

## Step 1. Reserve the serial lane and specify distinct frame observations

### Prompt Context

**User prompt (verbatim)** See the director's first diary entry. **Delegated assignment (verbatim)** “Once Candela ordinary UI and physical report+diary done, take exclusive board for new PICOCALC-TYPED-RAY. Coordinate scalar ABI/source with pie_lowering NOW so scaffold compile/load/native measurement ahead. Need same-input original fixed C and Typed full frame, exact all depths/IDs/colors, varied scenes, matched instrumented phase and clean frame samples, flash qualified latest playable, no native rendering decisions for Typed.” **Assistant interpretation** Establish a physical stock scalar baseline with identical exported pixel, depth and identity results. **Inferred user intent** Separately measure each compiler or algorithm change. **Commit (code)** Design checkpoint before implementation.

### What I did

Coordinated eight-register audit ABI, separate clean-frame ABI, fixed reusable workspace and two compiled backend variants. Reserved the normal guarded presentation interface with the director. The preceding Candela physical suite holds the board throughout its run.

### Why

Writing an extra 102,400 bytes for every frame can distort comparisons. A real clean path and a paired audit path let the reader distinguish renderer performance from diagnostic traffic.

### What worked

The renderer owner specified scalar axes, geometry bounds, packed or padded strides, scratch capacity and fixed object identifiers. The compiler owner supplied a complete generated backend with the unchanged QuickJS API and an independently reproducible digest.

### What didn't work

The shell sandbox does not expose the USB device node to default commands. The established scoped physical runner can request serial and flash access; its previous physical readback succeeded. Lack of default sandbox access does not imply a disconnected board.

### What I learned

The original C convenience call returns RGB only. Direct access to the private row geometry is required for a good audit and phase control. The renderer owner will supply these native helpers from the original engine.

### What was tricky to build

The baseline's row-stride convention, one-based object IDs and zero miss value have to be shared by all compilers and rows without moving arithmetic into host code.

### What warrants a second pair of eyes

Check the C and Typed clean entry functions neither write the two diagnostic planes nor take a different scene argument. Check that source scheduling and code generator changes can be selected independently.

### What should be done in the future

Complete the previous physical trial, then time the qualified new image. Collect the whole framebuffer and preserve the verified rollback image.

### Code review instructions

Start with [the physical protocol](../design-doc/04-measuring-a-whole-typed-ray-frame.md) and follow the native module entry signatures into the complete Typed source.

### Technical details

The ELF follows ilp32f. On RV32 the eight audit arguments can occupy a0 through a7. All four Typed arguments that represent buffers point to a capacity header followed by little-endian 16-bit cells.

## Step 2. Pair C and native guest work at every stage

### Prompt Context

**User prompt (verbatim)** [Director's diary](01-director-investigation-diary.md). **Assistant interpretation** The same input, output and instrumentation obligations must hold independently for each implementation. **Inferred user intent** Establish where the compiler and handheld spend time and keep the playable display path entirely in the tested module. **Commit (code)** 15c3a06, 38d617b.

### What I did

I implemented an eight-register guest audit call, a clean frame call, a primary-only call and a shade-from-two-planes call. A closed Typed module returns four addresses to the trusted loader. The benchmark first produces an untimed scalar C reference with all three planes. It then rotates C scalar, C PIE and guest order, timing each operation on the same output pointers. I freeze the three input variables separately: baseline source, span/ray algorithm and compiler backend. The build accepts locally generated closed backend variants as optional bundles.

### Why

The physical framebuffer and both the C and Typed audit planes live in ordinary PSRAM. Moving source evaluation or lighting into the native wrapper would understate the guest cost. Four independent entry clocks can be audited without subtracting a checksum run from an unrelated time.

### What worked

The independent qualification data covers a lamp-only change, overlapping objects, legal near/far corners and an output stride as wide as 320. The test puts opposite byte patterns in the C and guest outputs, checks every visible word, checks each untouched pad, checks the end canary and compares the physical C model to a separately compiled host C model.

### What didn't work

The first archived build named a newly created generator file that existed in the working tree but was absent from commit 223e017. The stage generator failed before any board write. The director promptly committed both algorithm transformations at 669f242. I began a clean ordinary candidate from the complete scalar production commit while preserving the Candela rollback tree.

### What I learned

The proposed independent [Opus High research design](../various/commission/measurement.md) explains that terminal checks and differing buffer traffic are central measurement confounders. The physical protocol takes its matched-input, independent intermediate and rotated-order suggestions. It records hardware core-cycle deltas and elapsed microseconds on a pinned kernel task. All variants share a fixed data layout within a block. The study samples a single binary placement per configuration.

### What was tricky to build

Classic C and complete Typed render the exact same visible scene. A pixel match alone could occur if a switch request never selected the Typed renderer. The ordinary UI now increments a success counter only after its guest frame returns and its pixels have been copied. The runner checks the observed pose and counter movement at each step and again after the final reboot.

### What warrants a second pair of eyes

The fixed algorithm precomputes per-row scratch in every entry call. The shade-only clock includes relevant setup and copying geometric inputs. The sum of isolated phase times need not equal a clean-frame observation. The C watchdog and input scheduler continue their ordinary work outside these calls.

### What should be done in the future

Compare both semantically identical packed backends at their first successful physical build. Preserve negative outcomes if a new backend fails any intermediate or pixel gate.

### Code review instructions

Review [the ordinary build helper](../scripts/device/01-build.py) and [physical tests](../scripts/device/02-device.py). Compare the checked number of returned pixel words with the dimensions of each physical phase; the extra guard after the last row is outside the reported CRC.

### Technical details

Cold compile uses a fresh 4 MiB-bounded QuickJS allocator and an 8 s deadline. Fixed output surfaces each reserve a 4-byte header, 2*(159*stride+160) output bytes and one final guard. Scratch reserves 2,048 words plus header and guard. A separate material program uses the 303-cell scene graph and existing native Candela row control.
