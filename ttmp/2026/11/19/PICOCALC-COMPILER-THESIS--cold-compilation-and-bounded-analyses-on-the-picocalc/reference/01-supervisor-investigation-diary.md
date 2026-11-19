---
Title: Supervisor investigation diary
Ticket: PICOCALC-COMPILER-THESIS
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T15:44:04.191948911-05:00
WhatFor: ""
WhenToUse: ""
---

# Supervisor investigation diary

## Step 1: Commission three controlled compiler experiments

The question is how much compile time and storage the target can afford to spend improving code. I divided the work by compiler boundary so the experiments can measure independent effects on the same inputs.

### Prompt Context

**User prompt (verbatim):**

> we want to focus on compiler improvements vs "systemic" improvements, it's really about novel compiler construction

> ok, launch subagents, each should write extensive diary (see diary format) + take notes +  write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill).      
>  Commit and push the bsidian vault when done (go-go-parc vault).    once they are done.
>
> Run sol agents or so and supervise them as the thesis supervisor, in fact use astra agents to review their work and help them be innovative and effective and progressive and deep researchers and great implementers. We want to save on tokens so we want to use cheaper agents to implement and work, but really the research should be stellar and as such we need some big intelligence to tie it together.
>
> Yu keep a diary too, everybody should. commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)

**Assistant interpretation:** Run three implementations, independently examine them, qualify results and publish each researcher's technical article.
**Inferred user intent:** Preserve the derivation and limits of genuinely informative compiler experiments.

### What I did

- Opened PICOCALC-COMPILER-THESIS with docmgr. Assigned three Sol researchers to register placement, reversible changes to the compiler's intermediate representation, and guarded text accesses.
- Asked the leads for independent tests of argument shuffling, mutable aliases, signed indices, output metadata identity and equal-work timing.
- Located the existing host QuickJS objects and the actual firmware compile function. Checked available board transport without resetting hardware.

### Why

A fresh compiler runtime, the running app and the padded linked module all answer different performance questions. Semantic equivalence is an independent gate for every timing claim.

### What worked

The baseline revision is dd69a81. All three workers submitted a design. The proposed correctness cases refer to actual compiler operations used by Files, Agenda's typed parser and Editor.

### What didn't work

My first independent Astra launch returned `collab spawn failed: agent thread limit reached` with three Sol workers active. I provided first-pass review immediately and scheduled the independent examination for the next free slot. The shell sandbox intermittently reported `bwrap: Can't bind mount /oldroot/ on /newroot/: Unable to apply mount flags: remount "/newroot/mnt/pico": No such device`. Scoped host inspection worked. A read-only worlds query on /dev/ttyUSB0 returned zero bytes. The previously qualified /dev/ttyACM0 was absent.

### What I learned

A USB bridge does not establish the identity of its attached board. The existing workstation phase benchmark also preloads a runtime and a compiler, which changes the meaning of cold compilation.

### What was tricky to build

Different researchers consume the same compiler sources while the RV32 lead changes one of them. Pinned control sources and recorded blob identities make the comparisons auditable.

### What warrants a second pair of eyes

Review whether all control-flow paths agree on register homes, whether old length facts can survive alias changes, and whether each representation measurement includes equivalent work.

### What should be done in the future

Independently rerun the candidate and obtain target measurements if the PicoCalc transport becomes available.

### Code review instructions

Start with the experiment design in this ticket and the prior NATIVE-NEXT Scope A plan. Follow each researcher’s diary to the scripts generating their receipts.

### Technical details

The corpus comprises 7 Files, 34 Agenda and 120 Editor functions. Scope A static counts refer to RV32 words in the app, excluding reactor padding. A measured peak must name the allocator and the machine.
