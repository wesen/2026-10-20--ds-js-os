---
Title: Analysis selection investigation diary
Ticket: PICOCALC-ANALYSIS-SELECTION
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
LastUpdated: 2026-11-19T22:00:16.815415101-05:00
WhatFor: ""
WhenToUse: ""
---

# Analysis selection investigation diary

## Step 1. Reserve held-out applications and synthetic families

I opened Study 7 during the frontend board build. The previous factor study already found a large source-order effect with 37 same-size functions. This design retains the same proof and changes which functions reach it under a fixed work budget.

### Prompt context

The user-authored brief specifies:

> Predict which functions deserve analysis. The previous selector saved 720 words or zero when we changed only declaration order. Compare source-order selection, a cheap literal-only rule, and a predictor of benefit per unit of analysis work. Freeze each policy before testing it on unseen programs and reordered variants where the budget actually binds. This is the strongest candidate for an original research result.

The supervisor asked for a pre-implementation design and a held-out split whose inputs remain reserved until policies are hashed and committed.

### What I did

- Read the prior two-pass divisor analysis, its 32,768-cell selector and the real RV32 guard sequence.
- Reserved Editor, three novel synthetic families and seeds 501–520. Named Files, Agenda and synthetic seeds 1–8 as training.
- Read the independently generated Opus 5.5 High design review and mapped its transferable tactics to divisor guard words.
- Specified a byte/hash gate for later held-out generation.

### Why

The earlier physical apps never exhausted the previous selector’s budget. Generated functions vary the position, concentration and actual proof yield independently. The real held-out app grounds those mechanisms in a full compiler workload.

### What worked

The ordinary compiler finalizes one numeric function at a time, providing an existing boundary where a bounded summary can be captured. The guard sequence gives an objective word cost that can be checked against emitted bytes.

### What did not work

There is no policy implementation or result at this design checkpoint.

### What I learned

Ranked admission gains information, but gathering it incurs separate work. Counting proof visits alone would hide the extra parse. The design spells out a deployment-relevant time and storage measurement and a secondary shared-charge analysis.

### What was tricky to build

The language disallows forward calls. The planned primary permutation test uses independent leaves. The full Editor app remains in its original order so reordering never changes its program merely through declaration validity.

### What warrants a second pair of eyes

Verify the freeze receipt is mandatory before a held-out read, that selectors cannot consult oracle data, and that work-budget-limited cohorts are apparent in the results.

### What should be done in the future

Implement the training and sealed-holdout runner, collect only training outcomes during tuning, and commit exact rule and generator hashes before release.

### Code review instructions

Read the [preregistered design](../design-doc/01-a-preregistered-comparison-of-bounded-function-selectors.md), the earlier bounded-facts ticket’s `scripts/01-stage.py` and `scripts/02-divisor-facts.js`, and the signed division logic in `typed-rv32.js`.

### Technical details

Production compiler `40bcf85`. Existing charges are two visits per numeric cell with a 2,048-cell function cap. The new test uses an exact knapsack oracle solely in evaluation. Editor was reserved before the current experiment read or ran its input. Earlier published Editor aggregate results were available as background.

## Step 2. Test training cases and commit the holdout lock

The ranker sees direct nonzero literal sites and prospective single-write local sites. It counts their probable instruction savings before sorting by expected words per charged cell. On the training split, full weight on the local estimate recovered more oracle words than four alternative weights. I froze the selector at that weight and verified that an uncommitted lock cannot open the holdout.

### Prompt context

See Step 1. The supervisor asked me to implement the selector and report the hash before unblinding, and requested an independent custom-source entry point.

### What I did

- Staged the unchanged proof code and kept the ordinary production backend. The disposable wrapper accepts an explicit set of admitted functions.
- Added an ordinal-independent name tie-breaker and a streaming feature pass. A separate proof pass performs the actual removals. The benchmark times a fresh Node realm from script execution through the linked module for each lane.
- Created the deterministic generator, benchmark runner, evaluation-only knapsack and custom source command.
- Tuned the local weight on Files, Agenda and only seeds 1–8. The sum of oracle fractions across binding positive-oracle training budgets was 20.860 at weight 1.0, 20.544 at 1.5, 20.184 at 2.0, 20.104 at 0.5 and 18.738 at zero.
- Froze hashes of the exact staging, policy, generator and evaluator sources, plus all five staged JS files. [Training transcript](../various/training.json) · [Freeze lock](../various/frozen-policy.json).

### Why

