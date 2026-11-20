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

## Step 4: Investigate code mobility and receiver-side compilation with Chess

The owner proposed shipping a drawing function once and following it with complete semantic updates. I commissioned two independent assessments and tested two prerequisites on the host. The current producer spells out thousands of bytes of canvas operations for a cursor change. An actual pure typed drawing helper can be compiled and invoked without the Chess runtime. These findings identify a feasible experiment and leave the cost of a complete renderer on the P4 open.

### Prompt Context

The owner wrote, verbatim:

> imagine also this idea: an app can send relocatable code / self contained code over to the compositor, who can execute it given the received data so that only the semantic data is sent to the compositor. this kind of "sending code over the bus" is i think an interesting technique, maybe reminiscient of say, tuple spaces or capturing closures over channels in go or so. relocatable could also mean that the compositor can call chess code? It breaks "security" a bit but I think it's an interesting avenue.

> or it could send the typed code over to the compositor who then compiles it, that could maybe be more pragmatically sound

> anyway, search it al, use opus xhigh and astra again, maybe create a second design doc

I interpreted this as a request for an independently researched alternative in the existing renderer program. The deliverable is a second architectural design and reproducible supporting evidence, pending approval before firmware work.

### What I did

- Commissioned Claude Opus at xhigh with a generic source-free question and public literature search. Asked Astra xhigh independently to study the concrete code, compiler, scheduler and existing hardware receipts.
- Read the Chess view from legal-marker computation through canvas serialization and SDK publication. Compared the standalone no-import compiler with the whole-world board compiler. Consulted the primary literature on remote evaluation, active messages, NeWS, Linda, Go closures, CSS Paint, and Wasm embedding.
- Wrote and replayed two ticket-local probes. `08-measure-chess-screen.mjs` runs the current compiled Chess world through a fixed opening. `09-probe-standalone-view-function.mjs` extracts and compiles the existing piece-glyph helper. Stored both receipts with artifact digests and committed the evidence as `58a05a3`.

### Why

Shipping semantic data, shipping a renderer, and compiling on the device are distinct interventions. A comparison between today's tree and a source-compiled renderer would conflate all three. A resident renderer and a delivered copy of the same program make each incremental cost measurable.

### What worked

The cursor updates for e3 and e4 both produced 4,897 tree bytes, plus 41 of hints, covering 148 canvas operations each. The full trees differed, as expected for a moved highlight. The 339 source bytes for the pure helper produced 156 portable module bytes, zero imports, a 65,536-byte linear memory and all 12 expected glyphs. I reran both scripts and obtained byte-identical JSON receipts.

### What didn't work

A direct copy of the current drawing entry is unsuitable for replay because it writes legal move scratch and can query check detection. Source compilation using the current whole-world path also assumes a reactor and a synchronous call. Both are substantive differences between the proposed API and the existing system. During source navigation, a lookup for `picocalc-os/nucleus/native_elf.c` reported `No such file or directory`. The P4 ELF backend lives under `picocalc-os/port/esp32p4/optional/native_elf/native_elf_p4.c`.

### What I learned

Code can be syntactically small yet drag in expensive computation through its callees. Moving colors, geometry and glyphs is plausible, while computing legal destinations from the game's mutable search workspace in a repaint would change both costs and ownership. The source distribution arm can improve on-device authoring even if precompiled delivery installs faster. When emitted module bytes are identical, both share warm execution behavior.

### What was tricky to build

A previous snapshot can outlive its sender and compositor. Successful validation of a module says nothing about whether a particular input exhausts its fuel or generates excess host raster work. The protocol consequently commits a replacement only after its output is drawable, and pins all dependencies of the prior view through the handover.

### What warrants a second pair of eyes

Review the proposed 92-byte schema against every branch in `chessAppendStatus`, `chessAppendTile` and the optional search footer. Check whether formatting, text transcoding, output validation, memory reset and content clipping dominate the saving. Keep the physical SPI endpoint separate from SDK byte counts.

### What should be done in the future

