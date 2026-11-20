---
Title: A binary snapshot with direct indexed access
Ticket: PICOCALC-RENDER-BINARY
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/js/system/compositor.js
      Note: Shared production painter
    - Path: repo://picocalc-os/nucleus/kernel.c
      Note: Production sender envelope and retained dispatch
    - Path: repo://ttmp/2026/11/20/PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/scripts/02-binary-screen.js
      Note: Encoder and immutable reader
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:35:07.884023075-05:00
WhatFor: ""
WhenToUse: ""
---

# A binary snapshot with direct indexed access

When Chess paints a board, the compositor reads a list of canvas instructions. In JSON the producer sends punctuation, names and values. The current compositor parses that text into objects and arrays. Only then can the compositor jump to the last instruction. The experimental PSIX v1 format stores the addresses of variable-sized values in fixed-width slots. It pays for a full validation pass before admission, then can read one instruction at a time without allocating the rest of the tree.

The experiment changes the representation of one complete snapshot. The payload has the same logical fields as the current kernel post, `{app, title, frame: {tree, hints}}`. A trusted caller supplies the expected sender. The compositor owns focus, battery and banner independently. An idle sender's latest accepted snapshot is sufficient to redraw after a compositor restart. [Renderer pipeline and guarantees](../../PICOCALC-RENDER-NEXT--bounded-screen-snapshots-and-compiled-layouts-for-the-picocalc-compositor/design-doc/01-a-bounded-screen-renderer-from-producer-to-panel.md).

## Reading the second child

Consider this JSON value, an abbreviated view tree.

```json
{"kids":[{"t":"label"},{"t":"gap","h":2}]}
```

A *reference* is a three-byte slot. Its upper four bits identify its type and its lower 20 bits hold a small number, a string ID or an offset from the start of the packet. An object entry spends two additional bytes on a key ID. All IDs refer to a packet-local sorted string directory. For this tree the directory contains `gap`, `h`, `kids`, `label` and `t` with IDs 0–4.

| Byte offset | Contents |
|---:|---|
| 10 | Root reference, object at 39 |
| 39 | One-field object. `kids` has ID 2 at 41 and points to array at 46 |
| 46 | Array length 2. Its two slots start at 48 and 51 |
| 54 | First child object with `t: "label"` |
| 61 | Second child object with `h: 2` and `t: "gap"` |
| 73 | End of the packet |

Read `kids` by searching the root's ordered keys. For array index 1 the slot address is `46 + 2 + 3 × 1 = 51`. Its reference points to byte 61. The second object's first field uses key ID 1 at byte 63. The slot at byte 65 represents `2` inline. The reader visits the selected slot and second child's body after admission. This is constant-time array indexing in the length of the array. The 64-field bound gives at most seven probes for an object lookup, each comparing key bytes. Retrieving a string still decodes its UTF-8 bytes when the consumer needs a JavaScript string.

```js
const bytes = binaryScreen.encode({kids: [{t: 'label'}, {t: 'gap', h: 2}]});
const reader = binaryScreen.admit(bytes);
reader.path(['kids', 1, 'h']); // 2
reader.view().kids[1].h;       // 2
```

The `view()` API supplies read-only array and object proxies so the existing painter can use ordinary property syntax and array methods during the measurement. The direct `path()` API avoids creating container proxies for the intervening slots. Both APIs only exist once validation succeeds. [Encoder and reader](../scripts/02-binary-screen.js).

## Packet invariants

All multibyte fields use little endian. The first 13 bytes contain ASCII `PSIX` at bytes 0–3, version 1 at 4, zero flags at 5, the exact packet length at 6–7, the string count at 8–9 and root reference at 10–12. The next `2 × (count + 1)` bytes store the offsets of strings in strict UTF-8 byte order, including the final end offset. Adjacent offsets give each UTF-8 byte length. The end offset marks the first byte of the body, even for an empty directory. A field name and a repeated label may share the same string ID.

| Tag | Payload and verification |
|---:|---|
| 0, 1, 2 | Null, false, true. The operand must be zero |
| 3 | Signed 20-bit integer in two's-complement form, −524,288 to 524,287. Producer negative zero normalizes to zero like JSON.stringify |
| 4 | Offset of an eight-byte finite IEEE-754 binary64. A number fitting tag 3 uses that tag |
| 5 | String ID less than the declared count |
| 6 | Offset of array count `u16` followed by three-byte slots |
| 7 | Offset of object field count `u16` followed by pairs of key ID `u16` and three-byte slot. IDs within a map are strictly increasing |

