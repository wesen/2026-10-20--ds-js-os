---
Title: Validation coordinator investigation diary
Ticket: PICOCALC-SHADOW-CODEGEN
Status: active
Topics: [compiler, performance, picocalc]
DocType: reference
Intent: long-term
---
# Validation coordinator investigation diary

## Step 1: Freeze the transfer workload and hardware contract

I froze a real non-rendering program before looking at a candidate image. The Chess application already has a full position evaluator, a separately callable absolute-value helper, and an inexpensive negative path which turns off the positional scoring. The hardware operator has accepted a callable harness with no independent access to the board.

### Prompt Context
**User prompt (verbatim):** “Ok, next round then. Like before.  
  Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
  Chose opus high for researchers
  Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
  analogies, see skill).
   Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.”

**Assistant interpretation:** Qualify one general compiler change outside the ray renderer. **Inferred user intent:** Produce repeatable evidence of transfer to another workload while preserving program behavior.

### What I did
- Read the production Chess module and its six transitive source definitions at revision `57b2d9f`.
- Froze three position fixtures, two execution paths, and an independent positional scoring oracle in `scripts/validation/holdout.mjs`.
- Told the physical department to call `shadow_holdout_bench()`. Sent the frozen choices to the compiler lead and director.

### Why
The location bonus exercises a tiny numeric helper and the full evaluator exercises register pressure, repeated buffer indexing, and calls in a loop. One fixed workload can therefore test several plausible code-generation strategies without selecting the input retrospectively.

### What worked
The Chess source and shipped score function are directly extractable; no synthetic change to their computation is needed.

### What didn't work
No failure at this stage.

### What I learned
The chess helper spells negation as `0 - n`. The ray helper spells it as unary negation. A successful transfer needs either equivalent lowered operations or a general callee transformation that can handle both.

### What was tricky to build
An advanced=false comparison suppresses the signed-magnitude helper but still runs `chessSquare`, `chessValue` and `chessSide`. If a candidate changes one of those independently, advanced=false is a valid timing treatment rather than a no-change control.

### What warrants a second pair of eyes
Review the application source order, piece encodings, king-square offsets, and whether the device timer includes initialization or serial output.

### What should be done in the future
Execute the fixtures before and after implementation and challenge the proposed compiler admission rules with adversarial inputs.

### Code review instructions
Compare the extracted names and bodies in `position.typed` and `search.typed` with `loadSource()`. Check that `independentScore()` does not execute the compiler or share Wasm output.

### Technical details
The hardware ABI passes a pointer to a length plus halfwords and an i32 positional-scoring flag. The harness validates the entire 133-cell visible board buffer including the two cached king squares.

### Handoff after the supervisor changed to sequential staffing

The transfer freeze was committed as `5d885b0`. After that checkpoint the compiler operator identified the provisional candidate option as `{pieLoops:"pie-empty",registerLocals:true}`. I started a single isolated Opus oracle request with `scripts/validation/01-opus.py oracle`. On notification to end parallel work I stopped that request and its children. The process exited 143 and produced no research deliverable. No candidate image was observed, no device access occurred and no timing or qualification results are claimed by this department. The sequential researcher can use the pinned source, boards and independent expected-value function directly.