The phase gate compares the lock in the checkout to the matching Git blob and recomputes every input hash. It checks this condition before reading Editor or generating the withheld families. The custom-source entry point has the same lock gate, so the supervisor can run independently authored inputs against the same selector.

### What worked

The training runner preserved exact diagnostics, matched every predicted admission with the real backend on replayed samples and checked every unbounded word count against known zero-guard and overflow-guard instruction widths. With 257 functions it retained 256 summaries and used source-order admission, yielding the same raw image as the direct source-order compiler.

### What did not work

The default sandbox returned `Error: spawnSync git EPERM` when the Node evaluator tried to read pinned training source. That invocation did not reach evaluation. The approved command read the pinned blobs and finished.

The deliberate uncommitted-lock run began with `fatal: path '…/various/frozen-policy.json' exists on disk, but not in 'HEAD'` and produced zero lines of evaluation output. The caller's subsequent use of `status` also hit zsh's read-only parameter of that name. I checked the captured stderr and empty stdout separately.

### What I learned

Even the best training ranker consumed a sizeable feature pass. Exact knapsack recovery in the proof-only budget is a different outcome from the case where a planner debits its work from that budget. Both are present in the holdout schema.

### What was tricky to build

The Editor compiler accepts typed SDK imports. The second parser pass obtains the exact imports and source-size limit from the app linker’s call into the real backend. This preserves import bindings and the same error behavior for malformed programs.

### What warrants a second pair of eyes

Verify that no label derived from the full proof enters `choose()`, and that permutations reuse only per-function costs and benefits from independent leaves. The runner also compiles selected permutations through the real backend as a cross-check.

### What should be done in the future

Record the lock commit and hash, perform the first held-out run, and preserve obligations that the host planning pass cannot establish for the PicoCalc.

### Code review instructions

From the repository root set `ticket` to this workspace and `reactors` to the built ESP32-P4 reactor directory. The same frozen overlay directory is used by all comparisons.

```sh
python3 -B "$ticket/scripts/01-stage.py" "$overlay"
node "$ticket/scripts/04-evaluate.mjs" training "$overlay" "$reactors"
node "$ticket/scripts/04-evaluate.mjs" lock "$overlay"
node "$ticket/scripts/04-evaluate.mjs" custom "$overlay" /tmp/order-a.typed /tmp/order-b.typed
```

The custom and held-out commands require the committed lock. The primary budget is 32,768 proof cells.

### Technical details

Freeze receipt SHA-256 `c228d8f90d7154e6cd623713df3331716cd8f44ed2555118ea8254aaecd00f75`. The ranking pass uses three fixed local arrays with 128 slots. Candidate summaries retain cost, predicted guard words and function name until planning finishes. The later proof still decides all actual removals.

## Step 3. Correct the generated trap's typed syntax

The first locked held-out command exited before producing any evaluation output. The decoy generator placed a return inside an ordinary block. The typed parser accepts an immediate conditional return and rejects that statement inside the block. The recovery preserves the predicate, division-by-zero trap, seed split and all three policies.

### Prompt context

See Step 1. The supervisor received the committed policy lock and custom-source runner before the first held-out invocation.

### What I did

- Changed the generated conditional from `if (d === 0) { return x / 0; }` to `if (d === 0) return x / 0;`.
- Recomputed the lock after changing that single generator string. The original lock remains in commit `5c2806c`. The staging, chooser and evaluator hashes are unchanged.

### Why

Every run needs valid syntax for the intended runtime trap. Discarding the whole decoy cohort would remove the preregistered scenario. The repair keeps the same source condition and divide-by-zero behavior.

### What worked

No held-out case emitted a metric or compiled result before the error. The stdout file was empty. The selector had already been frozen and the unchanged policy file still matches SHA-256 `65c6cd926b08b3170df79a5eab305a3da229def01e3e353300005ac2da234bd0`.

### What did not work

`node scripts/04-evaluate.mjs held-out "$overlay" "$reactors"` stopped at `SyntaxError: 1:69: expected identifier` in `NumericFunctionEmitter.statement` during the first nonempty decoy trap case.

### What I learned

The grammar treats a block as a list of ordinary statements. It supports a branch return through the immediate conditional form, retaining the required trap in generated code.

### What was tricky to build

The freeze includes generator source. A syntactic correction must renew that one hash in a new commit through the same release gate. The correction leaves the scoring rules intact.

### What warrants a second pair of eyes

Compare the two freeze receipts and generator diff. Verify no training or held-out results were used to change ranking.

