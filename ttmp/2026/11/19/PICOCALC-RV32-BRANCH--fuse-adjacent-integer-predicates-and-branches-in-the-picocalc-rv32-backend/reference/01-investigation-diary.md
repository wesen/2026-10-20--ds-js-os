---
Title: Investigation diary
Ticket: PICOCALC-RV32-BRANCH
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Chronological evidence and decisions for the adjacent predicate experiment."
LastUpdated: 2026-11-19T19:30:45.260513098-05:00
WhatFor: ""
WhenToUse: ""
---

# Investigation diary

## Step 1. Identify and isolate branch fusion on the production register backend

The prior study establishes the current image sizes and the depth-indexed operand invariant. I chose small static lookahead over explicit delayed comparison entries because the current frontend has structured consumers and the register backend already puts predicate operands in stable locations. The guide records this decision before implementation.

### Prompt context

The supervisor commissioned a Scope A experiment at `6426798` with a pre-implementation guide, reproducible ticket-local code and evidence, Files/Agenda/Editor qualification, comparative static and dynamic measures, a board handoff, a vault project report, and reMarkable delivery. This is a summary of the delegation. See the supervisor's ticket for the original authored request.

### What I did

- Inspected `FunctionCode`, structured frontend conditions, the prior study's harnesses, and the A2 and A3 designs.
- Ran `docmgr ticket create --ticket PICOCALC-RV32-BRANCH --title 'Fuse adjacent integer predicates and branches in the PicoCalc RV32 backend' --topics picocalc`.
- Added this diary and the intern guide with `docmgr doc add` and wrote the design before creating any patch.

### Why

The fixed-width pre-existing branch path isolates one hypothesis. Savings come from avoiding a short-lived integer result, with no branch relaxation pass influencing the comparison.

### What worked

The source confirms seven existing predicate operations, including the unsigned bounds relation, and adjacent structured consumers. The preceding baseline study recorded 804, 4,058 and 21,886 words for the three applications.

### What did not work

No substantive failures in the design stage.

### What I learned

The frontend stores immediates as individual cells, so lookahead is valid only from a comparison opcode with no immediate. The local B-type branch tests the complement of the eventual jump condition.

### What was tricky to design

`if` and `br_if` take different polarities. The scratch destinations must be distinct when both operands live in frame slots. Taking an optional `eqz` without unbounded scanning provides a direct loop-path reduction while bounding compile-time lookahead.

### What warrants a second pair of eyes

Verify swapped operands for greater-than and less-or-equal, and verify that the height saved by `begin` reflects consumption of both original operands.

### What should happen next

Build the exact pair in isolated scratch directories and qualify the candidate through normal entry points.

### Code review instructions

Begin with the symbol-level references, truth table, and qualification sequence in the [intern guide](../design-doc/01-intern-guide-for-fusing-rv32-integer-predicates-into-structured-branches.md).
