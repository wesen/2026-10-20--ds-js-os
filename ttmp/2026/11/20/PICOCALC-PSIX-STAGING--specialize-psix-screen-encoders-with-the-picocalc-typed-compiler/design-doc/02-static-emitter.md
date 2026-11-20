---
Title: A declared PSIX encoder for Chess state
Ticket: PICOCALC-PSIX-STAGING
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-PSIX-STAGING--specialize-psix-screen-encoders-with-the-picocalc-typed-compiler/scripts/static/01-specialize.js
      Note: Declared schema and source generator
    - Path: repo://ttmp/2026/11/20/PICOCALC-PSIX-STAGING--specialize-psix-screen-encoders-with-the-picocalc-typed-compiler/scripts/static/02-primitives.typed
      Note: Packed native writer primitives
    - Path: repo://ttmp/2026/11/20/PICOCALC-PSIX-STAGING--specialize-psix-screen-encoders-with-the-picocalc-typed-compiler/scripts/static/05-replay.mjs
      Note: Reproducible oracle and measurements
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T12:15:08.201729288-05:00
WhatFor: ""
WhenToUse: ""
---

# A declared PSIX encoder for Chess state

The Chess renderer experiment moved rendering across a process boundary by sending game state as a record of pieces, legal-move masks and display fields. The writer in this experiment takes the same logical state in fixed ABI cells and creates a complete canonical PSIX v1 record. It generates typed source directly from a small declared record and tuple description. The same source goes through the repository's Typed frontend and either the streamed RV32 instruction emitter or the Wasm emitter. A counted span of packed bytes is visible at the native call boundary. [Prior Chess producer](../../PICOCALC-RENDER-CHESS--measuring-semantic-chess-screens-and-portable-typed-views/scripts/04-semantic-producer.typed) · [PSIX v1 layout](../../PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/design-doc/01-a-binary-snapshot-with-direct-indexed-access.md).

## Generator input and output

Load the generator as ordinary JavaScript, then pass the text of the typed primitive functions. The resulting source is deterministic. The two arguments are staging inputs, so a different title recompiles the constant layout and can change canonical string IDs and offsets. The record is declared in `chessShape()`. Its dynamic input fields are bounded by the profile. The generator needs zero frame observations. [Generator](../scripts/static/01-specialize.js) · [Typed primitive functions](../scripts/static/02-primitives.typed).

```js
const source = psixGenerateSource(primitiveSource, "Chess");
const {image, entries, importCount, relocations} = typedRv32.compile(source);
const entryByteOffset = entries.psixEncode;
// image is an RV32IM instruction span. An executable host must link or install it.
```

The closed image has zero imports and zero relocations. The host harness links the image as executable ELF text with an entry symbol at the compiler-reported offset. The Wasm harness invokes the exported function in a module with no imports. These experiments use different execution substrates with the same frontend source. [Host runner](../scripts/static/05-replay.mjs).

## ABI

```ts
psixEncode(input: buffer, out: buffer, capacity: i32): i32
```

A Typed buffer starts with a 32-bit length in cells, followed by 16-bit cells. The native caller owns and supplies disjoint, appropriately aligned buffers whose actual allocated lengths agree with their headers. It initializes the output allocation before the call because insertion of a single wire byte reads the existing halfword to preserve its neighbor. Concurrent mutation of the input during a call is outside the contract.

| Input cells | Meaning | Domain |
|---|---|---|
| 0–63 | Pieces at a8 through h1, row-major | 0 for empty or 1–6, 9–14 for pieces, at most 32 occupied cells |
| 64–71 | Legal destination file bits for each rank | 0–255, all zero when no selection |
| 72–89 | Nine signed i32 values, low then high halfword | Cursor 0–63. Selected, from and to 0–64. Status 0–8. Hint 0–1. Depth 0–32. Nodes 0–2,147,483,647. Score −2,147,483,647 through 2,147,483,647 |