### What should be done in the future

Run the same held-out command through the renewed lock and preserve the comparison as initially specified.

### Code review instructions

Inspect the one decoy string in `scripts/03-generate.mjs` and the input-digest diff in `various/frozen-policy.json`.

### Technical details

Commit `5c2806c` is the initial lock. The successor changes only the reserved generator's invalid return spelling.

## Step 4. Evaluate the frozen rules and execute the emitted arithmetic

The revised lock opened Editor and 60 generated modules. All generated modules saturated the primary proof budget. Equal-proof ranking greatly improved the recovered word count and eliminated permutation spread. When feature visits were debited, the distributed family favored source order. An independently authored raster workload supported the concentrated-case interpretation.

### Prompt context

See Step 1. The supervisor delivered three independent permutations of a 72-function workload after the policy freeze and requested its inclusion as a distinct cross-check.

### What I did

- Ran the committed held-out lock and preserved every module, order, budget, selected word count and charged-cost comparison. [Complete held-out receipt](../various/held-out.json.gz).
- Verified the supervisor’s compressed inputs and exact hashes. The three files contain identical sets of 72 function bodies. Each saturates the primary proof budget. [Independent checks](../various/independent/scores.json).
- Compiled original, reverse and shuffled representatives through the actual native backend and checked predicted and actual function names, proof visits and raw word totals.
- Reused the earlier arithmetic fixture to exercise 20 functions through the no-proof and three selected program images. Checked native results against a separate Wasm instance. [Guest evidence](../various/guest-results.json).
- Generated and reviewed the figure. Wrote the [article](../analysis/01-which-functions-deserve-limited-compiler-analysis.md) and [reproduction guide](../README.md).

### Why

The exact knapsack upper bound uses the true word difference from analysis-disabled and analyze-all compilations. It establishes attainable savings. The chooser reads only its fixed features. The planning debit confronts the ranker with the same work ceiling and keeps the oracle denominator fixed.

### What worked

The freeze **`70c85541957a32e0f0764ab5e40f88608c62b5711827fa92332da269457eb7e1`** yielded 1,320 saturated synthetic orderings, 440 in each family. Under equal proof budgets, the density medians were 100%, 100% and 99.91% of the oracle in concentrated, decoy and distributed cohorts. Charging the feature count gave 100%, 91.13% and 32.38%. Source order retained 75.15% median oracle recovery under distributed workloads. The independently authored variants produced 1,386/407/1,232 words saved at source order and 1,386 in all orders with both ranked policies.

Editor used 4,278 eligible visits and all three policies saved 83 words. The free-budget ranker took about 34 ms longer than source order in the six matched fresh Node contexts. The compiler and linker scripts were precompiled before timing. This is host evidence for the extra parse's cost.

All four arithmetic lanes returned the same 987 values and trapped for all 16 isolated inputs where Wasm required it. The density-selected image removed 78 raw words relative to no proof. The native interpreter distinguishes breakpoint occurrence, while the Wasm oracle records division-by-zero or arithmetic-overflow intent.

### What did not work

An initial invocation of `python3 -B scripts/06-run-guests.py "$riscv_gcc" "$slas" "$work/guests"` gave `AssertionError: slas: run.elf:1: instruction outside a function`. The build-tree `slas-rv32` binary assembles source and does not execute that ELF. Building the repository’s `tools/rv32/emu.c` as `rv32emu` and passing it to the same runner succeeded.

### What I learned

Stable ranking addresses order sensitivity if a few functions supply most of the value. A planner can incur a substantial overhead even if it predicts exact per-function benefit. The difference between 99.91% and 32.38% on distributed inputs shows how a work-accounting boundary can change the conclusion.

### What was tricky to build

An all-proofs pass counts the real code change after backend lowering. Its per-function word deltas equal twice the number of removed zero guards plus seven times the overflow guards. The replayed three orders confirm that the model applies to the independent leaf functions despite shifted function positions. Host app linking uses the actual Editor source and SDK import descriptors.

### What warrants a second pair of eyes

Inspect the equal-proof denominator in the charged plots and verify that the figures separate workload families. Review the independent sources and the policy lock comparison. The experiment does not physically time the extra planner on the PicoCalc.

### What should be done in the future

Investigate collecting a partial score during ordinary frontend emission if another workload runs out of proof budget. The present Editor has no demonstrated need for the two-pass planner.

### Code review instructions

