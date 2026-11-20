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

## Step 3. Price moving work and prepare the two intact guests for the board

The render gate from `730b8cb` opened the installation experiment. I ran the validated renderer as preinstalled code, as delivered bytes, and as delivered source compiled by the receiver. The semantic representation saves bytes early in the opening, but counting the receiver exposes a small endpoint gain on the host. The director requested the actual producer modules for a physical WAMR comparison; I supplied both and verified the same C harness under host WAMR.

### Prompt context

See Step 1. The director asked for a board-callable module, a QuickJS receive capsule and fixed producer trials through both real guests. Device access, image installation and restoration remain with the director.

### What I did

- Added a binary install header, a cache keyed by kind, ABI, compiler identity and content digest, allowlisted source revisions, and verified raw module identity. Compared M/S output against the A/A-qualified control through the shared rasterizer.
- Rotated the order of two unchanged controls and two distinct producers on 1,200 selected and 1,200 plain cursor pairs in each comparison. Timed the guest event, envelope construction, receipt through the parsed paint input, and whole path. Recorded all raw samples. Measured 35 repeated new-cache installs per delivery arm and 12 fresh Node processes for each of R/M/S. Added unrelated same-event-loop callback probes.
- Implemented a WAMR C fixture for the real whole-world producers. An instance-identity check in a disposable image forwards only the fixed test instance to a span capture. All other worlds continue to use ordinary kernel syscalls. The shared test input buffer stays outside the event clock. Generated real generic and semantic launch/left/right/select/left/right/deselect checksums.

### Why

The Node runtime can retain compilation caches across `new WebAssembly.Module`. A fresh installer inside a hot process and the first install in a fresh process answer different questions. Sending approved source also requires testing the source cache rather than assuming that deterministic compilation gives a cache hit.

### What worked

A binary packet costs 8,649 bytes and a source packet 6,416. In the observed opening both repay their entire install traffic by the second changed post. The three arms constructed the same 8,641-byte artifact in all applicable checks, and all 47 full framebuffer comparisons passed for each delivered arm. Hot R/M/S render p50 was 25.276/25.193/25.410 µs. Fresh-process first-tree medians were 1.787/1.936/7.031 ms. Selected-cursor median guest/capture work fell from 14.583 to 5.347 µs but receiver work grew from 28.062 to 37.404 µs. The complete paired saving was 1.024 µs. Both full producer modules passed 25 returned frames in the host WAMR smoke test.

### What didn't work

The first `node scripts/10-measure.mjs /tmp/chess-render-experiment` tried a source edit adding a trailing line comment and returned `SyntaxError: 154:1: expected function`. Moving the comment before the first declaration gave the same verified output bytes while changing the source cache key. The reproduction keeps this frontend limitation explicit. An early timing pass tied order to movement direction. The retained measurement uses the four-order sequence G/R, R/G, R/G, G/R and includes an A/A comparison.

### What I learned

An 18-post opening already saves 84,968 framed update bytes, so distribution size is material only for a short session. CPU cost is different. Behind the receiver the candidate still writes thousands of UTF-16 units, converts them to a string and parses a complete tree. The serial C fixture checks each complete byte stream outside the guest timer.

### What was tricky to build

Serving the two intact world binaries needs safe imports for the SDK metadata and screen calls. Re-registering process-wide imports could affect unrelated applications. The probe uses the currently running instance identity and checks each event's returned value, screen count, two lengths and content FNV. At 73,204 and 66,618 bytes the emitted modules both instantiate an eight-page initial guest memory, one at a time. The 16,504-byte capture buffer exists only for the trial.

### What warrants a second pair of eyes

The small host saving should not be turned into a time crossover guarantee, especially on a different runtime. The paired 95th percentile in the selected A/A series is +6.525 µs. Source compiles synchronously; a setImmediate callback wait is a host latency probe, and a P4 optical endpoint and physical key progress require additional instrumentation.

### What should be done in the future

The director owns physical procedure 15 and PC-side serial collection. When readings arrive, interpret producer, receive, WAMR view, install and checksum costs with their own clocks. Preserve the distinction between isolated physical components and shipping-game latency.

### Code review instructions

