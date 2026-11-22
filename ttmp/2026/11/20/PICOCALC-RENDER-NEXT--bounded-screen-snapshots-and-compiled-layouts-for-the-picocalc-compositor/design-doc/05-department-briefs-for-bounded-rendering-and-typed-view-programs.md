---
Title: Department briefs for bounded rendering and typed view programs
Ticket: PICOCALC-RENDER-NEXT
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://compiler/typed/typed-wasm.js
      Note: Portable standalone view compilation
    - Path: repo://apps/js/picocalc/system/compositor.js
      Note: Production measurement, layout and rendering control
    - Path: repo://firmware/nucleus/kernel.c
      Note: Durable snapshot and sender lifetime
    - Path: repo://apps/typed/chess/view.typed
      Note: Semantic split and existing game state dependencies
ExternalSources: []
Summary: Dispatch-ready research assignments, controls, dependencies and device gates for the two RENDER-NEXT designs.
LastUpdated: 2026-11-20T11:00:52.654484921-05:00
WhatFor: ""
WhenToUse: ""
---

# Department briefs for bounded rendering and typed view programs

**Funding recommendation.** Commission three things together: a trustworthy screen replay, a bounded reader for existing screens, and a compiler experiment that moves stable drawing work out of repeated updates. Use System to study ordinary UI constructors and Chess to study a typed view procedure. Reserve one physical board for common measurements. Release work on layout caches, partial painting and receiver-side compilation when their cheaper controls establish that there is something worth buying.

This program commissions the two designs inside RENDER-NEXT. The [bounded renderer guide](01-a-bounded-screen-renderer-from-producer-to-panel.md) owns the end-to-end protocol. The [typed view design](04-sending-a-typed-view-program-to-the-compositor.md) owns the code and data split. The existing [phase plan](02-lab-phases-independent-studies-and-device-qualification.md) supplies the M, R, T, L and D task IDs. This handout gives each researcher a question, an independent comparison, a first deliverable and a stopping point.

## What the lab has in hand

| Available today | Evidence | What still needs building |
|---|---|---|
| Playable System, a qualified correction to its oversized frames, host fixtures and a prior device receipt | 134 host comparisons of drawing calls. The fixed System ran for 152 seconds in the prior device trial. [Fault ticket](../../PICOCALC-COMPOSITOR-FAULT--system-monitor-frame-faults-in-the-native-picocalc-compositor/index.md) | Captured sequences of actual screen envelopes, complete reference pixels and stage costs on a pinned firmware |
| Real Chess producer and a repeatable six-screen host trace | The e3 and e4 cursor updates each emit 4,897 bytes of JSON plus 41 hint bytes and 148 canvas operations. Both complete trees have distinct hashes. [Host receipt](../various/chess-screen-baseline.json) | A view of the complete game state, a renderer for that view, and pixel comparison over more than one opening |
| Standalone typed-to-Wasm compiler and an executable Chess leaf function | A 339-byte typed helper compiles to a 156-byte module, has zero imports, uses a 64 KiB linear memory and returns all 12 glyphs. [Probe receipt](../various/standalone-glyph-host.json) | A bounded runner for a complete view, output validation, compatible artifact retention, and device installation |
| Production renderer and separate display driver | CJI decodes frame messages. The kernel retains the latest frame. The compositor paints fully and graphics commit compares 16-row bands. [Source-level review](../analysis/01-independent-astra-review.md) | A matched materializing decoder for any native reader experiment, exact pixel and transfer oracles for partial redraw, and correlated lifetime accounting |
| An ordinary-constructor holdout and a distinct typed consumer holdout | Keys uses UI builders. Editor writes its own serialized screen; it does not exercise the same source extractor. [Phase plan](02-lab-phases-independent-studies-and-device-qualification.md) | Sealed input sequences, success criteria and an independent operator to unlock each holdout |
| Staff and bench | Opus xhigh can be commissioned through the Claude CLI. Astra xhigh and Sol 6.2 High can work in separate Codex assignments. The host simulator and typed reactor are present. | Schedule the P4 with one operator. At preparation time this environment exposed no ttyACM/ttyUSB device or serial-by-id directory. Host work can start immediately. |

