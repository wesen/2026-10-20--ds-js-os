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

## Step 3. Compare integrated source stages and independently replay the device result

I integrated the two frontend features and real material evaluator, then compared all three assembled sources on both targets. An independent researcher qualified the material graph, geometry, numeric model, application UI and physical performance. Each lane's project article and diary are in this ticket.

### Prompt Context

See Step 1 and the original commission in sources/commission.txt. The comparison requires the same authored meanings and a stage-by-stage integration.

### What I did

The stage checker at 6a05083 compared full retained graph storage, parameter edits and material samples after each invocation. Commit 39c57eb brought the builder article and regressions into the shared branch. I reviewed the seven oracle frames, validation cases, fractional predicate disagreements and physical receipts, then computed medians directly from the 108 row records.

### Why

A matching image alone can hide two distinct types of error. Different graphs can yield the same quantized result on today's inputs, and two targets can share the same lowering bug. The test layers isolate graph structure, unlit colors, final RGB565 and the ordinary displayed viewport.

### What worked

The direct, fluent and captured fixtures agreed at every tested weight on both targets. Independent C and Python agreed on 38 validation cases and seven whole frames. Nine cold installs and 108 paired per-pixel/row measurements qualified on the board. The five ordinary screen captures each matched the reference on 57,600 viewport pixels. The release was verified by a final readback. The original classic frame also survived reset.

### What didn't work

A historical compiler experiment assumes generated code exceeds 300,000 bytes. The current and control compilers both generated 248,108 bytes for that workload. The builder researcher preserved the stale size expectation in the regression diary. It did not differentiate the two compilers. Decimal tile frequencies also disproved a broad assumption about fixed-point agreement. A one-tenth tile frequency changed 8,516 of 25,600 predicates against exact arithmetic.

### What I learned

The unit of material execution matters. Across callback-stage observations the paired reduction was 81.24% for shared materials and 89.17% for the captured tile shape. The row shader both amortizes calls and specializes common expression shapes. The experiment does not identify the independent contribution of dispatch alone.

### What was tricky to build

The verification crosses an ABI that passes 16-bit cells, stores unpacked color in two cells per sample, and finally quantizes RGB565. Preserving the shader's unlit samples in a separate receipt avoids attributing lighting or packing errors to graph construction. Keeping geometry on the C side for this commission held the reference constant.

### What warrants a second pair of eyes

Peak QuickJS allocations, monitor-observed PSRAM high-water changes, code image bytes and resident relocated storage are different quantities. Inspect the per-install rows before adding any of them together.

### What should be done in the future

The new PICOCALC-TYPED-RAY ticket compares a complete Typed scalar renderer to the same C image and investigates the cost of its generated instructions.

### Code review instructions

Read the director article and follow its links to the independent evaluator and physical report. Recompute medians from various/review/rows.json grouped by stage and fixture. Read various/review/final.json for the qualified application and partition hashes.

### Technical details

Final Candela image f3dc689a28dc1db1d3e91a44a288a87144b63e7b3005c3eefbec71d844008951. The ordinary stage compiles once. The setter batches contain 1,024 edits per measurement. Hardware capture data, controls and summaries were committed by the physical reviewer in 598a781.

## Step 4. Publish all five studies

I staged the five articles and two linked physical figures using the research archive publisher. It validated local links, wrote each vault note, committed only the seven commissioned files and pushed them. It then compared remote main and every committed blob with the expected content.

- Vault revision: 8f6d2e2621c20b11788d61f3eade412060a2ec34.
- Receipt: various/director/publication.json.
- Review: open the director article and follow its four companion study links in the vault.
