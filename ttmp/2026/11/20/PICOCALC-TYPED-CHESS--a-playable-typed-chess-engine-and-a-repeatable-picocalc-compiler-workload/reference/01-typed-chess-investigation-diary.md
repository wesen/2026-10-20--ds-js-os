---
Title: Typed Chess investigation diary
Ticket: PICOCALC-TYPED-CHESS
Status: active
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T00:33:58.010034231-05:00
WhatFor: ""
WhenToUse: ""
---

# Typed Chess investigation diary


## Step 1: Match the chess design to the shared typed-world reactor

The compiler requires an acyclic typed call graph. An explicit frame stack therefore represents the search independently of the representation of ordinary typed calls. Two existing shared reactor buffers can keep the visible position separate from the board that currently has a speculative search move applied.

### Prompt Context

The supervisor assigned a playable typed orthodox chess world with a bounded, nontrivial engine, dual-target validation, measurement, a newcomer design and publication. The user emphasized that the engine should not be entirely naive.

### What I did

- Read the shared typed-world ABI, buffer capacities, C slot linker and Editor event idioms.
- Designed an explicit-stack iterative deepening engine, legal rule path and timer-driven UI.
- Confirmed the source can use the shared generic reactor on both targets.

### Why

Using the same application ABI as Editor lets the compiler qualification treat Chess as another real source workload. The game requires no C move generator or C search code.

### What worked

The shared reactor offers two 65,536-unit buffers, key-event text, JSON screen transport and an SDK yield timer. The function signatures match the app wrapper and source assembly conventions.

### What didn't work

The local Python interpreter initially reported `ModuleNotFoundError: No module named 'chess'`. Published independent perft vectors supply a reference, and a separate optional oracle can be installed only if needed.

### What I learned

Typed source uses one-word buffer accesses and arithmetic rather than a general object heap. Dense packed moves and a mailbox suit the representation.

### What was tricky to build

Castling safety and en passant expose attacks that depend on temporarily changing the board. One make/unmake implementation should serve perft, UI legality and engine search.

### What warrants a second pair of eyes

Check the search caps and exact in-check quiescence behavior, snapshot restoration, and the draw rules admitted by the UI.

### What should be done in the future

Calibrate the timer slice on the physical board after host qualification.

### Code review instructions

Open the intern design, then trace a move from its encoded word through the reversible position update.

### Technical details

The engine uses source functions in `picocalc-os/worlds/chess` and the generic `typedWorldMeta` and `typedWorldEvent` entry points.

## Step 2: Build reversible rule handling and the explicit search stack

The six Chess files in commit **4e49fe9** share one move generator and one reversible position representation. An independently generated fixture suite and a separate Opus 4.6 High design were available before this host gate.

### Prompt Context

See Step 1 for the supervisor's summary of the user request. The follow-up assigned fixed-budget tactical search, preserving correctness at checked quiescence leaves and keeping engine code inside the typed subset. The exact original user text is unavailable in this implementation thread.

### What I did

- Implemented the mailbox and compact moves in position.typed and moves.typed, search in search.typed, and event/UI code in chess.typed and view.typed.
- Reviewed the independent [Opus High discussion](../various/opus-search-design.json) about stand pat, interrupted deepening, and an optional transposition table.
- Read the pinned Python fixtures and added Kiwipete as a separate published perft vector.
- Ran **node scripts/03-engine-oracle.mjs GCC EMULATOR** from the repo root with the linked paths in the [reproduction guide](03-reproduce-chess.md).

### Why

The compiler rejects recursive functions, so the frame needs an explicit move cursor, window and pending child. Position undo allows the app to store one search board instead of a board copy per child. A node budget gives a reproducible comparison across compiled targets.

### What worked

The engine matched 6,981 returned words across Wasm and streamed RV32. Initial perft was 20/400/8,902. Kiwipete was 48/2,039. The complete legality lists included castling through check, pinned en passant, legal en passant, all four promotion siblings, and both checkmate and stalemate. The poisoned pawn changes from d1d5 at depth-one material to f2f4 after activity and quiescence. The quiet mate in two is d6c7 at depth 3 with +29,997 and 1,344 visits. Both mates in one scored +29,999, and exhausted one-node budgets retained legal fallbacks. [Exact engine oracle](../various/engine-oracle.json)

### What didn't work

No failing legal-count or tactical assertion remained. Earlier initial-position depth-four debug perft returned 197,281 under Wasm. The committed dual-target suites use depth three for the opening and bounded specialty depths to keep the emulator run short.

