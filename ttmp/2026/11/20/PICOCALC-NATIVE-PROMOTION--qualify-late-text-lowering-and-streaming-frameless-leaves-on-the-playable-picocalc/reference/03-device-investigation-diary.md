---
Title: Device investigation diary
Ticket: PICOCALC-NATIVE-PROMOTION
Status: complete
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Physical preflight, matched ordinary release trials, verified rollback, and successful candidate handoff."
LastUpdated: 2026-11-20T20:01:06.925902032-05:00
WhatFor: ""
WhenToUse: ""
---

# Device investigation diary

## Step 1. Establish the installed firmware and measure ordinary cold builds

The handheld began on the published smooth-Chess application. I acquired the USB console, stopped between peripheral transactions, read back the installed application and partition table, then issued three ordinary reboot commands. Each boot supplies five independently reported compiler observations and one host-observed health endpoint.

### Prompt Context

**User prompt (verbatim)** “ok, advance both.” See the [director's investigation diary](01-director-investigation-diary.md) for the user-authored release request. This investigator received the following **delegated assignment (verbatim)**.

> Own board qualification and all serial use for this release. New ticket ttmp/2026/11/20/PICOCALC-NATIVE-PROMOTION--qualify-late-text-lowering-and-streaming-frameless-leaves-on-the-playable-picocalc. Begin now with actual installed (previous 134f3a24) ordinary release preflight, collect repeatable baseline app cold boot/compile timing and normally loaded PSRAM Chess fixed-work move (UI end-to-end with state/nodes if available) + Editor workflows editing using temporary safe scratch data, plus native health and painter. Make a meaningful baseline vs candidate using normal apps, capture observables and compare, distinguish guest vs UI time, no destructive user file edits. Preserve scripts, compact evidence and full diary under scripts/device, various/device and reference/03-device-investigation-diary.md. Once I supply built candidate path flash app only with hash/partition safeguards; leave latest qualified candidate on device if passes, restore verified ordinary release on failure. If device unavailable register evidence and coordinate. No source compiler edits. Commit your owned files; signal when baseline is running. I own official build/package. If additional targeted PSRAM fixed work is needed coordinate with me.

**Assistant interpretation** Verify the installed comparison arm, observe ordinary startup in both arms and qualify normal app behavior.

**Inferred user intent** Decide whether the production compiler can ship on an everyday playable handheld using repeatable physical evidence.

**Commit (code)** af8d35e — Qualify the installed PicoCalc and measure its ordinary Chess and Editor paths.

### What I did

The baseline runner verifies the application at 0x10000 and partition table at 0x8000 against files of known SHA-256. The device remains on its existing filesystem. Cold timing uses five production console records per reboot. The host also records monotonic elapsed time to the last compile line and to the successful native-world and painter queries. [Baseline runner](../scripts/device/01-baseline.py)

### Why

The compiler, native-world loader, painter installation and filesystem share a real boot. A desktop ELF or a dedicated research image would leave startup scheduling, on-device source, allocated compiler heap and this loading path unmeasured.

### What worked

All three boots reported successful Agenda, Files, Editor, Chess and mobile painter builds. The median baseline compile durations were 574.761 ms for Agenda, 273.617 ms for Files, 2,584.555 ms for Editor, 3,637.659 ms for Chess and 1,362.095 ms for the mobile painter. All eight required native worlds became healthy and the painter installed on one compile. [Baseline receipt](../various/device/baseline-cold.json)

### What didn't work

The first collector terminated with `AssertionError` in `assert not log and p['compiles']==1 and p['rejects']==0`. A deliberately denied demonstration reported `nat-import crashed: it links to path_open, which picocalc-os does not give a module`. I restricted the crash check to the eight ordinary native worlds and repeated all three boots.

### What I learned

The release intentionally exercises failing examples at boot. Its shipped workloads and native peripheral services have individual identifiers and status fields permitting a precise health predicate.

### What was tricky to build

A serial console constructor drains startup logs before use. Explicit reboot from an already-open console establishes the same observation boundary across all trials. The final five app records include the screen-message painter, whose source arrives separately from the four bundle compilations.

### What warrants a second pair of eyes

The compile durations and peak bytes come from the firmware compiler telemetry. The host readiness metric includes UART transmission, query time, scheduling and other boot tasks. Healthy worlds are tested by exact file, engine, state and error. [Compiler timer](../../../../../../picocalc-os/port/esp32p4/main/typed_p4.c)

### What should be done in the future

Use identical poll and restart conditions for the candidate and preserve the image that passed the ordinary release gates.

### Code review instructions

Review `cold`, `hold`, `esp` and `ready`, including the app-only write offset and the independent partition verification. The known release and candidate hashes must differ. [Shared console helpers](../scripts/device/common.py)

### Technical details

The old app digest is `134f3a249589a860a1a85311e361498a9e6ba4f14bef34ca2397ea26ca86ebc1`. The partition table digest is `72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30`. The expected worlds are compositor, snake, keyboard, display, files, editor, agenda and chess. The keyboard check observes live I²C transfer growth with equal error counters across a sampling interval.

## Step 2. Establish a repeatable visible move and an owned Editor document

I exercised a complete opening move in the real Chess application and compared the entire body and hint area of its framebuffer with an independent frozen render. The Editor workload creates its own directory and file in the existing filesystem, types and revises two lines, saves, closes, reopens and edits again. It checks the visible deletion prompt before removing either scratch entry.

### Prompt Context

**User prompt (verbatim)** See Step 1.

**Assistant interpretation** Measure computation and observable completion separately while preserving user files.

**Inferred user intent** Verify that generated code handles actual play and editing and quantify the effect on normal latency.

**Commit (code)** af8d35e — Qualify the installed PicoCalc and measure its ordinary Chess and Editor paths.

### What I did

For each Chess block I started a new game, selected e2, moved the cursor two squares, then timed the final Enter that submits e2e4. I sampled the painter for two more packets and two more paints, read the world's CPU accumulator, and compared the 320×298 body and hint area against the frozen b8c6 reply. The whole 320×320 transfer has its own CRC. For Editor I verified the prospective directory and alternative root file were absent, checked the Files path on screen, and used the normal Files and Editor keys throughout. [Workflow runner](../scripts/device/workflows.py) [Frozen match and reference frames](../various/device/reference)

### Why

The ordinary production console provides time and state for the whole Chess world, SPI byte counts and external framebuffer snapshots. The deterministic reference carries the board, selection, depth, node count and score associated with the expected pixels. The device can directly confirm only state that is rendered or exported. It does not directly print the engine's result tuple.

### What worked

The first three baseline moves each produced the b8c6 reply digest `5ebdc7118d57aac83f7fc5702dab8db5546d8a18e32a7c6c9dc9b8b28644c55b`, two additional painter calls to paint and 23,628 additional SPI bytes. Both saved file revisions were read back. The cleanup matched independently rasterized confirmation glyphs before deleting the file and its empty directory.

### What didn't work

The first second-save read returned `AssertionError: ('reopen', ['no file qcprobe7/qcheck7.txt'])`. A later read returned exactly `['alpha text', 'beTa7']`; the path can temporarily disappear during a save. I polled for the full expected content with a deadline. A repeat from an existing game then returned `AssertionError: initial-chess differs from opening`. F1 returns to the launcher while Chess retains its board, so I added a new-game F2 before checking the initial reference.

### What I learned

A sampled painter counter and the Chess world's accumulated time cover different boundaries. The first successful painter query is a conservative observable upper bound on body-paint completion. A separate screenshot checks the exact endpoint; neither UART observation measures the physical last panel scanline.

### What was tricky to build

Editor input takes the ordinary keyboard and compositor route. Each new save can publish asynchronously. Matching an exact file identifier in a red confirmation raster before deletion prevents selecting a different entry after Files refreshes its list. A second absent-path check confirms removal.

### What warrants a second pair of eyes

The host bracket spans the start of the previous unsuccessful poll to the end of the first successful poll. The Chess world delta includes other work in its single event turn. The numerical search fields come from independent reference execution, and equality of the rendered pose does not expose hidden device state. The director is separately measuring the isolated search.

### What should be done in the future

Pair the same receipt with a candidate produced by the ordinary build recipe, and retain the same RGB565 body fixtures and filesystem expectations.

### Code review instructions

Inspect the `play`, `match`, `edit` and `remove_owned` functions. Regenerate the two reference records with the frozen Chess camera harness and compare the decompressed bytes. [Reference game generator](../../PICOCALC-CHESS-3D--render-a-three-dimensional-chess-position-with-a-delivered-typed-painter/scripts/camera/01-match.mjs)

### Technical details

The first revision is `alpha text\nbeTa`; the second is `alpha text\nbeTa7`. The captured foreground body begins at row 22. The reference tuple's final three fields are completed depth 3, 1,600 nodes and score 12. Ordinary guest timing is the native Chess world's kernel CPU accumulator difference, with 0.001 ms presentation precision. SPI traffic covers the same interval plus the counter queries.

## Step 3. Check the official image against the ordinary startup notification

The director provided the compiled candidate and its SHA-256. I verified it against the supplied digest, checked the matching partition table and ran the release script. The first complete candidate boot series exposed a difference in observation time. Faster startup let the measurement reach the opening board while a stock diagnostic banner was still visible. The script restored the published image on that mismatch.

### Prompt Context

**User prompt (verbatim)** See Step 1.

**Assistant interpretation** Preserve the ordinary system image and verify the actual visible application before measuring its move.

**Inferred user intent** Keep the production device usable even when a qualification harness detects a difference.

**Commit (code)** af8d35e introduced the app-only qualification and automatic rollback. The follow-up changes the untimed wait for the opening pose.

### What I did

I compared the two failed opening reference images before changing any gate. The candidate showed the stock red `nat-import stopped after 5 crashes in 10 s` notification. A comparison of all 320×320 pixels put every difference inside x=4…315, y=26…86. I added a bounded observation period before the first timed move. It accepts the opening only when the entire 320×298 expected body and hint row match.

### Why

The desktop reference draws a settled Chess board. A timed system notification from an unrelated demonstration module shares the same compositor. Starting the motion clock with such a notification would mix system startup and game behavior.

### What worked

The initial installed release, candidate and rollback each had application and partition bytes checked with esptool. The candidate completed all five compilations on three reboots before the opening gate. The failure exercised the real rollback path without touching the filesystem.

### What didn't work

Before changing flash I noticed that an independent system log line could occur between the console's file-read lines. The first preflight was stopped after the old image had been verified and before any write. The readback parser now discards only the explicitly recognized filesystem timing record for this test file. On the next attempt the actual opening mismatch reported `AssertionError: initial-chess differs from opening`; the retained failed screenshot established the banner bounds. The test now waits for its expiry and compares every byte. The clock for move execution starts later.

### What I learned

Optimizing startup changes which asynchronous tasks and notifications are still active when the five compiler lines have arrived. A faster compiler does not imply a semantically different board. A screenshot with a banner is nevertheless a genuinely different screen, so the stable observation needs an explicit condition.

### What was tricky to build

The ordinary serial status commands, startup diagnostics and application payloads share UART output. Some text lines are application data. The filter recognizes the exact ESP-IDF filesystem timing syntax including the test path, then requires the remaining two lines to exactly match the expected document. A missing or extra data line still fails.

### What warrants a second pair of eyes

Review the opening wait's deadline, lower-body comparison and full final equality, and the rollback order. Waiting cannot change the input keys, expected pixels or timing of the subsequent move. The documented 5,000 ms is a system-banner duration and the bounded observer allows time for redraw.

### What should be done in the future

A future release with a different startup notification can retain the full equality gate and examine the complete failed snapshot to identify the cause.

### Code review instructions

Inspect `opening` in the workflow and the candidate runner's exception handler. The first failed physical screenshot preserves the unaltered notification. [Failed opening screen](../various/device/opening-with-boot-notice.png) [Candidate runner](../scripts/device/03-candidate.py) [Workflow](../scripts/device/workflows.py)

### Technical details

The attested candidate contains 4,331,776 bytes. Its app digest is `33b439d0a7bcdf85f01b373ed1ec71d654ce60d7079f2569fce4de859f29e813`. The release profile is built at revision `8052db721eda91720010867915b70064b33912f0`. The ordinary prior application contains 4,328,368 bytes. esptool verifies the 3,072-byte partition table separately from either application.

## Step 4. Qualify the candidate and release the serial console

With the steady opening pose established, the candidate completed the paired ordinary trials. The numerical comparison and screenshots below derive from the final three-boot run for each arm; the earlier rollback data remain separately identified.

### Prompt Context

**User prompt (verbatim)** See Step 1.

**Assistant interpretation** Leave the verified candidate installed when all ordinary release gates pass, then hand the board to the director for the separately instrumented PSRAM study.

**Inferred user intent** Preserve one usable production device and distinguish the game as experienced through its UI from a dedicated guest-code experiment.

**Commit (code)** 90bbfa1 established the stable opening predicate. This entry accompanies the final physical receipts.

### What I did

I repeated three explicit candidate software cold boots, three complete opening replies and the gated Editor create/edit/save/reopen/edit/save/remove sequence. The candidate runner re-read both flash regions after the workflow, reset the board, checked all eight expected native world filenames and states, verified one installed painter and sampled the keyboard bus. A separate offline check reconstructed all 102,400 RGB565 pixels from the retained candidate PNG, recovered the full UART framebuffer byte-for-byte and compared the 95,360-pixel app body with the independent reference. [Readbacks and image digest](../various/device/physical-readback.json)

### Why

Compiling and linking successfully does not exercise the normally loaded app, scheduler, backing store and display together. The director's independent workload isolates a narrower part of those costs. Measuring both boundaries provides an answer to different practical questions.

### What worked

Median Chess world CPU fell from 246.665 to 212.009 ms. The median upper observation of the second paint fell from 463.171 to 400.228 ms. The cold Chess compiler duration fell from 3,637.659 to 1,893.521 ms. From the normal Editor app, both file revisions and the edited screen matched across arms. After the final cold boot the keyboard was actively polling and the painter had compiled once with zero rejects. The application and partition table matched their expected flash bytes. [Final health](../various/device/candidate-final.json) [Paired measurements](../various/device/comparison.json)

### What didn't work

Files used 280.497 ms to compile on the candidate versus 273.617 ms on the prior release, a 2.5% cold slowdown. Its median tracked peak rose from 480,392 to 490,776 bytes. Each arm recorded one Editor save latency. The filesystem timings from these single saves cannot support an Editor speed claim.

### What I learned

Kernel world CPU is an elapsed-time account for segments of the Chess turn. External input, waiting between segments, a separate painter and the sampled UART completion boundary explain why the observed app repaint and the world's CPU cannot be treated as the same number. The module container remains fixed even where compiler time or peak compiler heap changes substantially.

### What was tricky to build

The system bar can change independently of the application and the startup demonstration can temporarily cover real game content. The target equality includes every visible app pixel and excludes only the top 22 system rows. Timed moves begin once a full opening match has established a settled board. The archival PNG is the entire physical framebuffer including that system bar.

### What warrants a second pair of eyes

Compare all three CPU deltas and both sides of every host poll bracket, including SPI-byte and paint counts. The operation is a fixed position in the same world under two firmware versions, with every old trial preceding every new trial. The hidden device search tuple cannot be obtained from the ordinary console; the visible result and the independent source/reference tuple have different provenance.

### What should be done in the future

The director has sole serial ownership for the complementary full-ELF search measurement and will return the board to this same qualified firmware. A broader UI study could vary positions and repeat Editor saves on a controlled filesystem.

### Code review instructions

Run the offline aggregation from this ticket without attaching a board.

```sh
python scripts/device/04-summarize.py various/device > /tmp/ordinary-comparison.json
diff -u various/device/comparison.json /tmp/ordinary-comparison.json
```

For an authorized physical replay on the prior ordinary release, use a checkout of this ticket and the corresponding complete ESP-IDF application and partition-table directories. These are the commands used on the research workstation, with new empty output paths for each run. The SHA checks protect the historical input and installed image, and the final command leaves the new application installed on success. Each arm's source files, release profile, and hardware budget came from the official build. [Build identity](../various/release/build.json)

```sh
P4PY=/home/manuel/.espressif/python_env/idf5.4_py3.11_env/bin/python
"$P4PY" -B scripts/device/01-baseline.py /tmp/ordinary-cold \
  --previous-build /tmp/chess-camera-release/build
"$P4PY" -B scripts/device/02-workflow.py /tmp/ordinary-baseline
"$P4PY" -B scripts/device/03-candidate.py /tmp/picocalc-native-promotion-rev1/build \
  33b439d0a7bcdf85f01b373ed1ec71d654ce60d7079f2569fce4de859f29e813 \
  /tmp/ordinary-baseline /tmp/ordinary-candidate \
  --previous-build /tmp/chess-camera-release/build
```

### Technical details

The candidate reply PNG has SHA-256 `68a0f3371728831784ad305ad16ddfcc0f66a77bf3452ec9a2f7d2d763a5ba57`; the RGB565 board and hint digest is `5ebdc7118d57aac83f7fc5702dab8db5546d8a18e32a7c6c9dc9b8b28644c55b`. Archive copies omit raw serial and RGB565 dumps. The browser-readable PNG uses a reversible expansion of each physical 5- or 6-bit color component to eight bits. [Ordinary device report](../analysis/04-what-changes-for-the-person-playing-chess.md)