The host Chess receipts were reproduced byte-for-byte during preparation. The System drawing comparison also passed again. No candidate renderer has a new device timing. A proposed 92-byte Chess state would be 98.1% smaller than the cursor update’s 4,938-byte application body. The 92 bytes exclude program identity, generation, packing and transport headers. Wire bytes, CPU work and visible response time are three separate outcomes.

## The common experiment

Give all departments the same revision, frozen inputs, acceptance rules and timing boundaries. For System, replay recorded counter values, clock, focus, key events and notifications. Otherwise changing renderer CPU time changes the numbers and pixels that System legitimately displays. Run live System separately for interactive progress. For Chess, start with the opening trace, then add promotion, check, terminal states, scrolling or focus overlays where applicable, and a stopped or sleeping publisher during compositor restart.

The common record contains the input action, publication and draw sequence IDs, sender identity and generation, input digest, expected RGB565 frame, successful transfers, stage counters, executable identity and measurement environment. Multiple publications may coalesce into one draw. Replay reports include both counts. A partial renderer must agree on **every final pixel**. Two changed pixels can share an SPI rectangle that contains many unchanged pixels, so comparing rectangle lists alone gives the wrong acceptance test. Apply only successful transfers to a simulated panel, and include a skipped flush followed by recovery.

| Comparison | What it can establish |
|---|---|
| Existing materialized tree vs bounded indexed JSON, identical envelope and renderer | Cost of building receiver objects and whether admission can guarantee a recoverable bound |
| Full generic System screen vs hand-authored template vs automatically extracted template | Attainable on-device benefit and how much of it a compiler recovers |
| Current Chess tree vs resident pure view plus complete semantic state | Net value of moving presentation across the message boundary, including producer costs |
| Resident vs delivered copies of identical Wasm bytes in the same runner | Cost and feasibility of dynamic installation, verification and retention |
| Delivered module vs on-device compilation from typed source to the same module | Edit-to-first-correct-frame, cache behavior and installation interference |
| Full paint vs one independently enabled layout or damage change | How much computation occurs after receipt and whether the proposed change removes it |

The comparisons answer different questions. A good bounded reader can shorten the generic control and change the case for a template. Combine candidates only after measuring each individually. Keep the existing band-difference and driver behavior on both sides.

## Department 1. Experimental methods and device qualification

**Chair: Astra xhigh. Implementation and board ownership: director or designated experimentalist. Scope: M0–M3 and P4.**

**Commission.** Build the smallest trace that can falsify an appealing renderer result. Start with one System row selection and one Chess cursor move. Demonstrate two unchanged-control replays with identical inputs and pixels. Show explicitly where the SDK tree length, the retained envelope length, the queued copy count, the committed pixel rectangles and the last successful SPI completion are observed. Each is a different boundary. The researcher records its clock and owner.

**First delivery.** A versioned replay fixture, stage diagram and A/A run comparing two labels on the same control. Include one display resynchronization with a lost flush. List bytes held concurrently by old and incoming snapshots, queued messages, installed views, private output and framebuffers. Record time with tracing enabled and disabled. After this first pair, freeze the larger tuning and holdout corpus and the minimum worthwhile effect before opening candidate comparisons.

**Independent audit.** Rotate control and candidate order across boots, pair by workload and provide raw trial counts, absolute times and paired percentages. Report worst observed segment against the existing 80 ms compositor allowance, peak bytes by owner, and unrelated-key progress during install. Keep the 768 KiB compositor allowance visible alongside device-wide PSRAM use. Printed commits and screenshots are valid for particular endpoints. A claim about photons needs an observation at the panel. When control noise is larger than the apparent gain, report the result as inconclusive.

## Department 2. Snapshot representation and admission

**Lead: Sol 6.2 High, independently reviewed by Astra. Scope: R0–R2.**

**Commission.** Determine whether the compositor can read an existing full JSON screen from immutable bytes without building a second object tree. In the current code the general CJI receiver converts and parses a message before the ordinary frame handler. The kernel replaces its durable screen before publishing. A token index created inside that handler would miss both the early allocation and the lost last-good frame. Start at the actual kernel retention and ingress boundaries. [Receiver trace](../analysis/01-independent-astra-review.md)

