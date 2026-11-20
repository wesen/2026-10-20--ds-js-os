---
Title: Astra review diary
Ticket: PICOCALC-RENDER-NEXT
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-COMPOSITOR-FAULT--system-monitor-frame-faults-in-the-native-picocalc-compositor/scripts/02-compare-system-frames.mjs
      Note: Existing draw-operation oracle rerun for this review
    - Path: repo://ttmp/2026/11/20/PICOCALC-RENDER-NEXT--bounded-screen-snapshots-and-compiled-layouts-for-the-picocalc-compositor/analysis/01-independent-astra-review.md
      Note: Results and design questions from the independent investigation
ExternalSources: []
Summary: Chronological evidence, research decisions and review record for the render roadmap.
LastUpdated: 2026-11-20T10:31:18.188529735-05:00
WhatFor: ""
WhenToUse: ""
---

# Astra review diary

## Step 1 — Trace representation, ownership and failure recovery

I reviewed the existing System producer, native receiver, typed Editor and display path before reading the design author's roadmap. The two important lifetime changes occur in different components. The kernel replaces an app's durable screen before the receiver sees it. The receiver's input message then disappears before the queued draw runs.

### Prompt Context

**User request, as summarized in the director's assignment.** Review a phased scientific roadmap for four renderer techniques, with intern-accessible engineering guidance, independent studies and a held-out Editor trial. The original full text was not present in my delegated context. The director owns operational and publication decisions. [Director diary](01-director-investigation-diary.md)

**User steering (verbatim, relayed by director).** “Tell them they can research further techniques and research and fundamentals and techinques, but to consolidate their results so that it doesn't spread into 10000 independent directions. We do want to explore a fair bit, but structure helps.”

**Assistant interpretation.** Examine local boundaries, distinguish measured facts from proposed outcomes, and put each reference or technique under one of the four testable decisions.

**Inferred user intent.** A future lab director should be able to stop an unproductive branch and still get an independently reproducible answer from the other studies.

**Source revision.** `12c76f876b147cde337f3bb2bf2a76e2ec37d347`, from `git rev-parse HEAD`. This checkpoint changes research documents.

### What I did

- Read the compiler research index, the prior compositor incident design and its review disposition, and the native roadmap's M1/M2/H3 section. The previous ticket's recorded firmware, elapsed duration and failures delimit the historical result.
- Started at `sysmon.js:sample`, followed `kernel.c:frame_message`, `new_msg`, `replay_retained`, `eng_dispatch`, `native.c:nat_dispatch`, `cji_elf_event`, `rt_host_event`, and the generated CJI `$message/$decode/$wire`. Checked the ESP32-P4 CMake file to confirm which CJI source tree the firmware uses.
- Compared the ordinary `ui.*` builders to `editorDocumentFrame` and `typedSdkScreen`. Followed `paint`, `stack`, `gfx_commit`, `gfx_invalidate`, display flush and the P4 SPI worker.
- Created the review and diary with `docmgr doc add --ticket PICOCALC-RENDER-NEXT`. Shared raw-boundary, restart and live-corpus findings with the director.

### Why

The existing native event API exposes bytes early enough to experiment with a bounded reader, but the ordinary JS handler is reached too late. A service-level measurement alone would confuse payload conversion, data extraction and changes to the renderer. A consumer-local fix can yield a useful experiment while leaving durable recovery and total-system memory unqualified.

### What worked

The production build recipe led directly to the checked-in CJI sources. `string_of_utf8` allocates a temporary UTF-16 buffer of `2*(n+1)` bytes, creates a managed string and frees the temporary. The JS event path conditionally walks the decoded graph when the input contains escapes. The source comments explicitly exclude screen retention from the ordinary 4,096-byte quota. The fake framebuffer fixture remains available as a draw-operation oracle.

### What didn't work

A source search used `rg -n 'gfx_commit\(|gfx_invalidate\(|\.front|->front' picocalc-os/nucleus/{bus*,cap*,bindings*,native*,gfx.c} picocalc-os/port/esp32p4/main/bus_p4.c`. zsh reported `no matches found: picocalc-os/nucleus/bus*`. Repeating `rg` on the full `picocalc-os/nucleus` directory and the exact `bus_p4.c` file exposed the allocation, front-buffer pin and commit paths without relying on a filename guess.

### What I learned

