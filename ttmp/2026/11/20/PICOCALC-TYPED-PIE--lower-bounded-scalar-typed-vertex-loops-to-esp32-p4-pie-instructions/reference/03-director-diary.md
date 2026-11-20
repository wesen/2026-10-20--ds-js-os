---
Title: Director diary for automatic PIE lowering and its graphics workload
Ticket: PICOCALC-TYPED-PIE
DocType: reference
Status: active
Topics: [compiler, picocalc]
---

# Director diary for automatic PIE lowering

## Step 1: Define a testable compiler claim and commission its independent review

The user proposed a 3D Chess board and asked whether inference at lowering time could produce the packed arithmetic in an ordinary scalar program. I commissioned an implementation and a separate experimental review. Both studies start on the host because the 2D mobile-painter qualification owns our single ESP32-P4.

### Prompt Context

**User prompt (verbatim):**

> can't we do this more "elegantly" by doing type inference and doing this at lowering time?

> Ok, send out another researcher to do this. And I guess once the other research comes back, we could start experimenting with sending a 3d rendering painter over to the compositor?

> don't use opus this time around, because we ran out of credits. Use sol medium.

> use sol + astra independent supervisor or whatever.   
>   Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
>   Chose opus high for researchers
>   Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
>   analogies, see skill).
>    Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.

I followed the explicit credit limit and the Sol + Astra allocation. I interpreted the UI idea as a separate downstream experiment that can start once there is a qualified message/compile/draw path.

### What I did

I inspected typed-wasm.js and typed-rv32.js, checked Espressif’s instruction semantics and LLVM's treatment of loop dependence, and compared a public vector intrinsic with inferring packed operations from an ordinary loop. I assigned the implementation to GPT-6.2 Sol Medium and experimental review to an independent GPT-6.2 Astra researcher. Requested an unchanged source, executable differential tests, assembler verification and guarded fallback. The prior 2D Opus assignments were complete; these new researchers use no external model services.

### Why

A saturating hardware addition can implement ordinary i32 addition when the result provably fits the lane. The type of a buffer cell alone cannot supply the proof. Conversely, a recurrence can have perfectly narrow values while requiring the previous scalar iteration. The proposed interim representation retains both arithmetic and memory effects for one loop within the existing streaming compiler.

### What worked

We agreed on a first mesh projection with residue-bounded input coordinates and three outputs. The independent reviewer verified unsigned buffer loads, i32 arithmetic and 16-bit truncation on stores. Both researchers found the alignment issue arising from the four-byte capacity header. The independent reviewer traced the configured ESP-IDF context-switch code and found q3 absent from its save/restore lists.

### What didn't work

The first attempt to start a new researcher reached the four-slot team limit. I finished the prior compiler and transport researchers' scoped handoffs, verified their commits, and assigned the freed slots. This preserved the board operator's exclusive access.

### What I learned

Even a scalar reference run that traps can have observable writes from earlier iterations. A correct vector guard can select the original loop when a short buffer might trap. Rejecting an entire span before a previously visible prefix write would silently change Typed semantics.

### What was tricky to build

Separate language interpretation, legality of lane-wise arithmetic, independence of addresses, and profitability. The target is custom ESP32-P4 PIE v2.1; plain RV32 emulation can check scalar code and a reference implementation but cannot establish target cycles or context-switch behavior.

### What warrants a second pair of eyes

The independent reviewer should compare the *entire* arena before/after successful and trapping calls, demonstrate entry into the vector block and check the packed machine instructions against Espressif's assembler. Guard alignment must be checked on payload pointers. Board ownership must be handed over explicitly.

### What should be done in the future

Measure cold compilation overhead, code size and transformed vertices at multiple sizes. Separate a candidate's arithmetic throughput from scene rasterization and panel transfer. Try a physical 3D painter once the flat painter qualification gate has been evaluated.

### Code review instructions

Start with scripts/01-vertices.typed and the independent report. Inspect each inferred bound, loop index and address span. Verify the unchanged source with Wasm, scalar RV32 and the candidate machine code.

### Technical details

A 128-bit PIE vector holds eight 16-bit cells. The initial projection computes sx = 384 + x - z, sy = 640 + x + z - 2*y, and depth = x + z + y, for x, y and z in [0,255]. All outputs fit in unsigned 16-bit cells and every intermediate in this expression fits in a signed lane. A remainder by 256 is a low-byte mask only for these zero-extended inputs.