Follow `README.md` for host evaluation and the independent arithmetic emulation. The frozen `04-evaluate.mjs` emits all static and timing evidence. Decompress `various/held-out.json.gz` to audit the exact per-function analysis, order hashes, admission costs and per-order savings.

### Technical details

The frozen chooser source had SHA-256 `65c6cd926b08b3170df79a5eab305a3da229def01e3e353300005ac2da234bd0`. The summary cap test retained 256 summaries across 257 functions and produced a raw image byte-identical to ordinary source-order admission. Every cohort ran comparisons at 32,768 and at one-quarter, one-half and the full eligible proof cost, with coincident budgets represented once.

## Step 5. Publish the held-out study

The vault’s main branch contains the standalone article and verified figure at `450e9267c5ff7c7e99d3eae96d7048c9888fe411`. The project report, policy lock, archived datasets and reproduction guide remain together in this ticket. [Publication receipt](../various/vault-publication.json).

## Step 6. Preregister and stage the frozen selector on the ESP32-P4

This follow-up transfers the locked selector from Node to the real compiler process. I registered the time and allocation forecasts at `e5cfeee` before staging. The fixture includes unchanged Editor and the locked original order of the distributed synthetic workload. It preserves the held-out article and report as published.

### Prompt context

The supervisor requested an on-device three-arm transfer with matched cold timing, startup costs and allocator observations. He confirmed the eight new guides were uploaded together with the measurement protocol. Guide PDFs for Studies 1 and 7 are in the acknowledged nine-document bundle *PicoCalc Compiler Lab II - Eight Experiments and the Measurement Protocol* at `/ai/2026/11/19/PICOCALC-COMPILER-LAB2`. [Bundle receipt](../various/remarkable-guide-delivery.json).

### What I did

- Wrote the [physical transfer preregistration](../design-doc/02-transfer-frozen-selection-to-the-esp32-p4.md) and committed it before creating the stage.
- Removed only ESM export syntax from the exact locked feature and chooser functions. Embedded them in the staged RV32 compiler for the two ranked arms. Source order uses the same proof code without the unused ranking script.
- Counted allocations and live high-water by five compiler phases, with a small number of JS-to-C phase markers. The production elapsed clock closes before the new UART lines are printed.
- Added the checked synthetic raw-image entry and retained the original Files, Agenda and Editor production paths. The physical runner verifies linked or raw output as appropriate.
- Built the disposable image with ESP-IDF 5.4.2 and verified full bytes from both Node and vendored QuickJS before handing it to the serial owner.

### Why

The physical execution verifies how much the second parser pass costs on the P4. An Editor-only comparison tests the cost with unchanged native output. The registered synthetic comparison tests the cost when the selected proof set also changes output size.

### What worked

The Node preflight matched the locked Editor ELF and the three synthetic RV32 binaries. The physical scripts produced the same results in vendored QuickJS without phase callbacks. Editor removes 83 words in each arm. The density and literal synthetic outputs remove 10,107 and 7,407 words, compared with 7,749 under source order. [Preflight](../various/p4-transfer-preflight.json) · [QuickJS digests](../various/p4-transfer-quickjs.json).

### What did not work

No build or output eligibility failure occurred. The physical measurements are pending.

### What I learned

The selector prepass uses the app linker’s exact import list and maximum source length, so it must execute inside the native compile entry. The exact feature and proof visits are portable. Array sorting implementations can legitimately execute different comparison counts in QuickJS and Node, even when stable tie-breaking yields the same admission.

### What was tricky to build

The original generic stage reserves the `base` lane name for a frozen production pair. The physical overlay replaces that staged copy with the frozen source-order analysis treatment and then generates fresh guest and output oracles. The original generic runner and production sources stay unchanged.

### What warrants a second pair of eyes

Check that timer phase totals reproduce the outer timer and phase high-water reproduces the whole peak. Inspect the captured Editor and synthetic feature and proof counters for every arm.

### What should be done in the future

Record two complete physical captures, restoration, and forecast comparisons. Keep the transfer report separate from the original held-out article.

### Code review instructions

Run `08-stage-p4.py WORK`, build with the former frontend study’s `05-build.sh`, then run the original compiler lab’s `03-oracle.mjs WORK` and this ticket’s `11-p4-oracle.mjs WORK`. The single serial owner invokes `12-p4-board.py WORK BACKUP --port PORT --esptool ESPTOOL --boots 2`.

### Technical details

The physical-transfer image SHA-256 is `dac35e2bca871ea6e7d3a389659bd9ab79443e56e6341cd640f8aab71aca4ac7`. The density ranked arm uses the exact 32,768 proof-visit budget. Planning is timed independently and does not debit that physical budget.