**First delivery.** Trace two generations through the kernel and deferred draw. Specify admission, refusal, pinning, release, queued-subscriber limits and publisher teardown. Then deliver one indexed reader with caps on encoded bytes, tokens, depth, decoded text and traversal. Show a table cell with escaped Unicode rendering identically to the control. If indexing moves to C, add a materializing C control behind the same call boundary to separate the runtime change from the representation change.

**Acceptance and stopping rule.** The sequence valid A → over-cap B → restart with the producer idle → valid C must show A and then C, with an attributed diagnostic for B. Repeat with a busy mailbox, old view pinned and token-rich input. Report actual field visits, decoding at paint time and the maximum permitted simultaneous allocations. Budgeting only one candidate arena misses the peak. A defensible hard bound can justify a time or memory trade; put the price in the table. Promote R3, one binary encoding comparison, only if textual representation remains a consequential measured cost.

## Department 3. Compiler specialization and program placement

**Principal researcher: Opus xhigh. Implementation researcher: Sol 6.2 High. Scope: T0–T3 and the semantic part of T4.**

**Research question.** Can a compiler identify which parts of a screen can be built or installed once, and which values must cross the channel on every update? A good answer predicts both a profitable cut and a case where carrying a view program or template costs more than resending the ordinary screen.

**Independent design brief for Opus.** Before seeing the implementation result, predict static fields, dynamic slots, evaluations that must keep their order, and likely fallback sites in the System Worlds table. For Chess, trace the dependencies of one drawing function. Pin reads of mutable game/search state to the producer and clipped picture construction to the recipient. Predict which values cross, their logical and encoded size, and where the cost of the cut moves. Record one counterexample that would defeat each proposed rule. Supply the predictions and their assumptions to the director before exchanging results with Sol. Existing literature and reserve techniques are indexed in [the consolidated survey](03-research-families-primary-sources-and-promotion-criteria.md).

**First implementation for Sol.** Write a manual System Worlds template with static seven-column descriptors and dynamic rows, values, selection and details. Compare against complete generic snapshots with the same deduplication rules and identical state. Next implement only the extractor rules that can explain a material manual gain. Preserve dynamic evaluation count and order. Freeze the rules before the experimentalist scores **Keys**, including every fallback site. Report flash, build time, producer work, receiver work and allocation. If G, M and A are matched generic, manual and automatic costs, report G−M and G−A. Only quote (G−A)/(G−M) when the manual gain exceeds measured noise.

**Chess assignment for the next available implementation slot.** First implement the resident comparison with a manual closed view. Chess owns legal moves, check/terminal status, cursor, promotion, last move and search statistics. The view reads a complete by-value state and emits bounded drawing output. The existing draw entry mutates legal-move scratch; the pure glyph helper is the only function already probed in isolation. Include computing the eight-byte legal-destination mask in the producer cost. Use the same paint order, font and clipping as the control. The existing JSON channel can carry an initial semantic record if the cost of that representation is reported. Count the real payload. Compare the manual template when its repeated-square shape can express the same scene. [Chess design and API](04-sending-a-typed-view-program-to-the-compositor.md)

**Success or stop.** A hand-written win establishes that a representation is useful; held-out performance tests the extraction rule. A smaller semantic packet that merely recreates a large command list at the receiver may lose on time. Publish that result. Keys evaluates ordinary JS extraction. Reserve Editor for the independent consumer test. A later offline placement model earns a study if manual cuts work and the static predictions can be tested on unseen code.

## Department 4. View installation and local editing

**Lead: a Sol researcher rotating out of baseline or representation work. Opus supplies the cost prediction; Astra owns acceptance. Scope: the installation portion of T4.**

**Release condition.** A resident Chess view renders correctly and either lowers a cost the lab values or establishes a specific local-editing benefit worth pricing. The host can design the runner interface while this evidence is collected. Only the resident trial is needed for the first device decision.

