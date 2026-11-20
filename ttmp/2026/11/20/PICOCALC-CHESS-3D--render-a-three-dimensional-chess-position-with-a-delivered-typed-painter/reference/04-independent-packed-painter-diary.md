---
Title: Independent review diary for the combined packed painter
Ticket: PICOCALC-CHESS-3D
DocType: reference
Status: active
Topics: [compiler, graphics, picocalc]
---

# Independent review diary for the combined packed painter

## Step 1. Define the comparison against the frozen scalar scene

I began from the frozen d6c2dc3a… painter and from the independently qualified compiler. A new scene must combine these two exact behaviors. I wrote a proof and test plan before reading the proposed implementation. Its first independent example is grid vertex 80, which a count rounded down to eight would omit.

### Prompt context

The original user wording is in the [director diary](../../PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/reference/03-director-diary.md). My follow-up assignment from the director was:

> Your original paper is now frozen for publication; thank you. Sol is going to prototype an optional combined closed 8-arg painter, genuine 9x9 ground lattice packed projection in CHESS-3D/scripts/packed. Please independently inspect proposed wrapper/mesh mapping and validate compared to the frozen scalar scene, ABI alias/lifetime, observed vector path, and pixel correctness when available. Add independent continuation to CHESS-3D (analysis/04-review.md, design-doc/04*, reference/04*); don't edit the published PIE report.

I interpreted this as a fresh review of the combined source, generated machine program, receiver ABI and resulting image. The original report remains the record for the earlier independent compiler experiment.

### What I did and why

I traced the existing mobile painter entry, ELF signature check, allocation, worker and synchronous render call. I contacted the compiler researcher for the proposed schema and the exact source freeze. I derived the 81 expected vertices from the original coordinates and camera.

### What worked and what did not

The original Checked painter call takes two buffers. The private compiled image lives in a painter handle, while its resulting validated command list can remain current after the function returns. The original receiver does not expose vertex scratch storage. The new ABI must make its storage ownership explicit. No test of the new implementation has run at this checkpoint.

### What I learned and what was tricky

Sharing lattice vertices across squares changes algorithmic work independently of the packed hardware operation. Using only frozen scalar versus packed time would combine this with instruction selection. A redesigned scalar control is necessary to separate the two effects.

### What warrants review and what comes next

Check actual allocation alignment, lifetime, clean release and software fallback. Reuse the preceding study’s independent machine interpreter and vendor disassembly, and require packed stores during execution of the painter itself. Once the code is available, compare all command words and vertex outputs.

### Code review instructions and technical details

Start with design-doc/04-independent-packed-painter-review.md. In the product baseline, mobile_painter_p4.c loads the native entry and supplies the two public buffers. painter_service.c owns the current and scratch command lists. The final review will follow the new entry from the same call site.

## Step 2. Execute the actual eight-argument renderer in four native forms

The proposed board grid uses 81 vertices at (16c,0,16r). The generated source puts its camera pitch in scratch input cell 81, immediately after the last vertex, then constructs x, y, and z, calls the eligible projection, and reads the two projected columns for its board face coordinates. I ran the frozen compiler and candidate source against the original 47-game-state fixture, the two cursor controls, two alternate camera pitches and seven fallback layouts.

### Prompt context and scope

See Step 1. The source owner froze generated Typed source 27620f6de0cab545c37ca565fd0cfc2ad1808b1b1575c76c8aef311abf54c458. I compared the resulting geometry with the frozen point-at-a-time source; all tests are in the new 3D ticket.

### What I did and why

I compiled the original and redesigned source with the ordinary compiler, and compiled the redesigned source with guarded scalar and PIE lowering. The baseline Wasm and reconstructed geometry use the original world coordinates. The independent native machine interpreter checks every preserved register, nested stack pointer and return address. For eligible calls the vendor-disassembled instructions are attributed to their enclosing function while they execute. The checker compares all six raw scratch columns for each cell from zero to eighty, the unchanged pitch cell and every byte outside writable regions. It alternates poisoned scratch data and data retained from the preceding trial.

To test the actual drawing output I wrote only the candidate machine's returned words to disk, replayed them through the scene's pixel-center raster and required identical frozen command and application-pixel hashes. The checked area is the 320-by-298 app-owned rectangle, including the hint strip.

### What worked and what did not

All 58 memory cases matched among the four ordinary/packed native configurations and their Wasm references at their defined interfaces. Fifty-one eligible calls executed exactly 200 packed instructions and 30 packed stores apiece. Misaligning any individual scratch payload, or aliasing x with projected x, disabled all packed instructions. Fifty-one app-rectangle SHA-256 hashes agreed, covering 35 distinct images. No difference appeared in any vertex coordinate or partial-group tail.

### What I learned and what was tricky

The projected coordinates are encoded as 384+x−z and 640+x+z, so subtracting 224 from projected x and applying 42+(projected y−640)*pitch/8 yields the frozen camera exactly. Index 80 is written by the original scalar tail and gives (160,202) at pitch five. One camera control changes the pitch, and a second cursor control changes only color. Both detect plausible but different failures.

The frozen opening took 129814 interpreted instructions. The batch rewrite took 152189 ordinary instructions, guarded scalar took 145021, and PIE took 142114. The packed loop made the batch implementation faster in this model, while the extra grid initialization and checked lookups made the complete batch painter slower by instruction count than the original. Cycles must be measured at the same call boundary to test that result on hardware.

### What warrants review and what comes next

Review receiver allocation and actual hardware selected-path evidence after the private wrapper lands. The host cases directly control the addresses and cannot establish the real allocator's alignment guarantee.

### Code review instructions and technical details

Run scripts/review/combined.mjs with the generated source, the frozen scene's fixtures.bin, an output directory and the installed Espressif binutils prefix. Then run scripts/review/check-pixels.py on that output directory. Machine and argument digests are in scripts/review/combined-host.json. Aggregate pixel checks are in scripts/review/combined-pixels.json.
