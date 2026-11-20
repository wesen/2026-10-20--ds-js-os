---
Title: Why one new label can change four string IDs in a binary screen
Ticket: PICOCALC-PSIX-STAGING
Status: active
Topics:
    - picocalc
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-PSIX-STAGING--specialize-psix-screen-encoders-with-the-picocalc-typed-compiler/scripts/review/02-binding-results.json
      Note: Measured dictionary and offset examples
    - Path: repo://ttmp/2026/11/20/PICOCALC-PSIX-STAGING--specialize-psix-screen-encoders-with-the-picocalc-typed-compiler/scripts/review/04-cross-results.json
      Note: Independent cross-arm qualification counts
ExternalSources: []
Summary: A worked example of partial evaluation, packet-local string identity and value-dependent numeric width.
LastUpdated: 2026-11-20T12:15:00-05:00
WhatFor: Teach a compiler newcomer which serialized bytes a type can determine in advance
WhenToUse: When evaluating a compiled or cached writer for PSIX v1
---

# Why one new label can change four string IDs in a binary screen

Suppose a program displays a label, a score and a small fixed list called `tail`. The display's binary encoder turns these values into bytes that a reader can look up by name. Can a compiler do some of that work once, when it first sees the record declaration? Try changing the label from `"zz"` to `"aa"`. Its length stays two bytes. The numbers, keys and list all stay the same. Yet a writer that replaces just the dictionary and keeps the old record bytes produces a packet in which reading `label` returns the **score**. In the experiment the packet passes the real reader’s validation.

## Reading a packet with three fields

The research format is called PSIX v1. A packet begins with a header followed by a *dictionary*, the distinct strings in that packet sorted by their UTF-8 bytes. Both a field name such as `"label"` and a value such as `"zz"` belong to the same dictionary. A string’s ID is its zero-based position. An array or object stores a short description of each child in a three-byte slot. A slot contains a four-bit tag saying how to interpret its remaining twenty bits. A string slot carries a dictionary ID. An object or array slot carries the absolute byte position of its record. The header contains such a slot for the root. [PSIX writer and reader](../../PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/scripts/02-binary-screen.js)

Here is the input for the first packet. The escape in the list names one Unicode character, U+E000. Its UTF-8 representation occupies three bytes.

```js
{ label: "zz", score: 524287, tail: [true, 7, "\ue000"] }
```

The sorted dictionary is `["label", "score", "tail", "zz", "\ue000"]`. The header occupies thirteen bytes. Six two-byte positions follow, one for the start of each string and one for the end of the last string. The string contents use nineteen bytes. The root object therefore starts at byte 44, counting from zero. Its two-byte field count and three five-byte entries occupy seventeen bytes. Each entry contains a two-byte key ID and its three-byte value slot. This leaves the list starting at byte 61. You can now read the whole object using the following table.

| Field | Key ID | Tag and payload | What the reader returns |
| --- | ---: | --- | --- |
| label | 0 | string, 3 | “zz” |
| score | 1 | integer, 524287 | 524287 |
| tail | 2 | array, 61 | the list at byte 61 |

Now encode the second packet with `label = "aa"`. The dictionary is `["aa", "label", "score", "tail", "\ue000"]`. Its length, the total length of its contents and the array position all stay the same. The key IDs for the same three fields become 1, 2 and 3. The label value’s string ID becomes 0. The earlier ID 3 now denotes `"tail"`.

The control experiment constructs the correct new header and dictionary, then copies the seventeen-byte object and its child list from the old frame. Of its body bytes, four differ from the correct result. Admission checks that the object’s key IDs are strictly increasing and valid, and that the array begins where the format requires. The old key IDs 0, 1 and 2 still pass those checks. Under the new dictionary the packet now describes an object with keys `aa`, `label` and `score`. Its second value is the integer 524287, which explains what the reader returned for `label`. The failure distinguishes wire validation from application correctness. A byte comparison to an independent encoder tests the entire intended output in one operation. [Executable counterexample](../scripts/review/01-binding-boundary.mjs) · [Recorded observations](../scripts/review/02-binding-results.json)

## What can the compiler do early?

