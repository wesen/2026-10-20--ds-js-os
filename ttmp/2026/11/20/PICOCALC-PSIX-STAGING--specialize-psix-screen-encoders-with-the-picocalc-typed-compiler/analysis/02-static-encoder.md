---
Title: Compiling a PSIX writer for a Chess position
Ticket: PICOCALC-PSIX-STAGING
Status: active
Topics:
    - picocalc
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-PSIX-STAGING--specialize-psix-screen-encoders-with-the-picocalc-typed-compiler/scripts/static/01-specialize.js
      Note: The declared encoder stage
    - Path: repo://ttmp/2026/11/20/PICOCALC-PSIX-STAGING--specialize-psix-screen-encoders-with-the-picocalc-typed-compiler/various/static/host-receipt.json
      Note: Raw host evidence
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T12:15:09.16733618-05:00
WhatFor: ""
WhenToUse: ""
---

# Compiling a PSIX writer for a Chess position

After White plays e2–e4, the PicoCalc's Chess producer already knows which square now contains the pawn, which side is thinking, and where to put the cursor. A generic serializer takes those facts as an object and discovers its keys, types, and array lengths every time. The Typed compiler can generate a native function that already knows the record layout. In this experiment the generated function takes the board and display state as numeric cells, then writes a counted PSIX v1 byte span. The same typed source ran as generated RV32 instructions in the CJI emulator and as Wasm in Node. Both executions produced the exact bytes of the previous JavaScript and C reference encoders in 121 cases. [Host evidence](../various/static/host-receipt.json).

The work moved to compile time includes record traversal, sorting the *fixed* strings and calculating container addresses. A new frame still supplies values, including two strings whose order changes the packet's string IDs. Those values must be checked and encoded each time. The resulting writer performs direct packed stores where placement is known, computes the remaining addresses from the values, and returns the valid prefix length. The design keeps the existing PSIX v1 packet that the receiver can independently validate. [Wire format and invariants](../../PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/design-doc/01-a-binary-snapshot-with-direct-indexed-access.md).

## The input is game state

Chess keeps its board and display state in fixed-size data structures. The earlier semantic-rendering study used this information to reconstruct the complete screen tree in a resident view function. Its sender published a 64-digit hex board and a 16-digit mask, with nine metadata integers for cursor, selection, last move, status, hint flag and search statistics. It also attached a view version and artifact digest. We use the same logical payload and leave the view work to the existing consumer. A PSIX packet from this experiment can be compared to a generic encoder operating on that payload. It is a semantic snapshot of Chess, whose size and type mixture differ from those of the expanded canvas command tree. [Semantic renderer experiment](../../PICOCALC-RENDER-CHESS--measuring-semantic-chess-screens-and-portable-typed-views/analysis/01-what-crosses-the-screen-boundary-when-a-chess-cursor-moves.md).

The experiment exposes that state to the compiled writer as 90 unsigned 16-bit cells. The first 64 cells contain numeric piece codes, row-major from a8 through h1. The next eight contain one bit mask each. The remaining 18 carry nine signed integers as pairs of halfwords. A trusted caller supplies readable input, a separate initialized output allocation, and an upper bound on the bytes that the writer may publish. The state adapter in host replay fills these cells from captured semantic messages. The compiler receives only the declaration and value domains, so it can run before any of those captures exist.

The declaration states which values become fixed at generation time. Here is the relevant construction, with the metadata names written out.

```js
record({
    app: literal('chess'),
    title: literal('Chess'),
    frame: record({
        hints: literal(''),
        tree: record({
            v: literal(1),
            p: literal(digest),
            b: hex(board),
            m: hex(masks),
            f: tuple([
                integer('cursor'), integer('selected'),
                integer('from'), integer('to'), integer('status'),
                integer('hint'), integer('depth'),
                integer('nodes'), integer('score'),
            ]),
        }),
    }),
})
```

The `hex` and integer expressions are *holes*, meaning slots whose values are supplied at execution time. Their input representation and bounds are declared. For instance, `hex(board)` always emits 64 ASCII bytes derived from the allowed piece codes. The number in `integer('score')` may be negative and may change its representation when its magnitude passes PSIX's inline range. A fixed set of typed primitive functions implements the operations the generator can emit. [Shape and generator](../scripts/static/01-specialize.js) · [Typed primitives](../scripts/static/02-primitives.typed).

## How one packet reaches byte 228

PSIX starts with a 13-byte header, a table of string offsets and a region containing the actual string bytes. Container records follow. Each field or element has a three-byte reference. The reference carries a four-bit tag and a 20-bit value. The value is either immediate data or an address or string ID for data elsewhere in the packet. In a record, a two-byte key ID precedes each reference. A receiver can tell where the next array slot is from its index because every slot has the same width.

In the opening frame, there are 16 strings. The string offset table has 17 entries because its final offset marks the end of the last string. Thus character bytes start at `13 + 17 × 2 = 47`. The directory contains the empty hint string, the zero mask string and the digest, among the constant keys and text. The header is the following 13 bytes.

