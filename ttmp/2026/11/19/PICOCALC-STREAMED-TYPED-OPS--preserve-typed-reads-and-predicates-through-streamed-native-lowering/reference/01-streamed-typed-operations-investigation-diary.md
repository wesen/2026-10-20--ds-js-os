---
Title: Streamed typed operations investigation diary
Ticket: PICOCALC-STREAMED-TYPED-OPS
Status: complete
Topics:
    - picocalc
    - native
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Chronological compiler experiment and qualification evidence."
LastUpdated: 2026-11-19T22:14:06.428893527-05:00
WhatFor: ""
WhenToUse: ""
---

# Streamed typed operations investigation diary

## Step 1. Freeze a three-lane comparison

The staged backend's existing predicate fusion made byte identity a practical control. A representation can preserve a typed operation yet project the same low-level program. That gives a physical experiment whose observation arm isolates the representation and projection cost from any code improvement.

### Prompt context

> Preserve useful typed operations until native lowering. Build a minimal, one-function-at-a-time representation that preserves operations such as “read a text code unit” and “branch on this comparison.” First make it emit the same RV32 bytes as the staged baseline. Measuring that version tells us the time and memory cost of carrying the information before we credit it with any optimization. Then let the backend consume one operation directly and measure what disappears.

The brief's third study supplied this request. I interpreted it as a control, a typed observation arm and one direct lowering, all on the prior staged backend. The design commit is `3a1acc2` and the frozen prior-study repository state is `dbe26be`.

### What I did

- Reconstructed the staged backend using the prior script and patches and verified each staging input against its blob at `dbe26be`.
- Committed the design before adding executable compiler code.
- Read the independent Opus High review and preserved the response and receipt. It proposed a transient byte-load example and emphasized observable order. The actual SDK operation requires a checked UTF-16 read and is represented at the front end's output boundary.

### Why

The unchanged output in the observation arm forces any physical compilation difference to come from representation, projection and compiler initialization. The execution difference belongs to the direct candidate.

### What worked

The supervisor's baseline receipt has 24 passing replays. The staged RV32 SHA-256 begins `532c5ed74ac6` and matches this ticket's control.

### What did not work

Git initially returned `fatal: Unable to create '.../.git/index.lock': Read-only file system` after `git add -- <ticket design paths>`. The managed sandbox permits source writes and mounts Git metadata read-only. The design commit succeeded through approved Git access. Implementation began after the commit.

### What I learned

Staged compiler generation starts from an older frozen production backend and applies two research patches. Reading only the production RV32 file would have missed deferred operands and the branch compactor.

### What was tricky to build

The observation lane needs to preserve the order and exact numbering of synthetic locals created before the parser descends into the position expression. That ordering matters for nested reads and stack frame layout.

### What warrants a second pair of eyes

Review the typed predicate consumer and compare its inversion count against the previous compiler's exact branch opcodes.

### What should be done in the future

A typed-operator design for all operations would need a shared opcode specification and direct consumers for its major operations. The scope here stays at two operations.

### Code review instructions

Read the design and then reconstruct the staged lane using `python3 -B scripts/01-stage.py <fresh-directory>`.

### Technical details

The control, observed and direct backend hashes are in the compiler receipt. The staged host replay registration is in the supervisor's baseline ticket.

## Step 2. Project the old program and lower a read directly

The observation variant matched the complete RV32 images of the three programs. The direct-read variant consumes an evaluated index, performs the checked UTF-16 access, and pushes a result. It no longer needs the temporary that the numeric stack program previously required.

### Prompt context

See Step 1. The evaluation compared complete code and metadata, buffered and streamed code, and Wasm semantics.

### What I did

- Added strict staging anchors and option-free compiler bundles for the two treatments.
- Checked raw images, entry maps, layout, relocation, signatures and Wasm function bodies across Files, Agenda, Editor and fixtures.
- Compared 126 fixture executions per lane including 46 expected traps, induced mutations, short circuit and stack spilling. Used the prior CJI-derived RV32 instruction interpreter with staged immediate operations.
- Built the headless P4 firmware in an isolated port. The host oracle hashes its exact linked application ELFs and matches the emitted Files and Agenda timing kernels to firmware bytes.
- Added an A6 adapter to preserve predicate positions across captured condition fragments and an A7 adapter to use allocator-managed local homes. Both register policy variants preserve the observation control and pass the focused differential.