*Partial evaluation* takes a program with two inputs and supplies one of them in advance. The result is another program that waits for the remaining input. For serialization, think of the first input as a description of the record and the second as the values in one frame. A specialized program must produce the result the original encoder would have produced with both inputs. Work left for that program is called *residual*. This terminology concerns when information becomes available. A normal function invoked on each frame can be the residual program. [Jones, Gomard and Sestoft](https://raspi.itu.dk/people/sestoft/pebook/pebook.html)

Which information does the example really give us early? All three keys occur every time. Their order relative to one another follows their bytes and is fixed. The string U+E000 always occurs in the list. We can sort these four strings once. To encode the live label, find its position among the four. If the live value equals one of them, reuse its ID. Otherwise insert it and add one to the ID of every permanent string at or after the insertion point. The relative field order is a constant even when all three IDs change. With several live strings, first obtain their distinct, sorted values and merge the two lists, folding duplicates across both. In both algorithms every ID is a rank in the dictionary of the current packet.

There are also bytes worth copying. The list record begins with eight bytes encoding the count of three, the boolean true and the integer seven. Those eight bytes never depend on the label or the score. The final list slot has a known string tag and a payload that depends on the rank of U+E000. The writer can copy the same eight-byte prefix to a computed address, then write that final slot. This copy is valid even when the entire list moves.

```text
Earlier, from the declaration     On each frame
-----------------------------    ----------------------------------------
ordered permanent strings   ---> merge the current label; assign string IDs
object/list record sizes    ---> add dictionary bytes and numeric body bytes
list’s eight-byte prefix    ---> copy at the computed list address
ordered field slots         ---> write the final IDs, score and list address
```

The number also needs a decision. The signed integer range that fits in a twenty-bit payload extends from −524288 through 524287. The next positive integer, 524288, still fits in the Typed compiler’s i32, but PSIX encodes it in an eight-byte floating-point body and places a pointer to that body in the slot. The list following that body moves by eight bytes. A wire tag for an arbitrary i32 remains undecided until a range proof, a checked guard or a runtime branch supplies the missing fact.

| Frame change | Total bytes | Unique strings | Root starts | List starts |
| --- | ---: | ---: | ---: | ---: |
| “zz”, 524287 | 72 | 5 | 44 | 61 |
| “aa”, 524287 | 72 | 5 | 44 | 61 |
| “label”, 524287 | 68 | 4 | 40 | 57 |
| “lengthy”, 524287 | 77 | 5 | 49 | 66 |
| “aa”, 524288 | 80 | 5 | 44 | 69 |

If the label itself is `"label"`, the dictionary loses a distinct entry. Replacing the two-byte `"zz"` in the first frame saves those two bytes of string contents and two bytes for the directory position. The four-byte decrease accounts for both moving addresses. A comparison based only on input string lengths would miss this shortening. [Raw results](../scripts/review/02-binding-results.json)

## Declaring a layout and observing one

A declared layout can specify that a record has exactly these fields and that each score is an i32. A compiler that owns the declaration can emit direct reads from known field positions. If the declaration also promises a bounded score, the compiler can choose the integer tag once. A fixed vocabulary can similarly remove dictionary merging if the set of strings actually present is invariant. An enum of permitted labels still requires the current label to determine which string occurs in a packet, unless every possible label is guaranteed to occur elsewhere.

A writer that learns from one ordinary JavaScript object has weaker evidence. Some *guard*, a runtime condition, must establish the assumptions implied by its fast path. If it assumes an exact key set or a fixed number of list elements, check those before committing the output. If it assumes packet-relative string IDs, check those as well or recompute them. A changed string can be a normal input to a sufficiently general residual writer. Treating each new string as a new compiled shape risks spending more time generating writers than encoding frames. A source object with arbitrary property getters would also need a defined capture step, since two reads of one property may return different values.

The same distinction applies to generated names. A generator that pastes a helper name into user source could accidentally call a binding with that spelling from the wrong scope. *Macro hygiene* preserves the identity of declarations as program fragments are combined. A generator with a separate compilation unit and an explicit helper interface can control those bindings with ordinary scope rules. Both approaches still need the string-rank calculations above. Macro expansion decides what code will run, while the label supplied on the next frame determines the numeric answer to that code. [Flatt, Binding as Sets of Scopes](https://www-old.cs.utah.edu/plt/publications/popl16-f.pdf)

## From this writer to machine code

The independent host experiment hand-wrote the residual routine for this single declaration. It transcoded and checked the label, merged it against the permanent dictionary, chose the numeric representation, calculated addresses, and wrote all the bytes of a fresh output. It compared 23 labels crossed with 13 finite numeric inputs (299 packets) to the generic encoder, byte for byte. Six invalid cases produced matching errors. The inputs included a pair of Unicode strings with opposite order under JavaScript's default UTF-16 sort and the required UTF-8 byte sort. Each accepted packet also passed admission and three path checks. The writer used Node's Buffer and binary64 support. These tests establish correctness for the exercised inputs and the counterexample, without measuring runtime on a handheld. [Writer and test matrix](../scripts/review/01-binding-boundary.mjs)

I then exercised both research candidates independently. Seven declared Chess writers, each compiled separately to WebAssembly by the actual Typed compiler, produced exactly the reference bytes in all 294 cases. Each received a packed board and score, constructed a complete output in memory prefilled with a recognizable byte, and preserved that memory on a one-byte-short capacity call. Chess restricts its dynamic strings to two fixed-size hex encodings, so it can compute their ranks against constant keys without a general string table. The observed candidate accepted the three-field example as an ordinary object. Across 60 frames it completed 56 guarded hits and four calls to the generic encoder. It produced the reference bytes in both paths by rebuilding the current dictionary on hits and guarding the numeric representation class. This cross-check used a host Wasm runtime for the first candidate and Node for the second. [Independent cross-arm driver](../scripts/review/03-cross-review.mjs) · [Counts](../scripts/review/04-cross-results.json)

Targeting PicoCalc introduces one concrete translation issue. The Typed language supports a counted buffer of 16-bit code units. Its normal store writes two bytes per unit, and the current screen SDK converts such units to UTF-8 text before sending a screen. PSIX already consists of packed bytes and includes zero bytes. A compiler experiment must identify where it writes this output, how it becomes packed bytes and who owns it when the reader starts. Timings will answer different questions if one writer starts with a fully initialized retained packet while another constructs a fresh packet. [Typed frontend](../../../../../../picocalc-os/compiler/typed-wasm.js) · [SDK implementation](../../../../../../picocalc-os/sdk/typed/world.c)

I also repeated the teams’ larger trace runs. For the declared writer, the same 121 packets matched across generated Wasm, generated RV32 in an emulator, the JavaScript reference encoder and a separate C reference. The RV32 encoder occupied 16,116 bytes. Its median recorded-frame instruction count was 21,496. The observed plan interpreter reproduced 427 application packets in its complete Node replay. On one mixed 209-frame holdout it hit on 157 frames after a cold start, yet the median stream time was 10.69 ms against 10.20 ms for the generic encoder on that shared host. Looking up and guarding plans takes time even when they work. [Static replay](../scripts/review/06-independent-static-replay.json) · [Observed replay](../scripts/review/05-independent-node-replay.json)

For a next measurement, execute the same residual operations twice, once through a plan interpreter that dispatches on operation kinds and once as compiled direct writes. Charge both for obtaining input values, checking the same guards and delivering the same owned bytes. Those two runs isolate the saving from compilation. Compare the winner to the generic encoder, including one-time compilation cost over the actual number of frames. A gain after hundreds of hits could matter to a game repainting repeatedly and be irrelevant to an infrequently opened settings panel.

## Try the boundary

From the repository root, Node 24 can reproduce the table and all assertions with the following command.

```sh
node ttmp/2026/11/20/PICOCALC-PSIX-STAGING*/scripts/review/01-binding-boundary.mjs
```

Before running it, predict what happens if `label` is exactly U+E000. The dictionary still contains only the four permanent strings. The object value and the final list entry refer to the same ID, 3. Next try U+10000. That character’s UTF-8 bytes sort after U+E000, giving it ID 4. A writer can know the key names and their relative order for the lifetime of the application. The packet containing the current label determines their final representation.
