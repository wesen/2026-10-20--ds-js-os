---
Title: 'Scope A: an RV32 backend with a compile-time operand stack'
Ticket: PICOCALC-NATIVE-NEXT
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://compiler/typed/typed-rv32.js
      Note: The RV32 backend that Scope A rewrites
    - Path: repo://compiler/typed/typed-wasm.js
      Note: Frontend change for && and || in A6
    - Path: repo://firmware/sdk/typed/rv32-slot.S
      Note: Slot reservation reduced in A8
ExternalSources: []
Summary: 'Tasks A0 to A8: the register lowering with a compile-time operand stack, fused comparisons, short branches, branch-form && and ||, locals in registers, and smaller slots, each with a predicted instruction count.'
LastUpdated: 2026-11-19T15:05:39.749689699-05:00
WhatFor: Implementation guide for the RV32 backend work.
WhenToUse: When working on picocalc-os/compiler/typed-rv32.js.
---

# Scope A: an RV32 backend with a compile-time operand stack

This document describes the nine tasks that replace the middle of `picocalc-os/compiler/typed-rv32.js` with a translation that keeps the WebAssembly operand stack in registers. It first explains what the backend does today and what the new one does differently, using one four-line function throughout. It then fixes the design decisions that every task shares: which registers play which role, what an entry of the compile-time stack can be, and what the rule at control-flow joins is. The tasks follow in order. Each has a predicted instruction count that the implementation must meet within a stated tolerance.

Read sections 5.2, 5.5, 5.6, 5.7 and 5.8 of Article 5 (`$ISSUE/sources/issue/05-code-generation-for-a-stack-machine-on-a-register-machine.md`) before this document. The orientation document (`01-implementation-plan-...`) defines *slot*, *trampoline*, *operand stack* and *flush* and gives the shell variables used in the commands.

## A.1 What the backend does today

The class `FunctionCode` in `typed-rv32.js` (lines 22 to 222) translates one WebAssembly function body. Its method `step(op)` (line 145) is a `switch` over the opcode. Every case follows the same pattern: `pop` its inputs from frame slots into `t0` and `t1`, compute, `push` the result back to a frame slot. `pop` (line 66) emits a load, `push` (line 71) emits a store. The frame holds the locals first and the operand-stack slots after them; `lower` (line 205) computes its size once the deepest stack is known and patches the first two words of the function.

The function used as the running example is `bump`.

```
function bump(b: i32, c: i32): i32 {
    let a = b + c;
    if (a > 0) { a = a + 1; }
    return a;
}
```

The frontend emits 25 bytes of WebAssembly for it: `20 00 20 01 6a 21 02` (`local.get b`, `local.get c`, `i32.add`, `local.set a`), `20 02 41 00 4a 04 40` (`local.get a`, `i32.const 0`, `i32.gt_s`, `if`), `20 02 41 01 6a 21 02 0b` (`a = a + 1`, `end`), `20 02 0b` (`local.get a`, `end`). The backend emits 41 instructions. The first sixteen are shown; the complete listing is `$ISSUE/various/02-bump-example.txt`.

```
# emitted today (node $ISSUE/scripts/02-disassemble-example.mjs "$OBJDUMP" bump.typed)
   0:  addi sp,sp,-32
   4:  sw   ra,28(sp)
   8:  sw   a0,0(sp)        # parameter b to its frame place
   c:  sw   a1,4(sp)        # parameter c
  10:  lw   t0,0(sp)        # local.get b
  14:  sw   t0,12(sp)       #   push
  18:  lw   t0,4(sp)        # local.get c
  1c:  sw   t0,16(sp)       #   push
  20:  lw   t1,16(sp)       # i32.add: pop
  24:  lw   t0,12(sp)       #   pop
  28:  add  t0,t0,t1
  2c:  sw   t0,12(sp)       #   push
  30:  lw   t0,12(sp)       # local.set a: pop
  34:  sw   t0,8(sp)
  38:  lw   t0,8(sp)        # local.get a
  3c:  sw   t0,12(sp)       #   push
```

Across the three applications, 50 to 55 percent of all emitted instructions are these loads and stores of operand-stack slots (`$ISSUE/various/01-rv32-instruction-mix.txt`).

## A.2 What the new lowering does

The new lowering keeps a list, `this.stack`, with one entry per operand-stack position. An entry says where the value is now. `local.get` and `i32.const` append an entry and emit nothing. An operation that needs a value in a register asks the entry for one, and only then is a load or a constant emitted. A comparison appends an entry that remembers its operands, and the branch that follows emits one compare-and-branch instruction. The target listing for `bump` after task A3 is 15 instructions.

```
# target after A3 (model A: 15 instructions)
   addi sp,sp,-16
   sw   a0,0(sp)
   sw   a1,4(sp)
   lw   t0,0(sp)           # i32.add needs b
   lw   t1,4(sp)           #   and c
   add  t0,t0,t1
   sw   t0,8(sp)           # local.set a
   lw   t0,8(sp)           # the branch needs a
   blez t0,L               # if (a > 0), inverted, one instruction
   lw   t0,8(sp)
   addi t0,t0,1            # the constant 1 never enters a register
   sw   t0,8(sp)
L: lw   a0,8(sp)           # return a
   addi sp,sp,16
   ret
```

The function makes no calls, so it does not save `ra`. After task A7 the locals live in registers and the function is five instructions: `add a2,a0,a1`; `blez a2,L`; `addi a2,a2,1`; `L: mv a0,a2`; `ret`.

## A.3 Design decisions shared by all tasks

### Register roles

| Registers | Role | From task |
| --- | --- | --- |
| `t0`–`t4` (x5, x6, x7, x28, x29) | Stack registers. The entry at stack depth *d* (0 for the bottom), when it is in a register, is in `T[d]`. Depths 5 and above use the frame slot `4 * (locals + d)`, the same numbering the old lowering uses. | A1 |
| `t5`, `t6` (x30, x31) | Scratch: operands of an operation whose entry has no stack register, and constants needed inside a check sequence | A1 |
| `a0`–`a7` | Arguments and results of calls. In a leaf function after A7: locals | A1, A7 |
| `s1`–`s11` | After A7: locals of a function that makes calls, saved on entry and restored on exit | A7 |
| `s11` | After F3: the fuel counter, which removes it from the locals of A7 | F3 |

Tying a register to a stack depth is the simplest form of what Ertl calls static stack caching [Ertl 1995]. It has one property that the rest of the design relies on: two paths that reach the same point with the same stack depth and with every entry in its register agree on where every value is, without any bookkeeping. The cost is that an expression with more than five computed values pending uses memory for the sixth. Editor's deepest operand stack is 8, and 100 of its 120 functions never exceed 5, counting entries that are constants or unread locals and occupy no register (`$ISSUE/various/03-register-cache-model.txt`).

