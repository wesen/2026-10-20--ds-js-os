---
Title: Usability diary
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
LastUpdated: 2026-11-21T14:23:49.083979257-05:00
WhatFor: ""
WhenToUse: ""
---

# Usability investigation diary

## Step 1: Commission three blind sessions

I prepared three role cards and one tool that evaluates JavaScript on a named loopback session. I checked that Pi could reach the requested provider using a generic transport prompt before exposing any study data.

### Prompt Context

The full implementation request is recorded in the supervisor diary. The user's additional instruction was “also point them at Projects/2026/11/21/ARTICLE - Playbook - Persona Sessions with Agents - Improving Software and APIs from Usability Reports.md”. I took this to require fidelity to the observed-query and independent-reproduction methods of both named playbooks.

### What I did

- Read both vault playbooks and the project verifier. Created separate briefs for a compiler intern, a middle-end engineer and a performance reviewer. Every role receives the same common brief with both method references.
- Confirmed provider and model using `pi --list-models deepseek`. Added an explicit provider extension and `--thinking high` for the subsequent real calls.
- Implemented a Pi tool accepting exactly one string and a standard-library Python runner that creates and deletes a fresh service session, starts Pi in an empty directory and retains only actions and final answers.

### Why

A token representing a name can occur in several compiler prints. The optimizer persona must establish identity and adjacency. A summary of aggregate executed instructions can justify a pass ablation on a workload, but it cannot by itself identify the critical PC. These two examples test different kinds of evidence discipline.

### What worked

Pi listed `lunaroute/deepseek-4.1-flash` with thinking support. The scoped transport probe returned exactly `READY`. Pi also loaded the isolated analysis extension and listed the same model without an extension error.

### What didn't work

`pi --help` in the workspace sandbox failed with `EROFS: read-only file system, mkdir '/home/manuel/.pi/agent/trust.json.lock'`. Running Pi with the necessary access resolved its local lock. A generic probe using `--no-extensions` then returned `No API key found for lunaroute.` Explicitly loading only the installed Lunaroute provider extension restored model discovery and authentication.

### What I learned

The user's default Pi configuration loads unrelated tools. The provider supplies both model discovery and authenticated transport through an extension. A controlled room needs an explicit provider plus an explicit tool selection.

### What was tricky to build

The measurement needs the executed queries, not just a fluent final answer. Pi's JSON mode emits both public events and private thinking deltas. The runner filters event types and retains only tool-start, tool-end and final user-visible message data.

### What warrants a second pair of eyes

Check whether any claim in the final debrief is unsupported by the retained replies. Exact numerical answers can mask accidental disclosure through a help example.

### What should be done in the future

Run the baseline against the stable executable, reproduce findings and rerun affected cards.

### Code review instructions

Read the common brief and all three cards, then the runner, its Pi extension and the two source playbooks linked from the operator guide.

### Technical details

Every session has a ceiling of fourteen evaluations and eight minutes of wall time. Service loopback is fixed by the host. The model sees neither a session ID nor a general-purpose network primitive.
