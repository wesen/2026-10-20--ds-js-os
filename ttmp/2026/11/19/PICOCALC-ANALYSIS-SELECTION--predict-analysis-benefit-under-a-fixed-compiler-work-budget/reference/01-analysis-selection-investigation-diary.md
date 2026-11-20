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
