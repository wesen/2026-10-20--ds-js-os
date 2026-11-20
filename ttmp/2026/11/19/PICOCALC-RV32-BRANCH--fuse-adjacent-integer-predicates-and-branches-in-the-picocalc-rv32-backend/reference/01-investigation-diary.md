---
Title: Investigation diary
Ticket: PICOCALC-RV32-BRANCH
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/19/PICOCALC-RV32-BRANCH--fuse-adjacent-integer-predicates-and-branches-in-the-picocalc-rv32-backend/scripts/01-construct.sh
      Note: Reproduce both compiler bundles
    - Path: repo://ttmp/2026/11/19/PICOCALC-RV32-BRANCH--fuse-adjacent-integer-predicates-and-branches-in-the-picocalc-rv32-backend/scripts/04-differential.mjs
      Note: Focused semantics and code-shape checks
    - Path: repo://ttmp/2026/11/19/PICOCALC-RV32-BRANCH--fuse-adjacent-integer-predicates-and-branches-in-the-picocalc-rv32-backend/scripts/05-guest.py
      Note: Executable whole-driver benchmark
ExternalSources: []
Summary: Chronological evidence and decisions for the adjacent predicate experiment.
LastUpdated: 2026-11-19T19:30:45.260513098-05:00
WhatFor: ""
WhenToUse: ""
---

# Investigation diary

## Step 1. Identify and isolate branch fusion on the production register backend

The prior study establishes the current image sizes and the depth-indexed operand invariant. I chose small static lookahead over explicit delayed comparison entries because the current frontend has structured consumers and the register backend already puts predicate operands in stable locations. The guide records this decision before implementation.

### Prompt context