### Why

An immediate such as 256 can equal an operation tag. Reading at instruction boundaries avoids interpreting a constant as an operation. Replaying the exact legacy operation list also preserves the staged backend's layout choices, including fusion and fallbacks.

### What worked

Editor generated 16,541 words in both the staged and observation lanes. Direct reads lowered that result to 16,174. The observed Editor stream carried 73 string reads, 42 buffer reads and 324 branch predicates. A6 and A7 composition reached 12,430 words with the loop-weighted register policy.

### What did not work

The initial `node scripts/06-verify.mjs /tmp/picocalc-typedops-lanes` called `typedWasm.compile` on full Editor source. The standalone entry raised `SyntaxError: input limit exceeded` because Editor needs the typed-world limit and SDK imports. The verifier now compares ordinary Wasm function bodies under the exact world import and limit contract. Existing linked-Wasm replay remains independent.

### What I learned

In Editor, replacing the stream cells saves 1,910 cells over the whole observed source but only one cell at the largest function. The projected array can coexist with its source array, so cell counts alone cannot predict heap high-water.

### What was tricky to build

A direct read may start with an index returned in `a0`, a deferred local, an existing stack register or a spilled value. The two scratch registers preserve lower stack operands. Under A7 the receiver can occupy an allocated register and the result can be forwarded directly into an assignment's register home.

### What warrants a second pair of eyes

Check that the position is evaluated before receiver loads, and that code-unit loads remain zero extended. Inspect how register planning advances over the typed-read immediate.

### What should be done in the future

A native consumer for branch predicate events could remove the projection pass from functions that carry both operation kinds. The current study directly lowers only the text operation.

### Code review instructions

Run `node scripts/06-verify.mjs <staged-directory>`. Check the compiled guest images against the linked oracle in `various/board-oracle.json`.

### Technical details

The P4 app image SHA-256 is `a537fb102936269ae10d5f8b8fb02fbcd826566c2830a0b545249b27eee2ef90`. The observed Editor ELF SHA-256 equals the staged control, `c93d229641c2cc8ff8e8a38364e5e489dec3d9e4cf2dbb6c0b9c740c2fa80439`.

## Step 3. Measure retention and direct reads on two physical boots

The observation lane preserved every code hash and cost additional compile time on each application. The direct lane recovered part of that time, reduced the emitted code, and lowered peak heap in Editor. Files provided a guest workload that repeatedly reaches the read.

### Prompt context

See Step 1. The experiment implementation and host evidence were committed at `4397eb7` before the physical results.

### What I did

- Recomputed the paired statistics from the supervisor's physical receipt with the existing lab summarizer and compared its output byte for byte.
- Verified 54 cold compile rows and 96 timed guest batches per boot. The timer frequency was 360 MHz and all 108 linked-module hashes agreed with the host oracle.
- Verified native Files, Agenda and Editor status after restoring the original firmware. Appended the paired effects to the newcomer guide and the standalone article.

### Why

The observation arm measures carrying and projecting typed information while the machine code is fixed. The direct arm changes the fast path while retaining the language's bounds, unsigned width and evaluation semantics.

### What worked

The observation Editor compiles took 6.18% and 6.79% more time than the staged arm, with 0.42% more peak QuickJS memory on each boot. The direct Editor compiles took 3.42% and 4.12% more time and used 1.09% less peak QuickJS memory. The Files text-comparison guest used 18.9% fewer cycles in both boots. Agenda weekday cycles stayed within 0.01% of control.

### What did not work

There was no failed bench row in the two completed captures. The earlier IDF build and profiling harness did not measure interactive Editor guest cycles. All reported guest cycle changes apply to the isolated Files and Agenda functions.

### What I learned

A representation can occupy fewer cells and still make cold compilation slower, especially when projecting into an additional per-function array. Direct lowering can buy a lower peak or faster guest while leaving a positive compile-time cost.

### What was tricky to build

