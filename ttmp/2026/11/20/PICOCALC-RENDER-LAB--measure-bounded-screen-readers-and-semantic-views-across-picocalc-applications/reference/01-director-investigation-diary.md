---
Title: Director investigation diary
Ticket: PICOCALC-RENDER-LAB
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:07:20.741483467-05:00
WhatFor: ""
WhenToUse: ""
---

# Director investigation diary

## Step 1: Commission the execution and establish a physical control

The department plan was authorized. I assigned three experimental operators to work with actual Opus High researchers and commissioned a fourth Opus High study of representation. My work covers independent qualification, shared pixel comparison, admission and physical measurement. Each researcher will author a separate teaching article after receiving verified results.

### Prompt Context

> research all this, also do chess, snake, system.
>
> Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
> Chose opus high for researchers
> Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
> analogies, see skill).
> Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.

I used the department handout at revision 80cc251 as the starting specification.

### What I did

Created this execution ticket, commissioned the studies, traced actual serial visibility and ran the playable three-app control. Wrote a recorder for the production compositor and a C driver linked against the actual graphics primitives and font tables. Defined one NDJSON fixture schema and raw RGB565 output across studies.

### Why

A byte count on the producer, a device CPU interval, and successful display transfer are different observations. Comparing the actual full image detects subtle text, clipping and paint-order changes that an operation count can hide.

### What worked

The external host exposed the P4 on ttyACM0. A read-only world query returned the native compositor, native Chess and Snake, and JS System. The 69-second live control captured three CRC-verified screenshots. The strict oracle's one-letter positive control changed seven pixels. A deliberately skipped transfer recovered on a subsequent identical repaint.

### What didn't work

Inside the filesystem sandbox, listing /dev/ttyACM0 failed although sysfs contained the device. The authorized host check resolved it. Node’s first native subprocess reported “spawnSync git EPERM”; the same scoped test ran under approval. The first glyph differential showed zero changed pixels because an omitted font shifted fields in my line protocol. Explicitly supplying the production default font corrected the error. The first independent Keys holdout stopped with “ReferenceError: ask is not defined” in the focus fixture. I requested a fixture-only fix after the extractor freeze.

### What I learned

Snake runs as a native CJI world on this firmware even though its app source is ordinary JS. The device is available despite the appearance of the sandbox. Code size alone hides the fixed 64 KiB Wasm linear memory a standalone renderer can require.

### What was tricky to build

Full-screen equality and panel recovery require separate oracles. The C driver applies only the returned commit rectangles to a simulated panel. The compositor recorder freezes its clock and exposes drawing exceptions, so a candidate cannot silently pass by drawing the same error view.

### What warrants a second pair of eyes

Check that each study charges packet framing, transient host work and unshared install costs. Examine false positives when a screenshot is unchanged; changing a glyph should affect the raster.

### What should be done in the future

Run the bounded-reader comparison on the frozen corpus, compare candidate treatments on the handheld, independently replay the reported results and verify publication of all articles.

### Code review instructions

Begin with scripts 03 and 04 for pixels, scripts 05 and 06 for the physical control, and the model-attributed public response in various/01-representation-blind.md. Compare the frozen holdouts to the individual study tickets. Raw serial files stay local to the bench.

### Technical details

The physical lock is /tmp/pico-lab2-wave/original/serial.lock. The installed playable reference image and its historical receipt agree on the SHA-256 beginning f12e2f5d. The frames use 320×320 little-endian RGB565 pixels and the graphics code's 16-row band comparison.

## Step 2: Test the two rendering designs on identical screens

### Prompt Context

The user clarified that both designs were in RENDER-NEXT. I kept the portable-view and bounded-reader comparisons together and reserved Editor and Keys as independent consumer and extraction checks.

### What I did

Implemented a validation pass, an eight-byte record format, traversal on demand and a materializing control sharing the scanner. Ran the actual compositor on 409 host snapshots. Built a width-sensitive, capped within-draw layout reuse candidate. Coordinated portable Wasm probes, whole-guest producer instrumentation and separate fixed System, Snake and Chess receive jobs on the physical device.

### Why

A shorter packet can move cost to the receiver. An indexed reader can reduce materialization yet spend more time locating individual fields. Both possibilities require an end-to-end equality check and independent stage timings.

### What worked

All four traces produced the same graphics commands for original, indexed and cached layout. On 100 System, 236 Snake and 47 Chess frames the memo table recorded zero repeated identical node/width requests. Keys produced 48 hits across 26 frames. The code handles an escaped object key, a duplicate key, null, Unicode and capped input without changing accepted tree values on the corpus.

### What didn't work

The first sandboxed hostname wildcard used inside a command-line assignment failed to expand. Passing the resolved ticket path fixed the replay. The first ESP-IDF configuration failed on a missing historical CJI runtime. Another commit had just moved it. The staging script now extracts the exact CJI revision that goes with the frozen OS source.

### What I learned