### What I learned

At a quiet leaf, first establish that one legal move exists before considering stand pat. This detects stalemate. For checked leaves, all legal evasions remain available. At their hard quiescence cap the engine evaluates the resulting position directly after each legal evasion.

### What was tricky to build

The buffer stores unsigned 16-bit words. Scores are biased by 32,768, and the full search window fits within stored values. The root records only finished iterations. When the budget stops a child traversal, the pending move at each parent must be undone before returning control.

### What warrants a second pair of eyes

Read the draw-scope paragraph in the article alongside chessOutcome. Review behavior at the hard quiescence cap and the use of deterministic tie breaks in ordered move lists.

### What should be done in the future

The targeted fixture comparison establishes concrete tactical behavior. A stronger comparative claim would need a broader independently scored puzzle set or separately measured match series with the same time and memory limits.

### Code review instructions

Trace chessMake and chessUnmake first. Then read chessPrepareNode, chessSearchStep and chessCompleteNode in that order. Run the engine oracle and compare its JSON to the frozen evidence.

### Technical details

Application search allows up to four full plies and 1,600 counted node starts. The perft and search oracle exercise the same buffer paths, verify exact restoration of all 135 position words, and compare streaming and buffered RV32 compiled bytes.

## Step 3: Cross the real reactor boundary and arm the physical replay

The linked SDK replay exercises the actual typed reactor in each target. The P4 production integration is opt-in and follows the existing bundle and shared linker path. The board clock and timing observer live in an isolated firmware build under /tmp.

### Prompt Context

See Step 1. The supervisor requested one short board script covering launch, a human move, deterministic reply, counters, separate timing boundaries, and restoration under the existing flock. Production firmware integration and first host receipts are in **a08f71f**.

### What I did

- Added both firmware selectors, a Chess manifest entry, and the small generic compiler caller in chess_p4.c.
- Ran the WAMR launcher replay, inspected the reply image, and used cmp to confirm the reset and opening captures were identical.
- Ran the linked replay against actual Wasm and the P4 shared module loaded in the CJI emulator.
- Staged an observer with **python3 -B scripts/10-stage-board-chess.py --output /tmp/picocalc-chess-board-rv32 --idf-export /home/manuel/esp/esp-idf-5.4.2/export.sh --target rv32**, then validated the result with the no-port preflight.

### Why

The raw instruction test cannot catch event or SDK integration errors. The shared reactor proof includes text input, frame output and timers. The physical observer times only the key event through the final retained frame, and serial screenshot traffic starts after that boundary.

### What worked

The linked targets matched all 98 events and 18 retained screen payloads. After e2e4 both produced b8c6, depth 3, score +12, 1,600 nodes and 78 timer settlements. Stale reset tokens were ignored, and a failed timer preserved legal play. The uninstrumented Wasm launcher displayed the same reply and reset its app to the original screenshot. Firmware staging compiled 4,179,168 bytes and the preflight verified the image and original app backup digests, as well as the partition table.

### What didn't work

The first linked replay passed the shared object to the CJI emulator as chess.elf. It reported **not an rv32 relocatable object**. This emulator selects its ET_DYN module loader only for the .so suffix, so the same bytes worked as chess.so.

The first host keys script ended with **worlds** and the host script runner said **line 14: unknown command worlds**. Removed the board-only command and reran the launcher replay.

The first ESP-IDF staging clone tried to load ignored **sdkconfig.agent-elf** from the copied tracked files. It reported **FileNotFoundError: [Errno 2] No such file or directory**. Added the explicit SDK config parameter with the existing checkout config as the default, used a new build directory, and reran.

### What I learned

The bounds on node starts and frame steps serve distinct purposes. The linked trace gives 78 real wake events for this opening reply because a visit may require several frame steps.

### What was tricky to build

Writing to synchronous UART inside search would shift wall time and compete with display capture. The observer stores counters after the white frame, tracks total world time, then emits one record only after the last measured segment. The kernel rendering time records retained frame handling, while app frame encoding stays part of engine time.

### What warrants a second pair of eyes

Check that portrait display capture and the app-partition restoration stay outside the observed Chess window, and that the native renderer frame payload retains the score exactly.

### What should be done in the future

The board replay is scheduled with the supervisor. Record observed timings and the hash-verified restoration in the article once the run completes.

### Code review instructions

