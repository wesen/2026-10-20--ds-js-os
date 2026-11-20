---
Title: Pool checked buffer literals in the RV32 emitter
Ticket: PICOCALC-RELEASE-LAB
Status: active
DocType: design-doc
Topics: [picocalc, esp32-p4, native, performance]
Intent: long-term
---

# Pool checked buffer literals in the RV32 emitter

Chess sends the authorized painter as source text. The compiler emits a long chain of immediate stores to reconstruct that source in a Typed buffer. A literal pool stores those code units once as data, then a short native copy writes them to the checked destination. This experiment changes the representation of an existing operation. The source syntax, Typed input rules, and Wasm semantics remain the same.

## Preserve the two checks and the result

The existing emitter evaluates the start expression once. It saves the value in a temporary and checks the first and last positions before writing anything. The buffer layout places a four-byte capacity before its halfwords. The numeric path already stores a checked address temporary equal to the receiver plus twice the start index. The first store must add four to reach the actual payload. An empty literal still evaluates the start expression and returns zero without checking or writing the destination. Keep this sequence in the shared emitter and replace only the store expansion for qualified lengths.

The numerical operation introduced by the experiment carries an address-local index and a literal-data index. At native lowering, the addressed local becomes a copy destination and the data index names a module-local pool entry. The copy writes exact UTF-16 code units in ascending address order. It preserves lone surrogates and pairs because it neither re-encodes Unicode scalar values nor reads a C terminator. It uses the bound established by the existing runtime checks and the compile-time length limit of 1,022 units.

## Lay out the executable and its data

Streaming lowering records symbolic data references alongside its existing jump fixups. Once all functions are sized, append a four-byte-aligned data pool to their code and patch each reference. A PC-relative pair uses the address of its own `auipc` as the origin. Split the byte displacement by taking its signed low twelve bits, then replace the high part with the displacement minus that low part. It is valid across relocation because both instructions and data share the same segment. Function, import and entry offsets still refer to the same instruction regions.

The first version uses a small inline copy loop with halfword loads and stores. The destination is halfword-aligned but may be two modulo four. A word-copy alternative needs an explicit alignment path and goes in a separate arm if measured. Native copy scratch uses backend temporary and argument registers, disjoint from the operand-stack registers, and makes no call. This is a private staged compiler option with no ABI change. Consider 16 units the fixed first qualification threshold. Use separate no-pool, pool-without-unification and pooled-identical-string arms to distinguish representation from deduplication.

## Measure and falsify

For Chess, Editor and a frozen held-out source set, record source bytes, generated instruction bytes, literal payload bytes, padding, total program extent and linked ELF bytes. A fixed existing reactor slot produces equal linked ELF sizes while actual content changes. Report a smaller slot in a separately built physical comparison. Check commands or source bytes from real consumer entry points rather than using just image sizes.

Use fresh JavaScript realms for a host compilation comparison, with interleaved arm order and precise methodology. A QuickJS board compilation provides actual cold latency and tracked heap. Time bounded writes separately from compilation and install. Calibrate copy costs for short, long, repeated, heterogeneous and UTF-16 literals. Compare entire output buffers and unchanged surrounding memory on success, pre-check traps, starting indices at boundaries and empty literals. Report any size reduction that costs copy runtime, and distinguish repeated identical source text from repeated substrings.

## Review the implemented variants

The halfword loop computes its source end with one signed ADDI. Since the grammar limits literals to 1,022 units, the largest byte length is 2,044, which is within the instruction's signed immediate range. The optional word variant emits the wider loop only when the pool entry's offset is divisible by four. The linker already locates the program code on a four-byte boundary. It additionally tests the destination pointer at runtime. Aligned source and destination use complete word pairs, including at most one separate halfword. All other addresses use the exact halfword path. The wider variant does not pad the pool or assume that a different source position can be made aligned by moving both pointers together.

For this emitter, at least one local load, one constant instruction and one halfword store are emitted for each scalar unit. At the 16-unit threshold that is at least 192 instruction bytes. The largest pooled call site has 88 instruction bytes, 32 literal bytes at that threshold and at most two trailing padding bytes. For longer inputs the difference grows by at least ten bytes per additional unit. The unchanged guards and return-count instructions are outside both sides of that comparison. This is a bound on this source emitter and fixed-width backend. A future narrower scalar path would need a new threshold proof.

An independent Opus High design proposed the fixed threshold and the endpoint loop. An implementation review highlighted the importance of the loader/base-alignment invariant, live operands across the private op, and distinguishing generated payload from the fixed-slot ELF. The prototype adds strict halfword/word alignment checks to its native instruction model and exercises live depth beyond its five operand-stack registers. The board compile probe links all versions into the existing slot and measures actual QuickJS time and tracked heap. A separate firmware-embedded writer comparison uses a reinitialized output buffer in PSRAM and executable code and pool bytes in mapped flash. The latter is a physical exact-output comparison for this memory configuration. Executing the changed game under the live ELF loader remains a separate qualification. [Independent design](../sources/literal/opus-high-design.md) [Implementation critique](../sources/literal/opus-high-review.md)

## Reproduce the host comparison

From this ticket, use artifacts from the ordinary smooth Chess firmware build. The first argument is its build's ESP-IDF main component directory. The second is the exact saved painter source. The remaining arguments hold test scratch and the measurement receipt.

```bash
node scripts/literal/02-host.mjs \
  /tmp/mobile-painter-chess3d/build/esp-idf/main \
  /tmp/chess-camera-release/painter.typed \
  /tmp/pico-literal-host /tmp/pico-literal-host.json
```

The generated compiler stays in the temporary stage. The tool-free research lead reviewed an abstracted summary and aggregate results and had no access to device logs or credentials.
