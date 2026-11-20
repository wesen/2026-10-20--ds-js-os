---
Title: Director investigation diary
Ticket: PICOCALC-RENDER-NEXT
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T10:30:50.343155205-05:00
WhatFor: ""
WhenToUse: ""
---

# Director investigation diary

## Step 1: Commission the roadmap and establish its boundaries

I opened a planning ticket modeled on the native compiler roadmap, commissioned an Opus xhigh design author and a separate GPT-6.2 Astra xhigh reviewer, and inspected the production call sites. The first decision is which experiments to authorize. Device work begins after owner validation.

### Prompt Context

The owner proposed four directions: bounded snapshot access, compiled screen templates, layout reuse, and partial redraw. The following are verbatim excerpts of the instructions accompanying that proposal.

> You can start a opus extra high researcher to build it, give it enough context to start, and have them write out the ticket (remember instructions: Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.)

> then study the astra result, and make a set of proper phases and how to research them across th elab, and let me know here concisely, so I can validate.

The later steering was:

> Tell them they can research further techniques and research and fundamentals and techinques, but to consolidate their results so that it doesn't spread into 10000 independent directions. We do want to explore a fair bit, but structure helps.

### What I did

Created PICOCALC-RENDER-NEXT with docmgr. Read the professor's scope/task guide and the compositor incident report. Checked the current kernel, CJI entry, framebuffer and native typed Editor paths at project revision 12c76f8. Commissioned the Opus guide and the follow-up public literature survey using the briefs in scripts/. Astra undertook a separate local source review.

### Why

The four candidates affect different endpoints. A common control helps separate producer cost, event receipt, layout, pixel writes and display completion. Reviewing the plan before implementation leaves the lab free to reject an unnecessary change.

### What worked

The source review surfaced a correctness boundary early. The kernel replaces its durable frame before delivery, and CJI converts incoming bytes and parses JSON before the ordinary compositor handler. A fixed-size arena in that handler would miss both the memory already spent and the loss of the previous screen after restart.

### What didn't work

The initial literature brief used a historical author URL for the partial-evaluation book. It redirected to the university landing page. The authors' current publication page supplies the intended full text. The survey's suggested full-flush comparison also differed from production; the roadmap uses the live band comparison in both arms.

### What I learned

The live System monitor is a feedback loop. A faster renderer legitimately changes the CPU number and possibly the graph. Freeze input samples for causal comparison; separately use the live app to test progress and user-facing behavior. The 152-second qualification of the old correction does not profile the four new proposals.

### What was tricky to build

Editor is a useful unseen renderer workload, but its typed producer writes buffer contents rather than ordinary UI constructor calls. The plan assigns Keys to the compiler applicability test and keeps Editor for a separate transport and rendering test.

### What warrants a second pair of eyes

Review which owner is charged at each lifetime boundary, whether callers can observe a refused publication, and when an acquired frame can be freed. Check that a test recovers the last good view after restart and that a stale transfer cannot falsely pass a framebuffer-only check.

### What should be done in the future

After owner validation, freeze inputs and tolerances, then commission the independent experiments. Gate optional encoding and rendering variants on measurements, keep a comparable negative report when one loses, and give a single operator the board schedule.

### Code review instructions

Start with the phase guide and the independent Astra review. Cross-check the links to new_msg, replay_retained, the generated CJI receiver, the typed screen writer and gfx_commit. The assignment and source references disclose which evidence each researcher actually received.

### Technical details

The author uses the Claude CLI with the Opus model alias and xhigh effort. Its design brief contains scoped architecture facts and aggregate counts. The separate literature request permits public WebSearch only. Astra had local source access. The prospective time and memory comparisons in this ticket have no new device results.

## Step 2: Review the research and select the questions worth testing

Both Opus extra-high commissions returned. I compared the architecture proposal against Astra's source-level review, promoted the corrected phase plan to the sole task list, and revised the guide's worked example. The strongest open question is whether automatic extraction keeps enough of the device benefit of a manual template on an unseen producer. It now has a falsifiable three-arm comparison.

### Prompt Context

See Step 1 for the commissioning and consolidation instructions. The owner also asked, verbatim:

> is the opus extra high research already back? do you think it's good/interesting/broad enough? or could it use more depth and reasoning