A decoder limits the input to 32,768 bytes before copying. It checks the header and string directory, then walks the references in array or key order. Each array, object or binary64 must start exactly at the next unconsumed byte. To validate an array, reserve its entire slot directory first, then visit each referenced child. This preorder rule rejects overlaps, aliases, gaps, circular references and trailing bytes using one advancing cursor. The validator checks strict UTF-8, including rejection of surrogate encodings and overlong sequences. The admitted data model permits embedded zero. The separate C comparison uses the subset without embedded NUL because cJSON exposes C strings, and caps string occurrences at 4,096 for both native arms.

The prototype caps depth at 24 with the root at 0, total values at 8,192, array length at 1,024, object fields at 64, unique strings at 4,096 and each decoded UTF-8 string at 2,048 bytes. Encoder work visits bounded values and maintains an incremental packet-byte total before growing scratch further. Receiver validation work is linear in the bounded packet and takes stack depth proportional to tree depth. Full rendering can still repeatedly decode a repeated label. The constraints bound transport structure. A production candidate needs widget-specific limits, including geometry, commands and expanded text work, and a bound for all queued, retained and pinned generations. None of the allocator results includes framebuffer memory.

The encoder sorts both object keys and its per-frame string directory. Byte comparison works for output from this encoder. The admission rules also permit a sorted string directory with unused entries, so independently implemented producers must follow the encoder's deduplication and ordering policy before relying on byte equality for semantic deduplication.

Opus's blind research proposed an aligned eight-byte slot format, optional resident dictionary and typed vectors. The implemented format carries the direct array slot and sorted-field directory ideas in three-byte slots, retains exact binary64 values seen in real graph data and uses a contiguous preorder body. This choice avoids a per-packet block-start table and avoids a flashed application schema. FlexBuffers is a separate schema-free precedent for direct vector access and binary search over sorted map keys. Its variable widths and backward references have different wire rules. [Blind design](../various/01-opus-blind-design.md), [FlexBuffers format internals](https://flatbuffers.dev/internals/).

## How a receiver keeps the last good frame

The experiments use an admitted closure that owns a copy of the incoming byte span, so the caller can free or mutate its buffer as soon as admission returns. Copying costs time and a simultaneous second payload allocation, which the study charges. The host retention model accepts a trusted sender generation and binds it to the decoded sender. It constructs the candidate view before replacing the retained entry. On malformed input, unsupported version, a mismatched sender or exhausted caps it reports one diagnostic and old accepted state stays available. A draw that already holds the prior view can finish using it. A retired sender generation cannot be replayed as current. [Host last-good model](../scripts/06-retention.js).

A future integration would require a counted byte span from producer to kernel message through both retention and replay. The kernel needs to stamp sender and publisher generation in trusted metadata and reserve bytes for queued and pinned generations. It can replace its existing text comparison with a length check and byte comparison once producer rules are identical. It must publish the snapshot and swap the retained reference only after complete validation, capacity reservation and identity checks. A receiver must pin the accepted buffer through layout and painting, release it after the last draw, and invalidate damage state on restart. This proposed boundary is suitable for isolated integrations. The existing NUL-terminated channel lacks those semantics. Base64 wrapping increases measured payload size for all four traced workloads.

## Reading the experiment

The control names refer to fixed actions. `P` uses the built-in JSON encoder and parser with sender/envelope checks. `G` adds cap checks over the parsed object so it accepts the same tested structural domain. `B` uses a JavaScript binary encoder, validator and lazy property adapter. All three use the same production layout and paint source with fixed clock inputs, one paint command checksum, two repeated paint checks, full semantic traversal and 32 alternating first/last indexed lookups. QuickJS built-ins are partly native. This matrix compares concrete integration options. A separate native C matrix compares cJSON to the same PSIX packet within one binary and separates receiver-only from native producer-plus-receiver. It excludes production painting. These boundaries are important when deciding what to adopt.

The selection rule sorts real eligible frames by complete compact JSON byte size and chooses the upper median. Eligible frames have a nonempty collection whose first and last entries can produce a scalar through the same deterministic descent rule. The largest such collection in traversal order supplies the first/last lookup pair. System, Chess and Snake supplied examples first. Editor was kept out until the format, caps and selection rule were frozen. Independent host replay checks the full trace, all paint commands and RGB565 output. Device timings use those four frozen specimens. The [reproduction guide](../README.md) runs the experiment from the recorded fixtures.
