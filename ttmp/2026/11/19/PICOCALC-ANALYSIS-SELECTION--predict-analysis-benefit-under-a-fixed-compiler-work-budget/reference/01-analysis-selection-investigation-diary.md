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