Start at typedWorldEvent, then take the deterministic event record from the linked replay and the disjoint boundaries documented in [the repro guide](03-reproduce-chess.md). Compare the staged manifest's Chess engine selector and source path.

### Technical details

The packaged image is /tmp/picocalc-chess-board-rv32/image/picocalc-os-p4.bin and its SHA-256 is **525f997b926b5fccd7da276a189e1d8bcc6b21e083490217e79c097e0c5aa529**. The original 8 MiB app partition hash is **6b0e3ba4a2d4546b5eeae3a608c82b3b0df06034afc5afedcc1e3e264d0b883f**.

## Step 4: Measure the compiler and event handler on separate host clocks

The timing harness uses one QuickJS process per compilation and a fresh Node/Wasm reactor per event series. Compile script setup now follows the device loader's order and only loads RV32 emission in the RV32 lane.

### Prompt Context

See Step 1. The measurement request distinguishes compiling the typed source from running the engine and creating frames.

### What I did

- Ran **bash scripts/13-measure-host.sh REACTOR_ELF /tmp/picocalc-chess-host-final-measurements.json** at compiler checkout **d3e7c7d**. The driver times compileTypedWorld and compileTypedWorldRv32 and captures the linked module sizes.
- Recorded nine fresh QuickJS CPU samples per target and nine Node event timing series.
- Rendered the figure from the raw data using scripts/14-plot-host.py.

### Why

Compiler setup is relevant to cold application starts and search work is relevant each turn. Separate clocks also expose how the final search wake includes encoding the engine reply frame.

### What worked

Median source-to-module CPU times were 30.74 ms for Wasm and 41.05 ms for RV32. Setup medians were 6.38 and 7.24 ms. Their artifact sizes were 73,204 and 240,452 bytes. In Wasm the first board frame took a median 0.54 ms, the white move and frame took 0.24 ms, and the 77 search-only wakes totaled a median 7.33 ms. [Raw host samples](../various/host-measurements.json)

### What didn't work

A preliminary driver loaded the RV32 script in both QuickJS lanes and used the legacy prepass loading order. Changed the staged driver to mirror the production runtime and reran all samples. The earlier numbers are superseded.

### What I learned

The linked RV32 file includes the entire shared ELF slot. Its length answers a packaging question. The image size cannot directly answer how many instructions Chess itself emits.

### What was tricky to build

Node reports wall time for the guest event and SDK work, while QuickJS process CPU excludes time unavailable to the process. Both capture different operations. Keep compositor and panel terms outside the Node clocks.

### What warrants a second pair of eyes

The nine samples describe this host at this revision. Cross-reference the hardware scope and source digests before comparing them with other runs.

### What should be done in the future

Chess should use the exact same source, replay and score when added to a broader compiler experiment. Compare compiler variants within the same host or hardware lane.

### Code review instructions

Open scripts/13-measure-host.sh and trace the two separate clocks to scripts/13-compile-chess.js and the timing-only path in scripts/07-chess-world-oracle.mjs. The analysis figure is produced from the saved JSON.

### Technical details

The compiler clock includes source parse, code emission and linked-module construction. Setup covers loading the compiler source into an already created QuickJS runtime. The linked Wasm event clock starts after marshalling the event buffer and stops when the reactor returns.

The follow-up source overlay in the engine oracle changes only the quiet-leaf capture extension. The activity-aware control takes the defended pawn d1d5 at +456 with 25 visits. Restoring the extension chooses f2f4 at +342 with 26 visits. Ordering and checked evasions are held constant. A separate exploratory Wasm comparison used Python chess 1.11.2 with seed 20261120, 24 random legal playouts capped at 90 plies, and samples at ply indexes congruent to 4 modulo 5. Move lists were sorted by UCI before selection. The 432 sampled positions matched every legal UCI and all 415,182 depth-two leaves. The committed executable oracle remains the 13-position dual-target qualification.

## Step 5: Trace checkmate from the board position to the visible winner

The engine had chosen and scored mates correctly, but the UI’s result code interpreted the side to move as the winner even though that side was checkmated. Commit **634105f** corrects the displayed color and tests the actual production outcome and rendering functions.

### Prompt Context

See Step 1 for the playable-app requirement. The supervisor authorized pausing and requeuing the waiting Chess job so the physical run uses the corrected firmware.

### What I did