The supervisor commissioned a Scope A experiment at `6426798` with a pre-implementation guide, reproducible ticket-local code and evidence, Files/Agenda/Editor qualification, comparative static and dynamic measures, a board handoff, a vault project report, and reMarkable delivery. This is a summary of the delegation. The [authored request](../../PICOCALC-RV32-STUDIES--independent-picocalc-compiler-studies-of-branch-lowering-and-output-lifetime/reference/01-supervisor-investigation-diary.md#step-1-establish-a-shared-control-and-assign-independent-reviews) is quoted verbatim in the shared investigation diary.

### What I did

- Inspected `FunctionCode`, structured frontend conditions, the prior study's harnesses, and the A2 and A3 designs.
- Ran `docmgr ticket create --ticket PICOCALC-RV32-BRANCH --title 'Fuse adjacent integer predicates and branches in the PicoCalc RV32 backend' --topics picocalc`.
- Added this diary and the intern guide with `docmgr doc add` and wrote the design before creating any patch.

### Why

The fixed-width pre-existing branch path isolates one hypothesis. Savings come from avoiding a short-lived integer result, with no branch relaxation pass influencing the comparison.

### What worked

The source confirms seven existing predicate operations, including the unsigned bounds relation, and adjacent structured consumers. The preceding baseline study recorded 804, 4,058 and 21,886 words for the three applications.

### What did not work

No substantive failures in the design stage.

### What I learned

The frontend stores immediates as individual cells, so lookahead is valid only from a comparison opcode with no immediate. The local B-type branch tests the complement of the eventual jump condition.

### What was tricky to design

`if` and `br_if` take different polarities. The scratch destinations must be distinct when both operands live in frame slots. Taking an optional `eqz` without unbounded scanning provides a direct loop-path reduction while bounding compile-time lookahead.

### What warrants a second pair of eyes

Verify swapped operands for greater-than and less-or-equal, and verify that the height saved by `begin` reflects consumption of both original operands.

### What should happen next

Build the exact pair in isolated scratch directories and qualify the candidate through normal entry points.

### Code review instructions

Begin with the symbol-level references, truth table, and qualification sequence in the [intern guide](../design-doc/01-intern-guide-for-fusing-rv32-integer-predicates-into-structured-branches.md).

## Step 2. Build the isolated candidate and verify code selection

The pre-implementation guide was committed at `2bcf54e`. I constructed both compiler bundles from `6426798` and applied a zero-fuzz experimental patch to only the candidate lowerer. I sent the constructor, hashes, and ready-to-test candidate to the board supervisor and independent examiner before the local app matrix completed.

### Prompt context

See Step 1. The board supervisor requested the three typed compiler files under each lane's `typed/` directory so the physical series could build one matched firmware.

### What I did

- Wrote `scripts/01-construct.sh` and `scripts/02-predicate-fusion.patch`.
- Added `PREDICATES`, `fuseBranch`, and `branchTarget` to the isolated candidate. Reused `begin` for all structured block opens and reused the branch-over-jump encoder for all conditional transfers.
- Ran `bash "$ticket/scripts/01-construct.sh" /tmp/picocalc-branch-count-pair`. Saved the printed SHA-256 sums in `various/compiler-sha256.txt`.
- Ran `node "$ticket/scripts/03-apps.mjs" count /tmp/picocalc-branch-count-pair > "$ticket/various/static.json"`.

### Why

Separating the source extraction and patch application from benchmarking lets the board build, examiners and host comparison share one candidate identity. Keeping the two-word control transfer fixes the question to predicate fusion and allows the far target test to retain the current reach.

### What worked

The candidate parses in Node. Only `rv32.js` differs. All three application images shrank, and streaming and buffered compilation agree inside both lanes. Total conditional branches, emitted JAL words, and relocation counts are identical between the two images of each application.

### What did not work

The first `git add -- "$ticket"` failed with `fatal: Unable to create '.../.git/index.lock': Read-only file system`. Repeating the intended staging and commit in a scoped escalated command succeeded.

### What I learned

Editor emits 21,886 baseline words at this revision and the patch saves 1,379. The backend source itself grows 1,263 bytes. The density of saved machine code therefore cannot establish the direction of a cold compiler timing on the board.

### What was tricky to build

The structured parser consumes both the branch opcode and a later immediate. Fusion must advance through the matched predicate cells and branch opcode once, then leave the immediate for the ordinary consumer. The two emitter layers complement the truth value for different purposes.

### What warrants a second pair of eyes

Inspect the runtime scratch use for two spilled inputs and the base and inverted funct3 mappings in the patch.

### What should happen next

Check known boundary values and both linked and unlinked executions before publication.

### Code review instructions

Review `scripts/02-predicate-fusion.patch` against `6426798` and run the constructor and static command above from the repo root.

## Step 3. Compare WebAssembly, RV32 fixture behavior, and complete app drivers

A candidate can compile a smaller image yet choose the wrong polarity on one branch. I checked arithmetic-edge fixtures against Node's real WebAssembly VM and ran separately linked full Files, Agenda and Editor ELF files against established C drivers.

### Prompt context

See Step 1. Application output hashes and exact guest counts are qualification evidence for the selected release-control workloads.

### What I did

- Created `scripts/04-differential.mjs` and adapted the prior RV32 decoder in `scripts/07-rv32.mjs` to recognize signed and unsigned conditional branches.
- Ran `node "$ticket/scripts/04-differential.mjs" /tmp/picocalc-branch-count-pair > "$ticket/various/differential.json"`.
- Created `scripts/05-guest.py` using the existing Files, Agenda and Editor driver sources. It builds and links from the public application entry points and runs two counterbalanced pairs over the same module pathname.
- Ran `python3 "$ticket/scripts/05-guest.py" "$gcc" "$emu" /tmp/picocalc-branch-count-pair > "$ticket/various/guest.json"` with ESP GCC 14.2.0 and the CJI emulator. The harness requests `RV32_STEPS=1` only for the measured guest runs.
- Used `scripts/08-worked-example.mjs` with the same toolchain's objdump to record emitted bytes and assembly in `various/bump-disassembly.txt`.

### Why

The focused emulator provides precise memory and trap comparisons. Linked normal entry points exercise entry stubs and import relocation targets under the independent RV32 emulator. A common module pathname and identical driver within each pair avoid measuring changes to the test executable or input.

### What worked

All 1,343 differential calls matched Wasm across both RV32 lanes. All 24 expected traps matched and both lanes preserved identical fixture memory. The far-arm jump displacement was 12,004 bytes. Whole driver output hashes matched across all 24 measured executions. Editor savings ranged from 5.84% to 8.63%. The Files and Agenda savings were 0.08% and 2.76%.

### What did not work

- The first differential command failed at the byte comparison of `eq_value`. One `jal` changed from decimal word 3932156143 to 3969904879. The comparison had included absolute-layout-dependent displacement bits in a call instruction. Masking the displacement in the shape assertion retained its opcode and destination register. Differential execution validates the actual call target separately.
- The first `05-guest.py` command reached the Editor fixture, where Node returned `Error: spawnSync .../picocalc-os/build/picocalc-host EPERM`. A scoped rerun outside the sandbox recovered all six measurements. The edited and large workflows satisfied the host JS and Wasm checks before native comparison.
- The first `08-worked-example.mjs` command produced stdout from objdump but returned `Error: spawnSync .../riscv32-esp-elf-objdump EPERM`. Scoped execution recovered the complete two-lane disassembly.

### What I learned

Guest step reductions can be much smaller than the static reduction. Files' measured flow removes 73 guest instructions, while a 64 KiB Editor navigation and save flow removes 3,653,409. Their denominators include the same driver's and reactor's work in both compiler lanes.

### What was tricky to build

The GUI-based Editor replays verify a JS and Wasm framebuffer oracle before generating the native driver and reactor. The harness validates that the fixture's original module bytes equal the isolated baseline output before measuring both modules. The nested Agenda scenario reads the same module under two logical loads and receives the same module pathname for each.

### What warrants a second pair of eyes

Verify the complete stdout digest equality per workflow and separate guest instruction counts from timing. The focused fixture interpreter and the independently maintained CJI emulator have separate decoding implementations.

### What should happen next

Attach paired board data and record final delivery.

### Code review instructions

Start with `various/static.json`, `various/differential.json`, and `various/guest.json`. Each is generated by the corresponding numbered ticket script from the same compiler bundle.

The existing host workflow script also passed 24/24 for each compiler. I ran the compiler-thesis `scripts/lowering/replay.sh` with GCC, emulator, and the corresponding extracted `typed/rv32.js` as its third argument. The script's selector uses its own `PICOCALC_BASELINE_LOWERER` preload variable in either lane. Captured receipts appear as `various/baseline-replays.txt` and `various/candidate-replays.txt`.


## Step 4. Qualify the candidate on the physical ESP32-P4

I handed the exact paired compiler bundles to the board supervisor. The supervisor ran Editor's normal compiler path with a source and reactor shared by all trials. The same temporary firmware contained both generated versions of the `filesCompare` function. The shared board and independent examiner records contain the raw data and code identity checks.

### Prompt context

See Step 1. This handoff connects the project's compiler and guest-instruction evidence to separately measured handheld compilation and native execution.

### What I did

- Shared the candidate constructor and source hash `8cdf92a2f42a4880a107718d59aecb79223bda67570752b055d13d6117ac0926`. The board supervisor selected that bundle without changing the source used by this host experiment.
- Checked the committed first-boot receipt for the reactor digest, ELF oracle, raw balanced blocks, elapsed time, accounted QuickJS peak and measured cycle batches.
- Compared the physical `filesCompare` symbol lengths of 428 and 392 bytes to the 107 and 98 words in the static application output.

### Why

A native guest step count and a physical execution cycle count have different costs. Source size alone also does not predict QuickJS cold compiler costs. Measuring both paths at distinct boundaries provides evidence for each question.

### What worked

The first-boot cold Editor median moved from 2,483,993 to 2,450,901.5 µs across four paired blocks, with three faster and one slower. Peak accounted QuickJS bytes fell by 16,160 B at the median. All complete Editor ELF digests matched the corresponding board-reactor oracle and all linked outputs were 240,452 B. The three long comparator fixtures used about 13.9% fewer cycles in all 16 pairs.

### What did not work

The supervisor's prior Files comparator parser asserted core 0, while the temporary kernel task actually ran on core 1. The corrected validator used the observed core and verified exact symbol bytes and raw batches. The detailed failure and recovery are recorded by the supervisor.

### What I learned

The directory shortcut has too little sustained work for a stable cycle benefit at this sample size. The long comparator fixtures gain at both run orders according to the independent audit. The cold compile differences vary considerably more across blocks.

### What was tricky to verify

The host workflow reactor has a different digest from the board's IDF-generated reactor. The physical receipt compares both ELF digests with an oracle built against the exact board reactor, so the normal host fixture ELF hash is a distinct artifact.

### What warrants a second pair of eyes

Use the actual ELF and source digests before pooling runs across a different build. Keep the absolute batch cycle windows and per-block differences visible when judging any aggregate savings.

### What should happen next

Retain methodology, raw receipts, and physical behavior evidence with the candidate.

### Code review instructions

Read the [first boot receipt](../../PICOCALC-RV32-STUDIES--independent-picocalc-compiler-studies-of-branch-lowering-and-output-lifetime/various/p4-first-boot.json) and [independent audit](../../PICOCALC-RV32-STUDIES--independent-picocalc-compiler-studies-of-branch-lowering-and-output-lifetime/various/examiner/board-first.json). The shared ticket also contains the trial firmware staging and board replay scripts.


The supervisor validated the second boot independently. I derived the within-block medians from the baseline minus the candidate times, using the original pair groups. The 2.9775 ms repeat median is substantially below the first boot's 32.961 ms. The 16,144 B repeat heap reduction is close to the first boot's 16,160 B. The first three paired comparator reductions reproduced within 0.02 percentage points.

The second boot loaded branch-compiled Editor and displayed the qualified 64 KiB long-inline Markdown fixture. Both capture integrity checks passed. I ran `python3 "$thesis/scripts/supervisor/p4-verify-preview.py" /tmp/p4-independent-studies.v78VRJF2/replicate/preview` offline. Each 640 × 640 frame differed from the qualified reference exclusively in the clock bounding box `[548, 10, 626, 30]`. The [repeat receipt](../../PICOCALC-RV32-STUDIES--independent-picocalc-compiler-studies-of-branch-lowering-and-output-lifetime/various/p4-replicate.json) and [native Editor capture](../../PICOCALC-RV32-STUDIES--independent-picocalc-compiler-studies-of-branch-lowering-and-output-lifetime/various/p4-branch-editor-preview.png) are in the coordinating ticket.

## Step 5. Deliver both study documents

I uploaded the finalized intern guide and published one new note in the user's project vault. The guide records the implementation and repeat benchmarks. The vault report also incorporates the physical Editor preview check.

- Ran `remarquee upload bundle "$guide" --name "PicoCalc RV32 Predicate Fusion Intern Guide" --remote-dir "/ai/2026/11/19/PICOCALC-RV32-BRANCH" --toc-depth 2 --non-interactive`.
- The utility returned `OK: uploaded PicoCalc RV32 Predicate Fusion Intern Guide.pdf -> /ai/2026/11/19/PICOCALC-RV32-BRANCH`. See [cloud receipt](../various/remarkable-upload.txt).
- Committed only `Projects/2026/11/19/PROJECT REPORT - PicoCalc Compiler - Fusing RV32 Comparisons and Branches.md` in `/home/manuel/code/wesen/go-go-golems/go-go-parc`. Commit `15585a7` was pushed to `origin/main`.
- The isolated compiler patch and all host experiment receipts are in source commit `12c6962`. The initial guide predates implementation at `2bcf54e`.
