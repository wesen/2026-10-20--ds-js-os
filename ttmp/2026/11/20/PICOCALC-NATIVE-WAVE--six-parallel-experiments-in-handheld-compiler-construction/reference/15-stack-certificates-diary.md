---
Title: Stack certificates investigation diary
Ticket: PICOCALC-NATIVE-WAVE
DocType: reference
Status: active
Topics: [picocalc, compiler]
---

# Stack certificates investigation diary

## Step 1. Commission an independent design

The director delegated this experiment in the six-study native compiler wave. The authored request belongs in [the director diary](01-director-investigation-diary.md). Emit per-function frame claims and call targets while compiling. Check them independently from RV32 bytes after final linking, compare checked call depth to the per-function claims, and explicitly account for SDK and interrupt boundaries. Use ordinary test fixtures and altered metadata to qualify the checker. Freeze policy before the independent holdout.

I started a separate Anthropic Claude CLI with `-p --model opus --effort high --tools '' --setting-sources '' --output-format json`. Each lead received its own scoped code and question. Neither was given hardware credentials, serial logs or the independent holdout. The working tree for implementation is confined to this ticket. The release compiler remains the ordinary reference through the real application entry point.

The first source inspection identified the emitted-program functions and the ELF slot linker in `picocalc-os/compiler/typed-rv32.js`. The current frontend may lower async Editor tasks before streaming ordinary and generated bodies through different lexers. The release application inputs are the exact CMake products used in the preceding release study. I will preserve a hash for each and rerun fresh control measurements.

## Step 2. Independently decode the linked RV32 image

The lead's preregistration describes a per-function frame, a saved return-address slot and direct call records. I instrumented the emitter's computed local frame and symbolic call records before relocation. The second module reads final emitted or linked bytes using an independent decoder. It verifies the partition against the trusted symbol table, positive aligned local frames, exact save/restore, all direct jumps and calls, local stack slots and the arithmetic instruction subset. It prohibits entering the middle of the epilogue and confines conditional arcs to the active-frame body or the beginning of its epilogue. For this single-frame grammar every live path at each body instruction has the same stack displacement. No abstract-interpretation fixed point is necessary.

The final ELF checker verifies the public entry stubs, import trampolines and executable extent. It separately carries, for each SDK import, the maximum prefix already occupied by typed frames at the call. It does not claim a measured C stack bound, asynchronous callback bound or ISR bound. The standalone structural path also checks the final internally relocated instruction buffer with no SDK.

The first attempt to locate the compiler was one parent directory too high. `realpath ../../../../../../../../picocalc-os/compiler` returned “No such file or directory”. I corrected the path and ran `node 05-trial.mjs /tmp/native-wave-deps ../../various/05-stack/host.json`. Both applications returned the identical stock ELF; all 119 Editor functions and 82 Chess functions were covered. Fourteen deliberately wrong metadata or unsupported instruction cases were rejected. Independent arithmetic/branch/call emulation using the prior RV32 interpreter checked 24 execution depths across twelve branchy chains. Deepest observed was 192 bytes, and branches that skipped calls used only 16. The design specified a considerably larger independently authored held-out population. The separate director fixture will be reported at its observed size with that limitation.

I sent the director separate pre-holdout hashes of the policy, emitter and checker. No comparison of submitted source against its own generated metadata was used as a substitute for reading the final bytes.
