---
Title: Investigation diary
Ticket: PICOCALC-CJI-RANGES
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-18T11:12:27.735059355-05:00
WhatFor: ""
WhenToUse: ""
---

# Investigation diary

## Step 1 — Try separating receiver inference from the final numeric proof

Agenda reruns inference on a tree that grows as more library calls are resolved. I tested whether intermediate rounds can resolve receivers without repeating a complete range proof. The independent reference unit still matched Agenda. Wider testing found a difference in code generation, which makes this an experimental schedule.

### Prompt Context

**User prompt (verbatim):** “go for big boy improvements if possible, be bold, the world is your oyster and nothing about the compiler is sacred, you can change everything, new passes, IR, complete reorganizatino, etc... Just make sure to write everything up precisely and commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)”

**User prompt (verbatim):** “you can think really hard and do compiler research, and I also downloaded ~/Downloads/'Engineering a Compiler (Keith D. Cooper, Linda Torczon) (z-library.sk, 1lib.sk, z-lib.sk).pdf' for you”

**User prompt (verbatim):** “if you are about to implement a consequential optimization or approach, create a new docmgr ticket and Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.


That's so I can understand and learn from your work in the future, even though i'm new to the field.”

**Assistant interpretation and inferred intent:** Give each consequential design an independently readable, retraceable record. I moved the isolated experimental patch and its test recipes into this ticket when the user requested a dedicated workspace. The established benchmark harness stays in PICOCALC-CJI-PERF.

### What I did

- Read the expansion loop, type writer and numeric demotion logic. Built a copied compiler from a patch in scripts/19-defer-range-proof.patch. Stage 0 compiled the modified bundle into native stage 1.
- Ran scripts/21-check-deferred.py across the manifest. Used the sibling ticket's script 13 to count actual range work in the candidate on Agenda.
- Compared original archive fixtures with scripts/23-check-original-fixtures.py. For the first differing fixture I ran each SLIR through the original slas runner and compared stdout to the archive's hashed.out.
- Consulted Cooper and Torczon's third edition, §§9.2, 9.3.6 and 9.4. Recorded the applicability and limits of sparse propagation in the guide; kept the supplied PDF outside the repository.
- Uploaded the guide to /ai/2026/11/18/PICOCALC-CJI-RANGES. Receipt: OK: uploaded CJI Intern Guide - Scheduling Numeric Range Proofs.pdf.

### Why

The measured whole-program proof was nested inside helper expansion and consumed most inclusive host instructions. Changing when that proof runs targets whole redundant analyses and avoids retaining megabytes of serialized memo entries.

### What worked

The source differential matched 22/22 exit statuses, outputs and diagnostics. Agenda full analyses fell from seven to two, fixed-point rounds from 95 to 20 and interval joins from 11,743,517 to 3,036,247. The generated Agenda world unit remained byte-identical. The changed compiler bootstrapped on the host.

### What didn't work

The hypothesis that the two schedules always emit identical instructions failed on collections/hashed.js. Reference and trial compiled successfully but produced 320,000 and 327,897 bytes of SLIR text. The diff contains a distinct Map$set specialization and a changed floating equality branch. Both outputs ran and matched all ten expected lines.

### What I learned

Helper specialization can depend on numeric annotations already present on the expanded tree. A successful catalog sweep is a useful deployment observation, while the archive fixture exercises language combinations absent from that catalog.

### What was tricky to build

The ordinary writer consumes owned input statements. The prototype must write a full annotated tree for the next expansion, leave the sidecar call sequence intact, and run a complete proof after expansion. Source-level and compiled experiments use different clocks and tools.

### What warrants a second pair of eyes

Find the first differing specialization input on hashed.js, and inspect whether numeric annotations copied between trees remain valid. Check signed zero and NaN outcomes, compiled bytes, and the record/use sidecar mode independently.

### What should be done in the future

Complete the wider fixture comparison, paired native measurements and the headless P4 candidate run. Establish a rule for the changed output before enabling the schedule by default.

### Code review instructions

Read design-doc/01-scheduling-numeric-range-proofs-in-the-cji-compiler.md, then examine scripts/19-defer-range-proof.patch. Reproduce catalog checks and work counts using the specific commands in the guide. Compare the control and candidate digests with various/catalog.jsonl.

### Technical details

The two accepted translations of hashed.js have SHA-256 values fa672dd2459953595b549a2bc70eb198c19e7e58e5ff746b6689b0175fadcc72 and 37255ee6a2c9f07d05266e885eb9471df10d66604b2d7356ea9b2efbb2686755. This checkpoint qualifies the source experiments. Performance claims need separate receipts.