```text
50 53 49 58  01 00  39 01  10 00  e4 00 70
```

The length field is little-endian `0x0139`, or 313 bytes. The root reference is little-endian `0x7000e4`. Tag 7 identifies an object at offset `0xe4`, or 228. Its three fields occupy `2 + 3 × 5 = 17` bytes. The child for `frame` starts at byte 245. No runtime frame data changes these addresses because the two hex strings' combined byte count and the number of strings are fixed. The stage emits the root, child and metadata-array offsets as constants in typed source. [Layout and ABI](../design-doc/02-static-emitter.md).

String IDs carry a different dependency. To encode the opening board, the writer uses ID 6 for the board hex string. It places that string between the key `b` and the value `chess`. If a8 becomes empty, the board now begins with `0` instead of `c`. Its directory entry may move before the digest. A literal store of the initial string IDs could write valid but semantically wrong references. At stage time the generator sorts and deduplicates fixed strings. At run time it computes where each of the two live hex values belongs among those fixed strings. The generated rank functions compare only with static boundaries a valid value can reach. For a fixed entry, inserting an earlier dynamic string adds one to its ID and either 64 or 16 to its byte offset. If both live values belong within the same interval, the writer compares them to decide their order.

This handles the changes without an arbitrary runtime interning table. Both dynamic values have even lengths, so their insertion shifts fixed strings by an even number of bytes. The stage can know which fixed characters form packed pairs no matter which legal values arrive. The native writer copies those pairs with typed halfword stores and writes the dynamic hex digits directly to the destination span. It writes a canonical signed 20-bit integer inline when it can. A larger i32 is exactly representable in binary64. The two values that can use that representation place their eight-byte payloads after the metadata slot directory, in the same order the generic encoder would visit them. The generator enforces that a later fixed container cannot depend on an address shifted by one of those values.

## Where the compiler fits

The source generator knows the wire shape. The Typed compiler knows how to turn function declarations and operations on buffers into runnable instructions. Consequently the experiment required no new compiler pass, library in the generated image, or dependency on the generic encoder. JavaScript converts the declaration into Typed function text. The existing frontend emits the operations for integer arithmetic, branches and buffer loads and stores. The RV32 backend writes an executable instruction span and entry offsets. The Wasm backend exposes the function through a standalone module. On the host, a freestanding ELF harness places the generated RV32 bytes in its executable text and calls the entry through the RISC-V register ABI. [Typed RV32 backend](../../../../../../picocalc-os/compiler/typed-rv32.js) · [Native driver](../scripts/static/03-rv32-driver.c).

This is a small form of partial evaluation. A shape describes all supported frames, so the generator evaluates the parts of the serialization algorithm determined by that shape once. It emits code for the parts determined by frame values. It can run in a build tool, which makes this a macro-like build step, or in a trusted JS realm on the device before compiling the encoder. Neither placement needs to make source generation part of drawing. The present implementation builds a shape object explicitly. It demonstrates the lowering and leaves the language-syntax decision, including whether an AST macro should construct the same representation, independent.

Regenerating with a different title gives a concrete second shape. Changing `Chess` to `Pico Chess` changed the native image and produced a 318-byte opening packet. Changing it to `chess` also reused the existing app string, reducing the packet to 306 bytes. Both generated Wasm functions matched the generic reference for their new titles. Meanwhile the original native encoder handled every captured and synthetic frame without recompilation or a fixture lookup. The separation between the two kinds of change is an explicit decision in the declaration.

## What the measured endpoints include

The original replay supplied 47 frame states from 127 Chess events. The snapshots covered the opening and black reply, check and terminal positions, castling, en passant, promotion and signed search statistics. Every traced PSIX payload was 313 bytes. The same semantic envelope in compact JSON was 257–263 bytes. Those lengths make the distinction between storage, computation and access visible. In this small shape, PSIX spends bytes on uniform reference slots and string offsets. It provides bounded indexed access. The experiment aims to remove repeated producer work while keeping that access property.

The two generic references and both generated backends agreed byte for byte for the 47 traces plus 74 deterministic structural cases. Synthetic inputs exercised both relative orders of live strings, a prefix relationship, values on either side of the inline integer threshold and i32 endpoints within the profile. The buffer tests verified that short declared byte caps and short backing buffer length headers leave all output bytes untouched. A successful call with exactly enough backing storage preserves the unused byte of an odd final halfword. The result is safe to hand to a caller already holding a valid allocation. The old PSIX admission logic still validates the syntax and owns the retained snapshot across drawing and restart.

| Host endpoint | Observed result |
|---|---:|
| Schema staging to Typed source, median of nine in-process runs | 0.402 ms |
| Typed source to RV32 instruction image, median of nine | 5.03 ms |
| Typed source to Wasm bytes, median of nine | 7.53 ms |
| Wasm module construction from bytes, median of nine | 0.072 ms |
| Wasm instance construction, median of nine | 0.160 ms |
| External freestanding ELF link, one host subprocess | 66.0 ms |
| Packed Wasm call with preloaded input, median block average | 3.26 µs |
| JS reference with a resident tree and new output, median block average | 25.52 µs |
| Emulated instructions for one packed RV32 call, median traced frame | 21,496 |
| Generated artifacts | 16,680 B Typed source, 16,116 B RV32 instructions, 6,514 B Wasm |

