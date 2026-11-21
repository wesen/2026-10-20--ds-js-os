---
Title: Director investigation diary
Ticket: PICOCALC-NATIVE-WAVE
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
LastUpdated: 2026-11-20T18:54:30.763123066-05:00
WhatFor: ""
WhenToUse: ""
---

# Director investigation diary

## Step 1: Commission six studies and freeze an independent application

I assigned six independent Opus High research roles to three operators. The researcher can work on a compiler and its host oracle without the board. The person measuring physical effects must hold the board exclusively, and the result must include the work done by the guest and the artifact produced by the compiler.

### Prompt Context

**User prompt (verbatim):** “can we parallelize the research?”

**Active user goal (verbatim):** “do it, as before.
  Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
  Chose opus high for researchers
  Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
  analogies, see skill).
   Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.”

**Assistant interpretation:** Carry out all six research projects concurrently and publish their findings and a director synthesis. **Inferred user intent:** Use independent scientific judgments and sustained host experiments while sharing the physical P4 safely.

### What I did

Commissioned separate Opus design/review/report work for six topics. Created the parent ticket and eight coordination tasks. Built a new ten-function telemetry program, an independent JS expected-value oracle and a vocabulary-independent lifetime challenge with eight classified event flows. Recorded SHA-256 commitments. Compiled and executed the source using the existing Wasm engine and RV32 instruction interpreter.

### Why

Editor and Chess have already informed the hypotheses. A new source and an independently computed return value make it possible to observe which results transfer. Serialization of physical measurements prevents probe firmware from another experiment becoming the control.

### What worked

The stock compiler generated 2,876 native bytes and a 1,500-byte Wasm module. Both passed 1,603 cases, including 101 expected traps, with complete test-memory equality. Stock native execution consumed 158,570 modeled instructions in the harness. Each model invocation is separate from an on-board timing.

### What didn't work

The sandbox device list could not find /dev/serial/by-id. A host-level read-only check identified USB serial device 5B61091051 and /dev/ttyACM0. No board action was needed to validate the test program.

### What I learned

The held-out input needs an arithmetic, text and layout path to serve these hypotheses. Lifetime inference opens a different question: an operational specification of expiration can transfer between surface syntaxes while still testing the same observable permission to retain a reference.

### What was tricky to build

Expected outcomes cover negative and reversed ranges, malformed fields, UTF-16 input, exact-capacity writes, required traps and post-call memory. The native interpreter has a separate stack. Only the publicly visible test memory is part of the equality requirement.

### What warrants a second pair of eyes

This is one independent program, with correlated test vectors. Case counts establish exercised inputs and do not constitute independent applications. Distinguish policy preregistration from implementation freeze whenever a researcher saw test source before finishing code.

### What should be done in the future

Re-run the frozen control from the committed files, compare researcher arms and issue the six original designs and seven final articles. Record device state and study limitations alongside results.

### Code review instructions

Check the hash commitment, then reproduce the director's test oracle once the code is disclosed under scripts/director. Compare the normalized program behavior separately from dynamic instruction counts.

### Technical details

The telemetry state uses a length-prefixed UTF-16 payload, three i32 calibration fields and a destination with a trailing canary. Scripted structural edits include a moved pair of fields, a changed literal, a changed uncalled signature and an inconsistent used signature.

## Step 2: Fix the evaluation policies and build a common execution harness

The operators reported six research policy locks. Two studies used a declared policy before seeing the held-out program, while the other four also supplied implementation hashes. I wrote a second, independent harness to evaluate native execution of three different operations in the same telemetry workload and on the same device.

### Prompt Context

**User prompt:** See Step 1. **Assistant interpretation:** Coordinate physical research while keeping the researchers' designs independent. **Inferred user intent:** Make results comparable across compiler approaches. **Earlier commit:** 89b8fc6 — Commission six compiler studies and freeze the independent evaluation inputs.

### What I did

Produced a common raw-image descriptor with exact code identity and function entry offsets. A C driver calls readBurst, countEvents and label through the corresponding native symbols. Independent expected values come from a Python implementation operating on the original inputs. The reference collector verifies all copied UTF-16 units and surrounding sentinels before timing. The stock entry points are repeated as a timing control at the same addresses. A freestanding second driver executes these exact programs under the CJI RV32 model and counts executed instructions between emulator clock requests.

### Why

The full differential suite includes invalid inputs that trap. Physical timing instead uses successful workloads with reproducible results. The model counts include the C iteration and calling overhead within each endpoint. A compile-time difference in a byte-identical image cannot establish a guest execution benefit.

### What worked

Four independently provided pilot arms linked successfully. Stock execution took 13,498 modeled instructions to parse the valid and malformed input set, 5,424 to count separators, and 1,495 for the label replay. The all-late semantic candidate used 12,610, 4,518 and 1,149 respectively. Stock and selected bounds images produced equal instruction counts.

### What didn't work

The first ESP-IDF link failed with “section .flash.text VMA [40000040,40018e2b] overlaps section .flash_rodata_dummy VMA [40000020,4002001f]”. A requested 64-byte assembly alignment had advanced the entire output text section beyond the default 0x20 offset. Reducing the input alignment to 32 preserved the linker layout.

### What I learned

A single function can differ between compiler arms for one endpoint while another endpoint's code is unchanged. Preserve the three endpoints in the results. Any positive timing on unchanged code is a useful check on layout and measurement variability.

### What was tricky to build

All imported symbols must resolve to the actual machine image at the offsets declared by the compiler. Function offsets can change between arms. The benchmark aligns each image separately and charges all branches and calls that occur inside the measured guest entry.

### What warrants a second pair of eyes

The cases represent one independent application. Studies 1 and 2 locked their rules before disclosure, but implementation was still in progress. Studies 3–6 supplied implementation identities as well. A positive transfer in this application only supports a limited empirical claim.

### What should be done in the future

Add the final leaf-lowering images to the same build, compare host and on-device behavior, and record the verified release restoration.

### Code review instructions

Start with scripts/director/heldout/01-burst-oracle.mjs and the receipt it produced. Run 02-prepare-matrix.py and 05-model-matrix.py on the raw compiler arms. Check the output of the no-change stock replay before claiming a runtime gain.

### Technical details

The standalone binary runs on a single 360 MHz core. Each timed sample replays its input set 48 times. Eleven rotated blocks include a warm call before timing. This measures guest execution with the machine image in linked flash text. It excludes cold compilation, normal native ELF loading, window compositing and SPI transfer.
