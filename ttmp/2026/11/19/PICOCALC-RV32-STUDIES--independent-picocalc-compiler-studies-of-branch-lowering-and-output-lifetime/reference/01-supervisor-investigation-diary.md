---
Title: Supervisor investigation diary
Ticket: PICOCALC-RV32-STUDIES
Status: active
Topics:
    - picocalc
    - native
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T19:30:57.411003462-05:00
WhatFor: ""
WhenToUse: ""
---

# Supervisor investigation diary


## Step 1: Establish a shared control and assign independent reviews

The two proposals modify different points in the native compiler. I froze the production inputs at `6426798` and assigned each a separate ticket. A third researcher received the role of examiner. All board runs use one supervisor-owned schedule so the two changes can be compared against the same control.

### Prompt Context

**User prompt (verbatim):**

> can you link the research index in the README.md  or so to point at where we currently are? Or AGENTS.md (I think is the right file). 
>
> Then run the independent research (all the way). Have the subagents Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.
>
>
> Also each: keep detailed diaries (you too), according to the diary skill format. Also to write  write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill).      
>  Commit and push the bsidian vault when done (go-go-parc vault) Once done (each subagent, and when they come back you look at their resulting research and results and write your own report, reexplaining everything as a fundamental for a new intern newcommer, pedagogically, in a textbook authoring stle.

**Assistant interpretation:** Link the existing global index, complete the two open compiler experiments, and publish the researchers’ work and a separate teaching synthesis.

**Inferred user intent:** Make historical evidence discoverable and reproducible, including negative results.

### What I did

- Added the repository-level agent entry point and opened a coordinating docmgr ticket. Assigned code generation, output allocation and independent examination to different researchers.
- Located the P4 by USB serial ID and began backing up the 8 MiB factory application after a console bus hold. Scripts and results stay in the tickets. The private board backup stays in scratch.
- Wrote the trial schedule and experimental design before physical measurement. Staged six JavaScript compiler configurations from the frozen revision.

### Why

A fresh runtime measures cold compilation. Running four compilers in one firmware ties the reactor, build configuration, timer, and board to the same experiment. The Files leaf is a separate measurement of generated code executing on the CPU.

### What worked

Both independent generators produced the same control files. The candidate branch backend and the output-only variants can be built in scratch without modifying the production compiler.

### What didn't work

The first sandboxed staging run reported `spawnSync git EPERM` in the existing Node benchmark extractor. I retained the partial stage in scratch and ran the toolchain-backed build outside that restriction. The first detached backup launch created no output directory. A foreground serial session received `#OK hold` and began the verified read.

### What I learned

A shared baseline must include the world linker as well as the frontend and instruction selector. Measuring the complete ELF and the used code separately is essential with fixed reservations.

### What was tricky to build

The user-facing Editor startup path is also a convenient place to run clean and instrumented trials. The driver runs its full series once per boot and then returns a real branch-built app to the loader on ordinary requests.

### What warrants a second pair of eyes

Check the guest code extraction, signed comparators and ELF relocation identity. Review the boundaries between setup, lowering and teardown in the allocation account.

### What should be done in the future

Qualify outputs on hardware, collect the reviewer’s independent results, and publish the derived decisions.

### Code review instructions

Read the linked design first. Trace the six variant selections in `scripts/stage.py` into `scripts/editor-trials.c`. Compare each clean control file with the baseline at `6426798`.

### Technical details

The clean Editor runs use 4 MiB and 6,000,000 microseconds as hard limits. Four clean blocks cross four lane positions. Each phase-only lane runs twice, in opposite orders. Both guest Files bodies use the same C ABI and matched entry-address residues modulo 64.