The model of Article 5 assumes that a free temporary always exists and gives a leaf function ten registers for locals. This design gives a leaf eight (`a0`–`a7`) and counts frame traffic for deep stacks. Both differences raise the count slightly. The tolerances in the acceptance checks allow for them, and the per-function report of task A0 shows where they occur.

### Entry kinds

An entry of `this.stack` is one of six kinds.

| Kind | Meaning | Emitted when created | Cost to obtain in a register |
| --- | --- | --- | --- |
| `const k` | The constant *k* | nothing | 0 if *k* is 0 (register `zero`), else 1 (`addi`) or 2 (`lui`, `addi`) |
| `local i` | The value local *i* has now | nothing | 1 (`lw`) while locals are in the frame; 0 after A7 if local *i* is in a register |
| `reg` | Computed; in `T[d]` | the computing instruction | 0 |
| `ret` | The result of the call just made; in `a0` | the call | 0 |
| `slot` | Saved in the frame slot of its depth | one `sw` | 1 (`lw`) |
| `cond` | A comparison `a ⋈ b` not yet computed; `a` is already in a register, `b` is a `const`, `local` or register | nothing (after A2) | 1 to 3 (`slt`, `xori`, `seqz` forms) |

### The flush rule

A flush turns every entry below a given depth into `reg` or `slot`: a `const` is loaded, a `local` is read, a `cond` is computed as 0 or 1, a `ret` is copied from `a0` to `T[d]`. The lowering flushes the whole stack at four places, which are the places where the counting model flushes:

1. before `block`, `loop` and `if` open (for `if`, after the condition entry has been taken off);
2. before `br_if` (after the condition entry has been taken off);
3. at `else` and at the `end` of a block that produces a value, the top entry is *placed* in `T[depth of the block]`;
4. before a call, every computed entry below the arguments is saved to its frame slot and becomes `slot`, because the callee may overwrite `t0`–`t6` and `a0`–`a7`.

The frontend opens a block only between statements or for `&&`, `||` and `Math.min`/`max`, so the stack is almost always empty at a flush. The model counts 0 flushed instructions in Files, 6 in Agenda and 155 in Editor.

A trap needs no flush, because nothing reads the frame afterwards. Section 5.5 of Article 5 gives the argument.

### The pending-read rule

A `local i` entry stands for the value the local had when `local.get` was translated. If `local.set i` is translated while such an entry is still in the list, the entry must first be read into its register. The same holds for a `cond` entry whose operand is `local i`. The frontend never produces this sequence today: an instrumented run of the model over all 161 functions of the three applications found no occurrence. The rule is still required, because the backend's input is WebAssembly and the frontend will change (A6, E1 to E8, G1). Its test in task A1 therefore feeds the backend a hand-written body.

### Selecting the lowering

The old and new lowerings coexist until task A8, so that each application moves when it is ready and the old output remains available as a reference. `typedRv32.compile(source, imports, maxSourceLength, options)` gains a fourth parameter; `options.lowering` is `"slots"` (the class `FunctionCode` as it is) or `"registers"` (a new class `RegisterCode`). The default is `typedRv32.defaultLowering`, initially `"slots"`. `worlds/files/compile.js` passes `"registers"` from A3, `worlds/agenda/compile.js` from A4, `compiler/typed-world.js` from A5. The replay scripts that call `typedRv32.compile(source)` directly are switched by preloading a one-line module that sets `typedRv32.defaultLowering`, so the scripts themselves stay unchanged.

---

## Task A0: host harness for the backend work

**Goal.** Provide the three host tools that every later task of this scope uses: a per-function comparison of emitted instruction counts with the model, an RV32 interpreter for differential tests of single functions, and a way to run all replays with the new lowering.

**Where to look.**
- `$ISSUE/scripts/03-register-cache-model.mjs`: the function `walk` (line 39) and the summary loop at the end, which compares `cost.current` with the real image per function.
- `$NEXT/scripts/02-staged-register-model.mjs`: the same script with the `STAGE` switch; `$NEXT/various/02-staged-register-model.txt` is its output.
- `$NEXT/scripts/01-run-host-replays.sh`: the 24 replays.
- `ttmp/2026/11/18/PICOCALC-AGENDA-COMPILER*/scripts/07-check-rv32-parser.mjs`, lines 17 to 19: how an existing check runs the same source as WebAssembly in Node (`WebAssembly.instantiate(compileTyped(source))`) and as RV32.
- `typed-rv32.js`, `compile` (line 224): the shape of its result, `{image, entries, records, relocations, importCount, signatures}`. A call to an imported function is left as a zero word and listed in `relocations` as `{offset, index}`.
- Article 5, section 5.8, for what the model does and does not show.

**Files to change.** New files only, in `$NEXT/scripts/`: `lib/model.mjs`, `lib/rv32-interp.mjs`, `lib/use-register-lowering.mjs`, `03-check-instruction-counts.mjs`, `04-check-functions-differential.mjs`. One change to `01-run-host-replays.sh`.

**Core algorithm.** The interpreter executes the unlinked image that `typedRv32.compile` returns.

```
run(program, name, args, imports, memory):
    x = 32 registers, all 0;  x[sp] = top of a 64 KiB stack area in memory
    x[a0..] = args;  x[ra] = RETURN_SENTINEL;  pc = program.entries[name]
    steps = 0
    loop:
        if pc == RETURN_SENTINEL: return x[a0]
        if pc is the offset of a relocation r:            # call to imports[r.index]
            x[a0] = imports[r.index](x[a0..a7], memory);  pc = pc + 4;  continue
        w = word at pc
        if w == 0x00100073: throw Trap(pc)                # ebreak
        decode w: LUI, ADDI, SLTIU, XORI, SLLI, ADD, SUB, MUL, DIV, REM, SLL, SRA, SLT, SLTU, XOR,
                  LW, LHU, SW, SH, BEQ, BNE, BLT, BGE, BLTU, BGEU, JAL, JALR; anything else: throw Undecodable(pc, w)
        every load and store must lie inside `memory`; otherwise throw OutOfBounds(pc, address)
        x[zero] = 0;  steps = steps + 1;  if steps > limit: throw StepLimit
```

The differential check compiles one source text twice and compares results over a list of argument tuples.

```
for each fixture {source, calls: [[name, args...], ...]}:
    wasm = instantiate(compileTyped(source))
    for lowering in ["slots", "registers"]:
        program = typedRv32.compile(source, [], undefined, {lowering})
        for each call: expected = wasm.exports[name](...args), or "trap" if it throws
                       actual   = run(program, name, args), or "trap"
                       assert actual == expected
```

