---
Title: A staged compiler for PSIX screen encoders
Ticket: PICOCALC-PSIX-STAGING
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T12:07:12.043000805-05:00
WhatFor: ""
WhenToUse: ""
---

# A staged compiler for PSIX screen encoders

A Chess cursor has moved to another square. The game knows which pieces occupy the board, which squares the user may select and what text belongs in the status line. The rendering study gave the game a compact way to send those facts to a separate view. The serialization problem starts one step earlier. Can the compiler derive a writer that takes those facts in their existing memory layout and produces the indexed message directly?

The current generic native PSIX writer accepts a cJSON tree. It visits the tree to discover the names, count members, compute sizes, sort object fields and collect the packet’s distinct strings. It then visits the tree again to write the bytes. Parsing JSON text, when the caller needs it to construct that tree, is another expense. The previous physical sender comparison began with the tree already available. This study specializes the writer and tests whether the producer can omit the intermediary representation.

## Follow one field to the wire

The typed Chess view input contains nine integer fields. Suppose the first field, the cursor, has value 52. The Chess writer's input buffer stores that field as the two halfwords at indices 72 and 73. The generated program reads it, checks that a cursor is between 0 and 63, and records the integer in a three-byte PSIX slot. A signed value in the inclusive range −524,288 to 524,287 fits directly in a slot. Larger valid integers need eight additional bytes. The writer must know the final size before it can promise to leave an undersized output buffer intact.

Most of the message never depends on the cursor. The outer frame always has an application name, a title and a frame object. The semantic Chess payload always contains its ABI version, the digest identifying its view procedure, the board, the destination mask and the nine integers. This structure is a *schema*. An abstract syntax tree (AST) can describe it with a record node, an array node, literal leaves and leaves that read a specific input field. An AST here is compiler input. The running Chess program can call the resulting function with fresh values on every turn.

```text
build or installation                                      each screen
Chess declaration → record/tuple/literal/input nodes       90-cell state
                       ↓                                      ↓
                assign layout and checks               validate dynamic values
                       ↓                                      ↓
        emit a typed function OR a small table   →    write a counted PSIX buffer
                       ↓                                      ↓
       existing RV32 compiler and ELF loader          existing PSIX reader / oracle
```

There are two forms of specialization worth comparing. If the producer declares the shape, the compiler can reuse it on every valid call. If a program submits ordinary dynamically shaped objects, a compiler can observe one of them and record a *plan*. Before reusing that plan, the next call must check that the branches and assumptions on which it depends still hold. The trial includes the cost of these guards, generic fallback and learning new plans.

## Which bytes can be copied

The packet begins with a header and a dictionary of *all* distinct strings used in the packet, in increasing order of UTF-8 bytes. The first occurrence of a key and every copy of its text value can use the same dictionary entry. Object fields are stored in order of increasing key ID. Each array position has a three-byte slot and each object field has a five-byte key/value entry. References to bodies use absolute packet offsets. Child bodies are emitted in a prescribed preorder. This permits a reader to verify ownership of every byte with a forward cursor.

Suppose a one-field edit replaces a string value `"zz"` with `"aa"`. The two strings have the same byte length. The latter may move ahead of keys that used to precede the value. Every old reference to one of those keys may now denote something different. The independent experiment admits a packet containing an updated dictionary and stale body, then demonstrates that reading the label returns the integer score. The packet is structurally valid. Equality of the reconstructed application value and byte equality to the canonical reference catch the error.

A compiler author should classify each potential write by the information that determines it.

| Information available | What the writer can precompute | Work that remains per call |
|---|---|---|
| A record's fixed field names | UTF-8 byte order, number of entries and offsets within the object | Map static keys to their current packet IDs |
| A fixed-length tuple | Number of slots and relative slot addresses | Scalar tags, numeric payloads, any indirect bodies |
| Fixed literal bytes | A byte run or a table of writes | The run's final address when earlier sections change size |
| A bounded runtime string | Codec, upper bound, source address | Encode, deduplicate, establish rank and write its actual bytes |
| A previous instance of a dynamic object | Candidate traversal and structural assumptions | Guard the candidate, charge misses and replace stale shapes |

A whole-structure memory copy is possible only when the in-memory producer layout already meets all wire invariants. The typed buffer begins with a four-byte *cell* count and stores 16-bit units. The message needs an independent header and contiguous bytes. A writing routine can still copy fixed ranges and use native stores for dynamic holes. In this prototype an odd final byte preserves the next byte already in the caller's buffer. That test catches implementations that silently overwrite unrelated data.

## Reuse the existing compiler

In `picocalc-os/compiler/typed-wasm.js`, `parseDeclarations` records raw field types and four-byte field offsets. `compileFunctions` scans signatures and drives the per-function emitter. The public `typedWasm.compile(source)` returns Wasm bytes plus record layouts. In `picocalc-os/compiler/typed-rv32.js`, `typedRv32.compile(source)` uses the same frontend and lowers one function at a time. The result includes raw instruction bytes, function entry offsets and relocations. The fixed study function has no imported calls. `typedRv32.linkSlot` installs its image into the executable segment of an ELF reactor and patches the entry stub.

The Chess generator is a closed JavaScript function usable in both Node and the handheld's QuickJS. It receives the schema already present in the generator and a small library of typed primitives. It emits typed source for one writer. This prototype takes the source route because it is a tested compiler entry point on the device. Generating the exact same operation stream through an internal API could later eliminate text emission and reparsing. Any such change would have to preserve local-variable identity, type checks, source diagnostics, buffer representation and both backends.

