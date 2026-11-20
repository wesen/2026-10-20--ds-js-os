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