Run `scripts/17-run-host.sh FRESH_DIRECTORY`. Examine `various/host-summary.json`, `various/host-timing.json`, `various/cold.ndjson` and `various/raw-timings.json.gz`. Inspect `scripts/13-board-producers.mjs`, `14-board-producer.inc` and `15-stage-producer.py` before building a disposable image. The director has the stage and console instructions.

### Technical details

All timers use monotonic clocks. The host key window ends at a parsed ordinary tree plus hints, before the common painter. Distribution admission enrolls only an exact approved digest. The desktop test separates immutable source and Wasm bytes from the one 64-KiB view page. Host and WAMR wall time cannot be substituted for one another.

## Step 4. Replay generated middlegames against the frozen view

The original eleven scenarios deliberately exercised presentation branches. They left open whether the same view would remain faithful through long, ordinary histories with different move sequences. After freezing the specimen, I wrote a driver that observes only the control's painted white pieces and orange legal-destination markers, moves the real cursor, selects a legal move using a seeded generator, and wakes the existing engine for its reply.

### Prompt context

See Step 1. This extends the original corpus after the host artifact and protocol were frozen at `730b8cb`. Host timings, mobile checks and the board staging milestone are committed in `53696bf`.

### What I did

Ran `node scripts/21-generated-games.mjs /tmp/chess-render-generated` to generate twenty deterministic ten-move White sessions. The ordinary guest's output chose subsequent inputs. The candidate executed the same key and timer events in its independent memory. Rendered all 220 launch and settled positions using the common pixel oracle, then ran `22-verify-generated.py`.

### Why

Handwritten seeded terminal positions can cover rare headings while exploring few real game histories. A generator can cheaply exercise changes to many different pieces, overlays and search results. It should not derive a new state for the candidate, or certify its own decision about a drawing.

### What worked

20,109 events produced 2,433 complete, byte-equal screen trees and hints. The 200 White moves and engine replies produced 194 distinct piece placements among 220 launch/settled frames. All 220 full 320×320 RGB565 buffers matched. Fresh view instances independently reconstructed every saved position.

### What didn't work

No mismatch was observed. A corpus based on this engine's deterministic replies and a fixed move selector does not represent all legal chess games. It is an additional post-freeze test and carries no claim of independent sealed holdouts.

### What I learned

A square can be located independently from its display primitives: the cursor is the 24×24 outline and legal destinations are the 5×5 orange fills. If those primitives change, the driver needs review. The ordinary screen completely determines the inputs without access to candidate metadata.

### What was tricky to build

The generator must handle blocked white pieces, deselect them and try another. It must finish any promotion choice and wait for the exact sequence of engine promises before reading the next control position. The driver asserts cursor coordinates and timer termination.

### What warrants a second pair of eyes

The generator samples White's moves and the same Black engine always responds. Twenty games share the initial position. Using the 220 saved frames as a unique-position count would inflate coverage; the actual distinct piece-array count is 194.

### What should be done in the future

Use the director's single device experiment to learn which host costs transfer. A renderer integration would need live layout, scheduling and panel evidence in addition to these host game histories.

### Code review instructions

The final three commands in `17-run-host.sh` generate and evaluate the extension. Review `21-generated-games.mjs`, `22-verify-generated.py` and `various/generated-verified.json` for all chosen moves, wake counts and a single ordered digest of all compared raw pixels.

### Technical details

The xorshift32 generator starts from the first 32 bits of SHA-256 of the declared post-freeze seed string. After each accepted input, the checker compares the candidate's unsorted JSON and hint bytes with the real guest syscall. The 220 saved states additionally check reconstruction in a new instance.

## Step 5. Interpret the physical trials and check the article against the actual interfaces

The director tested the compiled specimen, locally compiled source, actual whole guest producers and incoming JSON parses on the ESP32-P4. I interpreted five interleaved blocks after confirming each block had every Chess arm. The director restored and verified the playable firmware. The native, unchanged application's one-key trace provides a crucial comparison: the current RV32 key event was much faster than the Wasm control producer used to isolate the representation.

### Prompt context

See Step 1 for the user request. The director supplied the supervised board session receipt and asked me to return the final Opus-authored report and figure. The extended generated-game evidence is in `5ed77d3`.

