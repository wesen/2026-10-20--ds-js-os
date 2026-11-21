---
Title: Investigation diary for frontend and Wasm inspection
Ticket: PICOCALC-COMPILER-INSPECT
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/compiler/typed-wasm.js
      Note: Frontend observation and actual Wasm output projection
    - Path: repo://picocalc-os/tests/typed-wasm-inspect.test.mjs
      Note: Byte locations and async provenance regressions
    - Path: repo://ttmp/2026/11/21/PICOCALC-COMPILER-INSPECT--inspect-typed-wasm-and-rv32-emission/scripts/frontend/01-baseline.mjs
      Note: Pinned byte and diagnostic differential
ExternalSources: []
Summary: ""
LastUpdated: 0001-01-01T00:00:00Z
WhatFor: ""
WhenToUse: ""
---

# Investigation diary for frontend and Wasm inspection

## Step 1. Attach an optional frontend observer to the real emitter

The inspector needs the program actually emitted by each target. I kept the ordinary function arrays intact and used an observed array only when the exact filter selects a function. The array records source anchors as code is emitted, then the inspector decodes ordered operations from the finished array.

### Prompt Context

**Implementation brief:** “Both numeric and encoded emitters: capture named typed locals, source span per op (honest precision incl generated source), stable ordinal; actual Wasm function byte offsets, final module-relative addresses/bytes via real compile(source,options).”

**Assistant interpretation:** Observe the existing code path without a second parser or target-specific duplicate compiler. Report the available emission-token anchor with a named coordinate space.

**Inferred user intent:** Make it possible to connect source and typed operations to actual shipped bytes and independently use the same production compiler when inspection is disabled.

### What I did

- Agreed frontend and Wasm event fields with the director. The Wasm observer reports actual encoded byte offsets and RV32 frontend reports cell offsets.
- Recorded every named local at allocation, including locals later removed from the visible scope map. Assigned per-function ordinals from final emitted order.
- Preserved anchors when a counted loop moves its update from a temporary array to the block tail.
- Distinguished original, rewritten-body and synthetic-source coordinates. Included the exact generated text where needed to read the offset.
- Parsed the code section of the returned Wasm module and published absolute byte ranges for every operation in the selected body.

### Why

- One numeric tape cell is a complete operand value, while the Wasm bytes can encode one operand in an LEB128 sequence. Inspecting both in their own units preserves exact spans.
- Only the code section of the final Wasm module knows which body offsets survive variable-length section and function headers.
- The native lowering callback still consumes a plain numeric array. The inspector emits metadata before that call and leaves the existing lifetime in charge of the body.

### What worked

- Normal `make -C picocalc-os test-apps` passed, including four new inspection tests.
- The tests exercised a 131-index call, a local index above 127, multi-byte memory offsets, an actual negative signed LEB operand, and a loop update whose final order differs from parse order.
- Rewritten and synthesized async helpers produce generated coordinate spans. An unchanged synchronous function in the same module uses original coordinates.
- Editing an observer event can change that event in the caller. It leaves compiled output and subsequent placement unaffected.

### What didn't work

- No observer implementation test failed at this checkpoint.

### What I learned

- An emission-token anchor is smaller and easier to preserve than full syntax provenance. It can point to lookahead or punctuation, so a consumer must display its precision.
- Source spans for an async rewrite and a generated helper can both be accurate without pretending they came directly from the original source.

### What was tricky to build

- An observed callback that throws a SyntaxError must still surface as the same object. The existing async fallback should not interpret it as an error in the generated program. The observer uses a private wrapper while inside the compiler and restores the original exception at the boundary.
- The Wasm placement map stays private and detached from the frontend event. Callback code is free to mutate its snapshot.

### What warrants a second pair of eyes

- Review the current opcode schema against the actual common numeric and encoded emitters whenever a new opcode or operand format is introduced.
- Review the generated unit labels and the fact that parameter source positions remain null. Full syntactic spans would require different frontend data.

### What should be done in the future

- Add linked Wasm module placement only if an inspector consumer needs addresses within embedded runtime worlds. Keep it tied to the final runtime artifact.

### Code review instructions

Read `InspectionTape`, `inspectOperations`, and `inspectWasmEmission` in `picocalc-os/compiler/typed-wasm.js`. Run `node picocalc-os/tests/typed-wasm-inspect.test.mjs` or the normal `test-apps` target.

### Technical details

- `options.inspect.function` is an optional exact match. Event callbacks are synchronous.
- Source offsets count UTF-16 code units. Wasm ranges are half-open module byte offsets. RV32 frontend offsets count tape cells.
- [Frontend and Wasm mapping design](../design-doc/02-frontend-operations-and-final-wasm-offsets.md)

## Step 2. Reproduce ordinary bytes and diagnostics against the previous compiler

The opt-in test suite checks event content. A separate comparison checks that installing this instrumentation does not change the unobserved compiler's behavior. I pinned the pre-inspection source before running that matrix.

### Prompt Context

The brief in Step 1 requires byte-identical defaults and unchanged diagnostics.

### What I did

- Ran the current observed and unobserved compilers beside the previous compiler at `abc02eb`.
- Compared complete Wasm and RV32 images for the full Typed ray tracer, smooth Chess painter, Files, Candela, and a small async fixture.
- Compared three exact diagnostic names and messages on both targets. Used both ordinary and async failures.
- Replayed the resultant JSON receipt from a second scratch directory and checked byte identity.

### Why

- A check that compares only current observed and current unobserved runs can miss a change affecting both. The pinned earlier compiler removes that ambiguity.
- Whole delivered modules are the right unit of comparison when offset calculations and section widths are part of the new feature.

### What worked

- All ten target artifacts had identical sizes and SHA-256 under the earlier, current ordinary and current observed paths.
- Every diagnostic matched. The receipt records the selected function's emitted operation count and Wasm instruction span.
- The baseline case for `typedRayInShadow` records 18 named locals for both targets. Wasm has 312 operations across module offsets 2,489 to 3,028. RV32 has 180 numeric operations.

### What didn't work

- No replay or baseline comparison failure was observed.

### What I learned

- Having different operation counts across targets is expected when the numeric path retains operations already expanded by Wasm. The per-target ordinal maps describe actual emission and are not cross-target equivalence identifiers.

### What was tricky to build

- The async test observes only an ordinary body rewritten to call a generated helper. The ordinary module still includes the rest of the functions, so its final byte placement includes their real code-section sizes.

### What warrants a second pair of eyes

- Verify that CLI output labels emitted Wasm byte addresses as module offsets and labels RV32 frontend offsets as numeric tape positions.

### What should be done in the future

- Preserve scope and generated origins when adding richer instruction views.

### Code review instructions

Run from the repository root.

```sh
P=$(find ttmp/2026/11/21 -maxdepth 1 -type d -name 'PICOCALC-COMPILER-INSPECT--*')
stock=$(mktemp -d)
for name in typed-wasm.js typed-async.js typed-rv32.js; do
    git show "abc02eb:picocalc-os/compiler/$name" > "$stock/$name"
done
node "$P/scripts/frontend/01-baseline.mjs" "$stock" /tmp/typed-inspect-frontend.json
cmp /tmp/typed-inspect-frontend.json "$P/various/frontend/baseline.json"
```

### Technical details

- [Byte-identity and diagnostic receipt](../various/frontend/baseline.json)