**Steps.**
1. Move `walk` and the application table of `02-staged-register-model.mjs` into `lib/model.mjs` and export `walk(fn, callables, nImports, stage)` and `apps`. Keep `02-staged-register-model.mjs` as a thin caller whose output is unchanged.
2. Write `03-check-instruction-counts.mjs --app files|agenda|editor --stage 1|2|3 --model A|B --tolerance 0.05 [--lowering registers]`. It compiles the application, takes each function's emitted length from `program.entries`, and prints one row per function: name, emitted, model, difference. It exits non-zero if the total differs from the model total by more than the tolerance, and lists every function that differs by more than 4 instructions and more than 10 percent.
3. Write `lib/rv32-interp.mjs` as above. Strings and buffers are laid out in `memory` as the reactor lays them out: a 32-bit length followed by 16-bit units.
4. Write `04-check-functions-differential.mjs` with a first fixture list: `bump`; `countUnit`; one function per arithmetic operator including `/` and `%` with divisors 0, −1 and the dividend −2147483648; each comparison operator with both orders of a constant operand; `Math.min` and `Math.max`; nested `&&` and `||` as values and as conditions; a record field read and write; `charCodeAt` and `setCharCodeAt` at index −1, 0, length − 1 and length; `writeLiteral`; a call with 8 arguments; a call whose arguments are themselves calls.
5. Write `lib/use-register-lowering.mjs` containing one statement that sets `globalThis.typedRv32.defaultLowering = "registers"` after importing the compiler, and make `01-run-host-replays.sh` add `--import` of that file to every `node` command when the environment variable `LOWERING=registers` is set.

**Worked example.** With the old lowering only, `node $NEXT/scripts/03-check-instruction-counts.mjs --app files --stage 0` (stage 0 meaning the model of today's scheme) prints seven rows and the line `files: emitted 1529, model 1529, difference 0 (0.0%)`.

**Acceptance on the host.**
- `node $NEXT/scripts/03-check-instruction-counts.mjs --app A --stage 0` reports difference 0 for Files (1,529), Agenda (7,710) and Editor (43,965).
- `node $NEXT/scripts/04-check-functions-differential.mjs` passes with `{lowering: "slots"}` for every fixture, with at least 40 fixtures and 400 calls. This validates the interpreter against the lowering that the replays already trust.
- `STAGE=3 node $NEXT/scripts/02-staged-register-model.mjs` still prints 593, 2,789 and 16,544.
- All replays pass.

**What a wrong implementation looks like.** An interpreter that sign-extends `lhu`, or treats `sltu` as signed, agrees with a correct backend on small positive values and disagrees on a `charCodeAt` of a unit above 0x7fff or a bounds check with index −1. The fixture list contains both, and the old lowering is known to be right on them, so the first run exposes the interpreter's error and not the backend's.

**Dependencies.** None. **Size.** S. **Risks.** The interpreter is itself unverified code; it is checked only by agreement with WebAssembly on the old lowering. Keep it under 200 lines so that it can be read in full.

---

## Task A1: the register lowering with lazy constants and locals

**Goal.** Add the class `RegisterCode`, which lowers every opcode the frontend emits using the compile-time stack, with comparisons materialized as 0 or 1 and conditional branches in the long form, and compile Files with it at 732 instructions.

**Where to look.**
- `typed-rv32.js`: `FunctionCode` (lines 22 to 222) in full; `ALU` (line 17) for the encodings; `binary` (line 89) for the division checks; `begin`, `end` and the `0x05`, `0x0c`, `0x0d`, `0x10` cases of `step` for control flow and calls; `lower` (line 205) for the prologue and epilogue; `compile` (line 224) for how labels and calls are resolved across functions.
- `$NEXT/scripts/lib/model.mjs` (from A0): `mat`, `place`, `flush` and each `case` of the walk. The model is the specification of what each opcode may cost.
- Article 5, section 5.5, including "The rule at control-flow joins". Literature: Ertl 1995 (static stack caching); Bellard's Tiny C Compiler documentation, chapter 8 (the value stack); Titzer 2024 (one forward abstract interpretation of the operand stack); Backes 2018 (Liftoff's virtual stack).

**Files and functions to change.** `picocalc-os/compiler/typed-rv32.js`: new class `RegisterCode` beside `FunctionCode`; `compile` takes `options` and chooses the class; a new exported function `typedRv32.lowerBodies(functions, imports, options)` that `compile` calls after `typedWasm.compileFunctions`, so that a test can pass hand-written bodies. `picocalc-os/worlds/files/compile.js`: no change yet.

**Core algorithm.**

```
T = [t0, t1, t2, t3, t4];  scratch = [t5, t6]

reg(entry, d, want = T[d] or scratch):          # make the value available in a register; return it
    const 0        -> zero
    const k        -> emit li want, k;            return want
    local i        -> emit lw want, 4*i(sp);      return want
    reg            -> T[d]   (or, for d >= 5, emit lw want, slot(d)(sp); return want)
    ret            -> a0
    slot           -> emit lw want, slot(d)(sp);  return want
    cond           -> emit the 0/1 sequence into want; return want

settle(d):                                      # after reg(): the entry at depth d is now `reg`
    if d < 5: if the value is not in T[d], emit mv T[d], r.   stack[d] = reg
    else:     emit sw r, slot(d)(sp).                         stack[d] = slot

flush(upto = stack.length):
    for d in 0 .. upto-1: if stack[d] is const, local, ret or cond: settle(d) after reg(stack[d], d)

push(entry): stack.push(entry); peak = max(peak, stack.length)

step(op):
    i32.const k:        push(const k)
    local.get i:        push(local i)
    local.set i:        e = pop()
                        for every remaining entry that is `local i`, or a cond whose operand is `local i`:
                            read it into its own register first            # the pending-read rule
                        emit sw reg(e), 4*i(sp)
    add, sub with a const right operand that fits 12 bits:
                        b = pop(); a = pop(); emit addi T[d], reg(a), ±k;  push(reg)
    shl, shr_s with a const right operand:
                        emit slli / srai T[d], reg(a), k;                  push(reg)
    other ALU ops:      rb = reg(b, d+1); ra = reg(a, d)
                        div, rem: emit the zero check (bnez rb,+8; ebreak) and, for div, the overflow check,
                                  using scratch for the constants -1 and -2147483648; skip both when b is a
                                  const other than 0 and -1
                        emit op T[d], ra, rb;                              push(reg)
    comparison:         A1: compute 0 or 1 into T[d] with slt/sltu/xor/seqz/xori, as binary() does today; push(reg)
    i32.eqz:            emit seqz T[d], reg(a);                            push(reg)
    i32.load, load16_u: emit lw / lhu T[d], offset(reg(a));                push(reg)
    i32.store, store16: v = pop(); a = pop(); emit sw / sh reg(v, d+1), offset(reg(a, d))
    drop:               pop()
    unreachable:        emit ebreak
    block, loop:        flush(); control.push({op, depth, value, labels})
    if:                 c = pop(); flush(); A1: emit bnez reg(c), +8; j alternate;  control.push(...)
    else:               if the block has a value: place the top entry in T[block.depth]
                        emit j end; mark alternate; stack.length = block.depth
    end (of a block):   if the block has a value: place the top entry in T[block.depth]
                        mark labels; stack.length = block.depth; if value: push(reg)
    br n:               emit j target(n)
    br_if n:            c = pop(); flush(); A1: emit beqz reg(c), +8; j target(n)
    return:             emit mv a0, reg(pop()) unless it is already a0;  j exit
    call f:             args = the top count entries
                        for each computed entry below the arguments (reg, ret, cond): store to slot(d); it becomes slot
                        if an argument is `ret` and its position is not 0: emit mv a_i, a0 for it first
                        for the other arguments, i from 0: emit li / lw / mv into a_i
                        emit jal ra, f;  stack.length -= count;  push(ret)
    end (of the function): emit mv a0, reg(pop()) unless it is already a0

lower():
    reserve the prologue words; store parameters to the frame; run step over the body
    frame = 16-byte-aligned size of locals + peak + (1 if the function makes a call)
    prologue: addi sp,sp,-frame; (sw ra if the function makes a call)
    epilogue: (lw ra); addi sp,sp,frame; ret
```