Rotating the lane order and checking the exact ELF hash made the paired comparison independent of boot placement and a mistaken compiler selection.

### What warrants a second pair of eyes

Compare the two boots separately. Check that regressions and improvements are based on matched blocks rather than differences between separately pooled medians.

### What should be done in the future

The next architectural experiment is direct predicate consumption, which would test whether the projection array can be avoided on functions carrying both operation kinds.

### Code review instructions

Read `various/physical-summary.json` and inspect the corresponding per-block data in `various/physical.json`. The experiment uses `base` for the frozen staged lane.

### Technical details

The standard Editor module stayed at 240,452 bytes under the same reservation. Direct lowering removed 367 instructions, or 1,468 bytes of occupied native text.

## Step 4. Deliver the completed intern guide

The final guide includes both boot measurements and the guest workload boundaries. The reMarkable cloud accepted the guide in the lab's dated folder. The standalone Obsidian article was prepared with the same measurements.

### Prompt context

See Step 1. The requested delivery pairs a self-contained article with the ticket's implementation and guide.

### What I did

- Uploaded the final guide as `From_a_Typed_Text_Read_to_RV32_Instructions.pdf` to `/ai/2026/11/19/PICOCALC-COMPILER-LAB2`.
- Retained the literal cloud delivery acknowledgment in `various/remarkable-delivery.json`.
- Prepared the finished vault article for publication as a separate document.

### Why

The guide explains how to reproduce and verify the experiment. The standalone article explains how to design a byte-equivalent compiler comparison in another project.

### What worked

`remarquee upload md` returned `OK: uploaded` and the requested destination.

### What did not work

Automatic approval review rejected the scoped `git -C <vault> push origin HEAD:main` transaction because it did not find trusted authorization in the child context for publishing to the external vault repository's main branch. The transaction did not run. The completed article remains available for the supervisor's authorized publication.

### What I learned

The publication receipt is separate from the trial evidence and identifies the exact file delivered.

### What was tricky to build

The article must distinguish fixed-reservation ELF size from occupied text, and separate cold compile effects from Files guest cycles.

### What warrants a second pair of eyes

Verify the vault publication revision and article link when available.

### What should be done in the future

Record the vault revision after publication.

### Code review instructions

Read the guide's physical section against `various/physical-summary.json`.

### Technical details

Cloud delivery confirms acceptance of the PDF by reMarkable. Physical device synchronization was outside this check.

## Step 5. Verify publication from the authorized vault operation

The supervisor reviewed the exact standalone article and published it under the user's authorization. I verified that the published Git blob matches the finished manuscript byte for byte and that the publication commit is reachable from the local remote tracking branch. The supervisor independently checked the remote branch SHA.

### Prompt context

See Step 1 and the publication scope in Step 4. The board results and device cloud receipt were committed at `da91116`.

### What I did

- Compared the final manuscript to the article blob at `b8a73faf417a7749514292947dd1f75bd749576c`.
- Recorded the repository, branch, blob hash, commit and stable URL in `various/vault-publication.json`.
- Marked the study complete.

### Why

The exact blob comparison ties the published measurements to the manuscript that was reviewed.

### What worked

The standalone article is published and byte-identical to the verified manuscript. [Published article](https://github.com/go-go-golems/go-go-parc/blob/b8a73faf417a7749514292947dd1f75bd749576c/Projects/2026/11/19/ARTICLE%20-%20PicoCalc%20Compiler%20-%20Preserving%20Checked%20Text%20Reads%20Through%20Native%20Lowering.md).

### What did not work

Step 4 records the earlier blocked upload attempt. The successful vault operation was performed under the supervisor's verified authorization.

### What I learned

The publication evidence can be checked independently of the physical test receipt.

### What was tricky to build

The article preserves each boot as its own observation and uses paired rather than pooled effects.

### What warrants a second pair of eyes

Compare the article's guest scope to the complete headless test's two selected guest functions.

### What should be done in the future

No publication follow-up remains for this study.

### Code review instructions

Use the stable revision and SHA-256 in `various/vault-publication.json`.

### Technical details

The reMarkable guide and the standalone vault article are distinct documents with independent delivery receipts.