**Commission.** Run the same import-free Wasm artifact first as preinstalled code, then delivered as bytes. Finally send typed source on an edit and compile to the same artifact on the P4. Keep the runner, semantic inputs and output limits identical. Source compilation already exists for whole worlds; integration for standalone screen procedures is outstanding. Keep compile work out of an interactive paint turn and measure worst unrelated input latency while an install is active. The earlier 1.898 s Chess compile measures a whole RV32 world and cannot be substituted for view-only installation time.

**First delivery.** A schema and artifact identity, cold and warm cache cases, rejection of a mismatched version, and retained replay while Chess sleeps. Keep the prior drawable generation until both the new program and its output for this state pass. Bound execution, memory, output primitives, text and raster work. The 64 KiB page in the 156-byte glyph probe is a reminder to price instantiation separately from code size.

**Decision.** Compute whether savings across actual publications and paints pay the one-time install cost over a measured session length. When resident, delivered and locally compiled modules have identical bytes, the warm execution cost should agree within noise. Any difference calls for tracing the paths. Price source distribution by its installation cost, edit-to-first-correct-frame and ability to edit on the handheld. Record every cache miss after a source or ABI change.

## Rendering optimization held in reserve

During M1 the experimentalist can cheaply count identical repeated measurements by node, width and font, wrapped-text calls, redraw area, genuinely changed pixels and transmitted pixels. Qualify the counters’ overhead. If eliminating the **entire measured stage** would save less than the predeclared worthwhile effect, close the corresponding lane with a measured ceiling.

If the opportunity is material, give a Sol researcher **one** of the following in the newly available slot. L1 compares bounded within-frame measurement reuse with the same full painter on a nested System screen and a wrapping Editor sequence. D1 compares full paint with conservative clipped repaint on cursor motion, scrolling and overlay removal; D1 can use the original layout even if L1 fails. Exact panel recovery, primitive counts and end-to-end latency decide whether either earns adoption. Broader persistent caches, spatial indices and hardware raster offload remain options for a diagnosed residual cost.

## Dispatch order and deliverables

| Review point | Work that can proceed together | What releases the next assignment |
|---|---|---|
| 1. Open the host wave | Opus records blind predictions; Astra owns the replay contract; Sol A traces admission/lifetimes; Sol B builds the hand-written System control. Director coordinates. | Frozen control replays twice, last-good behavior is specified, and the manual template and generic source can be compared on identical inputs. |
| 2. Run independent host comparisons | Sol A tests indexed JSON; Sol B qualifies System templates and freezes extractor rules. As a slot frees, implement the resident Chess control. Astra keeps Keys and the Editor sequence sealed. | Equivalent pixels and effects, explicit byte/work bounds where claimed, paired results from the control, predictions recorded before holdouts. |
| 3. Book the single board | One operator freezes firmware identity and runs the production control, then indexed JSON, manual/automatic System templates and resident Chess as each becomes eligible. Reinsert the control between blocks. | Director decides which candidates merit independent replay, installation experiments or a gated layout/paint treatment. |
| 4. Close the program | Independently replay winners. For two interacting changes, measure control, each alone and both together. Compare with real live use after deterministic qualification. | One comparative decision table with adopt, revise, inconclusive or archive for every funded study. Leave the latest qualified playable image installed. |

With the present Codex configuration the director can supervise three active Codex workers. The first wave fits one Astra and two Sol assignments. Opus is a separate Claude CLI commission. These are proposed assignments; the earlier Opus and Astra reviews are already complete. The director owns the single device queue and an integrator owns each combined build.

Each commissioned researcher delivers an intern-facing design with a worked example and file/API references, a prediction recorded before seeing candidate timings, experiments under the study ticket’s `scripts/`, a detailed skill-format diary, scoped commits, reproducible results and a concise decision with limitations. Include failed and negative results. Publish the completed study reports in the lab's usual vault and reMarkable workflow. Raw observations belong to their originating study; the director's synthesis cites the receipts and states the tested scope of every claim.

**Proposed first authorization.** Fund the shared baseline, the ownership and bounded-reader study, the manual System template, and a manual resident Chess view. Release automatic extraction after the manual comparison; release distributed code and local compilation after the resident comparison. This gives the departments a compiler research question, a systems result and a real handheld outcome, with a clear way to stop each independently.
