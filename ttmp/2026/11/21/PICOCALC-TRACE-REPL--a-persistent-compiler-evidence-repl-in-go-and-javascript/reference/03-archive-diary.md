---
Title: Archive reader investigation diary
Ticket: PICOCALC-TRACE-REPL
Status: active
Topics: [compiler, performance, picocalc]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Design and verification of the Go reader for actual indexed LLVM evidence."
LastUpdated: 2026-11-21T14:24:16-05:00
WhatFor: "Review the evidence identity, cache lifecycle and regression probes below the JavaScript API."
WhenToUse: "When adding a query source, diagnosing a suspect count, or reproducing a persona finding."
---

# Archive reader investigation diary

## Step 1. Establish an addressable evidence record

A REPL query may evaluate the same function hundreds of times while an engineer investigates one pass. I inspected the original Python capture program and a checked LLVM trace to determine what the Go server can retain and how a second reader can recover the same evidence. An event records an occurrence at an ordinal in one stream. Its header names the pass, and its reference identifies bytes by digest and half-open range.

### Prompt Context

**User prompt (verbatim)**

> Ok, write a go version using ~/code/wesen/go-go-golems/go-go-goja, with a REPL service so that you don't need to recompute everything all the time but can keep things in the sandbox emmory. Create a new docmgr ticket, use subagents at your leisure, run subagents as personas with pi coding agent deepseek-4.1-flash that pretend to be these compiler engineers / researchers, and analyze how well they use the tool / the API / the .
>
> Look at /home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/11/21/ARTICLE - Playbook - Improving an Agent-Facing JavaScript API with Persona Runs - Lessons from homolog-bench.md and
>
> Write up the design and spec and examples that you put out above, in the same level of detail (verbatim, if you want). Use opus xhigh to implement, and tell it to use deepseek-4.1-flash thinking high subagents (or a mix, if they want, with opus high and opus medium personas too), to do various optimization based tasks, simple but also complex. Have them write a playbook for the persona based testing (and update it as they improve their methods).

**Additional user prompt (verbatim)**

> also point them at Projects/2026/11/21/ARTICLE - Playbook - Persona Sessions with Agents - Improving Software and APIs from Usability Reports.md

**Assistant interpretation.** This lane supplies a shared Go reader to the REPL service and its JavaScript bindings. The other lanes own session management and evaluation.

**Inferred user intent.** A compiler engineer can query one observation repeatedly, reproduce a result from its underlying bytes, and see when queries actually read new data.

### What I did

- Read both persona-testing playbooks, the archived manifest, the capture script `09-archive-llvm.py`, the previous Python extractor `10-read-pass.py` and the previous query workbook's independent verifier.
- Inspected first, last, and repeated headers in all three variants and both phases. Checked the complete dataset for the middle-end and backend pass-ID syntax used by the parser.
- Specified the shared Go API and the exact JSON field names for each event and reference with the query implementer and service owner.

### Why

Each invocation of virtual register rewriting has the same printed name. The compiler engineer needs an individual address for each invocation. Both playbooks emphasize reproducing symptoms at their source. For an incorrect answer in the REPL, a reader must be able to locate its evidence independently.

### What worked

The six headers tables decode from gzip archives. Checked middle has 195 entries, checked backend 116. Ordinals 74 and 78 in checked backend both name `virtregrewriter`.

### What didn't work

A lookup by pass name alone cannot distinguish the two backend occurrences. This is a limitation of that proposed key. The archive's original per-stream ordinal distinguishes them.

### What I learned

The checked middle-end stream starts its first indexed dump at byte 50. LLVM had printed a diagnostic preamble. The backend stream begins at zero. An individual event's range can also contain printer diagnostics for the next pass, so consumers need function-aware parsing when measuring instructions.

### What was tricky to build

LLVM's middle-end uses a title of the form `EarlyCSEPass on row`; the backend prints a readable title, an identifier in parentheses and, in some dumps, a trailing ` ***:`. The index preserves that colon and the preceding asterisks. The reader preserves the raw header and extracts the correct ID separately.

### What warrants a second pair of eyes

The index supplies the claimed evidence reference before the body has been verified. The first body read verifies that the stream digest, length and every indexed header match. Document this distinction for callers working with a damaged corpus.

### What should be done in the future

Run the real checked-row measurements, check failed-read recovery on a synthetic corrupted record, and exercise concurrent first reads.

### Code review instructions

Read the old capture script alongside `pkg/tracearchive/archive.go`. Compare ordinals 73 and 74 of checked middle with their headers, and compare the second line of backend ordinals 74 and 78.

### Technical details

The address is `{variant,phase,streamSHA,ordinal,start,end}`. The SHA-256 covers the uncompressed stream. Both offsets address bytes in that stream. The final event ends at the manifest's exact raw byte count. Summary citations use a separate digest over the original JSON file.
