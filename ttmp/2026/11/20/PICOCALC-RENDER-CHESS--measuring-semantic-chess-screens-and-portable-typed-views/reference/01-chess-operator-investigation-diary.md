---
Title: Chess operator investigation diary
Ticket: PICOCALC-RENDER-CHESS
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:07:24.198504427-05:00
WhatFor: ""
WhenToUse: ""
---

# Chess operator investigation diary

## Step 1. Commission the design before measuring

I opened a child ticket for the Chess experiment and asked the independent researcher to predict which side of the boundary should own game policy, what to count, and what would disqualify a result. The reference system already emits a complete tree; the new producer must start with its own running game. Comparing two transformations of the old tree would miss both the cost and the meaning of extracting a position.

### Prompt context

**User prompt (verbatim, as relayed by the director)**

> research all this, also do chess, snake, system. 
>
>  
>   Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
>   Chose opus high for researchers
>   Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
>   analogies, see skill).
>    Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.

**Interpretation and inferred intent.** I own the Chess work package. The director owns device scheduling and publication. A usable result joins real source, repeatable evidence and an Opus-authored explanation.

### What I did

Read the compiler research index, parent design documents 04 and 05, the complete Chess world view and event handler, the SDK UTF-16/UTF-8 boundary, the native screen wrapper and the original Chess world oracle. Started the Opus CLI using `scripts/02-commission.sh scripts/01-independent-design.txt` from a separate working directory with an empty tool list.

### Why

Real selection can generate legal destinations and a search timer can publish a completed score. Those two decisions depend on mutable game state and belong in the producer. The receiver must reproduce every text label, highlight, hint and optional footer with the producer gone.

### What worked

Found a compiled shared reactor and a deterministic opening that completes Black's response on its 78th wake. The previous study provides tree/hint byte and hash receipts for six screens and makes clear where its measurements stop.

### What didn't work

The baseline captures only the tree and hints at the SDK boundary. It cannot identify framing costs or prove a semantic publisher is independent. Two distinct guest modules and an explicit framing implementation are needed for this study.

### What I learned

The ordinary render path writes selection markers into scratch and may call the check detector. A glyph-only Wasm probe cannot establish that a whole renderer is portable. Counted UTF-16 in the guest and UTF-8 at the syscall must be measured on their respective sides.

### What was tricky to build

The worktree contains extensive pre-existing staged moves. All commits for this study must use explicit ticket pathspecs and `git commit --only` to preserve other people's index state.

### What warrants a second pair of eyes

Check that any endpoint named in a timing explicitly includes or excludes event delivery, game policy, renderer instantiation, decoding and painting. The director owns the shared pixel oracle and its font and clipping behavior.

### What should be done in the future

Freeze the implemented experiment against Opus's predictions. Exercise both normal interaction and the rare promotion and terminal display branches.

### Code review instructions

Start with `scripts/01-independent-design.txt`; inspect the operation and size checks in `picocalc-os/sdk/typed/world.c` and the actual native framing in `picocalc-os/nucleus/native.c`.

### Technical details

Each input frame will carry an app identifier, view ABI, artifact identity and complete by-value state, with real serialized lengths. A retained repaint should start from those bytes after both guest heaps are unavailable.
