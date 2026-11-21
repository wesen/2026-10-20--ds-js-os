---
Title: Investigation diary for Candela graph rendering and Typed materials
Ticket: PICOCALC-CANDELA
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/nucleus/candela_scene.c
      Note: Validates candidates and calls the Typed shaders
    - Path: repo://picocalc-os/worlds/candela/materials.typed
      Note: Contains the scalar evaluation and certified row reuse rules
    - Path: repo://ttmp/2026/11/20/PICOCALC-CANDELA--programmable-handheld-scenes-with-typed-builders-and-staged-materials/scripts/renderer/03-qualify.sh
      Note: Replays C geometry and both ordinary Typed compilation targets
ExternalSources: []
Summary: ""
LastUpdated: 0001-01-01T00:00:00Z
WhatFor: ""
WhenToUse: ""
---

# Investigation diary for Candela graph rendering and Typed materials

## Step 1. Freeze the boundary and build the shader path

The renderer lane took the representation from the director's pinned contract at `c065dc2`. The interface gives the frontend teams a direct-call path for constructing graphs and gives the native team stable function signatures for the board harness. The checked graph is the boundary between C geometry and Typed materials.

### Prompt Context

**Implementation brief:** “Implement Typed scene builders + material evaluator (bulk scanline and scalar) and integrate existing renderer with graph descriptors and shading, C geometry only. Build two fixtures, real pixels/immutability, host tests.” The director assigned Team 1 in `sources/commission.txt` and requested independent Opus High methodology and a textbook article.

**Assistant interpretation:** Keep the preexisting ray and lighting work in the native renderer. Give each winning ray a typed material expression, and evaluate those expressions in Typed on both compilation targets.

**Inferred user intent:** Show that an author can share and derive materials, change a runtime parameter, and get real pixels without rebuilding topology or adding a specialized C material interpreter.

**Commit (code):** `00e0a38` — “Render validated Candela graphs with Typed scanline materials”.

### What I did

- Pinned and shared the direct Typed builder signatures, the scalar and row shader signatures, RGB888 packing, geometry limits and exact hand fixtures with the director, frontend lane and board reviewer.
- Implemented checked builders and setters in `picocalc-os/worlds/candela/builders.typed`, scalar and bulk execution in `materials.typed`, and the two hand-built graph fixtures in `hand.typed`.
- Added the graph validator and material callback adapter in `picocalc-os/nucleus/candela_scene.{c,h}` and extended the original ray tracer to emit winning material handles before applying common geometric shading.
- Implemented three narrow Typed row reuse decisions for literal colors, uniform literal mixes and cell-stable checkers, plus one exact-pattern reduction for the captured tile expression. Retained a generic evaluator for other valid material graphs.
- Verified the existing ray tracer's three receipts still reproduce bit for bit after the shared geometry changes.

### Why

- The graph orders references backward, so validation can establish each node's type in one pass. Checked geometry and graph arithmetic bound both the C intersections and the Typed scratch values.
- Separate scene and parameter storage would complicate the agreed ABI. Keeping a fixed parameter region in the validated graph gives a simple edit operation that changes only one cell and leaves every reference intact.
- Scalar evaluation is a semantics control for the row optimizer. Comparing the same two colors on a complete frame isolates changes caused by the optimizer's proof.

### What worked

- The unmodified ordinary compiler compiled the hand source to Wasm and RV32. The hand bundle has 14,371 source bytes, 6,988 Wasm bytes and 14,604 RV32 instruction bytes.
- Both native C modules compiled with strict warnings on the host and the ESP-IDF 5.4.2 RISC-V/P4 compiler.
- The existing ray tracer's scalar, modeled draw, and linked PIE instruction receipts all remained bit-identical after enabling the programmable geometry entry.

### What didn't work

- Automatic approval review rejected the first project-specific Opus High request before execution. It identified that the proposed command would send a nonpublic Candela design document to Anthropic without specific trusted authorization for that payload. The blocked design was never sent.
- After the director confirmed a generic methodology brief was in scope, I ran a separate public textbook query with `claude -p --model opus --effort high --tools '' --setting-sources ''` from `/tmp`. That query contained only generic computer-science questions and asked for invented examples. It returned a public chapter. No Candela contract, source, identifiers, measurements, device logs, or credentials were sent. [Provenance](../sources/renderer/provenance.json)

### What I learned

- A bulk loop alone still interprets every graph at every sample when the result depends on x. The fixed tile family admits a stronger identity once each operation and operand kind is checked.
- In Q8 coordinates the largest position is 40,704 and the largest scale product is 10,420,224. Validated graph operations fit the selected 16-bit storage and 32-bit intermediate arithmetic.

### What was tricky to build

- C ray geometry must retain actual sphere lighting and floor shadows while leaving all material color decisions to the Typed callback. For the graph path the lit floor uses the authored color, and shadow scales that same RGB by one third.
- The first ray tracer uses an aligned private packet array. The programmable draw retains that arrangement while accepting any ordinarily halfword-aligned destination stride.

### What warrants a second pair of eyes

- Inspect `candela_validate` for malformed node kinds, forward references, unused operands, and parameter limits. Recheck the geometry envelope if any authoring method changes x, y, z or radius constraints.
- Inspect `candelaRowPeriod` and `candelaTileParam` for the exact optimization predicate. Check illegal and merely different patterns separately.

