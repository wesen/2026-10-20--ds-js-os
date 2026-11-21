---
Title: Following Typed operations into a Wasm module
Ticket: PICOCALC-COMPILER-INSPECT
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/compiler/typed-wasm.js
      Note: Captures exact operations and places them in the final Wasm module
    - Path: repo://ttmp/2026/11/21/PICOCALC-COMPILER-INSPECT--inspect-typed-wasm-and-rv32-emission/various/frontend/baseline.json
      Note: Records the pinned module identities, operation counts and real ray function offsets
ExternalSources: []
Summary: ""
LastUpdated: 0001-01-01T00:00:00Z
WhatFor: ""
WhenToUse: ""
---

# Following Typed operations into a Wasm module

The compiler inspector connects three things you can check independently. It shows the locals created for a Typed function, the operations emitted for it, and the exact bytes occupied by those operations in the finished Wasm module. This is useful when a source expression expands into several operations or when an operand changes the width of an instruction.

## Start with a function small enough to inspect by hand

Use this ordinary Typed function.

```typescript
function shifted(n: i32): i32 {
    const offset = n + 130;
    return offset;
}
```

The frontend assigns each local a slot. Slot zero holds the input parameter `n`. Slot one holds the immutable local `offset`. These slots are part of the function's local storage. The source names help a reader interpret the operations, even though their encodings use slot numbers.

The observer reports each named local when the emitter allocates it. That timing matters for a longer function. A name declared inside a loop or a block can leave the active scope before the compiler completes the body. Its slot still exists in the encoded function, so a report based on the final scope map would miss it. Compiler-managed anonymous slots contribute to the total slot count without receiving fabricated source names.

The Wasm instructions in `shifted` use an operand stack. `local.get 0` pushes the value of `n`. `i32.const 130` pushes the constant. The add consumes those two values and pushes their sum. `local.set 1` writes that value to `offset`. A final get leaves the return value on the stack when the function ends.

## Distinguish operation number from byte offset

The inspector assigns each frontend operation a zero-based ordinal. The ordinal counts instructions in the function's emitted order. An instruction's byte offset also depends on the widths of all preceding instructions. The following rows come from compiling this exact example.

| Ordinal | Frontend byte offset | Operation | Final module bytes | Encoding in hex |
|---:|---:|---|---|---|
| 0 | 0 | `local.get 0` | 55–56 | `20 00` |
| 1 | 2 | `i32.const 130` | 57–59 | `41 82 01` |
| 2 | 5 | `i32.add` | 60 | `6a` |
| 3 | 6 | `local.set 1` | 61–62 | `21 01` |
| 4 | 8 | `local.get 1` | 63–64 | `20 01` |
| 5 | 10 | `end` | 65 | `0b` |

A Wasm integer immediate is represented as a sequence of bytes. In `82 01`, the leading byte marks that another group follows and carries the low seven bits. The last byte carries the next group. Together they encode `2 + 128 = 130`. The opcode uses one byte of its own, so this constant consumes three bytes. The increment from ordinal one to two is one operation. The increment from frontend offset two to five is three bytes.

Your emitted numbers are easy to verify with the existing compiler. Run this from the repository root after saving the snippet to `/tmp/shifted.typed`.

```sh
node picocalc-os/tools/typed-inspect.mjs /tmp/shifted.typed \
  --target wasm --function shifted --jsonl
```

The module places the function body at byte 52. The three bytes at 52 through 54 declare one local of type `i32`. Instructions start at byte 55. The event's range for ordinal one is therefore the half-open interval `[57,60)`. The compiler reads these bytes from the finished module after section sizes and the body size have been encoded. Even earlier functions and export names can affect that final placement.

## Interpret source anchors at their stated precision

Each operation also carries a source anchor. The observer records the token active when the emitter writes the operation. While compiling `shifted`, the constant has the anchor for `130`. Both the add and the local set can carry the semicolon anchor at the end of the declaration. The emitter already consumed the expression before writing those last operations. The report labels this relationship `emission-token` so a reader can distinguish an available lexical anchor from an exact syntactic span.

A counted loop shows why anchors travel with the operations. The parser reads the update expression in the loop header, but that update executes after the body. The emitter writes the update into a temporary tape, emits the body, then attaches the update at the loop tail. When the inspector assigns ordinals, it follows that final order. The update still carries its header anchor.

An async source may have several coordinate spaces. An untouched function can refer back to the original text. A function rewritten to start a task refers to the rewritten body. A synthesized continuation refers to the generated helper text. The event identifies the coordinate space and supplies generated text where needed. A source offset always counts UTF-16 units in the indicated text. It is independent of the Wasm byte position.

## Compare the targets using their own units

The RV32 frontend emits a numeric tape. Its cells can hold full operands such as 130 directly. The native backend can also retain a checked text operation in one record where Wasm instantiates several primitive operations. This makes the count of frontend operations target-specific. It is reasonable for the same source function to have different ordinals and operand widths under the two targets. The native inspector then relates those numeric operations to machine bytes after layout and fixups.

The maintained ray tracer supplies a concrete comparison. For `typedRayInShadow` the two targets report the same 18 named locals. The Wasm frontend reports 312 operations whose instructions occupy module offsets `[2489,3028)`. The numeric frontend reports 180 operations. This result describes the two representations. An execution profile is needed to count how often the operations' machine code runs. [Baseline receipt](../various/frontend/baseline.json)

## Check the observer against the ordinary compiler

A correct trace must accompany the same executable the ordinary compiler produces. The host matrix compared the previous compiler, the current unobserved compiler, and the current observed compiler. Wasm and RV32 artifacts matched byte for byte across five inputs, including the ray tracer, Chess painter, Files, Candela materials, and an async fixture. Three error controls also preserved diagnostic names and messages. Further tests exercised multi-byte operand widths, moved loop updates, and callbacks that mutate their received event. [Frontend design](../design-doc/02-frontend-operations-and-final-wasm-offsets.md) · [Verification diary](../reference/02-frontend-inspection-investigation-diary.md)

Try compiling `shifted` with 2 in place of 130. Before running it, predict what happens to the next instruction. The constant becomes `41 02`, so the add moves from frontend byte offset five to four while retaining ordinal two. Final module positions can be read from the new emission event. That distinction between the order of operations and the position of delivered bytes is what lets the inspector explain changes without guessing the linker layout.
