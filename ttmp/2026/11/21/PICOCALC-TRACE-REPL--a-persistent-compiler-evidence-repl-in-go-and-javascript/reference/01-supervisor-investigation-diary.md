---
Title: Supervisor investigation diary
Ticket: PICOCALC-TRACE-REPL
Status: active
Topics:
    - compiler
    - performance
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T14:20:47.00276564-05:00
WhatFor: ""
WhenToUse: ""
---

# Supervisor investigation diary

## Step 1: Commission the query language and set up a blind usability study

The previous workbook could check its assumptions against a real compiler archive, but could not execute the language it proposed. The new ticket makes those examples acceptance cases for a local service. One worker owns the Go session lifetime, one owns authenticated archive reads, and Opus owns the JavaScript query evaluator. A separate research worker owns blind usability trials and the living playbook.

### Prompt Context

**User prompt (verbatim):**

> Ok, write a go version using ~/code/wesen/go-go-golems/go-go-goja, with a REPL service so that you don't need to recompute everything all the time but can keep things in the sandbox emmory. Create a new docmgr ticket, use subagents at your leisure, run subagents as personas with pi coding agent deepseek-4.1-flash that pretend to be these compiler engineers / researchers, and analyze how well they use the tool / the API / the .
>
> Look at /home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/11/21/ARTICLE - Playbook - Improving an Agent-Facing JavaScript API with Persona Runs - Lessons from homolog-bench.md and
>
> Write up the design and spec and examples that you put out above, in the same level of detail (verbatim, if you want). Use opus xhigh to implement, and tell it to use deepseek-4.1-flash thinking high subagents (or a mix, if they want, with opus high and opus medium personas too), to do various optimization based tasks, simple but also complex. Have them write a playbook for the persona based testing (and update it as they improve their methods).

**Additional user instruction (verbatim):**

> also point them at Projects/2026/11/21/ARTICLE - Playbook - Persona Sessions with Agents - Improving Software and APIs from Usability Reports.md

**Assistant interpretation:** Implement a stateful Go-hosted evidence workbench, run the specified agents against its actual interface and preserve a repeatable testing method.

**Inferred user intent:** Learn both what the existing compiler evidence can answer and how independently working compiler engineers discover those answers.

### What I did

- Created `PICOCALC-TRACE-REPL` with docmgr. Identified the prior design, its 26 small modules, independently verified facts and the six indexed pass logs.
- Gave the Opus xhigh implementer an isolated work directory, the workbook, both requested articles and a precise native bridge. Its production output is subject to independent checks. The durable brief is `scripts/commission/opus-query.md`.
- The usability worker verified the installed Pi provider ID `lunaroute/deepseek-4.1-flash`. Isolated persona sessions receive the public interface and goals. Reviewers retain the answer key.
- Wrote the native installation boundary in `pkg/traceapi/install.go`. Go copies archive records into the requesting JavaScript VM as plain data. The host's mutable Go state stays behind read-only methods.

### Why

Persisting a VM saves the investigator's calculations and bindings. Sharing the immutable archive also saves decompression across investigators. Confusing those two kinds of reuse makes memory and performance claims difficult to test.

### What worked

The compiler archive, both source articles, the local go-go-goja checkout, Claude Code and the Pi provider catalog were present. The Goja checkout contains runtime and REPL implementations suitable for source-level inspection.

### What didn't work

The initial sandboxed `pi --list-models deepseek` returned `EROFS: read-only file system, mkdir '/home/manuel/.pi/agent/trust.json.lock'`. The usability researcher verified the installed provider with permission to perform ordinary Pi startup. No model name was inferred from a marketing label.

### What I learned

The source workbook includes several queries whose correct answer is missing evidence. The original study never recorded per-PC samples. A compiler workbook can test a negative capability as precisely as an integer count.

### What was tricky to build

LLVM offsets are bytes into the *inflated* log. A JS string offset would use UTF-16 code units. Keep slicing and integrity validation in Go and return strings only for already selected byte ranges.

### What warrants a second pair of eyes

Check that two identical pass names cannot collapse into one entry, missing scope cannot become zero, and user-owned state never crosses session boundaries.

### What should be done in the future

Replay the original workbook, run the blind personas, reproduce their findings and repeat a revised task on a fresh session.

### Code review instructions

Start at `pkg/traceapi/install.go`, the commissioned evaluator brief and the original workbook appendix. Compare the command's session lifecycle with the archive's independent lifetime.

### Technical details

A middle/backend ordinal belongs to one variant and one stream. Every usable pass witness must include its stream SHA, ordinal and half-open byte range.