I interpreted this as a request for editorial judgment on the breadth, originality and depth of the returned work. The initial planning checkpoint is `bdecac7`.

### What I did

- Verified both CLI results. The design receipt names `claude-opus-5-5`. The literature receipt also lists a Haiku helper. Both commissions selected xhigh effort. The importer extracts only the public answer.
- Read the independent review and checked System's actual seven-column table, the kernel's replacement sequence, CJI event conversion, recursive layout, DMA buffer allocations and the commit/flush path.
- Replaced the draft's competing task IDs with the phase guide's M/R/T/L/D families. Retained the survey's additional techniques in one promotion ledger.
- Added the residual row-loop example, the allocation and traversal cost of an index, how to measure automatic versus manual specialization, and the distinction between changed pixels and transmitted rectangles.

### Why

Another survey could supply more names for plausible techniques. The decision now turns on the fraction of work that is static, the cost of reading dynamic values, the bounds a reader can guarantee, and the amount of avoidable repeated work in the actual apps. The revised studies each discriminate between competing explanations for the same observation.

### What worked

Opus supplied a common vocabulary and seven-stage tour. Astra traced evidence down to individual helpers and reran the historical 134 host fixture comparisons and both authorization/System tests. Its review provides a counterexample to requiring the tile mask to cover the baseline's SPI rectangles: two changed pixels can enclose many unchanged pixels in the same transmitted rectangle.

### What didn't work

The first manuscript described geometric invalidation as existing behavior, used a simplified list for Worlds, and did not distinguish the framebuffer quota from the module heap. It also compared templates against unchanged frames under an ambiguous suppression policy. Corrected the current behavior directly in the intern guide and kept the reviewer's disposition table for provenance.

### What I learned

An immutable full-screen snapshot gives an idle producer an unusually strong recovery property. A template preserves that property only if the catalog resolves during replay. A local admission check in the compositor cannot restore a last-good kernel snapshot that was already replaced.

### What was tricky to build

A useful compiler case falls between a constant screen and fully dynamic JSON. Worlds has seven fixed cell meanings but a changing row count and contents. A residual loop preserves the iteration and formatting of dynamic cells. Validation needs side-effect and fallback tests alongside pixel equality.

### What warrants a second pair of eyes

An experimentalist must freeze the noise floor, minimum worthwhile effect and independent boot blocks before candidate measurements. The bound needs platform budgets, not a guessed margin over the largest example. For meaningful percentages comparing manual and automatic extraction, the measured manual advantage must exceed the noise.

### What should be done in the future

After the owner's decision, freeze a deterministic replay and qualify the bounded reader and template treatments independently. Count repeated layout and redundant paint in the same control. Revisit advanced encoding, persistent geometry or hardware acceleration only if a remaining cost warrants a new comparison.

### Code review instructions

Read sections 6–9 of the first design document alongside the independent review's disposition table and the lab's P0–P4 plan. Run `docmgr doctor --ticket PICOCALC-RENDER-NEXT --stale-after 30` and follow the source links. A ticket-wide relative-link check resolved 50 occurrences before the final delivery entry. Doctor reported all checks passed.

### Technical details

Each RGB565 plane holds 204,800 bytes. Two hardware DMA planes account for 409,600 bytes of device memory outside the CJI module heap. For damage decisions the exact reference is the complete pixel image after each transition. The intended physical endpoint is the final matching SPI completion; a key-to-photon claim requires a further observation at the panel.

## Step 3: Deliver the reviewed roadmap

The four frozen documents were bundled in reading order and uploaded as **PicoCalc Renderer Research Roadmap.pdf**. The delivery receipt confirms cloud acceptance under `/ai/2026/11/20/PICOCALC-RENDER-NEXT`. Physical tablet synchronization was not observed.

- **Prompt context.** See Step 1 for the requested destination and Step 2 for the final research judgment.
- **Evidence.** The exact successful CLI line is in [the delivery receipt](../various/remarkable-upload.txt). The bundle contains the intern guide, lab phase plan, research survey and independent review. The receipt and checked sources are part of the publication checkpoint.
- **Next action.** The owner can approve the measurement baseline and two primary investigations. The conditional renderer studies have explicit release criteria in the phase plan.
