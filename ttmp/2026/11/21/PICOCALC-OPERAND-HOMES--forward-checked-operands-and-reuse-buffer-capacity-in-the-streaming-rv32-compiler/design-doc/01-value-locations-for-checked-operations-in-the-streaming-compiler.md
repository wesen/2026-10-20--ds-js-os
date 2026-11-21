---
Title: Value locations for checked operations in the streaming compiler
Ticket: PICOCALC-OPERAND-HOMES
Status: active
Topics:
    - compiler
    - performance
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T18:42:55.307004462-05:00
WhatFor: ""
WhenToUse: ""
---

# Value locations for checked operations in the streaming compiler

## Start with one pixel

The ray tracer asks whether a sphere blocks light reaching a floor pixel. Its shadow routine reads geometry from a buffer of unsigned 16-bit cells. At the native interface the first four bytes contain the capacity in cells. Cell 19 therefore occupies bytes 42 and 43. A valid read returns a zero-extended integer. An invalid index must trap; subsequent operations, including observable writes, must not run. Rendering the opening image calls the predicate 19,477 times.

On these same inputs the existing optimized Typed predicate took 382.25 cycles per call, compared with 144.31 for LLVM. Both read 264,928 elements. Typed issued 264,928 capacity loads and nearly 1.94 million direct stack accesses. LLVM issued 19,477 capacity loads and 311,632 direct stack accesses. These counts identify instructions worth removing. Clock cycles must be measured separately on the P4.

## Where values live

A *binding* names a local variable. Assigning to it changes its value. A *home* specifies where generated instructions can find the current value. Existing native lowering normally gives each local four bytes in the function stack frame. Temporary expression results use a small set of registers associated with evaluation depth. Registers store old values independently of the binding that produced them. For example, in an addition whose right operand overwrites a local, the already evaluated left operand must retain its earlier value.

~~~text
Typed source
   |
   v
frontend checks types and evaluation order
   |                            |
   v                            v
numeric operations per function    Wasm encoding (independent oracle)
   |
   v
local uses, checked index consumers, calls, stores and control boundaries
   |
   v
RV32 emitter chooses register, immediate or frame address
   |
   v
module image and named function entry offsets
~~~

The frontend evaluates the index once and assigns it to a fresh local before emitting opcode 0xf1, which computes a checked address. The following halfword load uses displacement four for the buffer header. A store computes and checks the address before evaluating its right-hand side. Maintaining this ordering is essential when the right-hand side can trap or call an imported function.

## Design and proof obligations

1. Route local reads and writes through the same interface in ordinary scalar operations, the checked-address operation, literal stores, parameter initialization and packet lowering. A stack home initially generates the original load or store. Exercise the existing control image before enabling an optimization.
2. Forward the result of a local assignment directly into the immediately following checked-address operation if the temporary has only that consumer. A constant index in displacement range allows the shift and addition to fold into the payload instruction. The bounds test still sees the original signed bits interpreted as unsigned. Preserve the original computation for other consumers.
3. Cache one receiver's capacity at its first mandatory check. A first implementation admits a straight-line entry check which dominates subsequent control flow. Reject reassignment of the receiver, memory writes and unclassified calls for this optimization. An inlined pure helper has no memory effects or ABI call. Never load capacity on entry merely because the function contains a conditional read.
4. Assign selected frequently accessed locals to unused caller-saved registers across loop edges in eligible functions. Use a single fixed home for every definition and use of a selected local across the function. This limited allocation needs no phi nodes or edge copies. Keep expression registers and emitter scratch registers separate. A real call can clobber these registers. Start with call-free machine functions; specialized packet code already claims argument registers and needs its own treatment.

~~~text
if defining use is adjacent and index temporary has exactly one read:
    consume its expression register directly
else:
    read the index from its chosen home
receiver = readLocal(buffer)
length = available_capacity(receiver) or load_header(receiver)
if unsigned(index) >= length: trap
address = receiver + 2 * index
consume address (payload offset is 4)
~~~

A fact about a receiver is valid only for that value. The conservative whole-function eligibility rules avoid maintaining a general alias analysis. Refusing a function is a normal outcome. Reserved registers must be disjoint from incoming argument registers until argument setup is complete. A merge reached via either edge must agree on each promoted local's physical location. The ordinary operand stack continues to handle a value live across an assignment.

## Interfaces and source map

| API or file | Role |
|---|---|
| typedRv32.compile(source, imports, maxSourceLength, options) | Compiles source and returns image bytes and function entry offsets. Research options select forwarding, capacity reuse and persistent homes independently. |
| typedWasm.decodeNumericOperations(fn.code) | Decodes a single function tape into operation boundaries and operands. Opcode counts must use decoded instructions because immediate integers can equal opcodes. |
| FunctionCode.step, lower, pop and push | Select native instructions, initialize parameters, preserve evaluation order and manage expression spills. |
| NumericFunctionEmitter.codeUnitAddress | Keeps checked address computation visible to the native target. |
| typedPieLoops.lower | Chooses packet plans and emits a scalar fallback. A native operand policy must respect both entry conventions. |

Read picocalc-os/compiler/typed-wasm.js for parsing and synthetic locals, typed-rv32.js for instruction encoding and branch labels, and typed-pie-loops.js for implicit register reservations. Start the test review in picocalc-os/tests/typed-rv32.test.mjs. The PICOCALC-SHADOW-LLVM ticket contains the reference board timing, instruction counts and original REPL archive.

## Validation sequence

- Freeze the current ray image with guarded returns and pie-empty enabled. Check byte identity under disabled new options and unchanged Wasm behavior.
- Compare success values, traps and memory written before a failure. Include adjacent writes, negative indices, loop-carried values, short-circuited first reads, receiver reassignment, calls, deep expressions and mixed scalar/packet compilation.
- Compile identical application source as control, forwarding only, capacity only and combined. Measure persistent homes separately. Record native image size, compilation cost, predicate cycles and full-frame time. A faster isolated predicate can have a smaller effect on integrated frames.
- Use the trace session to pair observations by block and fixture. Distinguish dynamic guest instructions, physical cycles, complete frame microseconds and compiler microseconds. Retain rejected or slower treatments as evidence.