```text
specialize(shape, source_layout):
    walk the declared keys and fixed children
    assign each runtime field a unique binding and source location
    check bounds and prove where indirect bodies can appear
    sort static strings and precompute relative directory locations
    emit a function with runtime validation, sizing and final writes
    compile and link once for the chosen target

encode(input, destination, capacity):
    read dynamic fields once and validate the declared domain
    bind current dictionary IDs and absolute offsets
    if destination cannot hold the measured result: return short
    write literals, fixed runs, tags, offsets and runtime payloads
    return the exact published byte count
```

The ABI takes three arguments. `psixEncode(input, output, capacity)` returns a positive byte count, −1 for an unsupported semantic input and −2 for insufficient capacity. Input and output occupy separate valid buffer allocations. The header of each gives the number of 16-bit units. Passing a byte capacity greater than the storage represented by the header cannot authorize an out-of-bounds write. Compiler tests exercise both caps. The output's pointer for transport would be the first byte of the payload after the four-byte buffer header.

## Both ways to know a shape

The declared Chess profile uses a complete semantic frame, including the real render digest. Sixty-four input cells hold piece codes, eight hold destination masks, and eighteen hold the nine metadata words split into halves. The board and mask encode into 64 and 16 ASCII hex characters. The literal dictionary is sorted once. The two runtime strings must find their order with respect to the literals and each other. The generator proves that the strings cannot be equal to a fixed string of matching length within the declared alphabets, and rejects schema variants which fail this particular proof. This is a restriction of the fast profile. The generic wire format permits equal strings.

A number spilling into an eight-byte body can also move *later containers*. The Chess generator places potentially indirect integers in the final group of child bodies. An explicit generation-time check rejects generalizations that would require relocating a later structural record. A more general writer must compute or patch those offsets. Both the independent reviewer and a separately implemented table writer checked the signed boundary.

The observed-shape experiment accepts trees as its normal input. It compiles an object/array traversal into a small bounded program and interprets that program after checking the new input. It builds a fresh string directory with current values. A fixed bank trained on a prefix, an initially empty adaptive bank and a bank warmed by replaying the prefix are all compared with the original encoder. A late System selection and a Keys control exercise changes and wholly different producers. Twelve cycling shapes on one route deliberately exceed the available positions. This design isolates the benefit of observed structure before spending additional cycles compiling each observation to machine code.

## Apply the macro reading to this language

*Macros Without Parentheses* separates expansion from execution and describes how generated bindings can accidentally refer to the wrong variables. Here the declaration is the expansion-time input, while the current board and output storage are runtime inputs. A generated `cursor` temporary and a user field spelled `cursor` need distinct identities. The current research generator owns the closed function and uses controlled names. Integrating a derive step in an arbitrary user program would require binding-aware local IDs or fresh private symbols for helpers. A macro that duplicates a user expression can also execute its effects twice. Lower that expression to one temporary before generating size and write uses.

The local tutorial's chapters on parsing infix macro syntax solve a different problem. The existing typed frontend already reads record declarations. A project-specific derive directive, ordinary build API or compiler call on its record table can select a writer without adding a new reader or general macro language. Flat records with simple scalars provide the natural first automatic derivation case. Schemas involving packed pieces, a particular digest or a program-specific string repertoire also need application knowledge. A declaration of a field as `buffer` alone does not say which of those contracts it implements.

Jones, Gomard and Sestoft call a program produced by fixing some inputs to a more general computation a residual program. Here the fixed inputs are the structural schema and ABI. Kennedy shows that serializers for larger types can be assembled from descriptions of smaller types. Scala Pickling provides a particularly close precedent for deriving specialized serializers from compile-time information. The scientific question is how much specialization pays on the P4 once setup, generic fallbacks, canonical variable-length fields and a small table interpreter all enter the comparison. [Partial Evaluation and Automatic Program Generation](https://raspi.itu.dk/people/sestoft/pebook/pebook.html) · [Pickler Combinators](https://www.microsoft.com/en-us/research/publication/functional-pearl-pickler-combinators/) · [Scala Pickling](https://index.scala-lang.org/scala/pickling)

## Run a discriminating trial

1. **Freeze the output.** Keep PSIX v1. For every input the reference encoder defines the exact bytes. Check changing rank, duplicate strings, signed width changes and short output. Keep skipped writes and the output tail observable. Structural admission alone can pass a wrong serializer.
2. **Compare the same semantic work.** Run the generated typed writer and a small C table interpreter on the same dense Chess input. Give the generic native encoder an already-resident equivalent cJSON tree. Charge the generated and table writers for filling a fresh buffer. Record where the application would have to construct the measured inputs.
3. **Charge specialization.** Measure source generation, compiler invocation, linking, ELF acquisition, relocation and first execution on the handheld. Record flash slot, actual instruction size and peak compiler heap separately. Compare to installing a prebuilt routine when assessing an edit or boot.
4. **Test reuse.** Preserve chronological order for a cache trial. Report hit count, fallbacks, bytes and total time to emit all packets. Count retraining separately when presenting a warmed bank. A periodically repeated benchmark that silently trains on its test set measures a different system.
5. **Measure a product decision only at the product boundary.** A wire writer has finished when the last byte is available. A Chess turn has finished displaying only after the compositor has admitted, painted and committed the changed pixels. The next integration must account for packing the live game state, retaining counted buffers, restart and screen equality.

Run `scripts/board/fixtures.mjs` to regenerate the compact descriptor and independent expected bytes from the checked-in semantic Chess trace. The ticket's board script includes a dedicated fixed entry, the production compiler and ELF loader, and an exact-image comparison with a host build. The normal firmware can continue accepting its existing screen messages while the experimental firmware owns a single serial session. The director's report records the measured decisions and links all executable controls.