Preallocating 4,096 records costs 32 KiB even for a small game update. An exact bound on these records does not bound text allocations, the event bus or the wrappers used to read the values. Claims about hard limits must name the boundary.

### What was tricky to build

Preserving normal array iteration required both indexed reads and property-presence queries. Relative jump offsets allowed streaming over a subtree without decoding all its contents. Repeated indexed reads still revisit text; testing a dense canvas exercises this cost.

### What warrants a second pair of eyes

The generic production compositor is compiled through CJI. Isolated QuickJS decoder results and WAMR producers measure real hardware with different runtimes. The trace on the normally booted app supplies the real frame-handler baseline.

### What should be done in the future

Finish the hardware comparison, compare the independent producer and consumer results, and record where candidate savings fall outside the measured interval.

### Code review instructions

Read scripts 10–12, inspect reader-layout-host.json, then compare stage boundaries in scripts 08 and 13–14 to the blind requirements. Complete device transcripts stay with the bench.

### Technical details

The fixed matrix uses three renderers, plus the independently frozen Keys workload. SHA-256 covers the ordered sequence of graphics calls. Pixel equality for each original recording is independently measured by the child tickets.

## Step 3: Qualify the stage measurements on the physical machine

### Prompt Context

The user wanted the two renderer proposals researched on Chess, Snake and System. They commissioned an additional independent binary-format group after the first physical results and asked that it keep the same diary and publication record.

### What I did

Restored the historical CJI inputs that match the experimental OS and verified the installed app and partition table with esptool. Ran all 140 physical comparisons across five blocks. Captured duration-only events in the production compositor, kernel, framebuffer and SPI paths. Ran 20 competing key trials and eight independent replay cells on another boot. Verified the restored image and the health of the target worlds after both successful sessions. Extracted 44 screens from an existing 64 KiB typed Editor event replay, ran both painters through the actual font and raster code, and compared all final buffers.

### Why

The five physical arms for the reader charge conversion, not just scanning. The Chess producer runs a complete game in a measured WAMR world. A trace of the shipped RV32 game shows how different its actual event budget is. Queuing an unrelated F1 while installing a view makes the cost to the event dispatcher observable.

### What worked

The same checksums and frame lengths survived all 140 cells. Raw pixels, retained-generation tests and independently compiled firmware provided separate checks. A second session reproduced the direction of the System, Snake, Chess producer and Chess reader results. First-frame source installation delayed admission of an unrelated key to a median of 398.8 ms. The original app and partition table matched their flash digests on restoration.

### What didn't work

The first physical fixture upload succeeded but the temporary console command returned before its normal completion marker. The operator timed out, cleaned the fixtures, and restored the original image. I corrected the command and repeated the run. Editor had no changed publication in its live F6 interval. The text-editor claim in the study instead rests on the separate actual typed guest replay. I corrected the host comparison to read the real font widths from the production font table. The first combined request to the external representation investigator for article and diary returned a provider refusal. A request for a public engineering article and factual experiment log succeeded, followed by the physical addendum.

### What I learned

One native Chess update spent 44.984 ms in the compositor's frames event. The complete draw including a graphics commit took 26.794 ms. Only 1.019 ms was spent transmitting its changed pixel data. The deterministic WAMR producer and QuickJS receiver controls help identify which stage to change; an integrated RV32/CJI trial is required for the actual product latency.

### What was tricky to build

Keeping the board playable required a single serial owner, matching app and partition-table digests, a uniqueness check on disposable filesystem paths, a cleanup limited to known fixture contents, and a restoration guard. The trace records nested and concurrent durations. The comparison script associates transfers with committed rectangles and refuses a trace that drops entries.

### What warrants a second pair of eyes

The timed QuickJS reader excludes the preallocated record array. Simulated last-good admission bounds work at a proposed protocol boundary; the production kernel and all subscribers do not yet use those slots. The physical key measurement ends at a UART acknowledgment. The renderer studies do not claim a complete end-user latency distribution.

### What should be done in the future

Finish the independently commissioned binary comparison, send its actual API to application researchers if it clears the qualification gate, and integrate the complete set of results in a director report.

### Code review instructions

Start with the stage boundaries in scripts 08, 13, 14 and 20. Compare the reports to various/physical-blocks.json, physical-summary.json and physical-followup.json. Scripts 15–17 and 23 reproduce the Editor holdout, memory budget and public representation report. Compare the commissioned binary gate against the ordinary and held-out workloads.

### Technical details

Four researcher articles and two figures were published to the go-go-parc vault. Git confirmed remote main at f6350ad094cf91cf98224cffa9e3029ab32e078f and resolved all six paths in that commit. The separate binary article and director synthesis follow after that department returns.

## Step 4: Move the index to the sender and test the application handoff

The binary group studied a complete message that a reader can index after admission. The board operators qualified a JavaScript reader, a native reader, and a complete native sender/receiver route. I applied the same raw byte representation to the semantic views from the first three application studies. This isolated two decisions the applications can make independently, which facts to send and which encoding to use.

