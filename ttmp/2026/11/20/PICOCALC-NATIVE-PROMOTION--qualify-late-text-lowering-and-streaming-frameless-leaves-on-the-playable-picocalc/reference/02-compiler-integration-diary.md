---
Title: Compiler integration diary
Ticket: PICOCALC-NATIVE-PROMOTION
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/compiler/typed-rv32.js
      Note: Lowers checked text and chooses a conservative frameless function
    - Path: repo://picocalc-os/compiler/typed-wasm.js
      Note: Produces checked numeric text operations and retains the Wasm primitive path
    - Path: repo://picocalc-os/tests/typed-rv32.test.mjs
      Note: Normal regression coverage for ABI and text code generation
    - Path: repo://ttmp/2026/11/20/PICOCALC-NATIVE-PROMOTION--qualify-late-text-lowering-and-streaming-frameless-leaves-on-the-playable-picocalc/scripts/compiler/01-mobile-painter.mjs
      Note: Compares the maintained closed renderer through both release compiler revisions
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T19:56:35.735000693-05:00
WhatFor: ""
WhenToUse: ""
---

# Compiler integration diary

## Step 1. Integrate the two qualified lowerings at their normal entry points

The source changes started from `5f77855`, after the separate late-text and leaf experiments and their composed host and device trials. The Typed RV32 compiler now performs both lowerings by default while it consumes one validated numeric function at a time.

In the frontend, the numeric emitter overrides checked address and literal write formation. In the native backend, a conservative test can use a frameless version of the existing function emitter. Both changes live in the normal compiler used by the handheld.

### Prompt Context

**Implementation brief:** “Implement BOTH proven optimizations as the normal production RV32 compiler in picocalc-os/compiler (sole code owner). User just approved advancing both. Base 5f77855, ticket ttmp/2026/11/20/PICOCALC-NATIVE-PROMOTION--qualify-late-text-lowering-and-streaming-frameless-leaves-on-the-playable-picocalc. Keep streaming default, no inlining or extra experimental feature; preserve Wasm and existing callers and legitimate backend options.”

**Assistant interpretation:** Promote the tested full late-text and streaming leaf arms with the existing compile and link APIs.

**Inferred user intent:** Use both qualified optimizations in ordinary firmware and production app compilation, with host and physical qualification before promoting a firmware artifact.

**Commit (code):** `8052db7` — “Promote late text lowering and frameless leaves in the Typed RV32 compiler”.

### What I did

- Reviewed the previous two prototypes, their combined held-out receipt, and the production entry points for Typed worlds, Agenda, Files, and the closed mobile painter.
- Moved literal store emission behind `FunctionEmitter.emitLiteralStores`. Only `NumericFunctionEmitter` changes the emitted operation representation. Both the ordinary and span-based source emitters already choose that class for native numeric compilation.
- Ported the previously qualified checked-address and literal-write sequences to the normal RV32 emitter. The frameless decision occurs inside its existing current-function lowering callback.
- Confirmed the normal compiler's held-out image exactly matches the previously composed late-plus-leaf arm. Committed the compiler sources and handed revision `8052db7` to the firmware operator.

### Why

- Text address lowering uses a direct unsigned branch around the original trap. The store sequence shares the checked destination register for a literal's ordered code units.
- A scalar function without a call, local write, memory operation or spill can use input argument registers and return without saving a return address or adjusting the stack.
- Specialized code is scoped to the current function. The literal references are released when the native emitter has consumed them. No function body cache or module-wide inline pass is needed.

### What worked

- `node --check` passed on both compiler files.
- Production default compilation of the frozen `burst.typed` gave the known 2,332-byte image, SHA-256 `16f1275848fd5990d72d59ef0d4c71b3b329b59066446d8368b6e9ecc7e310e9`, exactly matching the previously composed experimental image.

### What didn't work

- No compiler-source or syntax failure was observed during this implementation checkpoint.

### What I learned

