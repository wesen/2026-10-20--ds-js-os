---
Title: How application researchers can evaluate the binary screen API
Ticket: PICOCALC-RENDER-LAB
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:45:04.242420957-05:00
WhatFor: ""
WhenToUse: ""
---

# How application researchers can evaluate the binary screen API

The binary group supplies one versioned research format, PSIX v1. An encoded message is a sequence of bytes with its own string directory and tagged references. The producer emits a complete state. A recipient can find an arbitrary element of a vector by arithmetic and a named object field by bounded directory search. The receiver must first validate the buffer and own it for as long as a paint uses it. The dictionary is present in the packet. Keeping a copy of the corresponding app around is unnecessary for interpreting its field names.

## Pass a value to an existing semantic view

The JavaScript prototype in the binary ticket exposes these calls. They work with the ordinary complete semantic payloads already used by the three application studies.

```js
const bytes = binaryScreen.encode(state)
const message = binaryScreen.admit(bytes)
const decoded = message.view(message.root)
const rendered = residentView(decoded)
```

Here `state` is a plain object and `bytes` is a Uint8Array. `admit` validates and privately copies the submitted bytes. `message.root` is a tagged reference. `view` creates a JavaScript property-access view onto the indexed binary. The application-specific `residentView` still owns semantic checks. A validation budget for generic structure cannot determine whether a Chess square contains a legal piece.

When code only needs one value, call `message.path(["frame", "tree", "kids", 1, "ops", 75, 0])` on a **complete generic screen** whose canvas has at least 76 operations. The same sequence of field names would be inappropriate for a semantic Chess position; there the board is the field `b`. A direct typed cursor can use the offset of a vector and a fixed reference stride for element 75. An ordinary JS caller that repeatedly enumerates objects through a Proxy creates and decodes substantially more intermediate values.

## What the director replayed

The ticket script `scripts/25-semantic-consumer-check.mjs` encodes the actual complete semantic messages, hands the resulting bytes directly to the reader, and supplies the decoded state to the existing resident views. The fresh in-memory route contains no JSON serialization or parsing of the **input** during handoff. Stored research fixtures were originally exported as JSON. Some view outputs, notably Chess's existing bounded output tree, still use JSON before generic painting.

| Resident consumer | Observations | Immediate state changes | JSON payload bytes | PSIX payload bytes | PSIX if base64-encoded |
|---|---:|---:|---:|---:|---:|
| System template | 100 | 82 | 64,566 | 62,803 | 83,820 |
| Snake template | 236 | 224 | 28,313 | 29,841 | 39,788 |
| Chess typed view | 47 | 46 | 9,192 | 10,856 | 14,536 |

The reconstructed trees and hints matched the original semantic views for all observations. Byte counts include only changed payloads across this particular sequence and exclude the outer app/channel envelope. The original Snake study also freezes focus and kernel publication rules; its complete control has a different number of published frames. The raw format saved 2.73% for the System template and grew the two game payloads by 5.40% and 18.10%. A binary transport can still earn its cost by making validation or indexed access cheaper. For already compact game states, wire size alone gives little reason to change.

## Integration boundary

The physical firmware's existing `NW_SCREEN` entry in `picocalc-os/nucleus/native.c` validates a JSON object, pairs it with hints and serializes a complete frame. `nat_render` returns a NUL-terminated copy. In `nucleus/kernel.c`, `frame_message` adds the publisher and title. `kernel_publish` enqueues the message for eligible subscribers and replay uses the publisher's retained frame. Changing only the producer format would lose embedded zero bytes and fail the current contract.

A product trial should replace the representation of a **screen** at these named boundaries, retaining a verified length, a format/version field, publisher identity/epoch and reference-counted ownership through validation, queuing and draw. Updating normal channels is a separate decision. For the research receiver the low-level C entry in `PICOCALC-RENDER-BINARY/scripts/native/02-native.inc` demonstrates validation against the frozen layout. The C code is a fixture-based experiment. An application should obtain a validated view for its own immutable storage and release its generation at draw completion. Never infer a buffer length from its contents before verifying the transport length.

## Evidence that releases a product trial

1. Keep the existing app's state and inputs identical. Include the sender's construction and the receiver's safe admission in the primary interval.
2. Run the normal native producer and native compositor together on the P4. Compare handler time, key event to last changed-pixel transfer, peak live bytes during replacement and emitted bytes. Repeatedly reading a single field in isolation is a secondary metric.
3. Require exact pixels, sender ownership, refusal preserving the last good screen, recovery after a skipped flush, and fresh rendering after a receiver restart.
4. Record whether the production producer emits the binary representation directly. Building a JSON tree, serializing it, parsing it and then building PSIX measures a transcoder. Pricing the application changes requires using the actual source representation.

The director's report records the adoption decision. The executable compatibility check and exact API are available to each department independently of that decision.

## Reading notes for the receiving teams

Start with one access in the existing Chess screen, the last operation in an array of drawing commands. Three readings explain which part of that access each design can change.

1. **Who supplies the index?** Section 3.1 of the CBOR specification defines a definite-length array header by its element count. The elements can have different types and encoded lengths. For such an array, knowing its length lets a reader reject an out-of-range index immediately. Finding the last element still requires stepping over preceding encoded items or consulting an additional index. That observation motivated timing late-field access and charging the producer for creating the PSIX slots. It is a deduction from the format. The lab did not benchmark a CBOR implementation. [RFC 8949, section 3.1](https://www.rfc-editor.org/rfc/rfc8949.html#section-3.1)
2. **What does indexing cost when every field is read?** The FlexBuffers documentation illustrates zero-copy vector access and explains that iterating an entire map can be faster than doing a binary search for each key. Its stored keys and offsets let a receiver traverse a self-describing buffer directly. Our proposed Chess trial should count how the real painter reads the board and time one full paint. The lab's 32-lookup microbenchmark and full-tree walk answer different questions. PSIX has its own format and ownership protocol, and the native receiver in the trial copied the buffer once. [FlexBuffers access and efficiency](https://flatbuffers.dev/flexbuffers/#efficiency-tips)
3. **When does conversion earn its cost?** Keiser and Lemire's On-Demand parser traverses JSON with an iterator and materializes data as the caller accesses it. Their experiments establish the value of evaluating parsing and application access together on the machines they tested. Our renderer repeatedly accesses JavaScript properties during measurement and drawing. The P4 Proxy and native experiments indicate why a published desktop parsing result alone cannot predict the full renderer's time. When reviewing the production trial, trace which values actually become host-language strings or objects. [Keiser and Lemire, On-Demand JSON](https://arxiv.org/abs/2312.17149)
