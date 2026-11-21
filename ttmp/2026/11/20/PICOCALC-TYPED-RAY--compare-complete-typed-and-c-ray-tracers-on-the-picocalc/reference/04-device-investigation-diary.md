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
