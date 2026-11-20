---
Title: Independent replay and rendering correctness diary
Ticket: PICOCALC-SNAKE-INTEGRATION
Status: complete
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-SNAKE-INTEGRATION--ship-semantic-snake-snapshots-and-changed-cell-painting-on-the-picocalc/scripts/replay/03-gfx.c
      Note: N-API bridge to real C graphics primitives
    - Path: repo://ttmp/2026/11/20/PICOCALC-SNAKE-INTEGRATION--ship-semantic-snake-snapshots-and-changed-cell-painting-on-the-picocalc/scripts/replay/06-host-results.json
      Note: Final host qualification receipt
    - Path: repo://ttmp/2026/11/20/PICOCALC-SNAKE-INTEGRATION--ship-semantic-snake-snapshots-and-changed-cell-painting-on-the-picocalc/scripts/replay/10-opus-provenance.json
      Note: Model, effort and digests for each external research contribution
ExternalSources: []
Summary: Operator and Opus research provenance, baseline reproduction, lifecycle and refusal evidence, and qualification boundaries.
LastUpdated: 2026-11-20T00:00:00Z
WhatFor: Reconstruct the evidence behind the host Snake integration qualification.
WhenToUse: Changing Snake admission, drawing, retention or flush recovery.
---

# Independent replay and rendering correctness diary

## Step 1. Establish which images need independent checks

I took responsibility for host correctness. The director owned the production game and compositor edits. The hardware researcher separately owned the physical board. I requested the independent Opus High research design using a short description of the problem, then examined what the old checkout and its historical corpus actually contain.

### Prompt Context

The user wrote “ok, then do snake.” The follow-up request was

> write a report when done for snake, delegate to the usual combo.
>   Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
>   Chose opus high for researchers
>   Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
>   analogies, see skill).
>    Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.

I interpreted this as a production integration with an independently reproducible regression check and a teaching article. The director assigned publication of the coordinated vault edition to a separate step. [Director’s original prompt entry](01-director-implementation-and-integration-diary.md)

### What I did

I read the old producer, the compositor paint and dispatch path, the shared C raster, the normal framebuffer bindings and the earlier replay fixtures. I commissioned Claude with the short prompt in `scripts/replay/01-opus-design.txt`, using `claude -p --model opus --effort high` from `/tmp`, with tools, slash commands and session persistence disabled. The CLI reported `claude-opus-5-5`. The saved response includes the researcher's own dated diary. It describes work completed, assumptions, proposed falsifiers and evidence still needed. [Research design and diary](../scripts/replay/05-opus-design.md) · [Invocation](../scripts/replay/02-commission.sh)

### Why

A full-render baseline can detect a missing head, while a separate simulated panel can detect a missing transfer even if the head is already correct in memory. Sharing the old and new application's view projection would defeat the comparison. The public replay needed the same inputs supplied to two real applications, each generating its own view.

### What worked

Revision `e339b6a` holds the game scripts, 234 event records, the two constructed observations and full-frame SHA-256 evidence. A per-world seed and deterministic timer inputs make the old frame JSON reproducible. Each image and transfer comparison has a stable named observation.

### What didn't work

Opus's abstract design stipulated a 20-by-20 board with 16-pixel cells and proposed lengths as large as 399. Source inspection showed 22 by 18 squares, 13-pixel pitch, a four-segment start, and a requirement to keep a square free for food. I used the real 395-segment ceiling. Its proposed semantic lift from visible text would also conflate the live header's maximum with the historical best.

### What I learned

Game state, painted bytes, committed front-buffer bytes and physically visible bytes answer separate questions. The original archived hashes used the project's C raster. They give an excellent historical regression check but cannot independently validate that raster against a separate specification.

### What was tricky to build

The prelude closes over the application's private state. I inserted one host-only accessor at its unique `let S = {};` anchor, without changing the producer file. It reads original state for the independent semantic projection and installs constructed fixtures after the 234 events. In both versions normal events and render calls continue through the production entry points.

### What warrants a second pair of eyes

Verify that the old JSON source hashes are checked before using its reconstructed screens as the baseline. Confirm the native framebuffer path uses the same 64-rectangle output bound as the test binding.

### What should be done in the future

A separate specification-drawn raster would broaden the correctness claim. Physical measurements belong to the board researcher.