I also replayed the emitted phase and work callbacks in vendored QuickJS. Editor used 16 comparison calls under the literal rule and 14 under the density rule. Node reported 15 and 14. The synthetic QuickJS counts were 152 and 253, versus Node’s 40 and 229. Feature cells, retained summaries, proof visits and all output digests matched. Sorting API semantics fix the selected set and permit different comparator traffic. The device summarizer checks phase order and the portable work counters and records the physical comparator count separately. [QuickJS phase replay](../various/p4-transfer-quickjs-traces.json).

## Step 7. Verify the phase and cost comparison on the device

Two balanced boots completed all 144 compiles. Editor emitted one full ELF under all three policies. The binding synthetic emitted each policy’s registered raw byte image. The serial owner restored the original factory partition and verified all three applications returned to healthy native status.

### Prompt context

See Step 6. The physical follow-up is a transfer study on existing inputs. The held-out article remains at its published commit.

### What I did

- Increased the capture duration from 145 to 185 seconds before board use after measuring the synthetic/Editor time ratio in vendored QuickJS. Timed compilation alone totaled 160.237 and 160.358 seconds per boot.
- Parsed every boot twice with the generic receipt and the phase checker. Verified each phase sum and allocator high-water against its outer observed row.
- Archived both measured log extracts, restored state and complete summary. [Board receipt](../various/p4-transfer/physical.json.gz) · [Phase results](../various/p4-transfer/summary.json.gz).
- Authored the separate [physical transfer report](../analysis/02-the-cost-of-ranking-compiler-work-on-the-physical-picocalc.md) and its figure.

### Why

The P4 test times the actual setup and planner inside the existing app wrapper, controlling the output on Editor. The exact synthetic order tests a budget that saturates and allows output size to respond to selection.

### What worked

Editor’s paired median ranked costs were +1,311.098 ms for literal only and +1,293.660 ms for words per cell over source order. The feature passes took 1,348.699 and 1,342.500 ms. Setup added 10.235 and 10.455 ms, and ordering took 2.725 and 2.683 ms. Peak increased by 31,674 and 31,658 bytes. Loading the planner raised the setup peak by 20,180 bytes; either feature parse grew live memory by 89,648 bytes over its own phase entry.

The ranked density synthetic emitted 2,358 fewer words than source order and cost a paired +1,927.889 ms. Its peak was 54,438 bytes lower. All 12 blocks in either input showed longer ranked times. Every phase, output and work count matched its oracle. The QuickJS comparison counts repeated exactly across both boots.

### What did not work

The preliminary inspection of one UART log assumed an app field was initialized before a trial marker and raised `NameError: name 'app' is not defined`. The log legitimately contains ordinary app phase metrics before the first trial. Initializing that temporary inspection variable resolved it. The production parser only records phase measurements after a `LABRUN` and includes all 144 rows.

### What I learned

The additional parse dominates total overhead. The few milliseconds of function ordering and about ten extra setup milliseconds are much smaller. Peak and backing allocator operation counts can move in different directions. QuickJS serves many objects from the same arena, and arena and large-block traffic are what this counter measures.

### What was tricky to build

The backends share app source and limits but the synthetic returns raw bytes. Its digest and count have a different oracle from the app ELF. Keeping the raw phase records tied to the actual trial marker preserves that distinction when replaying logs.

### What warrants a second pair of eyes

Check the host-to-device scope and time accounting. The transfer runs equal proof budgets and measures planning separately. The original held-out report also explores debiting planner visits. The transfer provides two measured inputs rather than adding an independent holdout cohort.

### What should be done in the future

Collecting required features during the ordinary parse would address the largest measured cost. This experiment isolates the penalty of the current whole-module prepass.

### Code review instructions

Use the physical transfer commands in `README.md`. Inspect `various/p4-transfer/summary.json.gz` and the two matching boot excerpts. The provisional and final comparisons both use medians of differences within blocks, and the figure’s stacks use mean phases.

### Technical details

Image `dac35e2bca871ea6e7d3a389659bd9ab79443e56e6341cd640f8aab71aca4ac7`. The byte-checked factory backup is `6b0e3ba4a2d4546b5eeae3a608c82b3b0df06034afc5afedcc1e3e264d0b883f`. Both ranked Editor variants produced the registered ELF `06a85ff63c94a9d193a9136f92a2250e6725c5f9df830e9c00aa643d96503944`.
