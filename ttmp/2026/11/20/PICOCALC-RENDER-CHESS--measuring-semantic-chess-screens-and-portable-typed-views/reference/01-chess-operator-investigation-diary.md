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

## Step 2. Get independent boards and correct pixels across the boundary

I replaced only the rendering entry in a separately compiled guest. The two guests independently launched, interpreted the same keys and timer replies, and reached Black's b8–c6 answer at wake 78. The candidate guest emitted its own pieces, legal rank masks and view decisions. A 64 KiB import-free view instance reconstructed the exact UTF-8 tree and hint bytes for every one of 47 screen calls.

### Prompt context

See Step 1. **Implementation checkpoint.** The premeasurement scope and researcher commission are in `5996d3e`. The implementation follows the parent ticket's division between game policy and picture construction.

### What I did

- Requested the independent Opus High design, retained its response and wrote the concrete operator contract before comparing candidate results.
- Implemented two separately compiled production Chess guest instances and a third unchanged A/A guest in `03-guest.mjs` and `07-replay.mjs`. Ten seed variants change only new-game initialization in each guest to exercise supported but rare branches. The normal opening uses untouched initialization.
- Implemented the actual JSON publisher, standalone typed renderer, pinned module loader, and retained generation with validate-before-replace. Exported all position seeds for a C board operator.
- Compared the exact unsorted tree bytes, hints, syscall scheduling, event returns and all 204,800 framebuffer bytes per screen. Restarted the receiver from retained bytes after every screen. Rejected five invalid records between two valid generations.

### Why

The game engine's transient working board cannot serve as a retained screen. The actual API gives each view its own memory and copies the 64 pieces and eight rank masks by value. The status enum gives priority to game outcomes. A separate promotion hint is necessary because footer and hint policy are independent from the selected heading.

### What worked

All 47 A/A and 47 A/resident raw RGB565 comparisons matched. Eleven scenarios and 127 events produced 46 changed posts, including a matched no-op deduplication. Promotion cancel/reopen and underpromotion, both white castlings, en passant, all four outcomes, negative evaluation, a live engine and stale timer replies were exercised. The virtual panel recovered a skipped changed flush at opening/003. The 46 changed outer posts totalled 178,955 generic bytes and 11,952 semantic bytes, passing the preregistered fivefold threshold.

### What didn't work

The initial sandboxed `scripts/02-commission.sh scripts/01-independent-design.txt` returned `API Error: Can't reach the API server — check your internet or DNS (ENOTFOUND)`. An approved network-enabled rerun from /tmp produced a successful response from claude-opus-5-5. The raw error was superseded by a compact identity/response receipt. `node .../04-screen-oracle.mjs ...` initially failed with `spawnSync git EPERM`. The approved local rerun completed. A preliminary attempt to add ticket files inside the sandbox failed with `fatal: Unable to create '.../.git/index.lock': Read-only file system`; the approved exact paths and `git commit --only` succeeded.

### What I learned

Including a full 64-digit artifact identity and both JSON wrappers reduces the measured ratio. Opus's 20–100× ordinary-size prediction did not hold over this entire mixture of starting and sparse positions. Some chess rules need no transferred state when policy decisions stay with the guest. The renderer requires destinations, while castling rights and the en-passant target influence those destinations on the producer side.

### What was tricky to build

0x88 square identifiers reserve half of each 16-slot rank. The packet uses dense positions 0 through 63 and sentinel 64. A rank mask stores the a-file in bit zero. The test checks physical squares after castling, en passant and knight underpromotion, in addition to the complete output picture. Sending stale search counters when the footer is invisible would defeat content deduplication; the publisher zeros the three hidden counters.

### What warrants a second pair of eyes

The outer frame byte counts use the exact native and kernel JSON punctuation in a host reconstruction. No allocator, queue, physical SPI or optical timing is inferred from those bytes. The virtual panel uses the director's shared renderer. A host equality result cannot release the production firmware.

### What should be done in the future

Measure resident costs through the parsed paint input. Exercise the byte-delivery and typed-source installs on identical modules after this pixel-and-size gate. The director now has the exact callable artifact and independent C fixtures for the physical WAMR run.

### Code review instructions

Run `node scripts/07-replay.mjs OUTPUT` from the ticket; use the lab's shared `04-screen-oracle.mjs` on its control, duplicate control and resident streams, with a skipped flush at zero-based index 3 on the resident. Run `python scripts/09-check-pixels.py OUTPUT`. Open `various/replay.json`, `various/pixel-gate.json` and `scripts/08-board-fixtures.py`.

### Technical details

Module SHA-256 is `63d752c673c41636e4951c0f9a95ba7b7f69f698d98ed723e39037a3bc7fb026` and size is 8,641 bytes. The standalone typed source is 6,408 bytes. Shared memory offsets 0, 160, 224 and 16,616 name the input board, nine signed integers, output tree and hint buffer. The first output is 4,835 ASCII tree bytes and 41 hint bytes with FNV-1a 0x01b474f2. The receiver admits only the known hash. This makes bounded trusted-specimen evaluation feasible on the host; general fuel metering and hostile source admission are unresolved.
