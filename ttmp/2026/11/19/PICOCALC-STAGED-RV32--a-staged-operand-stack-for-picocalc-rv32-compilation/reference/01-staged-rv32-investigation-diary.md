---
Title: Staged RV32 investigation diary
Ticket: PICOCALC-STAGED-RV32
Status: active
Topics:
    - picocalc
    - compiler
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T20:23:30.429844293-05:00
WhatFor: ""
WhenToUse: ""
---

# Staged RV32 investigation diary

## Step 1 — Freeze the comparison and scope the research request

The Scope A lane starts from `40bcf850a5809ef6d839127869faa952596ed157`. The production `typed-rv32.js` at this revision is byte-identical to the file at the earlier fusion patch's extraction revision, `6426798`. The frontend gives the native compiler numeric immediate cells, while the older counting model walks Wasm encodings and must be interpreted as a hypothesis about target words.

### Prompt Context

The supplied lab direction appears in the attachment `pasted-text-1.txt`. The operative row reads verbatim:

> | Researcher 2 · Native code generation | Take Files from the 738-instruction fusion candidate toward the professor’s 593-instruction model. Explain the difference per function, then predict Agenda’s result before running it. | A model that predicts a second app, or an account of which assumptions failed. Continue to Editor and slot reduction once the model earns that confidence. |

The supervising task assigns this lane an intern guide in its own commit before implementation, a detailed diary, an actual Claude Opus high research contribution, isolated artifacts, a physical measurement handoff, and an article for the vault.

### What I did

- Extracted the exact control hash with `git rev-parse 40bcf85` and used `cmp` to verify that the earlier fusion patch applies to the same backend bytes.
- Read `typed-rv32.js`, the old stage model, and the four-lane combined trial harness. The shipped backend already places five operand-stack entries in registers and eagerly computes local reads and constants.
- Checked the no-tool authenticated CLI from an empty temporary directory. The request ran as `claude -p --model opus --effort high --restricted --safe-mode --strict-mcp-config --tools '' --no-session-persistence --output-format json`. The service returned the readiness string and reported `claude-opus-5-5`.

### Why

Holding the frontend, wrapper and runtime constant isolates the lowering changes. The starting point of 738 words is the previous predicate-fusion result, and the production control remains a separate line in the comparison.

### What worked

The control hash resolves and the earlier patch context matches. The tool-free authenticated readiness request succeeded with network escalation.

### What didn't work

The automatic reviewer rejected submitting the pinned backend, fusion patch and stage summary with the design prompt. Its reason was “The command uploads private compiler source, patches, and measurement data to the external Claude service, but the user did not explicitly authorize that specific sensitive payload to that destination.” A separate generic compiler design question contains public abstractions only. Automatic review allowed that request. The source-backed analysis stays local pending further authorization.

### What I learned

The historical model counts source-level lowering categories, but the current production backend and benchmark input each need their own frozen identity. Application numbers in the old design cannot substitute for a current compilation.

### What was tricky to build

A caller's saved stack homes survive a nested imported or internal call. Lazy return values in `a0` add a dependency on the next call or other scratch use that the eager control does not have. Frame, slot, and immediate scope all matter for the correct recovery.

### What warrants a second pair of eyes

Review deferred reads that cross transforms, both arms of value-producing branches, and deep entries sharing the two scratch registers. Verify that the prediction predates any candidate compile of Agenda.

### What should be done in the future

Qualify the reset and restoration path with the supervising board operator once the candidate passes the host gate.

### Code review instructions

Start with `picocalc-os/compiler/typed-rv32.js` at the pinned revision. Review the previous fusion patch and the old stage model alongside the proposed implementation guide.

### Technical details

Instructions count as 32-bit words. Branch distances are signed relative byte offsets. The four-lane host and firmware fixtures are under the sibling `PICOCALC-RV32-COMBINED` ticket.