- Native production callers use the established `typedRv32.compile` entry directly or through the same SDK world linker. Explicit `streamFunctions:false` remains available.
- Packed PIE lowering was staged in prior isolated research tickets. Production had no `pie` compiler option to preserve. Historical textual injection experiments use exact pre-promotion anchors, so replay them from their pinned compiler revision.

### What was tricky to build

- The checked write's address must be established before compiling and evaluating the RHS. The literal's end check must execute before its first store. Leaving validation and guard order in the existing frontend avoids a second definition of either contract.
- The framed divider reuses `a0` as a scratch register after saving parameters. The frameless variant uses `t5` for its overflow check because arguments remain in `a0` through `a7`. If it starts to spill, the partial emission is discarded and the original framed emitter starts fresh.

### What warrants a second pair of eyes

- Review the unsigned check and the preservation of two guard sites on nonempty literal writes. Check maximum literal offsets and the empty-literal path.
- Verify that the positive frameless opcode list contains no call, memory operation, mutable local assignment, or unreviewed private opcode. The fallback remains responsible for unknown operations and backend diagnostics.
- Verify that the mobile painter still validates its original closed two-buffer entry and reactor contract.

### What should be done in the future

- Use the separate host and device gates before calling the new default a playable release. Keep the earlier research images tied to their own compiler revision.

### Code review instructions

- Begin with `NumericFunctionEmitter` in `picocalc-os/compiler/typed-wasm.js` and `FunctionCode.step`, `LeafCode`, and `lowerLeaf` in `picocalc-os/compiler/typed-rv32.js`.
- Compare the production 2,332-byte held-out image to `late-leaf` in `composed-release-worlds.json` for the app results and `composition.json` for the independent program in the prior Native Wave ticket.

### Technical details

- Numeric operations `0xf1` and `0xf2` are private to the RV32 tape. Wasm emission continues to use the original primitive UTF-16 sequence.
- A nonempty literal's last UTF-16 halfword is at displacement `4 + 2 * (value.length - 1)`. The 1,022-unit frontend limit keeps the displacement at most 2,046, within the signed RV32 store immediate range.
- The leaf trial is restricted to zero local slots, at most eight `i32` or `bool` parameters, and at most 128 allowed tape cells. Internal arithmetic traps use the usual EBREAK and the return uses JALR with the caller's RA.

## Step 2. Add normal regressions and verify the mobile painter ABI

The production painter is a separately compiled Typed function delivered by the Chess app. It goes through the current native compiler and a dedicated closed linker. I tested this caller separately from the main application's linker and the common held-out source.

The final gate runs both the previous and promoted RV32 output through the same reviewed RV32 model and compares the complete memory arena to the byte-identical Wasm oracle. The arena includes the source header, all state cells, every command, and a sentinel after the written command list.

### Prompt Context

The implementation brief in Step 1 requires existing callers, options and Wasm behavior to remain compatible. The mobile renderer exercises the maximum ordinary source path and its dedicated reactor.

### What I did

- Added four compiler regressions to `picocalc-os/tests/typed-rv32.test.mjs` and added that test file to the ordinary host `test-apps` target.
- Verified scalar argument register liveness in division and early returns, framed fallback for spills, checked memory operations and imports, and rejection of an unknown tape opcode by the framed emitter.
- Verified normal literal code emits an unsigned branch across the trap and uses one base register for ordered halfword stores. The same test checks Wasm UTF-16 encoding and insufficient-capacity behavior.
- Ran `scripts/compiler/01-mobile-painter.mjs` against five frozen game states and all 32 rotation phases for each state. Both baseline and candidate used the ordinary `linkMobilePainter` entry and the same physical reactor bytes.

### Why

- A valid native image can violate a calling convention or memory check. The focused tests detect those errors at the instruction and ABI boundaries.
- The existing painter fixture exposes both generated programs to realistic state and output capacities. A complete arena comparison catches additional writes even if the command list count looks correct.
- Checking both stream modes through the public linker exercises the existing option path rather than the prototype-only entry point.