System's live input depends on the timing and bus traffic of the renderer itself. Two semantically correct builds can display different measurements and cause different transfer rectangles. A frozen corpus isolates renderer effects. A separate live trial checks the real user experience.

### What was tricky to build

The reference outcome after a lost flush depends on three different states, the desired app screen, committed front-buffer contents and pixels actually delivered to the panel. A CRC of the first two cannot establish the third. I specified a panel simulator that consumes emitted rectangles, plus device completion receipts.

### What warrants a second pair of eyes

Review the placement of admission before durable replacement, the send/return/draw lifetimes, and whether the budget charges cover mailbox copies, pins and full-panel buffers. Preserve normal sender and display authority as well as successful graphics.

### What should be done in the future

Freeze bootstrap inputs, qualifying limits and the held-out corpus before assigning prototype measurements. Keep one physical-board operator and make normal product qualification a later decision.

### Code review instructions

Compare the actual `rt_host_event(2)`, `$message` and `free_msg(m)` call sites to the proposed ingress drawing. Read the actual System and typed Editor frame builders beside the kernel's retention block. The [independent review](../analysis/01-independent-astra-review.md) links the files and symbols.

### Technical details

The native 16,384-byte limit applies to tree plus hints. Typed world output is counted UTF-16 with a separate UTF-8 conversion bound. `MAX_WORLDS` is 32. A 320 × 320 RGB565 framebuffer consumes 204,800 bytes per surface. A proposed 16 × 16 tile grid has 400 tiles on this panel. The existing commit examines dirty 16-**row bands**, merges rectangles and copies bytes before the flush is acknowledged.

## Step 2 — Establish causal controls and consolidate prior art

I wrote the independent comparison matrix and investigated the techniques requested in Step 1. I grouped them by the effect a lab could falsify. The result has one primary comparator per track, an optional codec gate, and a separate integration and hold-out decision.

### Prompt Context

See Step 1 for the relayed user steering and the scope of the director's request. The task here was research design and source corroboration.

### What I did

- Consulted first-party descriptions of jsmn token spans, simdjson traversal, CBOR, FlatBuffers field layouts, partial evaluation, Vue static caching, Yoga incremental layout, Acar's change propagation and LVGL damage repair. Grouped each under ingress, template specialization, measurement reuse or early repair.
- Specified pre-registration against repeat control runs, freeze/unlock rules for a JS extractor hold-out and the typed Editor, full-frame pixels and simulated-panel coverage, and per-stage resource accounting.
- Replayed the historical producer oracle with the current checkout and old `dcf3fca` producer. Ran the existing compositor authorization and System app tests as source-level controls.

### Why

A display-list repair should legitimately omit primitive calls. Exact operation equality would penalize a successful repair, whereas full-frame RGB565 bytes and simulated terminal panel state catch stale pixels. Continuing to send complete dynamic values per frame gives recovery an independent reference even if intermediate publications coalesce.

### What worked

`git show dcf3fca:picocalc-os/js/apps/sysmon.js | node ttmp/2026/11/20/PICOCALC-COMPOSITOR-FAULT*/scripts/02-compare-system-frames.mjs` exited 0. It compared 28 Worlds selections, 36 Handles selections and one Buses selection, then reported `69 extra boundary comparisons passed`. The byte examples matched the prior ticket. `node --test picocalc-os/tests/compositor-auth.test.mjs picocalc-os/tests/sysapps.test.mjs` exited 0 with both specified test files passing. These runs exercise existing code.

### What didn't work

Opening `https://docs.lvgl.io/9.2/overview/draw.html` returned “URL ... is not accessible via this tool.” I used the official LVGL 8.4 documentation's drawing section, which describes saving old and new areas, then redrawing visible layers. The FlatBuffers and partial-evaluation links in the review point to their respective projects' documentation.

### What I learned

Comparison cost, raster work and physical traffic have different baselines. The host charges a full nominal panel comparison in `gfx_commit`. A credible P4 performance result needs a real clock or cycles and a measured tracer overhead.

### What was tricky to build

A single summary speedup can hide moving work into the kernel, cold loading an immutable template, suppressing draws or dropping unsupported widgets. I separated A/B contrasts and denominators for accepted, coalesced, painted, no-op, flushed and completed generations.

### What warrants a second pair of eyes

A property proven by an on-device experiment with one subscriber and one focused screen does not bound the whole 32-world system. Review the role of aggregate in-flight bytes and the exact input contract when qualifying “bounded.” Have the hold-out evaluator verify that all configuration and threshold decisions preceded opening Editor timing results.

