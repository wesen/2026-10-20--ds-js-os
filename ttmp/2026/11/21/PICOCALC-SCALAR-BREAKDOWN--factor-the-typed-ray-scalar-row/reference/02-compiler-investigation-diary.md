---
Title: Scalar compiler investigation diary
Ticket: PICOCALC-SCALAR-BREAKDOWN
Status: complete
Topics: [picocalc, compiler, performance]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Chronological scope, decisions, failures and checks for the host compiler factors."
LastUpdated: 2026-11-21
WhatFor: Understand and reproduce the scalar cost breakdown.
WhenToUse: Reviewing compiler transformations or designing a matched frame experiment.
---

# Scalar compiler investigation diary

## Step 1. Freeze a four-way experiment before handing off the board images

The previous scalar kernel accelerated a whole routine. I kept the next experiment inside the stock backend, where I could measure two independent decisions without changing the loop domain.

### Prompt Context

User request (verbatim, as recorded in the [director diary](01-director-investigation-diary.md)): “Alright, implement that an then the scalar breakdown. Diary and design doc and all that. commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)”. Follow-up: “also regarding wasm / rv32 emission, etc...”. The director assigned the host experiments, comparisons against C and integrated inspector evidence to this lane. Code commit `b6cf97c`.

### What I did

Read all 318 numeric cells for the ordinary row. Built a common preflight plus five variants from the original `e54c13e7` backend. Coordinated IDs 9–13 and reserved the old matched scalar arm as a separate device control. Compared real RV32 execution against Wasm on 480 admitted scene rows and ten edge cases. Handed off the qualified files and frozen manifest.

### Why

A common qualifying entry makes the two-by-two comparison interpretable. Counting horizontal reads directly establishes that the two factors visit the same set of candidate pixels.

### What worked

Every fixed-domain arm executed 76,800 horizontal reads. The skip arm executed 26,400. Default preflight overhead was 6,560 retired instructions. Hoisting saved 311,624 and register retention saved 662,081 against either setting of the other factor.

### What didn't work

The earlier hand-written scalar body could not isolate either desired factor: it changes pointer induction, clears storage differently and already skips empty rows. I retained that program only as an external residual comparison.

### What I learned

The backend already emits a compact explicit checked-address opcode. Three removed static words correspond to two instructions on successful dynamic accesses. This makes the observed guard effect exactly inferable from independent check counts.

### What was tricky to build

Forwarding a register through a live expression must preserve evaluation order. The permitted lookahead has at most one pure local read or constant before its binary consumer. On any other sequence the normal stack-home representation remains available.

### What warrants a second pair of eyes

Check which argument registers remain free in the leaf row; confirm that the preflight preserves the live input registers and that the fallback receives the untouched buffer. Review wrapped i32 arithmetic and the admitted root-table range.

### What should be done in the future

Compare the factorial effects against actual physical time and inspect each final image region separately.

### Code review instructions

Start with `row-pass.js`, then `make-backends.mjs` and `qualify-rows.mjs`. The [manifest](../various/compiler/manifest.json) pins backend and image hashes and final row offsets.

### Technical details

Selected local slots are 0, 2, 15, 16, 17, 18. Fast/fallback words are rebased independently during final image assembly. The extra skip uses a structured block around the original horizontal loop; the four factorial programs run identical numeric IR.

## Step 2. Check whole C frames and freeze a prediction on another function

I executed the full scalar renderer through independently linked RV32 images and counted actual shadow instructions from a separate unchanged run. The six-word admission prediction was written and committed before emitting the candidate.

### Prompt Context

See Step 1. The director asked for a concrete prediction on `typedRayInShadow`, separately from any generic compiler promotion. Measurement and forecast commit `9d43fba`.

### What I did

Reused the existing C renderer's audit harness, working from its 12 frozen sphere/light/stride cases. Ran 144 complete calls for six images, two entries and all fixtures. Traced the shadow routine in a clean default frame, counting calls, direct instruction retirements and branches around bounds traps.

### Why

Returning the same visible colors can hide errors in the winning sphere or depth. Padding and canaries expose indexing errors. An independent prediction about another hot function tests the explanation of the first result.

### What worked