**Steps.**
1. Split `compile` so that the part after `compileFunctions` is `lowerBodies(functions, imported, options)`; export it. Check that the old output is byte-identical (the replays and A0's count check with stage 0).
2. Write `RegisterCode` with `byte`, `leb`, `emit`, `load`, `store`, `constant`, `jump`, `mark` copied from `FunctionCode`, and `reg`, `settle`, `flush`, `step`, `lower` as above. Keep the two existing limits: a frame of at most 2,032 bytes and a field offset of at most 2,047.
3. Record, while pre-scanning the body once for `call` opcodes, whether the function is a leaf. A leaf does not save `ra`.
4. Add the synthetic fixtures for the pending-read rule to `04-check-functions-differential.mjs`, passed through `lowerBodies` (see the worked example).
5. Run A0's differential check with `{lowering: "registers"}` until every fixture passes.
6. Run the Files replays with the new lowering and compare the count with stage 1.

**Worked example: the pending-read rule.** Input, a hand-written body with one parameter `x` and no further locals:

```
20 00        local.get x        stack: [local x]
41 05        i32.const 5        stack: [local x, const 5]
21 00        local.set x        the entry `local x` is still pending
20 00        local.get x
6a           i32.add
0b           end
```

For `x = 3` the result must be 8: the old value 3 plus the new value 5. Target output:

```
   addi sp,sp,-16
   sw   a0,0(sp)
   lw   t0,0(sp)        # pending read of x taken before x changes
   li   t5,5
   sw   t5,0(sp)        # local.set x
   lw   t1,0(sp)
   add  t0,t0,t1
   mv   a0,t0
   addi sp,sp,16
   ret
```

A second body covers a pending comparison: `41 02 20 00 48` (`2 < x`), `41 09 21 00` (`x = 9`), `04 7f 41 01 05 41 00 0b 0b` (`if` producing 1 or 0). For `x = 1` the result must be 0.

**Acceptance on the host.**
- `node $NEXT/scripts/04-check-functions-differential.mjs` passes for both lowerings, including the two pending-read bodies (results 8 and 0).
- `node $NEXT/scripts/03-check-instruction-counts.mjs --app files --stage 1 --model A --tolerance 0.05 --lowering registers`: the total is between 695 and 769 (model 732).
- `LOWERING=registers node ttmp/2026/11/18/PICOCALC-TYPED-APPS*/scripts/02-check-files-rv32.mjs "$GCC" "$EMU"` prints `Files RV32 startup, directory sorting, rounding, and mkdir passed`.
- All replays pass with the default lowering unchanged.

**What a wrong implementation looks like.**
- *No pending-read rule.* The first synthetic body returns 10 instead of 8. No application replay can catch this today, which is why the synthetic fixture exists.
- *No flush before `if`.* An entry that is `local i` before a block and is assigned inside one arm is read after the join with the new value on one path. The fixture "nested `&&` as a value with a `Math.min` operand" fails in the interpreter with a wrong result on the path through the else arm.
- *Arguments loaded in the wrong order.* With a `ret` entry as the second argument, loading `a0` first destroys it. The fixture "a call whose arguments are themselves calls" returns the first argument twice.
- *Computed entry not saved across a call.* `f(x) + g(y)` adds `g(y)` to whatever `g` left in `a0` or `t0`. The same fixture catches it.
- *Count far below the model.* A total under 695 means the lowering skips something the model counts, usually a division check or a bounds check. Compare per function.

**Dependencies.** A0. **Size.** M. **Risks.** The model assumes results appear in the register where they are needed; `settle` sometimes adds a `mv`. If Files exceeds 769, print the per-function table and look for `mv` after calls first.

---

## Task A2: pending comparisons fused into branches

**Goal.** Make a comparison a `cond` entry that emits nothing, and translate `if` and `br_if` on a `cond` entry to one conditional branch followed by a jump; Files at 668 instructions.

**Where to look.**
- `typed-rv32.js`, `binary` lines 108 to 119: how each comparison opcode maps to `slt`/`sltu` with swapped operands and an optional `xori`. The opcodes are `0x46` eq, `0x48` lt_s, `0x4a` gt_s, `0x4c` le_s, `0x4e` ge_s, `0x4f` ge_u, and `0x45` eqz.
- `lib/model.mjs`: `condValue`, `condBranch` and the `0x45` case, which inverts a pending comparison without emitting anything.
- Article 5, section 5.6. Literature: Bellard's value stack records "in the processor's flags" as an entry kind; Cooper & Torczon 2023, §7.4 on short-circuit evaluation.

**Files and functions to change.** `typed-rv32.js`, class `RegisterCode`: the comparison cases, `i32.eqz`, `if`, `br_if`, `reg` for `cond`, and the pending-read scan of `local.set`.

**Core algorithm.**

```
comparison op:   b = pop(); a = pop(); ra = reg(a, d)          # a in a register now; b stays as it is
                 push(cond {base: eq | lt | ge | ltu | geu, ra, b, swapped, inv: false})
i32.eqz on cond: flip inv; emit nothing
i32.eqz else:    push(cond {base: eq, ra: reg(a), b: const 0})

branchIfFalse(c, target):                # used by `if`: skip the block when the condition is false
    (kind, x, y) = the RV32 branch for NOT c:
        eq  -> bne x,y      (beq when inv)
        lt  -> bge x,y      ge  -> blt x,y       (unsigned forms bltu / bgeu; swapped exchanges x and y)
        y = zero when c.b is const 0, else reg(c.b, d+1)
    A2: emit the inverse branch over +8, then j target        # long form; A3 shortens it
branchIfTrue(c, target):                 # used by `br_if`
    the same with the condition not negated
reg(cond):       the 0/1 sequence of A1, used only when a comparison is stored, passed or returned
```

**Steps.**
1. Add the `cond` kind and the two branch helpers.
2. Extend the pending-read scan of `local.set` to `cond.b`.
3. Rerun the differential fixtures; add fixtures in which a comparison result is assigned to a `bool` local, returned, and passed as an argument, so that `reg(cond)` is exercised for every comparison and both values of `inv`.

**Worked example.** `if (a > 0)` in `bump`: `local.get a`, `i32.const 0`, `i32.gt_s`, `if`. After A1 this is four instructions: `lw t0,8(sp)`; `slt t0,zero,t0`; `bnez t0,+8`; `j L`. After A2 it is three: `lw t0,8(sp)`; `bgtz t0,+8`; `j L`. `bump` goes from 17 to 16 instructions.

**Acceptance on the host.**
- Differential fixtures pass.
- `03-check-instruction-counts.mjs --app files --stage 2 --model A --tolerance 0.05 --lowering registers`: total between 635 and 701 (model 668).
- The Files RV32 check passes with `LOWERING=registers`.

**What a wrong implementation looks like.** The usual error is an inverted or unswapped condition for one of the six comparisons, for example `a <= b` translated as `a < b`. A replay may pass, because the applications rarely sit on the boundary. The differential fixtures call every comparison with `a < b`, `a == b` and `a > b`, with a constant on each side, and with `!` applied; one of the 36 combinations returns the wrong truth value.

**Dependencies.** A1. **Size.** S. **Risks.** `ge_u` appears only in bounds checks, where the taken branch leads to a trap. A wrong unsigned branch turns into a trap on valid indexes or no trap on invalid ones; the `charCodeAt` fixtures at −1 and at `length` cover both.

---

## Task A3: short branches with fix-up

**Goal.** Emit a conditional branch as one instruction whenever its target is within reach and rewrite the rare site that is not; Files at 593 instructions, which is model A.

**Where to look.**
- `typed-rv32.js`: `branch` (line 77), which always emits the inverted branch over a jump; `jump` and the `calls` list (line 82); `instruction.b` (line 11), whose immediate is 13 bits, signed and even, so a branch reaches −4,096 to +4,094 bytes; the loop in `compile` (line 244) that resolves `calls`.
- `$ISSUE/various/01-rv32-instruction-mix.txt`: 75, 274 and 1,009 branch-over-jump pairs today, of which one in Editor is out of reach.
- Article 5, sections 5.2 and 5.6. Literature: Wirth 1996, on fixing up forward branches in a single-pass compiler.

**Files and functions to change.** `typed-rv32.js`, class `RegisterCode`: `branchIfFalse`, `branchIfTrue`, a new list `this.sites`, a new method `relax()` called at the end of `lower()`.

**Core algorithm.**

```
conditional branch to label L:
    sites.push({at: words.length, kind, x, y, label: L, long: false});  emit(0)

relax():                                   # run once per function, after the body is lowered
    repeat
        changed = false
        shift[i] = number of long sites with at < i          # each long site adds one word
        for s in sites, not long:
            delta = 4 * ((s.label.at + shift[s.label.at]) - (s.at + shift[s.at]))
            if delta < -4096 or delta > 4094: s.long = true; changed = true
    until not changed
    build the new word list: a short site becomes b(kind, x, y, delta);
        a long site becomes b(kind ^ 1, x, y, 8) followed by a jump record to the label
    remap every label's `at`, every `calls[].from` and every site position through shift
```

The loop terminates because a site only ever changes from short to long.

**Steps.**
1. Replace the two-instruction forms of A2 by site records.
2. Implement `relax` and the remapping. The prologue words are at fixed positions and are not sites.
3. Add a fixture generated by the test: a function whose `if` body is 600 statements of the form `a = a + 12345;`, called once with the condition true and once false.
4. Make `worlds/files/compile.js` pass `{lowering: "registers"}` in `compileFilesRv32`.

**Worked example.** `if (a > 0)` in `bump` becomes `lw t0,8(sp)`; `blez t0,L`. `bump` is 15 instructions, the listing of section A.2. In the generated fixture the `if` body is longer than 4,094 bytes, so its site is long: `bgtz t0,+8`; `j L`.

**Acceptance on the host.**
- Differential fixtures pass, including the long-branch fixture, for which `relax` reports exactly 1 long site.
- `03-check-instruction-counts.mjs --app files --stage 3 --model A --tolerance 0.05 --lowering registers`: total between 563 and 623 (model 593); 0 long sites.
- `node $ISSUE/scripts/01-rv32-instruction-mix.mjs`, run with the register lowering, reports 0 branch-over-jump pairs for Files.
- All replays pass with Files on the new lowering by default: `01-check-files-wasm.mjs` prints `"rv32CodeBytes"` between 2,252 and 2,492.

**Device qualification.** Build the paired Files images with `ttmp/2026/11/18/PICOCALC-TYPED-APPS*/scripts/03-build-files-firmware.sh` and run `06-qualify-files-on-p4.py`. Predictions: the native workflow passes with the same capture hashes as the WebAssembly build; the `files compile` receipt shows `status=ok`; bus errors are 0. This is the first run of code from the new lowering on the real processor, and Files is the smallest application to debug it with.

**What a wrong implementation looks like.** A `relax` that expands a site but does not remap the labels after it produces branches that land one instruction early. Short functions are unaffected because they have no long site, so every application replay passes. The generated fixture has one long site followed by a label and returns a wrong value on the path where the condition is false.

**Dependencies.** A2. **Size.** S. **Risks.** The prediction of 593 is the first falsifiable prediction of Article 10's section 10.7. If the count is outside 563 to 623, stop and compare per function before starting A4; the article's instruction is to re-examine the model before doing Editor.

---

## Task A4: Agenda on the new lowering

**Goal.** Compile Agenda's 34 functions with the register lowering at 2,789 instructions and pass every Agenda check.

**Where to look.**
- `picocalc-os/worlds/agenda/compile.js`, `compileAgendaRv32` (line 43).
- `picocalc-os/worlds/agenda/reminder.typed` and `entry.typed`: 16 loops and 80 calls, all to typed functions; no reactor imports.
- `$ISSUE/various/03-register-cache-model.txt`: Agenda's deepest operand stack is 5, and the model counts 6 flushed instructions.
- The Agenda checks `07-check-rv32-parser.mjs` and `16-check-entry-tokens.mjs` in `ttmp/2026/11/18/PICOCALC-AGENDA-COMPILER*/scripts/`.

**Files to change.** `worlds/agenda/compile.js` passes `{lowering: "registers"}`. Fixes in `RegisterCode` for whatever Agenda exposes.

**Steps.**
1. Run the count check for Agenda and read the per-function table.
2. Run `LOWERING=registers` on the two RV32 Agenda checks.
3. Agenda is the first application with a stack depth of 5 and with calls nested in expressions. Add a differential fixture for each function whose count differs from the model by more than 4 instructions and 10 percent, reduced to the smallest source that shows the difference.
4. Switch `compile.js`.

**Worked example.** `16-check-entry-tokens.mjs` prints `"machineBytes":30840` today (7,710 instructions). After this task it prints a value between 10,600 and 11,712.

**Acceptance on the host.**
- `03-check-instruction-counts.mjs --app agenda --stage 3 --model A --tolerance 0.05 --lowering registers`: total between 2,650 and 2,928 (model 2,789).
- `07-check-rv32-parser.mjs` and `16-check-entry-tokens.mjs` pass: 3,924 cases agree between WebAssembly and RV32.
- All replays pass.
- If `picocalc-os/port/esp32p4/build-elf/esp-idf/main/agenda-reactor.elf` exists, `node ttmp/2026/11/18/PICOCALC-AGENDA-COMPILER*/scripts/09-check-rv32-world.mjs "$GCC" "$EMU" <that file>` passes.

**What a wrong implementation looks like.** A value at depth 4 saved to the wrong frame slot across a call is restored as a different value. Agenda's date arithmetic nests calls inside sums, and the 3,924-case comparison fails on specific dates while simple inputs pass. The failing case number identifies the function.

**Dependencies.** A3. **Size.** S. **Risks.** Low. Agenda has no reactor imports, so trampolines are not exercised until A5.

---

## Task A5: Editor on the new lowering

**Goal.** Compile Editor's 120 functions with the register lowering at 16,544 instructions and pass all thirteen Editor workflows on both targets.

**Where to look.**
- `picocalc-os/compiler/typed-world.js`, `compileTypedWorldRv32` (line 64).
- `typed-rv32.js`, `linkSlot` (line 263): relocations to trampolines are patched as `jal ra` (line 321).
- `$ISSUE/various/03-register-cache-model.txt`: Editor's deepest stack is 8; 37 functions reach depth 5 or more; the model counts 155 flushed instructions.
- `picocalc-os/worlds/editor/*.typed`: 46 loops, 428 calls of which 145 go to the reactor, and reactor calls with up to 7 arguments (`typedSdkSeek`).
- Article 5, section 5.7, on spilling: with entries tied to depths, the entry that is spilled is the one deepest in the stack, which on a stack is the one whose next use is farthest away. That is Best's rule in this setting [Cooper & Torczon 2023, §13.3].

**Files to change.** `compiler/typed-world.js` passes `{lowering: "registers"}`. `RegisterCode`: the paths for depths 5 to 7.

**Steps.**
1. Run the count check for Editor. Expect the largest differences in the functions with the deepest stacks; the table of A0 names them.
2. Add differential fixtures with expressions of depth 6, 7 and 8 in which every entry is computed (nested calls and products), so that frame slots for depths 5 to 7 and both scratch registers are used.
3. Run the thirteen Editor workflows with `LOWERING=registers`.
4. Switch `typed-world.js`.
5. Record the long sites `relax` reports for Editor.

**Worked example.** `02-check-editor-world.mjs` prints `"elfBytes":240452` today. The slot is a fixed reservation of 229,376 bytes inside the reactor, so this number does not change in A5 although the code inside the slot shrinks from 175,860 bytes to about 66,000. Task A8 reduces the reservation.

**Acceptance on the host.**
- `03-check-instruction-counts.mjs --app editor --stage 3 --model A --tolerance 0.05 --lowering registers`: total between 15,717 and 17,371 (model 16,544).
- Long sites in Editor: at most 1.
- `01-run-host-replays.sh` passes with all three applications on the new lowering by default.
- `$ISSUE/scripts/04-compile-phase-timing.sh` (the compiler under QuickJS on the workstation): the median of "frontend + RV32 lowering" is at most 48.7 ms, today's value in `$ISSUE/various/04-compile-phase-timing.txt`. The new lowering emits 2.7 times fewer words and must not be slower.

**Device qualification.** Paired Editor images with `03-build-editor-firmware.sh`, then `04-qualify-editor-on-p4.py`. Predictions: the workflow passes on both engines; the native build's two captures have the same SHA-256 on repeated runs; `module_bytes` is still 240,452; the native compile time is at most 3.17 s and `peak_js_bytes` at most 2,454,960; bus errors are 0.

**What a wrong implementation looks like.** With five stack registers, a sixth computed entry must go to a frame slot. An implementation that wraps around and reuses `t0` overwrites the bottom entry. Only functions with deep expressions are affected, and those are Editor's layout and Markdown functions; the `--markdown` and `--preview-dense-inline` workflows show wrong rows while `--edit` passes. The depth-8 differential fixture fails directly.

**Dependencies.** A4. **Size.** M. **Risks.** Editor's memory limit is the reason this scope exists; if the count lands above 17,371, the per-function table decides whether the cause is deep stacks (raise the number of stack registers to seven by using `t5` and `t6` and taking scratch from `a6` and `a7`) or call sequences.

---

## Task A6: `&&` and `||` in conditions compiled to branches

**Goal.** Make the frontend translate a `&&` or `||` that appears in the condition of `if` or `while` into conditional branches, with no 0 or 1 produced.

**Where to look.**
- `typed-wasm.js`: `expr` (line 236), where lines 248 to 259 emit `if (result i32)` … `else` … `end` for every `&&` and `||`; `statement` (line 365), the `if` case (lines 367 to 376) and the `while` case (lines 377 to 386); `prefix` (line 160) for `!` and parentheses.
- Counts measured for this plan with an instrumented copy of the frontend: of the `&&` and `||` operators in the sources, 23 in Files, 89 in Agenda and 167 in Editor stand in a condition, possibly under `!`, parentheses or another `&&`/`||`; 17, 24 and 38 produce a value that is stored, passed or returned.
- Article 5, section 5.6. Literature: Cooper & Torczon 2023, §7.4 (short-circuit evaluation); Dybvig, Hieb and Butler 1990 (destination-driven code generation).

**Files and functions to change.** `typed-wasm.js`: a new method `condition(whenFalse)` on `FunctionEmitter`; `expr` and `prefix` take a control destination; the `if` and `while` cases call `condition`.

**Core algorithm.** A condition is compiled together with the place to go when it is false. In structured WebAssembly that place is the end of an enclosing block, named by a relative depth.

```
if (C) { body }       =>   block                     ; F: the end of this block
                             cond(C, false -> 0)
                             body
                           end

while (C) { body }    =>   block  loop
                             cond(C, false -> 1)     ; 1 = the outer block
                             body
                             br 0
                           end  end

cond(p && q, false -> n):   cond(p, false -> n);  cond(q, false -> n)
cond(p || q, false -> n):   block                     ; T: reached when p is true
                              condTrue(p, true -> 0)
                              cond(q, false -> n + 1)
                            end
cond(!p,     false -> n):   condTrue(p, true -> n)
cond(e,      false -> n):   expr(e);  i32.eqz;  br_if n        ; any other bool expression
condTrue is the mirror image: br_if without eqz, with && and || exchanged
```

Every `br_if` here follows a comparison or an `eqz` of one, which the backend of A2 and A3 turns into one instruction.

**Steps.**
1. Add a block-depth counter to `FunctionEmitter` so that `n` can be computed when blocks nest.
2. Implement `cond` and `condTrue`; route the `if` and `while` cases through them. A `&&` or `||` in a value position keeps the existing `if (result i32)` form.
3. Keep the form `if (C) return e;` working: the `return` is inside the block.
4. Rerun the model on the new WebAssembly: `STAGE=3 node $NEXT/scripts/02-staged-register-model.mjs`. The numbers it prints replace 593, 2,789 and 16,544 as the model-A reference from here on; record them in `various/`.

**Worked example.** `while (start < end && filesSpace(value.charCodeAt(start))) { start = start + 1; }` from `worlds/files/files.typed`, line 16. Today the condition is `start < end`, `if (result i32)`, the call, `else`, `i32.const 0`, `end`, then `i32.eqz`, `br_if 1`: the backend computes a truth value, places it in a register on both arms and tests it. After this task it is `start < end`, `i32.eqz`, `br_if 1`, the call, `i32.eqz`, `br_if 1`: two conditional branches.

**Acceptance on the host.**
- The count of `if (result i32)` blocks reported by the model script's first line per application falls from 42, 115 and 228 to at most 19, 26 and 61 (the value-position operators plus the `Math.min`/`max` blocks).
- Emitted instructions with the register lowering: Files at most 547, Agenda at most 2,611, Editor at most 16,210. Each bound is the model-A number minus 2 instructions per converted operator, the smallest saving a converted operator can have.
- The emitted totals are within 5 percent of the rerun model.
- Editor's WebAssembly module is no larger than 88,255 bytes (`"wasmBytes"` in the Editor replay).
- Differential fixtures pass, with added fixtures for `(a && b) || c`, `a && (b || c)`, `!(a && b)`, `!(a || b)` and three-operand chains, each as an `if` condition and as a `while` condition, over all eight combinations of truth values, with operands that have side effects through a counter in a record so that the number of evaluations is checked.
- All replays pass on both targets.

**What a wrong implementation looks like.** The classical error is evaluating the right operand when the left one already decides. With pure operands the result is still right. In the applications the right operand is often a `charCodeAt` that the left operand guards, as in the example above; evaluating it traps at the end of the string. The side-effect fixtures count evaluations and fail first; the Files replay fails on a name with trailing spaces.

**Dependencies.** A5 (so that the model numbers stay fixed while the three applications are qualified). **Size.** S. **Risks.** This is a frontend change, so it alters the WebAssembly target too. The replays compare both targets with the JavaScript originals, which is the protection.

---

## Task A7: locals in registers

**Goal.** Keep the most-used locals of each function in registers, with no frame at all for a leaf function whose locals all fit; 470, 2,418 and 13,255 instructions on the WebAssembly of today, less after A6.

**Where to look.**
- `lib/model.mjs`: the pre-scan that counts uses per local and decides `leaf`; `budget`; `inReg`; the prologue cost for model B; the `0x21` case, where a result that is immediately stored to a register local costs nothing.
- `$ISSUE/various/03-register-cache-model.txt`: 5 of 7 functions are leaves in Files, 9 of 34 in Agenda, 31 of 120 in Editor; 1, 5 and 27 functions have more locals than the model's budget.
- Article 5, section 5.7. Literature: Poletto & Sarkar 1999 (linear scan) and Cooper & Torczon 2023, §13.3 (Best's algorithm) as the references a later refinement would be judged against; the counting policy used here is cruder than both.

**Files and functions to change.** `typed-rv32.js`, class `RegisterCode`: a pre-scan `plan()`, `reg` for `local`, `local.set`, `lower` (prologue and epilogue), the call sequence.

**Core algorithm.**

```
plan():
    uses[i] = number of local.get i and local.set i in the body;  leaf = no call opcode
    pool = leaf ? [a0..a7] : [s1..s11]
    leaf:      parameter i stays in a_i (it arrives there); the other locals take the remaining
               a registers in order of uses, most used first
    non-leaf:  the most-used locals, parameters included, take s1.. in order of uses
    home[i] = a register, or the frame offset 4*i for the rest

prologue, non-leaf:  addi sp; sw ra; sw each used s register; mv s_k, a_i for each register parameter;
                     sw a_i for each parameter that stays in the frame
prologue, leaf:      nothing if every local has a register; else addi sp and sw of the frame parameters
epilogue:            the mirror image

reg(local i):        home[i] if it is a register (no instruction); else lw as before
local.set i, home a register R:
    pending-read rule first: a pending `local i` entry, or a cond holding R, is copied to its stack register
    if the value was just computed by the previous instruction into T[d]: rewrite that instruction's rd to R
    else emit mv R, value   (li R, k for a const)
result forwarding:   before emitting an instruction that computes into T[d], look at the next opcode;
                     if it is local.set i with home[i] a register and no pending read of i, compute into home[i]
call, non-leaf:      register locals are in s registers and survive; nothing to save
```

**Steps.**
1. Implement `plan` and the two prologue forms. A leaf with a frame parameter still needs `sp` adjusted.
2. Change `reg` and `local.set`. Extend the pending-read rule: with locals in registers, a `cond` entry may hold a local's register as its left operand, and assigning that local must first copy the operand.
3. Implement result forwarding by one opcode of lookahead. Do not forward when the instruction after the `local.set` could be reached by a branch.
4. Rerun the synthetic pending-read fixtures with the parameter in a register; the expected results 8 and 0 do not change.
5. Run all three applications.

**Worked example.** `bump` has two parameters and one further local in a leaf function, so `b`, `c` and `a` are `a0`, `a1` and `a2`, and there is no frame.

```
# target after A7 (model B: 5 instructions)
   add  a2,a0,a1        # result forwarded into a's register
   blez a2,L
   addi a2,a2,1
L: mv   a0,a2
   ret
```

**Acceptance on the host.**
- `03-check-instruction-counts.mjs --model B --tolerance 0.10`, run against the model on the WebAssembly after A6, passes for all three applications.
- Absolute ceilings, which are model B on today's WebAssembly plus 10 percent: Files at most 517, Agenda at most 2,660, Editor at most 14,581.
- `bump` is at most 6 instructions and `countUnit` at most 19 (model: 5 and 17).
- Differential fixtures pass, with added fixtures: a leaf with 9 locals (one does not fit); a non-leaf with 12 locals; a function that assigns a parameter and then calls another function; the two pending-read bodies.
- All replays pass.

**What a wrong implementation looks like.**
- *A leaf's locals in `a` registers across a call.* The pre-scan must see every call. If `leaf` is computed wrongly for a function whose only call is inside an `if`, its locals are destroyed by the callee. The fixture "assign a parameter, then call" returns a wrong value.
- *Saved registers not restored on an early `return`.* Every `return` must go through the single epilogue. An emitted `ret` at the `return` leaves the caller's `s` registers changed; the caller then misbehaves much later. The interpreter's harness checks after every call that `s0`–`s11` and `sp` have the values they had before, and fails at the first function that breaks this.
- *Forwarding across a join.* Rewriting the destination of an instruction that lies before a label changes the value on the other path. The side-effect fixtures of A6 fail.

**Dependencies.** A6. **Size.** M. **Risks.** After F3, `s11` holds the fuel counter and the non-leaf pool shrinks to ten. The model's leaf budget is ten registers and this design has eight; if a leaf-heavy application misses its ceiling for that reason, extend the leaf pool with `t5` and `t6` and take scratch from the stack registers above the current depth.

---

## Task A8: remove the old lowering, shrink the slots, qualify on the device

**Goal.** Make the register lowering the only one, reduce the reserved slot sizes to fit the new code, and confirm the predicted module size and world memory on the handheld.

**Where to look.**
- `picocalc-os/sdk/typed/rv32-slot.S`, line 49: `.space 229376 - (.-.Lprogram)`. `picocalc-os/worlds/agenda/rv32-slot.S`, line 31: 49,152. `picocalc-os/worlds/files/rv32-slot.S`, line 19: 12,288.
- `typed-rv32.js`, `linkSlot`: line 308 rejects a program that does not fit; the capacity is read from the slot header, so no constant in the compiler changes.
- `native_elf_p4.c`, line 47: `W->mem_used = x->elf.segment_size + x->heap`. The slot is part of the code segment, so the reservation is charged to the world's memory in full.
- Article 6, section 6.6, on why Editor's native size matters: 710 KiB of a 768 KiB limit.

**Files to change.** The three `rv32-slot.S` files; `typed-rv32.js` (delete `FunctionCode`, `options.lowering`, `defaultLowering`); `worlds/files/compile.js`, `worlds/agenda/compile.js`, `compiler/typed-world.js` (drop the option); `$NEXT/scripts/lib/use-register-lowering.mjs` and the `LOWERING` switch (delete).

**Steps.**
1. Set the reservations: Editor 81,920 bytes (code at most 14,581 × 4 = 58,324 bytes plus 140 bytes of header, stubs and trampolines, with 23 KiB of room for growth); Agenda 16,384; Files 4,096.
2. Delete the old class and the switch. Rerun A0's differential check with the single lowering.
3. Update `$ISSUE/scripts/01-rv32-instruction-mix.mjs`'s expectations in this ticket's diary only; the script itself classifies frame traffic by the old layout and its slot categories will read near zero.
4. Rebuild the reactors and run all replays.
5. Device qualification.

**Worked example.** Editor's native module is the reactor ELF with the code copied into the slot. Today it is 240,452 bytes with a 229,376-byte slot. With an 81,920-byte slot it is 240,452 − (229,376 − 81,920) = 92,996 bytes.

**Acceptance on the host.**
- `02-check-editor-world.mjs` prints `"elfBytes":92996` for every workflow.
- `02-check-files-rv32.mjs` prints `"elfBytes":16232` (24,424 − 8,192).
- All replays pass.
- `grep -c "FunctionCode\|defaultLowering" picocalc-os/compiler/typed-rv32.js` prints 0.

**Device qualification.** Paired Editor, Files and Agenda images; three trials per engine in the order wasm, rv32, rv32, wasm, wasm, rv32.

| Receipt | Today | Prediction | Fails if |
| --- | ---: | ---: | --- |
| Editor native `module_bytes` | 240,452 | 92,996 | not equal to the host's `elfBytes` |
| Editor native `mem_kb` after boot | 710.1 | 566.1 | above 570.0 |
| Editor native compile time | 3.14–3.17 s | not higher | above 3.17 s |
| Editor native `peak_js_bytes` | 2,454,960 | not higher | above 2,454,960 |
| Editor native loader time | 14.1 ms | not higher | above 14.1 ms |
| Editor workflow, both engines | pass | pass, captures `crc ok`, bus errors 0 | any failure |

**What a wrong implementation looks like.** A slot that is too small makes `linkSlot` throw `RV32 program does not fit the reactor slot` and the application falls back or fails to start; the replay shows it at once. A slot header whose size word was not regenerated is caught by `linkSlot`'s header check (`invalid RV32 reactor slot header`). The less visible error is to shrink the slot of the shared reactor but leave Editor's manifest `mem_kb` assumptions in a test; the device table above is where that shows.

**Dependencies.** A7. **Size.** S. **Risks.** The memory prediction assumes the loader charges exactly the segment size. If `mem_kb` falls by less than 144 KiB, read `elf_load` in `native_elf_p4.c` for alignment of the segment allocation.

## Key points of Scope A

- The new lowering records where each operand-stack value is and emits a load only when a register is needed. Entries are tied to registers by depth, which makes joins agree by construction.
- Four flush points and one pending-read rule are the whole correctness argument for control flow. The pending-read case does not occur in today's sources and is tested with hand-written WebAssembly.
- Each step has its own number: Files 732, 668, 593; Agenda 2,789; Editor 16,544; then 470, 2,418 and 13,255 with locals in registers.
- The memory gain on the device appears only when the slot reservation is reduced, in A8: Editor's native module from 240,452 to 92,996 bytes and its world memory from 710 to about 566 KiB.