### What should be done in the future

Reconcile the independent review with the design author's commissioned draft before the director freezes the roadmap. Preserve rejected alternatives with a reopening condition. Performance conclusions await the planned experiments.

### Code review instructions

Check the links, repeat the two existing host controls above, then compare the proposed primary metrics with which component actually owns each allocation, framebuffer copy and SPI job. [Experiment matrix](../analysis/01-independent-astra-review.md)

### Technical details

The historical host producer control recorded 4,016/1,766 bytes for Worlds, 2,641/1,529 for Handles, and 2,678/1,166 for Buses, in old/current order. These byte examples cover representative JSON trees. The four new research treatments have no new local performance result or device receipt.

## Step 3 — Review the commissioned design and send corrections to the director

The director supplied the main Opus guide after my independent plan was written. I compared it with the sources and with the consolidated phases. Its damage criterion could reject a correct partial renderer, and its System example conflated application content with compositor chrome. I sent the director concrete replacements and recorded the decisions in the [review disposition](../analysis/01-independent-astra-review.md#disposition-of-the-commissioned-opus-draft).

### Prompt Context

See Step 1. The director requested a targeted review against production source and the director's phase guide. The original design brief and model response hashes are retained in this ticket.

### What I did

Read the draft end to end. Checked the seven-column System Worlds table and details, the compositor's measurement callers, current full-screen fill, front/back band narrowing, display transfer, CJI native allocation and P4 PSRAM ownership. Compared the draft's local task numbering and comparison arms with P0–P4.

### Why

A test that rejects a correct implementation can steer future researchers into unnecessarily expensive work. Commit rectangles contain unchanged pixels when they enclose distant changes in one band or when adjacent rectangles merge. The coverage condition is the set of changed pixels, followed by independent framebuffer and panel equivalence.

### What worked

The example with changes at both horizontal ends of one band follows directly from the per-band min/max accumulation in `gfx_commit`. The path from `cji_graphics` through `dmabuf_alloc` to `port_big_calloc` establishes that pixel planes are system PSRAM allocations. It resolves the draft's open question about those allocations being charged to the compositor's ELF world heap.

### What didn't work

The draft treated unchanged-frame suppression as a standalone comparator for specialization. That construction does not match the input workload between arms. I proposed toggling template representation with identical suppression rules, including both changing and unchanged frames. A potential receiver-side template miss also lacked a recovery action that works with an idle publisher after a restart. During record writing, the first tool call stopped at JavaScript parse time with `SyntaxError: Unexpected identifier 'gfx_commit'`. I corrected the Markdown quoting and reran the write.

### What I learned

The director's phase plan captures several decisions more precisely than the author's local task list. Using one phase vocabulary makes a neutral bounded-reader result, optional binary transport and the independent partial-repaint study individually reviewable.

### What was tricky to build

Proving that partial paint reproduces a desired frame takes three observations, a full oracle image for true changes, candidate final RGB565 bytes and a panel state reconstructed from successful candidate flushes. A wide transfer rectangle can carry many identical pixels. Conflating its geometry with true damage is the failure example.

### What warrants a second pair of eyes

Check the revised guide's worked System example, the table/list distinction, the explicit last-good rejection guarantee before retention, scope of a resolver miss, aggregate live bytes and the corrected D1 coverage oracle. Confirm that all stage and phase identifiers point to the same director plan.

### What should be done in the future

The owner can validate the proposed allocation from the consolidated director plan. Device results for these treatments remain open. Preserve the report and corpus for any rejected candidate.

### Code review instructions

Start with the [disposition](../analysis/01-independent-astra-review.md#disposition-of-the-commissioned-opus-draft), compare it with the [director's phases](../design-doc/02-lab-phases-independent-studies-and-device-qualification.md) and retrace `gfx_commit`, `worldsTab` and `dmabuf_alloc`. The authored response fingerprint in [the authorship receipt](../various/opus-authorship.json) identifies the draft under review.

### Technical details

The original guide's public response SHA-256 is `c7d704f3d105bd9ee8fd6973e7790b0414ada7cc762f674511628f6fcf221970`. I sent the director two correction messages covering the false rectangle oracle, actual source vocabulary, producer/kernel boundary, graphics-memory allocation, binary/profile limitations, recovery, controls and task dependencies.