- Applied the oracle's two known mating moves to the actual typed position and captured the label emitted by chessAppendStatus.
- Updated chessOutcome to return the opposing color when the side to move has no legal move and is in check.
- Reran both oracle scripts and repeated the nine host measurement samples and launcher replay on the corrected source.
- Stopped only the waiting physical-chess session. Rebuilt its cached, isolated ESP-IDF project and restarted the queue behind the ongoing Editor campaigns.

### Why

The engine outcome and the text on the screen are two different contracts. A correct mate score does not verify the named winner. Evaluating the emitted status after each color's mating move exercises the result mapping itself.

### What worked

The UI reported White after e1e8 and Black after e8e1. The 6,981 engine words and 98 linked-reactor events still matched across targets. The existing opening screenshot and the rerun were byte-identical. The fresh host compile medians were 21.63 ms Wasm and 30.44 ms RV32. The earlier timings in Step 4 are historical. No compiler file changed between the host measurements.

### What didn't work

Before the fix, **node scripts/03-engine-oracle.mjs /usr/bin/gcc /usr/bin/false** reached the Wasm status assertion before it invoked either placeholder process. The diagnostic was **AssertionError [ERR_ASSERTION]: mate-in-one**, actual **Checkmate - Black wins**, expected **Checkmate - White wins**. The same test then passed with the real GCC and emulator paths.

### What I learned

The board's turn flips during chessMake. By the time chessOutcome examines it, the side with no reply is the losing side. The game state codes identify the winner.

### What was tricky to build

The original board queue was asleep. Replacing its firmware safely required pausing that queue before updating the file, running the same partition preflight on the rebuilt binary, and restarting with the same shared lock after ensuring no physical Chess run had started.

### What warrants a second pair of eyes

Check that the receipt's final source digest agrees with both linked modules and that the UI regression test applies real reference moves before checking the label.

### What should be done in the future

Keep both color fixtures in the engine-to-UI gate.

### Code review instructions

Start with chessOutcome in chess.typed, then inspect the render mapping in view.typed. The checkout-ready oracle test and physical command are in the reproduction guide.

### Technical details

The corrected physical firmware SHA-256 is **6b2acb8523eeb874ce94a7f1da33380571c08e2d73f27cf67d57be3ea619e707**. Its source SHA-256 is **871c60f88cd8365e263f057cd68e07a22fb283dea6a53602cb9365994514fff3**. Dry preflight matched the existing backup and partition table. The probe script logs the measured firmware digest in physical.json.

## Step 6: Isolate a UART capture failure from successful physical compilation

The first native physical attempt installed the corrected Chess image and recorded successful source compilation on startup and reboot. The board restored the factory image after the console capture ended mid-JSON before the key replay.

### Prompt Context

See Step 1 and the physical replay handoff in Step 3. The supervisor asked to preserve the partial failure, correct the capture, and queue a retry after the portable Editor workflow and Find runs.

### What I did

- Parsed both Chess compiler records in the first physical boot log and recorded them alongside the actual backup and factory-world restoration proof.
- Split the boot sampling window from the world-list query in scripts/11-run-board-chess.py.
- Added bounded retries for the complete world-list response, recorded the compile before querying the list, and moved the restoration query after a separate settling capture.
- Queued the retry with the same verified firmware and serial lock behind the two reserved Editor sessions.

### Why

The UART bounds are fixture infrastructure. A partial catalog response can hide a working application and shouldn't erase a measured compile that ended earlier. Separate captures also leave the eventual move clock free of unrelated UART writes.

### What worked

The physical native compiler completed at 1,897,047 and 1,897,129 µs. Both boots reported 1,298,116 bytes of peak QuickJS heap and 240,452 bytes of linked module. The operator tool reported the hash of the restored factory app partition verified, and the restored Files, Editor and Agenda worlds returned without startup errors. [First attempt receipt](../various/physical-first-attempt.json)

### What didn't work

Running scripts/11-run-board-chess.py under the existing serial flock sent worlds in the same 19-second capture as reboot. That buffer ended after 5,364 characters of the catalog document. Python reported **json.decoder.JSONDecodeError: Unterminated string starting at: line 1 column 5358 (char 5357)** before the script opened the app. The partial receipt therefore contains no search timing.

### What I learned

An automatic startup and a requested reboot can both arrive in one serial capture. The last compile marker identifies the explicit reboot in this run. The large worlds response belongs in a separate window after the launcher finishes booting.

### What was tricky to build

The restoration path runs when the qualification fails. After flashing the factory image, the runner needs a second independently established world-list response and the flash tool's hash verification before the receipt can set restored.