### What I did

Extracted Chess-only runs into `various/board-evidence.json` with `24-board-evidence.py`; verified all 35 relevant rows and the restoration field. Read the fixed board harness timing boundaries and captured the ordinary native Chess trace. Sent the independent researcher only aggregate measurements and the methodological context. Re-read the host chapters as a newcomer, corrected details against the code and rendered a three-panel figure from actual raw pixels.

### Why

Three independent sources of cost change under this design. The producer avoids formatting large JSON, the input parser reads a smaller document, and the view reconstructs an ordinary tree. A result measured at one clock cannot by itself predict the full native app. In particular, the physical isolated view returned UTF-16 output; turning it into an ordinary parsed drawing tree still costs work.

### What worked

The P4 produced 705 correct lengths and FNV-1a checks for 47 cases × 3 installation routes × 5 blocks. Both real game producers also checked 250 complete SCREEN events. Median-of-block-mean selected WAMR cursor cost went from 19.919 to 5.330 ms. The same standalone view cost about 3.49 ms per case after installation. Device setup (acquisition plus WAMR installation, before first output) measured 16.993 ms resident, 21.666 ms delivered bytes, 377.699 ms locally compiled source. The original playable firmware was restored and verification found Chess running with the native backend and no error.

### What didn't work

The isolated board pipeline does not combine the prototype producer, kernel retention, renderer, parser and LCD path into one live application. There is no measured native-candidate end-to-end speedup. The initial physical attempt 01 produced zero Chess trial rows and is excluded; the director completed all relevant arms in session 02. The host article's first draft had check status precedence reversed and attributed dropped-flush recovery purely to complete snapshots. The operator corrected both against the production function and shared raster driver before publication.

### What I learned

One live unmodified RV32 Chess key segment measured 1.790 ms. It would be impossible to take the more than 14 ms saved in the separate Wasm producer and subtract it from this observation. The source arm did validate byte-for-byte on the board, so the same generated program can be installed from either representation. The recurring cost is its isolated invocation and consumption, independent of how its bytes arrived.

### What was tricky to build

The board hash is FNV over low ASCII bytes of the verified-length UTF-16 output, while the host pixel check compares actual framebuffer arrays. The article reports each endpoint explicitly. The live draw includes its graphics commit; adding both would double-count. The checksum phase lives outside the isolated renderer's timer.

### What warrants a second pair of eyes

The compiler's 6 MiB cap is a limit, not a measured peak. The five blocks share one boot and one physical board. The actual interactive compositor uses native code; the separately measured QuickJS parser is a component experiment. No physical candidate key-to-panel, unrelated-input-during-compile or optical latency was measured.

### What should be done in the future

Integrate a bounded consumer with real native RV32 Chess, run the same key traces with the existing full painter and a draw/flush observer, and time each stage including decoding the generated output. Qualify any source installation with an explicit scheduling measurement outside the paint turn.

### Code review instructions

Read `analysis/01-what-crosses-the-screen-boundary-when-a-chess-cursor-moves.md`, `various/board-evidence.json` and `various/native-chess-trace.json`. Compare timestamps to the shared supervised lab's board C harness. The figure generator uses the two labeled ordinary control framebuffers and asserts an exact 274-pixel difference.

### Technical details

The experiment image SHA-256 was `5172a38b98f5c3eed57bc4b6a7a1c33950ea955749e9cb099a0971dd6f67368a`. Restored app SHA-256 was `f12e2f5d6e668ef7d61fa456b69b56bf9f1e976e929672e7df81ac33a2f03f83`. The source-trial compiler evaluated typed source and the real standalone compiler on the board and compared the output byte-for-byte with the bundled reference before entering the same WAMR invocation path.

### Independent install and keyboard admission follow-up

The director subsequently supplied five single-frame installation trials per arm. A serial F1 acknowledgment took a median 6.315 ms idle and 398.812 ms alongside a source install, versus 40.595 ms resident and 44.157 ms for a delivered module. The article includes these new measurements and distinguishes admission from key-to-panel latency. I retained the twenty underlying measurements and per-frame component timings in `various/competing-key.json`. This updates the open question on the five-block run; user-visible competing-key response remains unmeasured.