### Code review instructions

Read `producer` in the replay runner, then the action list at the pinned old revision. The pure semantic projection uses the row-major coordinates from the old game state. [Replay runner](../scripts/replay/04-production-replay.mjs)

### Technical details

The original body is an array of coordinate pairs. The new list uses `22*y+x` and preserves head-first order. A semantic object carries `t`, `v`, `body`, `food`, `score`, `best`, `alive` and `auto`. The frame also carries the hints.

## Step 2. Put the real drawing and commit code behind both services

I built a thin Node N-API binding over the C graphics primitives so both compositor services would run through the old and new drawing implementations, including text and invalidation. A third memory buffer represents a panel which sees only the regions admitted by its transfer request.

### Prompt Context

See Step 1. The director asked for the production message path, a pinned old revision, and immediate notice of an important constraint. I reported early that the two or three fills on a legal one-step move must be compared with the last painted game, while full frames must remain independently usable after coalescing.

### What I did

I bound fill, rectangle, line, text, font metrics, commit and invalidate using the same nucleus C implementation as production. The JavaScript test harness installs both services on mock scheduling and message endpoints and calls their registered handlers. It compares raw bytes of old/new back buffers, old/new simulated panels, successful back/panel pairs, baseline JSON hashes, archived pixel hashes and the ordered committed rectangle lists.

### Why

A draw-only mock can count fills, but it will miss clipped text, an incorrect RGB565 color and a wrongly merged transfer rectangle. Conversely, a framebuffer snapshot after drawing alone will hide a driver that skipped an otherwise correct request. The three buffers let us observe each of those boundaries.

### What worked

All 236 observations reproduced the old pixels. Of these, 197 changed observations avoided a full clear, 27 did clear, and 12 suppressed publication. Ordinary downward movement made three calls and changed 363 pixels. Entering the departing tail made two and changed 242. The paused timer made none. The game-over and restart images changed 14,102 and 14,690 pixels respectively.

For the 222 distinct serialized frames in the 234-event game, the old total was 164,581 bytes and the new total 42,659. With the two constructed screens included the totals rise to 184,831 and 45,511 over 224 publications. The latter are fixture-inclusive totals. [Machine-readable receipt](../scripts/replay/06-host-results.json)

### What didn't work

A sandboxed run of `node …/scripts/replay/04-production-replay.mjs` could not spawn its child Git process (`spawnSync git EPERM`). The approved local replay was rerun with scoped execution permission for child Git and the C compiler. The final renderer check exited zero. The compiled binding was temporary.

### What I learned

The display transfer regions are obtained after the paint. A full redraw can still transfer only two rectangles, and three disjoint fills can become one rectangle spanning intervening areas. The drawing-call count and the rectangle count are different observables.

### What was tricky to build

The C framebuffer operation copies from back to front **before** asking the display to flush. Treating the front as the simulated panel would hide a skipped flush. The third buffer copies only requested subrows after successful service replies. During fault injection it stays unchanged. The native binding shares Node buffer storage with the two C surfaces and the JavaScript closures preserve their lifetimes.

### What warrants a second pair of eyes

Inspect the binding's coordinates and RGB565 sizes and the row subrange copied by the display model. A whole-frame copy here would make every omission of a transfer rectangle invisible. Check that the shared C files and fonts match the pinned Git revision.

### What should be done in the future

Exercise board-specific bus behavior if drawing hardware, gamma, byte order or tear behavior changes. This harness targets the presentation data supplied to the display service.

### Code review instructions

Start at `world`, especially the implementation of the display request, then `match` and the 236-observation loop. The graphics binding can be audited without reading the game source. [C binding](../scripts/replay/03-gfx.c) · [Replay runner](../scripts/replay/04-production-replay.mjs)

### Technical details

The host used Node v24.18.0 with Linux N-API headers, a temporary shared object compiled by `cc -shared -fPIC -O2`, and separate 204,800-byte back, front and display arrays per service. Hashes in the receipt identify the exact old and candidate JavaScript inputs. The replay asserts the original C raster, utilities, nucleus header and font table also match.

## Step 3. Refuse bad frames, recover stale displays and document the result