### What warrants a second pair of eyes

Check that the retry uses the identical firmware SHA-256 and that it records the compile even if a later UART step fails.

### What should be done in the future

Keep world-list and screenshot serialization outside the measured play interval. Respect the existing board lock when repeating the run with a Wasm image.

### Code review instructions

Read complete_world_list and query_worlds in the board runner. Compare the bad response length and both native compile stamps in physical-first-attempt.json against the retained console logs.

### Technical details

The last compile stamp before the failed world-list read was 1,897,129 µs. The retry keeps compile setup and teardown in the same source-to-module clock. Its Enter-to-reply measurement ends before requesting the UART screenshot.

## Step 7: Measure the opening exchange on the ESP32-P4 and restore the factory app

The second physical run used the same native observer image after separating boot, world inventory, play and screenshot capture. The game exactly matched the linked host trace and the subsequent restoration passed.

### Prompt Context

See Steps 1, 3 and 6. The supervisor asked to report the native-only physical scope, exact clocks, move, score, completed depth, nodes and restored original.

### What I did

- Waited for both reserved Editor campaigns to release the shared serial lock and ran the revised physical command from the reproduction guide with output under /tmp/picocalc-chess-physical-retry.
- Captured a complete settled world list, opened the launcher via F1, selected Chess via H, committed e2e4, and saved the one observer report after the reply.
- Verified the CRC screenshot, the factory reflash hash and the restored world list before freezing the physical receipt.
- Commissioned a fresh Claude Opus 4.6 High interpretation using the original design, independent legal fixtures, host counters, early capture failure and restored physical results.

### Why

The hardware run shows that the ordinary native world can compile, play and return its frame on the actual board. The observer preserves elapsed and CPU clocks independently because they answer different questions. UART screenshot and factory restoration occur after the measured reply.

### What worked

Native compilation measured 1,897,746 µs with 1,298,116 bytes of peak QuickJS heap and 240,452 linked module bytes. The reply was b8c6, score +12, completed depth 3, and 1,600 visits. There were 79 Chess segments including 78 timer settlements. Enter-to-white-frame elapsed time was 3,147 µs. Enter-to-reply reached 472,922 µs. Chess CPU was 258,777 µs, including 250,684 µs of engine work and 7,990 µs of kernel rendering. The screenshot passed CRC and showed the reply. The reflash reported hash verification and the restored factory catalog had native Files, Editor and Agenda without errors. [Physical receipt](../various/physical-rv32.json) · [Exact serial markers](../various/physical-rv32-clock.txt)

### What didn't work

No retry failure remained. The earlier boot-catalog truncation is retained in Step 6. The physical characterization consists of one completed RV32 exchange.

### What I learned

The elapsed time remaining after subtracting app CPU was 214,145 µs. The observation attributes it to time outside measured Chess segments. It does not identify individual scheduler or display contributions.

### What was tricky to build

The first Chess segment starts when the actual Enter reaches the world. Capturing a reply after rendering its JSON is a different boundary from the first physical pixel change. An observer next to the kernel segment accounting can verify both application boundaries without printing while the search is running.

### What warrants a second pair of eyes

Check that the host and device digests in physical-rv32.json and host-measurements.json identify the same app source and reactor. Cross-check the exact observer fields with the replay's output and the article's millisecond conversion.

### What should be done in the future

A qualified physical Wasm comparison can use the optional Wasm build lane and the same e2e4 event and observer. The committed numbers are native RV32 device measurements alongside both targets' host evidence.

### Code review instructions

Read the capture and restoration path in scripts/11-run-board-chess.py, then the observer's before/after hooks in scripts/09-chess-observer.inc. The world source contains gameplay and app rendering. The hooks belong only to the isolated measurement build.

### Technical details

Restoration verified 8,388,608 bytes of the original app partition. The confirmed screenshot SHA-256 is **cf28ae004e436c997b8311a758fa5f63fb0558373fd534315716a35e96da445b**. The final raw records and all digests are preserved in the ticket.

## Step 8: Publish the experiment and preserve the independent review

The independent post-experiment response returned from Claude Opus 4.6 High after 558,108 ms. Commit **666a437** archives the genuine CLI response, article and dated diary. The top of the independent article explains where its interpretation extends beyond the records.

### Prompt Context