The host runtime arms start from different in-memory representations and use different engines. The Wasm call includes representation checks and writes into an already allocated destination. The JavaScript run starts from a resident object and creates a new `Uint8Array`. Hot samples timed 2,000 calls in each arm per block after warmup and rotated order across nine blocks. Each host compilation sample ran in the same process with the compiler already available. The external link is test harness work, with process-spawn overhead. The RV32 instruction count covers the native call and the surrounding C measurement instructions. Traced calls ranged from 21,394 to 23,679 instructions. The worst synthetic case, which includes wide numbers, reached 30,394. The emulator counts executed instructions and models neither the ESP32-P4 clock path nor its cache behavior. [Raw samples, endpoints and artifact hashes](../various/static/host-receipt.json).

## What happened on the PicoCalc

The physical trial staged the source in QuickJS on the ESP32-P4, compiled and linked it with the existing Typed compiler, compared the entire resulting ELF against a host-generated golden artifact, and loaded the code through the native ELF loader. It then called the freshly installed entry on every captured state. Seven blocks rotated the order of three writers. Each block gave every writer four calls per state, or 188 calls per arm. The timer stopped after the writer returned. The harness then checked exact bytes outside that timer. For the two caller-buffer arms it also checked the first byte beyond the counted result. [Board harness](../scripts/board/staging_trial.c) · [Physical receipt](../various/physical.json).

| ESP32-P4 writer | Start and end of timed interval | Median of seven block means |
|---|---|---:|
| Generic C PSIX | Resident cJSON tree through the size pass, dictionary, allocation and canonical output | 101.28 µs |
| Generated Typed RV32 | Prepacked Chess state through domain checks, ranks and packed destination writes | 78.24 µs |
| Resident C layout-table writer | Same prepacked state through domain checks, bounded dictionary insertion and a body template copy with slot writes | 24.71 µs |

The generic C control already has a tree available. Constructing it or parsing JSON is outside the interval. The caller reserves output in the other two arms before timing. The Typed backend emits many short calls and bounded halfword accesses. The table writer uses optimized C routines including byte-span copies and runs the same fixed layout without that machine-code overhead. The physical comparison establishes that this emitted writer can save about 23.04 µs per call against the generic resident-tree encoder, and that the C table writer was a further 53.53 µs faster. Instruction profiling would be needed to attribute those gaps among buffer checks, register traffic, string work and call overhead. [Table writer](../scripts/board/descriptor.h).

Median install time was 603.79 ms. The component medians were 12.69 ms to prepare the runtime and bundle inputs, 51.81 ms to load and run the source generator in QuickJS, 537.75 ms for the Typed compiler and linker, and 1.53 ms to qualify and load the native image. Separate medians can come from different blocks. The linked ELF occupied 33,964 bytes. The production compiler's reported QuickJS peak was about 699 kB during compile and link, independent of the generator's earlier realm. At the observed 23.04 µs saving, an extra 603.79 ms of compile-and-install work takes about 26,210 calls to repay against generic C if the same saving holds on future calls. The observed table writer has a shorter hot call and comes resident in the image, so these costs give runtime code generation no break-even against that control. [Physical receipt](../various/physical.json).

## What a producer needs to keep

The writer returns a packed little-endian byte span. Its return value is the exact number of valid bytes, so the caller can obtain the payload address without narrowing halfwords one at a time. This makes a byte copy possible across the transport boundary. The experiment does not change the kernel's production screen message, whose current text interface is NUL-terminated. Using this encoder in that path would require a counted message, trusted sender and generation binding, byte-budget reservation and the same immutable admission that the generic PSIX prototype uses.

At build time, the consequence of staging an encoder is artifact space and one more compile dependency. At runtime, a producer pays for generation, compilation, executable installation and retained code. For any comparison using the *same* physical endpoint, let `c` be that incremental one-time time cost and `d` the measured per-frame saving. The first frame count at which the runtime compile pays back its time is `ceil(c/d)` when `d > 0`. A precomputed layout interpreted by resident native code can avoid generic tree traversal while sharing executable code among layouts. Its hot writer is the relevant additional comparison. These measurements give the choice a concrete consequence for this layout. A build-time artifact removes compile latency from the device, while a resident table writer also improves the measured hot path.

The result is a producer interface for declaring which data shapes are stable and passing the changes as values. A runtime-discovered shape would require guards or an explicit validated input language for subsequent calls. Its first frame supplies observations, while the declaration here supplies enduring limits. The renderer can continue to accept ordinary PSIX v1 because source selection, compiler identity and the encoder's executable authority all stay on the producer side. [Producer guide with reproduction commands](../design-doc/02-static-emitter.md).