### What worked

- `make -C picocalc-os test-apps` passed, including all four added compiler tests.
- All 160 mobile painter executions matched pre-promotion RV32 and Wasm for the return value, complete state, command contents and output tail. The streamed and buffered outputs produced identical linked ELF bytes within each compiler. An invalid painter signature still fails.
- Native text changed from 23,848 to 21,572 bytes. Both linked ELF files remained 33,840 bytes. The repeated commands used 104,430,252 modeled native steps at baseline and 95,073,440 after promotion across the same 160 scenes. Those step totals are model counts.
- The compiled painter's Wasm SHA-256 remains `6d4eff85a46b055274378ec8afd22f9f630c3359a8e49ac51937739f179655e5`.

### What didn't work

- The first painter runner called Git via Node child process and the local sandbox returned `spawnSync git EPERM`. I extracted baseline sources with direct shell Git commands and made the runner accept that directory. The test checks the baseline's exact image hash.
- The first unsupported-opcode regression prepended an unknown instruction, causing `SyntaxError: empty RV32 operand stack`. The ordinary binary dispatcher pops operands before diagnosing a bad opcode. I changed the regression to replace a real addition after both operands have been pushed. The native path now reaches the expected `unsupported RV32 operator 255` diagnostic.

### What I learned

- Source and ABI identity can be preserved while the instruction extent and linked ELF digest change. Fixed reactor size alone is insufficient evidence of a successful native transformation.
- Checked literal source length is UTF-16 code units. A supplementary-plane character contributes two stores. The test includes both halves and independently checks the Wasm output.

### What was tricky to build

- The ordinary captured scene file includes a 90-cell state, while the maintained painter consumes a 91st rotation-phase cell. The runner preserves the first 90 cells and explicitly enumerates the phase cell.
- Colder native timings and actual compositor service behavior belong to the device qualification. The host modeled steps do not stand in for either.

### What warrants a second pair of eyes

- Run the host suite and compare the painter receipt against the exact hashes for its source and reactor.
- Check that the native leaf allowlist accepts only reviewed operations. The regression's injected unknown opcode deliberately exercises the fallback without extending the language.
- Verify that the production compiler keeps `streamFunctions:false` output equivalent on this caller and continues to reject a malformed mobile entry.

### What should be done in the future

- Rerun the ticket's device gate whenever changes affect the delivered painter ABI, the loader's reactor slot, or native calling conventions.

### Code review instructions

Run from the repository root. The fixtures and reactor come from the prior maintained geometry replay and smooth release build.

```sh
make -C picocalc-os test-apps
baseline_dir=$(mktemp -d)
for name in typed-wasm.js typed-rv32.js mobile-painter.js; do
  git show "5f77855:picocalc-os/compiler/$name" > "$baseline_dir/$name"
done
P=$(find ttmp/2026/11/20 -maxdepth 1 -type d -name 'PICOCALC-NATIVE-PROMOTION--*')
node "$P/scripts/compiler/01-mobile-painter.mjs" \
  "$baseline_dir" /tmp/mobile-painter-compiler-replay-final/fixtures.bin \
  /tmp/picocalc-exact-clean-app/esp-idf/main/mobile-painter-slot.elf \
  /tmp/native-promotion-mobile-painter.json
cmp /tmp/native-promotion-mobile-painter.json "$P/various/compiler/mobile-painter.json"
```

### Technical details

- Baseline control compiler revision `5f77855`. Candidate compiler revision `8052db7`.
- [Mobile painter verification receipt](../various/compiler/mobile-painter.json)
- [Prior combined held-out experiment](../../PICOCALC-NATIVE-WAVE--six-parallel-experiments-in-handheld-compiler-construction/various/director/composition.json)
- [Prior composed release world links](../../PICOCALC-NATIVE-WAVE--six-parallel-experiments-in-handheld-compiler-construction/various/director/composed-release-worlds.json)