The sentinel 64 means absent for the selected square and both move endpoints. Both endpoints must be present together or absent together. These are representation checks, independent of legal position validation by the game. The assembled envelope uses the fixed sender `chess`, a chosen title, empty outer SDK hints, and renderer version and digest. The screen-local hint flag sits in the metadata tuple. To reuse a packed result on little-endian RV32, a caller takes exactly the returned positive number of bytes from `(const uint8_t *)out.units`. The odd final byte in the allocated halfword stays unchanged. The caller's explicit byte budget and the destination header's cell capacity are checked before mutation. The writer returns −1 for state outside the profile or −2 for insufficient capacity. Both leave the destination untouched.

## What the layout pass computes

1. Walk the declared record/tuple nodes at staging time, collect fixed strings, sort and deduplicate them, and reserve each container's complete slot area before reserving child bodies. Field order follows key bytes, so dynamic changes in string IDs preserve key order.
2. Precompute fixed-prefix byte offsets, packed literal stores, all slot addresses, and one comparison function per reachable fixed string boundary for each dynamic hex field. Source generation enforces ASCII for static strings and refuses a static literal that could equal a dynamic string. The two dynamic strings differ in length.
3. Emit a bounded rank computation. Each call places the 64-byte board string and 16-byte mask string into the preordered dictionary. Both are even-length, so fixed-string alignment is known at staging time. Rank effects on the remaining entries are prefix additions of 64 and 16 to byte offsets and increments of one to IDs.
4. Emit preflight and the final stores. Most values use three-byte immediate references. The two expression holes that can cross this range use canonical binary64. Their payloads occur at the end of the preorder body. The stage rejects a later fixed container once it has encountered a potentially out-of-line number.

For the initial Chess screen-state payload, the dictionary has 16 strings, starts at byte 47 and ends at byte 228. An empty string occupies no payload bytes, so the first two offsets both point to 47. The root reference at offset 10 is `e4 00 70`, which decodes as object tag 7 and offset 228. All 47 traced frames were 313 bytes. The two optional out-of-line numbers add 8 bytes each, so the default profile needs at most 329 bytes. [Byte oracle and instruction samples](../various/static/host-receipt.json).

## Verification and replay

Run from the repository root. The Wasm reactor prerequisite is needed to regenerate the real Chess inputs. The test names its ESP-IDF GCC, CJI emulator and cJSON source explicitly. The shell is Bash or another POSIX-compatible shell.

```bash
make -C picocalc-os typed-world-reactor
ticket=$(find ttmp/2026/11/20 -maxdepth 1 -name 'PICOCALC-PSIX-STAGING--*')
gcc=/home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20241119/riscv32-esp-elf/bin/riscv32-esp-elf-gcc
cjson=/home/manuel/esp/esp-idf-5.4.2/components/json/cJSON
node "$ticket/scripts/static/05-replay.mjs" /tmp/psix-static-host \
    "$gcc" cji/build/rv32/rv32emu "$cjson"
```

The harness regenerates its 47 Chess inputs from the previous replay using the normal app event entry, then adds 74 deterministic synthetic vectors. It compares frozen JavaScript and C generic encoders, the generated Wasm module and actual generated RV32 instructions. It also tests destination failure semantics and two altered variants of the static title, including one that deduplicates a string. It emits source, image, on-device fixtures, host timings and instruction counts in the output directory. The CJI instruction count includes the fixed C measurement envelope and reports no timing on a physical machine. [Replay entry point](../scripts/static/05-replay.mjs) · [RV32 driver](../scripts/static/03-rv32-driver.c).

The authorizer of a runtime compiler must distinguish executable authority from the output format. The standalone host tests run a locally generated specimen. A production publisher would use an allowlisted generator and profile, bind code identity to the buffer ABI and wire version, let the caller reserve output, and pass a counted span through trusted sender and generation metadata. Existing PSIX admission still owns the check and copy needed to retain an immutable frame. The host experiment ends before transport, admission, and drawing. [Previous retention model](../../PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/scripts/06-retention.js).