### What should be done in the future

- Keep general graph dependency analysis and additional node kinds independent of this qualification. Benchmark a new policy against the existing generic and specialized paths.

### Code review instructions

- Start with `builders.typed`, `materials.typed`, `candela_scene.h`, and the `raytrace_demo_render_materials` entry.
- Use the exact independently authored generic chapter as methodology only. The Candela values and experiments were checked locally.

### Technical details

- Graph storage has a 32-bit Typed capacity followed by 303 16-bit cells. Material work uses 192 cells. A shade row reads 160 handles and returns 320 color cells.
- Candela graph staging is separate from compilation. Neither normal scalar nor bulk rendering mutates the graph.
- The target build reported 528 bytes for the Candela call, 4,048 bytes for the native material geometry routine, and 1,024 bytes for its row bridge. These precede the Typed call stack and caller frames.

## Step 2. Cross-check the shader targets with real geometry and protected outputs

The host test records winning material rows through the public C graph renderer, evaluates both shader paths on the normal Typed compilation targets, and sends their agreed colors back into the same renderer for lighting, shadows and RGB565.

### Prompt Context

The Team 1 acceptance criterion asks for real pixels and proof that editing the right sphere's shared-material variation leaves the original material unchanged. The tiled scene must reuse its graph across parameter edits.

### What I did

- Compiled the ordinary Wasm and RV32 forms of the direct builders, scalar sampler and row sampler. Ran exact emitted RV32 code in the previously reviewed instruction model.
- Exercised three shared-material weights and three tile weights. An extra fixture wraps the specialized tile color in a redundant mix so the generic bulk evaluator must reproduce the same frame.
- Compared every output row and both compilation targets' whole guest memory, and verified that only the intended parameter bytes can change during edits.
- Verified builder failure on full tables and short storage. Tested 19 corrupt graph inputs through the real C renderer with a painted sentinel and an instrumented shader-call count.
- Wrote the [newcomer report](../analysis/04-validating-and-evaluating-candela-material-graphs.md) and handed full expected hashes to the board reviewer.

### Why

- A shader-only test cannot expose a geometry-to-material misbinding. Actual winning tags, lighting and RGB565 quantify agreement through the complete image path.
- Sharing the scalar and bulk target comparison while checking an independent prior scene separately makes it possible to tell which optimization caused a mismatch.

### What worked

- All seven full C-rendered images match both Typed shader paths on both backend executions. This is 1,120 rows with complete RGB color and graph memory comparison at each boundary.
- The shared fixture preserves the blue expression and material handle for the left sphere. The right side references a new mix that reuses the blue expression. Its sample changes 4,493 to 23,208 to 39,875, while the left remains 6,640.
- The generic tile fallback reproduces the entire specialized weight-73 frame exactly. The six main frames have distinct image hashes and each writes 25,600 pixels with 4,470 sphere pixels and 3,339 visible floor shadows.
- Every malformed graph case gave zero shade calls and left the existing destination untouched.

### What didn't work

- The initial malformed control tried replacing the mix opcode with the value it already held. The C test failed its `!candela_validate(graph)` assertion. I changed the mutation to set the mix's first operand to its own node index and added a separately malformed scalar operand. Both now fail validation as intended.
- The initial candidate tile sample used x = 11, which selects the same branch at all three tested weights for y = 13. I chose the x = 12 boundary by calculating the component residues, then confirmed that the scene changes at that coordinate and in the complete image.

### What I learned

- The tile fixture's modeled shader counts depend strongly on specialization. At weight 73, scalar takes 44,161,574 modeled instructions and the specialized row takes 2,347,886. The intentionally unspecialized wrapper takes 44,867,694 row instructions. The identical pixels are a sharper dependency test than a raw speed comparison.
- The RGB565 sample changes on the right even though the underlying geometry, lighting and shadow classification stay constant. The result isolates parameter-driven material evaluation.

### What was tricky to build

- The host captures material rows and replays generated colors in two process passes. This makes the bytes observable and retains the real C geometry and shading code. It does not measure native C-to-Typed call time.
- Per-row guest comparison includes the work buffer state between Wasm and RV32. The scalar versus bulk comparison checks full colors and the immutable scene, since their temporary scratch contents can differ.

### What warrants a second pair of eyes

- Confirm actual P4 FNV checks against the six host frames before attributing any physical timing difference to semantics.
- Review graph and already-shaded image hashes separately. Avoid interpreting modeled instructions or host transfer costs as board milliseconds.

### What should be done in the future

- Keep parameter-update, scene-build, compile, frame and peak-memory evidence distinct in the board report.

### Code review instructions

Run from the repository root.

```sh
P=$(find ttmp/2026/11/20 -maxdepth 1 -type d -name 'PICOCALC-CANDELA--*')
bash "$P/scripts/renderer/03-qualify.sh" /tmp/candela-renderer-local
cmp /tmp/candela-renderer-local/receipt.json "$P/various/renderer/host.json"
```

### Technical details

- [Host qualification receipt](../various/renderer/host.json)
- [Pinned graph contract](../design-doc/01-shared-scene-graph-contract-and-acceptance-fixtures.md)
- [Independent public methodology chapter](../sources/renderer/02-opus-high-public-methodology.md)
