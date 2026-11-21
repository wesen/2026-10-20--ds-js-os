---
Title: Physical shadow experiment handoff and investigation diary
Ticket: PICOCALC-SHADOW-CODEGEN
DocType: reference
Status: active
---

# Physical shadow experiment handoff and investigation diary

## Step 1: Commission and review an independent shadow-path classifier

The device department prepared an independent host oracle for measuring the paths taken by the shadow predicate. An Opus High researcher used a private Goja REPL sandbox to check two hand-calculated examples. The lab director then consolidated the departments into one sequential investigation. All device work stopped before opening the serial port.

### Prompt Context

**User prompt (verbatim, from the follow-up):** “what are the full investigations and implementations plans?”
**Assistant interpretation:** Specify an experiment that distinguishes the cost of an early projected-box rejection from a complete floor-shadow query.
**Inferred user intent:** Understand the generated code for the unchanged raytracing algorithm and choose a compiler improvement from measured behavior.

### What I did

- Located the previous twelve scene fixtures, restoration-checked serial runner and pinned playable build. The historical restore image SHA-256 is `e7b771aabc1a9cb0719caa5e30a1b7beed7d4ed33e05e600766246ea492a19b5`.
- Commissioned Opus High through `scripts/device/01-opus.py`. Saved the code in `scripts/device/02-classifier.mjs`, receipt in `various/device/classifier-receipt.json` and the executable REPL query transcript in `various/device/classifier-repl.jsonl`.
- Checked that the external researcher exited successfully. No board image was installed and no physical trials were performed.

### Why

The shadow routine may visit three spheres and may return early. A timer around the complete call includes multiple outcomes. A second control with exactly one sphere gives an observable cost per call for x rejection, y rejection, an exact-test miss, or a hit.

### What worked

The researcher labelled sphere visits in source order and stopped at the first hit. Two REPL evaluations returned `x,hit` and `x,x` on one two-sphere fixture. The separate historical REPL sanity query returned 9,182 executions for the previously captured RV32 location `scalar-lane-load` in `empty-row` and `empty-opening`.

### What didn't work

No experiment failed. The director ended the lane before corpus validation, harness construction and board measurement. The two evaluations above are the entire classifier validation for this checkpoint.

### What I learned

Input coordinates, projected box extent and prepared light state determine the paths. Each sphere visit contributes exactly one label. A path can contain several different labels. A ratio of whole-scene cycles to exact-test count includes the cost of all the other work done in that scene.

### What was tricky to build

The Typed routine uses unsigned halfword buffers for two-dimensional arrays and signed i32 arithmetic. The independent JS classifier reads the corresponding slots as integers and uses BigInt for the dot product and squared-distance calculation. Its equivalence requires proving the relevant i32 intermediates fit for the tested scenes or validating them against the exact guest for each input. It currently assumes properly prepared buffers with one to three spheres or count zero.

### What warrants a second pair of eyes

Check each returned Boolean against the exact Wasm `typedRayInShadow` on the twelve previous scenes before using labels for performance reporting. On malformed buffers the JS function does not implement the language's complete access contract. The control applies to the renderer's valid prepared input.

### What should be done in the future

- For a baseline, enumerate every visible floor pixel in raster order using the primary planes, then measure both Typed and production C over the same sequence with a post-run Boolean check.
- Add a one-sphere fixture that yields all four outcomes. Preserve raster order within every cohort and publish cycles per call, including shared traversal and output-store overhead.
- Stage the layout-controlled C only after documenting where the native prepared struct and the Typed halfword buffer reside. Keep full-frame and direct-call endpoints distinct.
- Use the preceding SIMD ticket's `scripts/ray/02-run-board.py` and verified restoration logic when the sequential investigator is ready.

### Code review instructions

Read `typedRayInShadow` in `picocalc-os/worlds/raytrace/raytrace.typed`, then read `scripts/device/02-classifier.mjs` and the actual calls in `various/device/classifier-repl.jsonl`.

### Technical details

For sphere index s, the prepared object's coordinates and radius begin at 1 + 5s. Its projected shadow box begins at 21 + 4s. The light x and y components are encoded with an offset of 32; the z component is 32. The count occupies slot 16. A projected x failure omits the y test, and a y failure omits the dot product. Only an exact hit terminates the complete call early.