### Prompt Context

**User prompt (verbatim):** “can you start one more group that replaces JSON with a binary format that can more easily be indexed as well? If that experiment turns out well, we can pass it on to the other groups to skip the json part too”

**User prompt (verbatim):** “same guidelines reading diary + project report apply”

**Assistant interpretation:** Commission an independent research group, qualify its proposal against our shared controls, and transfer the working API and evidence to the existing groups when the comparison justifies it.

**Inferred user intent:** Let application teams reuse measured improvements while giving a newcomer the design history, competing explanations and sufficient artifacts to repeat the work.

**Commit (code):** The native receiver and heap witnesses landed in 7ffd3a6 and 22031ce. The matched native sender and the seven-block device follow-up landed in 6dbecbb and 400d6db.

### What I did

- Commissioned the fifth Opus High study before disclosing the output measurements. Added isolated physical windows to the existing board operator. The last native run included encoding the same resident cJSON source for both formats.
- Replayed 100 System, 236 Snake and 47 Chess semantic observations directly through the binary index into their existing resident views. Reproduced the corpus and deployed capsule from a fresh output directory using scripts/30-replay-host.sh.
- Compared the native producer's raw bytes against the reference encoder, checked the stage receipts against the drawing and scalar checksums and passed the application handoff to the three researchers. Linked the handoff from each ticket.
- Wrote the director's report after all measured cells were available and produced a figure from three physical framebuffer captures. Corrected the label for the denominator of the Keys layout-cache count in the representation article and its vault copy.

### Why

An offset in a buffer gives a predictable address for an array slot. Finding that address has little value if encoding costs more than locating the field saves, or a property-access layer makes a painter visit it repeatedly. Seven alternating blocks per treatment separate those costs on this device. The app-specific handoff tests whether a smaller semantic message also benefits from a general-purpose binary encoding.

### What worked

All 427 generic screens, including the held-out Editor, produced matching commands and framebuffer bytes on the host. All three semantic consumers reproduced their reference output. The exact capsule produced in the independent replay had SHA-256 ca2d76e538601914a40b88ad12e560456d2b2c8b50a26dbfbaf392333b5ffc01. The native complete-route arm returned 56 valid measurement cells, with eight publications per cell. Its median paired reductions were 71.3% for System, 88.0% for Chess, 80.0% for Snake and 87.9% for Editor. All five physical session restore checks returned the previously qualified playable app.

### What didn't work

Every native binary encoder took longer in isolation than the JSON encoder. The QuickJS binary Proxy path through the first draw into the command sink took approximately four to five times the existing JSON path's time across the four fixtures. The indexed encoding also grew Snake and Chess's already compact semantic payloads. All three findings are reported, including the original control and amount of work charged.

### What I learned

Receiver lifetime dominates the tested native route. A single direct lookup was sufficient to expose that difference because the control builds and releases a tree. The tests do not establish the latency of a complete native render. The QuickJS experiment shows why an implicit conversion to a JavaScript property interface is an expensive way to integrate the format. Base64 enlarged the generic payload on every workload.

### What was tricky to build

Both sides of the comparison needed the same input, the same operation after admission, and an unambiguous end of ownership. An allocator witness alone misses the encoder; a checksum-only comparison misses glyph and clipping errors. Retaining the native and QuickJS measurements as two separate tables in the binary ticket makes the endpoints inspectable. The director report places them side by side with an explicit description of the two endpoints.

### What warrants a second pair of eyes

A reviewer should trace the real NUL-terminated screen path through nw_screen, nat_render, frame_message and kernel_publish. The proposed native trial needs byte lengths and retained ownership through the CJI renderer. The C benchmark begins with a resident cJSON tree. System, Chess and Snake may produce their screens from other representations in production.

### What should be done in the future

Qualify a full Chess cursor update with equal pixels, per-stage timing, key-to-last-SPI timing and peak overlapping generations. Keep the three original application controls available. The proposed trial has a recorded independent baseline and a concrete first action in the application handoff.

### Code review instructions

Begin with scripts/25-semantic-consumer-check.mjs, scripts/29-binary-results.py and scripts/30-replay-host.sh. Read the JSON receipts in the binary ticket's various/device-js-and-native-reader.json and various/device-native-route.json and compare the per-block treatment order to the summaries. The replay script takes an unused directory argument. Check various/independent-host-replay.json for the expected digest and counts.

### Technical details

The native encoder/receiver protocol, initial Opus research brief, implementation, host trace witnesses and both hardware measurement arms are in PICOCALC-RENDER-BINARY. The bulk evidence belongs in that ticket. The director's ticket keeps the cross-study results, the reproducible handoff and the board session scripts. The original four vault articles were verified at f6350ad; the correction was committed in da7ffd6. The first reMarkable volume's upload receipt is in various/remarkable-deliveries.txt.