Subject to owner validation, run T4 under the existing P2 owner. Compare generic and resident semantic renderers first. Release code installation and source compilation trials if their workload has enough useful updates or local edits to justify the fixed costs.

### Code review instructions

Begin at [Sending a typed view program to the compositor](../design-doc/04-sending-a-typed-view-program-to-the-compositor.md). Run both Node scripts from the repository root with the existing typed world reactor. Compare their outputs with the checked-in JSON receipts. Read the two independent assessments for the published mechanisms, source evidence and design alternatives.

### Technical details

One historical hardware receipt spent 1.898 s compiling **the entire RV32 Chess world**. The new host capture and leaf-module probe use Wasm and provide no renderer-only device timing. The design prices installation and steady-state work separately, with equal module bytes across the resident, delivered and source-compiled arms where the compiler and target match.

## Step 5: Reconcile the independent findings

Opus returned its xhigh memo and public literature survey. I incorporated its strongest challenge into the proposed study: the current retained tree already survives a compositor restart with an idle sender. Astra's qualified implementation candidate and the host measurements set a narrower first trial.

### Prompt Context

See Step 4. The decision was how to consolidate both assessments into one comparable extension.

### What I did

Imported only the public Opus response and digest, added source-reading limitations before its memo, and linked it with the independent Astra review. Consulted the authors' Cloud Haskell and automatic partitioning publications. Described an optional later placement analysis whose constraints follow from the measured Chess dependency cut.

### Why

The research models chose different scopes. Opus considered moving selection and touch handling into the receiver. Astra identified where the current typed source draws on mutable game state. Moving input policy would alter replay and introduce extra confounders. The chosen first trial keeps Chess authoritative for all game and selection state.

### What worked

The Opus design explicitly challenged the need for client code in the presence of persisted descriptions. Astra proposed comparing identical bytes preinstalled and delivered in the same runner. Together these give the semantic model, mobile delivery and receiver-side compilation distinct empirical tests.

### What didn't work

The first invocation of `10-import-mobile-research.py` stopped with `ValueError: Refusing to overwrite an edited document`. Docmgr created a blank analysis body rather than a comment template. Checked the file, changed the importer to accept only an empty body, and reran successfully. The script still rejects overwriting edited prose.

### What I learned

The remote-evaluation precedent settles the mechanism. A program-placement model can make an independently useful prediction about when a serializable cut pays. It must include who owns effects, how often views change and whether repeated values share a wire record. The original literature memo alone could not establish those facts for this implementation.

### What was tricky to build

Specialization is an optional extra intervention. Giving source-to-Wasm and delivered Wasm different optimizers would attribute optimization gains to source transport. T4 compares identical output first. A later specialization study would need the same target context and the same opportunities on both representations.

### What warrants a second pair of eyes

Review the proposed state encoding against complete game outcomes and frozen pixel fixtures. Measure the actual cost of staging and validating primitives as well as the wire saving. Review the source-reading limits of the Opus memo before citing a historical result.

### What should be done in the future

Qualify the resident control and manual semantic split first. Keep further research on automatic partitioning within T4 and conditional on a measurable opportunity.

### Code review instructions

Read design document 04, the independent Astra assessment, the Opus memo’s editorial disposition, and the two host receipts. The CLI receipt records Opus 5.5 with xhigh effort and a Haiku search helper.

### Technical details

The initial probes ran at repository revision `434c64e`. Scripts and outputs were committed in `58a05a3`. The leaf test used Node’s Wasm execution rather than WAMR on the board. The reference tree bytes were captured at the SDK boundary rather than on the LCD bus.

## Step 6: Deliver the code-mobility supplement

The design, source-level Astra review and independent Opus survey were delivered together as **Typed View Programs on the PicoCalc.pdf**. The named file appears in the [successful upload receipt](../various/remarkable-typed-view-upload.txt) for the ticket’s reMarkable cloud folder.

### Prompt Context

See Step 4 for the second design commission and Step 1 for the ticket’s delivery instructions.

### Evidence and commits