All frame payloads compared byte-for-byte against C, including stride 320. The shadow function executed 264,928 bounds tests in 19,477 invocations. Saving two dynamic instructions per check and charging six per admission predicts 412,994 fewer retirements.

### What didn't work

Comparing the explicit-stride default total with the previous study's zero-stride shortcut initially looked like a discrepancy of ten instructions. Both runs render the same scene. The current harness passes stride 160, which executes the documented explicit-stride validation route.

### What I learned

Both the width of the output and the exact entry convention matter to reproducible dynamic counts. The direct row and shadow counts remained unchanged by this stride detail.

### What was tricky to build

The oracle's file stores a sentinel before and after each plane. The assembly wrapper uses Typed capacity headers and two trailing canary words. Comparing the interior payload preserves padding while checking the different boundary formats independently.

### What warrants a second pair of eyes

Audit the six preflight instructions and the inclusive upper index of 32 for shadow coefficients. Recheck effectful helper assumptions before trying the prediction on a different program.

### What should be done in the future

Actually compile and execute the predicted candidate and verify its short-buffer behavior.

### Code review instructions

Run `frames.py` and `shadow-forecast.mjs` as in [the intern guide](../design-doc/02-reproduce-the-scalar-factorial.md). Inspect the [committed forecast](../various/compiler/shadow-forecast.json).

### Technical details

The C interpreter counts only named Typed routines. The shadow fixture's 1,288,258 direct stack loads and 647,710 stack stores remain outside the scope of the check-removal forecast.

## Step 3. Inspect both row bodies and test the preregistered shadow prediction

The director made final-byte observation available while the physical images were already frozen. I generated inspector-enabled equivalents and required identity with those images before attributing emitted words. I then executed the closed-source held-out shadow specialization.

### Prompt Context

See Step 1. The director explicitly requested a real held-out test after registering the prediction, with output-level checks and malformed fallback trials.

### What I did

Mapped the original checked IR to both emitted copies and explicitly marked the inserted skip controls. Generated a separate shadow backend with a six-instruction guard followed by fast and fallback copies. Ran the full C matrix again on stock and shadow images, and fifteen direct Wasm/RV32 boundary cases including invalid capacities, counts and extreme signed coordinates.

### Why

Duplicating a function after generating trace ranges would associate operations with the wrong code. Compiler inspection is meaningful only if it describes the actual linked image. A prediction counts as an independent check only after timing its registration relative to implementation.

### What worked

Every inspector image matched its physical image SHA. Fast-path trap sites fell from eleven to zero for hoisted arms, and all eleven remained in every fallback. The new shadow image measured exactly 5,115,403 shadow retirements and 15,119,640 whole-frame retirements on the default clean call, matching the prior prediction.

### What didn't work

Directly reusing fast IR coordinates in the skip arm would shift all subsequent source operations by seven or eight cells. I provided an explicit piecewise inverse map; the five synthetic events map to zero-length spans at the two insertion sites. I did not assign a source operation to the standalone preflight.

### What I learned

The shadow proof relies on the called absolute-value helper having no access to the mutable work buffer. This prototype pins the whole closed source and demonstrably declines a changed helper body.

### What was tricky to build

The shadow routine calls a helper, so local branch labels must move with each emitted copy while relative calls to other functions keep their global target. The preflight also has to check capacity before reading the object count.

### What warrants a second pair of eyes

Review the direct branch displacement to the fallback and complete coverage of function-relative byte offsets. Check that a declined minimal buffer can still return normally when its original data-dependent control flow permits.

### What should be done in the future

Use a broader call-effect proof before applying this shadow technique to unpinned user programs. Any physical follow-up should distinguish the image-size cost from the measured dynamic saving.

### Code review instructions

Run `inspect-receipt.mjs`, `shadow-edges.mjs` and `frames.py` with the held-out backend. Compare [the receipt](../various/compiler/inspection.json), [the actual full-frame counts](../various/compiler/shadow-frames.json) and the prediction at commit `9d43fba`.

### Technical details

The held-out image grows from 9,564 to 10,512 bytes because it preserves a complete fallback. The ordinary C machine interpreter and independent JavaScript instruction model cover different boundaries; all required agreement checks passed.