I added tests for cases where comparing the next timer tick is insufficient. They change ordinary application focus, display overlays and title, coalesce publications, restart the compositor, break the display transfer and inject invalid semantic frames. The final replay includes the 13-word validation bitset used in the CJI-compatible compositor.

### Prompt Context

See Step 1. The director asked to include author provenance, independent Opus research and a newcomer-friendly article. Publication of the vault edition remains under the director's coordinated release.

### What I did

I added 34 lifecycle and stress checks and 19 rejection checks. I tightened every rejection to require identity preservation of the retained object, an unchanged acceptance counter, no scheduled draw and no display transfer. I forced both a skipped reply and a thrown timeout after successful commits. After observing stale screen bytes I submitted the same position again and inspected the entire repaired panel. I also checked score-width and 8-bit length boundaries at sizes 13, 14, 255 and 256.

### Why

A rejected frame might silently replace the retained object with an equally looking frame. A display retry might accidentally pass because opening a different app forces a full repaint. Checking retained identity and replaying an identical position rules out those false positives. The accepted score is determined by length, while historical best may legitimately lag the live score.

### What worked

All 34 additional cases passed, including the 10 omitted positions and five service restarts with a single complete retained position. Both injected transfer failures left the modeled panel stale. In each case a second draw at the same position produced the rectangle `[0,0,320,320]` and brought every pixel back into agreement. All 19 refusal checks passed and a fresh valid frame was accepted immediately afterwards. The replay also records the actual head-first lists for the two-fill example.

A second Opus High commission produced a short original theory lesson and a scope-limited author diary. Both successfully sent research briefs used tools-disabled execution. The provenance file includes the model reported by the CLI and SHA-256 hashes of the exact stored briefs and responses. [Opus teaching note and diary](../scripts/replay/09-opus-theory.md) · [Provenance](../scripts/replay/10-opus-provenance.json)

### What didn't work

Automatic approval review rejected the proposed external Claude call using `07-opus-results.txt`. It cited “detailed internal Snake replay measurements and implementation-specific results” and lack of specific authorization to transfer that material to Claude. The measured-results prompt stayed local. I informed the director. The separate teaching commission supplied only a generic methods question and explicitly excluded project results. I retained its answer verbatim in the research notes. The article identifies measurements as the local operator's findings.

### What I learned

The generic Opus lesson assumes a hypothetical uniform-colored snake and display-before-commit order. The real head has a separate accent and the real C commit advances the front buffer ahead of the asynchronous transfer. The article derives the two interpretations separately. The article's worked example uses the recorded arrays `[204,205,183,182]` and `[182,204,205,183]`.

### What was tricky to build

Each compositor processes queued draw messages. Multiple frames can arrive before a single draw. The test scheduler permits them to replace each other, then drains one draw through its ordinary callback. Failure tests check that the screen actually became stale before testing repair. Tick-driven clock and banner expiration run through the service's registered timer.

### What warrants a second pair of eyes

The current evidence covers decoded service messages and a deterministic in-memory display, with production JavaScript evaluated by V8. It does not establish native execution speed or cover malformed raw JSON bytes, simultaneous device interrupts, physical tearing, or additional work needed before a draw is scheduled. The article should preserve these boundaries after publication.

### What should be done in the future

Rerun this gate when game state rules, fonts, compositor paint order or flush semantics change. A deliberate change to the C raster requires a separately reviewed baseline update because this experiment pins the raster inputs.

### Code review instructions

From the repository root run the following command and compare its output with the saved JSON. No device is needed.

```sh
node ttmp/2026/11/20/PICOCALC-SNAKE-INTEGRATION--*/scripts/replay/04-production-replay.mjs
```

### Technical details

At the final run the baseline compositor SHA-256 was `e25a2f94fc9b53845459c27d0cddeacdd07e200ba175380f134bd2ec2418be0b` and the CJI-compatible candidate was `07117cc469fefca6b0b4c493dab190ff4f6891101c207c78adb00794fdb94b52`. The checked production game SHA-256 was `d5b1b9ef08b086c3be08e44c528b10a22b36bd01cef7ae6cf2beb872e36fd4c8`. The article's editing pass checked that a beginner can follow the cell numbering, that bytes and events use the same denominator, and that framebuffer identity and physical panel delivery each carry their own qualifications. [Textbook article](../analysis/03-snake-rendering-correctness.md)