The host evidence commit is `58a05a3`. Both host receipts reproduced byte-for-byte, ticket doctor passed and local references resolved. The second cloud document has a new name, preserving the first roadmap edition.

### Noteworthy decisions or failures

The upload completed through the ordinary bundle command. The receipt establishes cloud delivery.

### Remaining requirements and next action

The user can validate T4 as a conditional arm of P2. Testing a complete semantic renderer on the P4, including cold installation latency and pixel parity, is the proposed experiment.

## Step 7: Turn the two renderer designs into department assignments

I wrote a dispatch-ready program for the bounded renderer and the typed view procedure inside RENDER-NEXT. It identifies four research responsibilities and schedules their work within one board and three Codex worker slots. The handout separates studies which can start immediately from ones whose interpretable control still needs building.

### Prompt Context

The user asked, verbatim:

> Ok, so let's look at the last two NEXT design docs, and give me a substantive reseach program so we can hand it out to the epartments (opus, astra, researchers, etc...) . What is available?

They clarified, verbatim:

> I guess I was refering to the two design docs in RENDER-NEXT.

I took the deliverable to be a program for review and dispatch. The first wave is proposed and has no new assignments running. The starting revision was `46f17ca`.

### What I did

I read the producer-to-panel and mobile-view guides, task list, phase plan, author receipts and latest diary. I replayed scripts 08 and 09 and compared both JSON outputs byte-for-byte with their receipts. I reran the System producer comparison using the original sysmon source from `dcf3fca`. I checked the available simulator and typed reactor, worker status and visible serial paths. I then wrote the department handout and linked it from the ticket index.

### Why

The lab can assign work now even before the full device oracle exists. An ownership study, manual template, blind placement prediction and two-sequence replay have distinct outputs. Keeping the three Chess delivery arms in one lane preserves the same program, schema and runner across the comparison.

### What worked

The six Chess screen records and standalone glyph result reproduced exactly. The System fixture run completed with its 65 selection cases and 69 additional boundary cases. The ticket already has separate source-constructor and receiver holdouts, two completed independent research assessments and a shared hardware program.

### What didn't work

I initially interpreted NEXT as possibly naming the native and rendering tickets together. The user clarified the intended pair. I renamed the empty draft and scoped the final handout to the two renderer designs. The native compiler appears only as an existing tool for a view procedure. Checking `ls /dev/serial/by-id` returned `No such file or directory`; a subsequent read-only check of ttyACM and ttyUSB names also found none. No hardware trial was attempted.

### What I learned

The scientific decision changes when the comparison changes. A semantic position can reduce repeated screen construction, a delivered module changes installation, and source changes the workflow for an edit on the handheld. Only the resident comparison measures the first effect. Keys and Editor also answer different generalization questions.

### What was tricky to build

Department boundaries had to conserve an independent reviewer and a single board operator. I kept installation as a rotating assignment after the resident control. Layout and damage share instrumentation early but gain dedicated implementers only when their measured opportunity justifies it.

### What warrants a second pair of eyes

The experimentalist should freeze the minimum worthwhile effects, timing boundaries and correct panel recovery before the first candidate comparison. An index implemented in C needs its own same-boundary materializing control.

### What should be done in the future

Upon authorization, dispatch the host work. Qualify independent treatments before testing their interaction on the P4. Each project should return a design, scripts, detailed diary, receipts, and a report for a positive, negative or inconclusive result.

### Code review instructions

Read [Department briefs](../design-doc/05-department-briefs-for-bounded-rendering-and-typed-view-programs.md) starting with the inventory, then compare the first authorization with the phase task IDs. The two existing Node probes are reproduced from the repository root. For System use `git show dcf3fca:picocalc-os/js/apps/sysmon.js` as standard input to the fault ticket’s `02-compare-system-frames.mjs`.

### Technical details

At the typed SDK boundary the reference cursor move emits 4,897 tree bytes plus 41 hint bytes. The proposed 92-byte state is a schema calculation. The standalone 156-byte Wasm program is only a leaf function. Qualification of a complete Chess view and measurement of any new device speedup remain open.