See Steps 1 and 7. The supervisor commissioned a follow-up interpretation by the Opus High model that produced the design and asked for its own signed article, dated diary, raw receipt, and publication alongside the implementation report.

### What I did

- Ran **python3 -B scripts/15-independent-interpretation.py /tmp/picocalc-chess-opus-review various/opus-interpretation.json** with the complete earlier design and verified aggregate host and physical evidence.
- Verified the returned model ID and success flag, reproduced both Markdown bodies verbatim, and attached separate editorial evidence notes.
- Published the main article, independent article and dated diary with four figures in go-go-parc and delivered the combined reMarkable bundle.

### Why

An independent interpretation can reveal gaps in validation and determine which predictions need more data. Preserving the raw response and marking the implementation team's corrections makes source attribution and the metric boundaries checkable.

### What worked

The vault push succeeded as **bff7217ed2cb2f4e099ba85e4d67430dd829a267**. The reMarkable CLI reported a successful upload to **/ai/2026/11/20/PICOCALC-TYPED-CHESS/PicoCalc Typed Chess - Engine and Physical Results.pdf**. [Delivery receipt](../various/publication.txt)

### What didn't work

The initial vault copy preflight returned exit 1 because the supervisor's prior publication already contained chess-physical-reply.png. A byte comparison matched the two images exactly. The final copy reused the published image and staged only six new files.

Some raw Opus conclusions also needed correction. The defended target was a pawn, the quiet move Ke6 did not capture, and the full suite included a thirteenth position outside the supplied excerpt. The evidence cannot yield per-iteration branching factors or isolate search throughput from frame work. The independent article's evidence note marks these distinctions rather than altering the authored text.

### What I learned

The most direct evidence for comparable runtime behavior is the exact linked-world replay and the physical event counters for the same position. Raw inference needs to preserve the difference between those results and the separate initial-position engine fixture.

### What was tricky to build

The independent article and diary use their own authored Markdown preserved under the ticket. The published copies link to each other and embed the figures while the study links to the frozen source and receipts.

### What warrants a second pair of eyes

Review the source-linked physical table when using the independent article's latency or throughput discussion. The published native rate includes the engine's event and frame work.

### What should be done in the future

The reMarkable upload receipt verifies cloud delivery. The native board result and published paths are permanently recorded alongside the tests.

### Code review instructions

Inspect the structured receipt and compare the Markdown after each editorial note with its corresponding response field. Review the vault commit for only the published notes and their images.

### Technical details

The recorded review model is **claude-opus-4-6** at **high**. The frozen prompt SHA-256 is **fd0135ad9899ae7d7612639e1422f6f5cc203e5cabd802a6b4a8dd87491c822b**. [Raw author receipt](../various/opus-interpretation.json)

## Step 9: Leave the playable firmware installed

### Prompt Context

“you don't need to restore the original firmware, we can just run the latest firmware with all the cool new stuff.”

### What I did

Built the offline production firmware from b1cbfa1 with the streaming compiler, four native typed apps and physical display and keyboard drivers. Checked the partition map, flashed the application at 0x10000 over /dev/ttyACM0, then queried the running firmware. Sent F1 followed by h and captured the opening position. Left the board in Chess.

### Why

Restoring the pre-study image after a benchmark removed Chess from the user's launcher. Everyday use requires a persistent playable installation.

### What worked

The running image reported Chess, Editor, Agenda, Files, keyboard and display as native with empty error fields. The first capture passed its CRC. Visual inspection showed all 32 pieces in the opening position, White to move, and e2 selected. [Device receipt](../various/playable-installed.json) · [Framebuffer](../various/chess-installed-screen.png)

### What didn't work

The previous firmware lacked the expected launcher experience. This installation completed successfully.

### What I learned

A live world list establishes which programs loaded. Opening Chess from Home and reading its rendered frame also verifies the launcher binding and initial UI.

### What was tricky to build

The benchmark workflow restores its control image. The everyday installer reuses its flash and capture routines and ends after opening Chess.

### What warrants a second pair of eyes

Serial key injection exercises the software input path. The operator can confirm the physical keys and LCD directly.

### What should be done in the future

Use the playable installation recipe after experiments that leave a different image on the board.

### Code review instructions

Read scripts 16 and 17 alongside the everyday installation recipe in reference/03-reproduce-chess.md. Compare the expected manifest paths with the live receipt.

### Technical details

The receipt records the application and screenshot SHA-256 digests and the source revision. Wi-Fi was disabled for this build. Only the application partition was flashed.
