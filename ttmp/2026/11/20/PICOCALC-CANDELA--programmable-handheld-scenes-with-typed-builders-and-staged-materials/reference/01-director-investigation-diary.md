---
Title: Director investigation diary
Ticket: PICOCALC-CANDELA
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T23:38:17.131890629-05:00
WhatFor: ""
WhenToUse: ""
---

# Director investigation diary

## Step 1. Freeze the contract and establish separate owners

I read the complete attached assignment before opening the ticket. I preserved the original brief in sources/commission.txt. The chosen boundary is a graph with one representation independent of both the frontend and the device rendering engine.

### Prompt Context

The attached commission says “I’d run three implementation teams and one independent reviewer.” The user also instructed “Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill”. The full assignment, including its original examples, is preserved in [the commission](../sources/commission.txt). My responsibilities include callback integration, cross-team qualification, synthesis and vault publication.

### What I did

Created the ticket, froze two fixtures and a bounded buffer contract in c065dc2, then assigned geometry and Typed material evaluation, frontend builders, callback staging, and independent board verification. The last team owns the serial port exclusively. Requested Opus with high effort for research via the authenticated CLI.

### Why

The graph is cheap enough to compare in its entirety and lets the renderer and authoring teams develop independently. Freezing the fixtures first makes a different surface or lighting result measurable.

### What worked

The handheld's existing two-byte buffer mechanism represents a complete bounded graph in 303 cells, plus its external four-byte capacity header. Color channels stay separate until RGB565 output.

### What didn't work

Automatic approval review held two researchers' prompts containing internal contract material. We requested payload-specific permission and used bounded, general methodology questions while waiting. External approval of a process is not evidence that a research result was returned.

### What I learned

The syntax teams both touch direct call resolution. Separate worktrees and narrow integration points let each test its own compiler before combining them.

### What was tricky to build

One graph cell stores one 16-bit integer. An RGB888 channel triple fits into three node operands, while the bulk shader needs two output cells per pixel before lighting.

### What warrants a second pair of eyes

Invalid input must be rejected before replacing the active graph. Uniform edits must preserve shared handles and be isolated from graph reconstruction.

### What should be done in the future

Measure the three authoring stages against identical geometry on the actual board.

### Code review instructions

Start with design-doc/01 and inspect the two source forms for each fixture. Compare complete graph buffers and a separate pixel oracle.

### Technical details

Node, material, sphere and parameter counts are distinct. Node references point backward. The fixture layouts deliberately allow the validator to detect type mismatches, forward references and capacity errors.

## Step 2. Merge independently produced frontend features

I implemented the expression-only callback in a detached worktree at 5b0602f, then integrated it into main. The namespace, receiver and record options compiler change in the other worktree met it at the direct-call emitter.

### Prompt Context

See Step 1 and the attached commission’s independent teams and integration order.

### What I did

Merged the callback as d46c0a0, wired scene selection and parameter editing through the normal graphics path at 9a3986e and merged static builders at 89512ad. Kept the existing graphics operation and used its integer argument to transmit the validated scene selection. Added explicit callback and direct call tests, plus a deterministic stage assembler.

### Why

A callback builds expression handles immediately. While lowering its body, existing local bindings and caller-owned buffers are still live. Only its point parameter needs a temporary lexical binding. No runtime closure or heap environment is necessary.

### What worked

The callback test compiled to 178 Wasm bytes and 272 generated native bytes. Two Wasm constructions incremented the construction counter exactly twice. Ten negative checks across the two targets passed. The callback binder's shadowed outer variable survived. The five normal native compiler tests passed after merging.

### What didn't work

Cherry-picking the fluent compiler milestone produced a content conflict in typed-wasm.js around call(name). I retained the callback helper and the new member-call helpers and reran both suites. An initial node --test invocation reported only two outer test files; I reran the normal per-file commands from picocalc-os for actual case counts.

### What I learned

Typing the point parameter as a distinct construction context makes an ordinary function call enough to append a position node. Per-hit booleans require a different diagnostic from ordinary type mismatch.

### What was tricky to build

The typechecker also handles source ranges. The callback lookahead starts at the end of the parameter token's actual source span, rather than depending on whole-source lexer cursor state.

### What warrants a second pair of eyes

Check field resolution versus receiver resolution, captured parameter identity, and code emission order when a record literal reorders named options with side effects.

### What should be done in the future

Exercise the completed material shader and normal loader with all three source forms, then verify the UI selection and parameter controls.

### Code review instructions

Run scripts/callbacks/verify.mjs from the repository root. Review FunctionEmitter.patternBody and the typed fixtures under picocalc-os/worlds/candela.

### Technical details

The callback is expression-only and available when the named function pattern is unbound. The frontend lowers the parameter to the construction-time SurfacePoint sentinel. Calls in the body still use normal Typed resolution, argument checking and result checking.
