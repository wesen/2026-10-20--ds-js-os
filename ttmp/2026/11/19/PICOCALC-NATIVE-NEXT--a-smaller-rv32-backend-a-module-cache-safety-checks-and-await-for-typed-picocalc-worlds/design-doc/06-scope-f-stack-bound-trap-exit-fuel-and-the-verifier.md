---
Title: 'Scope F: stack bound, trap exit, fuel and the verifier'
Ticket: PICOCALC-NATIVE-NEXT
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/compiler/typed-rv32.js
      Note: Emits trap jumps and fuel sequences
    - Path: repo://picocalc-os/port/esp32p4/optional/native_elf/native_elf_p4.c
      Note: Native loader where trap exit and verifier attach
ExternalSources: []
Summary: 'Tasks F1 to F6: static stack need, a controlled trap exit for native code, a fuel counter, a verifier over emitted RV32 with seven checks, mutation testing, and address masking.'
LastUpdated: 2026-11-19T15:05:41.239480084-05:00
WhatFor: Implementation guide for running native typed code without trusting it.
WhenToUse: When working on safety of native typed worlds.
---

# Scope F: stack bound, trap exit, fuel and the verifier

This document describes six tasks that together let the device run native code compiled from a typed source it does not trust. F1 computes how much stack a typed program can use. F2 gives native typed code a way to stop with a fault instead of an `ebreak` instruction. F3 bounds the running time of a turn with a fuel counter. F4 is a verifier that checks the emitted RV32 code for the properties the first three tasks establish. F5 tests the verifier by mutation. F6 adds address masking, which makes memory safety independent of the compiler.

Read Article 7 in full before this document. Sections 7.4, 7.5 and 7.6 correspond to F1, F3 and F4.

## F.1 What is true today, and what the tasks change

The native loader states its position in the comment at the top of `picocalc-os/port/esp32p4/optional/native_elf/native_elf_p4.c` (lines 1 to 13): a native module can read and write anything, can jump anywhere, and stalls the kernel if it never returns. For that reason native modules come only from the firmware bundle. Three facts about the typed compiler's output make it possible to do better for typed code specifically.

**The call graph is acyclic.** Today this follows from the order in which the frontend registers functions (Article 7, section 7.4); after task E5 it is an explicit check. Every function has a frame of fixed size. The largest stack a program can use is therefore a number, computed by a walk over the call graph. Computed for this plan from today's output, the typed frames of the deepest call chain add up to 96 bytes in Files, 320 bytes in Agenda and 896 bytes in Editor, where the chain is eleven calls long: `typedWorldEvent`, `editorReadDone`, `editorResumeRead`, `editorContinueRead`, `editorOpened`, `editorShow`, `editorDocumentFrame`, `editorPreviewFrame`, `editorQuote`, `editorQuoteContent`, `editorHex`. A native world runs on the kernel task's stack, which is 80 KiB (`picocalc-os/port/esp32p4/main/main_p4.c`, line 283).

**Loops are the only unbounded construct.** The typed sources contain 4 loops in Files, 16 in Agenda and 46 in Editor. A counter decremented at the end of every loop body bounds the work of a turn.

**The emitted code is regular.** All instructions are 4 bytes. After Scope A the backend emits about 25 different instruction forms. The code lies in one region, the slot, and calls leave it only through the trampolines.

One fact works against the plan and is handled first. A trap in native typed code is the single instruction `ebreak` (`0x00100073`; `typed-rv32.js`, lines 96, 104 and 147). The WebAssembly engine turns a trap into a fault of the world, which the nucleus reports and recovers from (`picocalc-os/nucleus/kernel.c`, lines 466 to 486: the world is logged as crashed and restarted with a delay). Nothing in `native_elf_p4.c` handles a breakpoint exception, and the loader's own comment says that an access fault "panics the board". A fuel counter that ends an endless loop by executing `ebreak` would replace a stalled kernel by a rebooted board. Task F2 therefore comes before F3.

---

## Task F1: static stack need

**Goal.** Compute, at compile time, the stack need of every function and of the program, report the deepest chain, and reject a program whose need exceeds a declared limit.

**Where to look.**
- `typed-rv32.js`, `lower` (line 205): the frame size is known when a function has been lowered (line 212). After task A7 a leaf function may have no frame.
- `edges` and `order` from task E5; the `stack` field of each reactor function from task D2.
- `main_p4.c`, lines 282 and 283: the kernel task has 80 KiB of stack, of which `port_js_stack` gives 56 KiB to QuickJS.
- Article 7, section 7.4. Literature: Gay et al. 2003 (nesC: no function pointers and no dynamic allocation, so the whole call graph is known).

**Files to change.** `typed-rv32.js`: `compile` computes the stack table and returns it as `program.stack`. `typed-world.js`, `worlds/files/compile.js`, `worlds/agenda/compile.js`: compare with a limit and throw. New `$NEXT/scripts/10-check-stack-need.mjs`.

**Core algorithm.**

```
for f in order (callees before callers):
    need[f]  = frame[f] + max( 0,
                               need[g]            for every typed g that f calls,
                               reactorStack[k]    for every reactor function k that f calls )
    chain[f] = f followed by the chain of the callee that gave the maximum
program.stack = { need: max over the entry points, chain: of that entry point, perFunction: need }
if program.stack.need > limit: throw SyntaxError("typed program needs N bytes of stack through a > b > c; the limit is L")
```

**Steps.**
1. Collect call edges per function in the backend, or take them from E5's `edges`.
2. Compute the table and attach it to the result.
3. Set the limit to 8,192 bytes in the three linker files.
4. Write the check script, which prints need and chain for the three applications and compiles two fixtures: a chain of 40 functions each with a 256-byte frame (need above the limit; must be rejected), and a diamond-shaped call graph in which the deeper branch is not the first one visited.

**Worked example.** For today's Editor output and with reactor stack use counted as 0, the result is `need: 896, chain: typedWorldEvent:48 > editorReadDone:80 > editorResumeRead:48 > editorContinueRead:48 > editorOpened:64 > editorShow:64 > editorDocumentFrame:176 > editorPreviewFrame:192 > editorQuote:64 > editorQuoteContent:96 > editorHex:16`. Agenda: `need: 320`, six functions from `normalizeEntry` to `leap`. Files: `need: 96`, `filesName:80 > filesSpace:16`.

**Acceptance on the host.**
- `node $NEXT/scripts/10-check-stack-need.mjs` prints the typed-frame part of the need for each application, and each is at most today's value: 96, 320 and 896 bytes. The frames of the register lowering are no larger than today's, because they hold the same locals and fewer operand-stack slots.
- The 40-function fixture is rejected with a message that names the chain; the diamond fixture reports the deeper branch.
- The interpreter of A0 records the lowest value `sp` takes during every differential fixture; for each fixture, the entry `sp` minus the lowest `sp` is at most `need` of the called function. This compares the computed bound with observed use.
- All replays pass.

**Device qualification.** None; the number is a compile-time property. It appears in the compile receipt after F4.

**What a wrong implementation looks like.** Summing the frames of all callees instead of taking the maximum gives a bound that is safe and several times too large; Editor would report tens of kilobytes. Taking the maximum over callees' frames instead of callees' needs gives a bound that is too small: it counts two levels of the chain. The interpreter check catches the second error, since the observed depth of the Editor-like fixture exceeds the reported need; the upper limits of 96, 320 and 896 catch the first.

**Dependencies.** A5 (final frame layout), D2 (reactor stack use), E5 (edges and order). **Size.** S. **Risks.** The bound covers typed frames and the reactor's own C frames. It does not cover what the nucleus uses when a reactor function calls into it, because that code runs on the same kernel stack and is outside the module. The limit of 8,192 bytes is this plan's choice, about a tenth of the kernel task's stack; the project owner should confirm it. The statement "the stack need fits the world's stack" from Article 7 has no direct counterpart on this device, because a native world has no stack of its own.

---

## Task F2: a controlled trap exit for native typed code

**Goal.** Make a trap in native typed code end the turn with a fault that the nucleus handles as it handles a WebAssembly trap, and find out what an `ebreak` does on the device today.

**Where to look.**
- `typed-rv32.js`: the three places that emit `0x00100073`: the division checks (lines 96 and 104) and `unreachable` (line 147). Editor's native code contains 404 of them today.
- `picocalc-os/sdk/typed/world.c`, `nw_on_event` (line 496), which calls `typedWorldEvent` and returns its result.
- `picocalc-os/sdk/nw_elf.c`: the native module's event entry, and the values `NW_DONE` and `NW_LATER`.
- `native_elf_p4.c`, `elf_event` (lines 236 to 252): a return value that is neither `NW_DONE` nor `NW_LATER` sets `last_error` to "it broke the native protocol" and returns −1, which leads to the crash path of `kernel.c` (line 466).
- `ttmp/2026/11/18/PICOCALC-TYPED-WORLDS*/scripts/02-editor-world-driver.c`: how the emulator driver calls the reactor.
- Article 7, section 7.5, first clarification: "Fuel stops a program; it does not schedule it."

**Files to change.** `picocalc-os/sdk/typed/rv32-slot.S` (through the generator of D1): two new routines, `typedEnter` and `typedTrapExit`, and one more fixed jump after the trampolines. `world.c`: `nw_on_event` calls the application through `typedEnter`. `typed-rv32.js`: a trap is emitted as a jump to the trap slot instead of `ebreak`; `linkSlot` patches it. `native_elf_p4.c`: a distinct message for a trapped turn. The files of the per-application reactors in the same way.

**Core algorithm.**

```
typedEnter(fn, a0..a3):                      # assembly, in the reactor
    save sp, ra and s0..s11 in a static area `typed_saved`
    jalr fn                                  # the typed entry point, with its arguments
    return a0

typedTrapExit:                               # reached by a jump from typed code; never returns to it
    restore sp, ra and s0..s11 from `typed_saved`
    li a0, NW_TRAP                           # a value distinct from NW_DONE and NW_LATER
    ret                                      # returns to the caller of typedEnter

slot layout after the task:  header, entry stubs, 28 trampolines, `j typedTrapExit`, code
emitted trap:                jal x0, <offset of the trap jump>       # one instruction, as ebreak was
```

A static save area is sufficient because the call graph is acyclic and the reactor is entered once per event: there is never more than one activation of `typedEnter`.

**Steps.**
1. On the device, before changing anything: build a fixture world whose key handler reads `text.charCodeAt(text.length)` and run it with the native engine. Record what the console shows. The expected observation is a panic and a reboot; whatever it is, record it in the diary as the baseline.
2. Add the two routines and the trap jump; count it in the slot header as a 29th fixed jump so that `linkSlot`'s header check covers it.
3. Change the backend's three trap sites and the linker.
4. Map `NW_TRAP` in `elf_event` to `last_error` "trapped (bounds, division or fuel)" and the crash path.
5. In the emulator driver, a trapped call returns `NW_TRAP` and the driver continues with the next event.

**Worked example.** `function at(text: string, i: i32): i32 { return text.charCodeAt(i); }` called through a reactor with a string of length 3. For `i = 2` the result is the third unit. For `i = 3`, today the emulator stops at the `ebreak`; after the task the reactor's event function returns `NW_TRAP`, the saved registers are restored, and a following call with `i = 0` returns the first unit.

**Acceptance on the host.**
- A new emulator check, `$NEXT/scripts/11-check-trap-exit.mjs "$GCC" "$EMU"`, built like `02-check-files-rv32.mjs`: it runs three events, valid, trapping, valid, and requires the results value, `NW_TRAP`, value, and that `sp` and `s0`–`s11` after the trapping event equal their values before it.
- Division by zero and `-2147483648 / -1` take the same exit.
- The instruction counts of the three applications are unchanged (a trap is still one instruction).
- All replays pass.

**Device qualification.** Flash the fixture world of step 1 built with the new exit. Predictions: pressing the key prints `<world> crashed handling …: trapped (bounds, division or fuel)` on the console; the world restarts; the other worlds keep running, shown by a `worlds` command that answers and an Editor that still accepts keys; the board does not reboot.

**What a wrong implementation looks like.** Restoring `sp` but not the `s` registers returns to the C code of the reactor's caller with changed saved registers. The C code then misbehaves at some later point, far from the trap. The emulator check compares all twelve `s` registers across the trapping event and fails immediately.

**Dependencies.** D1 (the slot's fixed jumps are generated). **Size.** S. **Risks.** After a trap the reactor's static buffers and the state record may be half-updated. The WebAssembly engine discards the instance; the native path must do the same, which means the nucleus must restart the world and not merely end the turn. Check that the crash path of `kernel.c` unloads and reloads a native module (`elf_unload`, `native_elf_p4.c` line 166).

---

## Task F3: the fuel counter

**Goal.** Make native typed code subtract from a fuel register at every loop back-edge and before every reactor call, and take the trap exit when the register goes below zero.

**Where to look.**
- `typed-rv32.js`, the `0x0c`/`0x0d` case of `step` (line 157): a branch whose target block has `op === 0x03` is a back-edge (line 159). The frontend emits exactly one per loop, the `br 0` at the end of the body (`typed-wasm.js`, line 384).
- The `fuel` field of each reactor function from D2.
- `picocalc-os/nucleus/native_wasm.c`, line 229: the WebAssembly engine already counts instructions for the turn budget, so the WebAssembly target needs no fuel code.
- Article 7, section 7.5, including the worked example: 20 million units per turn, 9 units per iteration of `countUnit`. Literature: Feeley 1993 on placing polling instructions so that the interval between polls is bounded.

**Files to change.** `typed-rv32.js`: `RegisterCode` (back-edges, reactor calls, the prologue of entry points), `compile` (a `straight` cost per function), `linkSlot` (entry points). `typed-world.js` and the two `compile.js` files: the fuel constant. `lib/model.mjs`: the added instructions.

**Core algorithm.**

```
register:      s11 holds the remaining fuel for the whole turn; the pool of A7 loses s11
entry point:   save s11 in the frame; li s11, FUEL; ... ; restore s11 before returning
               (the C code that calls the entry point expects s11 preserved)
               an entry point must not be called from typed code: reject such a program

cost of a loop body  = instructions emitted between the loop's start and its back-edge
                       - instructions inside nested loops (they charge themselves)
                       + straight[g] for every typed function g called in the body outside nested loops
straight[f]          = instructions of f outside all of its loops + straight[g] for its calls outside loops
                       computed in `order`; both are upper bounds, because both arms of an if are added

back-edge:     addi s11, s11, -cost        (li t5, cost; sub s11, s11, t5 when cost > 2047)
               bgez s11, +8
               jal  x0, <trap jump>
               j    loop start

reactor call with fuel {base: B}:
               addi s11, s11, -B           then the call
reactor call with fuel {base: B, per: K, span: [start, end]}, arguments already in a registers:
               sub  t5, a_end, a_start
               bgez t5, +8;  li t5, 0      # a negative span is charged nothing extra, never credited
               slli t5, t5, log2(K)        # K is rounded up to a power of two
               sub  s11, s11, t5
               addi s11, s11, -B           then the call
```

No test is needed at a reactor call. A path without a back-edge is finite, and the next back-edge tests the counter; the test is `bgez`, so a counter that has gone far below zero still traps.

**Steps.**
1. Reserve `s11`; rerun A7's count check to see how many functions lose a register local (the model's count of functions over budget rises from 27 for Editor).
2. Compute `straight` per function and the cost per loop.
3. Emit the back-edge sequence and the call charges.
4. Set `FUEL` to 20,000,000 in the linker files and make it an option of `typedRv32.compile` so that tests can use a small value.
5. Fixtures for the differential check with `fuel: 1000`: an endless loop that increments a record field; the same with a reactor-call stub charged by span; a loop that needs exactly the available fuel and one that needs one unit more.

**Worked example.** `function spin(state: S): i32 { while (state.n >= 0) { state.n = state.n + 1; } return 0; }` compiled with `fuel: 1000`. If the loop body costs *c* units, the function traps when `state.n` is `floor(1000 / c) + 1`: the counter goes below zero at the end of that iteration. The test reads `c` from the emitted `addi` and checks `state.n` after the trap against the formula. With the fuel of 20,000,000 and the loop of `countUnit`, scanning 65,536 units uses 65,536 × *c* units; for *c* at most 20 that is under 1,310,720, 6.6 percent of the supply.

**Acceptance on the host.**
- The fixtures trap at the predicted iteration, through the trap exit of F2.
- Added instructions, measured with `03-check-instruction-counts.mjs` against the model extended by the rules above: Files gains 12 instructions for its 4 loops plus 4 per entry point; Editor gains at least 283 (three per loop for 46 loops, one per reactor call site for 145 sites) and at most 1,020 (if every reactor call were charged by span).
- The negative-span fixture: a call with `end < start` leaves the counter lower than before the call, never higher.
- All replays pass. In particular the `--large`, `--dense-search` and `--preview-dense-inline` Editor workflows, which do the most work per turn, do not trap in the emulator.
- The emulator driver prints the smallest fuel remaining at the end of any turn; for every workflow it is above 10,000,000, that is, no turn uses more than half its supply.

**Device qualification.** Paired Editor images with fuel, plus a fixture world with an endless loop.

| Receipt | Prediction | Fails if |
| --- | --- | --- |
| Fixture world, key pressed | `crashed … trapped` within one second; other worlds respond | the board stalls or reboots |
| Editor workflow, native | pass, no trap | any `trapped` line |
| Editor native CPU time of the first turn | at most 15.4 ms (today 14.6 ms) | more than 5 percent above today |
| Editor native CPU time over the workflow (`cpu_ms` from `worlds`) | at most 5 percent above the build without fuel, median of three trials in alternating order | more |

**What a wrong implementation looks like.**
- *A charge that can be negative.* Without the clamp, a call with `end < start` adds fuel. A loop that makes such a call on every iteration never runs out. The reactor rejects the span and returns at once, so the loop is cheap and endless. The negative-span fixture checks the counter directly.
- *The decrement placed at the loop's start instead of its back-edge.* It still bounds iterations, but a `break` (E3) that jumps past it is harmless while a branch that re-enters the loop without passing the decrement is not; the verifier's rule in F4 is stated for back-edges, and code that decrements elsewhere is rejected there.
- *Cost taken from one arm of an `if`.* The counter then undercounts on the other arm. The bound on iterations still holds; the bound on instructions does not. The fixture with a long else arm and a short then arm compares the cost with the instruction count the interpreter observed per iteration and requires cost to be at least the observed maximum.

**Dependencies.** A5, D2, F2. **Size.** M. **Risks.** One unit of fuel is one emitted instruction. The relation to milliseconds depends on the processor's speed and on cache behaviour; 20,000,000 units for a 200 ms budget assumes 100 million instructions per second and comes from Article 7's example, not from a measurement. The fuel constant is fixed in the linker file, while the budget is a manifest value; a later change should derive one from the other.

---

## Task F4: the verifier

**Goal.** Write a program of a few hundred lines of C that takes a linked native typed module and accepts it only if every function in its slot satisfies the control, stack and time checks of Article 7, section 7.6, and the pattern check for memory accesses.

**Where to look.**
- `typed-rv32.js`, `linkSlot` (lines 263 to 324): how the slot is found in the ELF (three magic words in an executable segment), its header, the stubs, the trampolines and the code. The verifier locates the slot the same way.
- `RegisterCode` after A7 and F3: the complete list of instruction forms it can emit, the prologue and epilogue forms, the trap jump, the fuel sequence, the bounds-check sequence of `codeUnitAddress`.
- `native_elf_p4.c`, `elf_load` (line 175): where a module is accepted today.
- Article 7, section 7.6. Literature: Wahbe et al. 1993 (software fault isolation); Yee et al. 2009 (Native Client: a small validator, instruction sequences treated as units); Morrisett et al. 2012 (RockSalt); Johnson et al. 2021 (VeriWasm: checking the output of a WebAssembly compiler).

**Files to change.** New `picocalc-os/nucleus/typed_verify.c` with one function, `typed_verify(const uint8_t *elf, size_t length, size_t stack_limit, char *why, size_t n)`, and no dependencies. `picocalc-os/Makefile`. `native_elf_p4.c`: call it in `elf_load` for modules that contain a typed slot, behind a build option. New `$NEXT/scripts/12-verify-driver.c` and `12-check-verifier.sh`.

**Core algorithm.** The verifier splits the code into functions and runs seven checks. The names V1 to V7 follow the rows of the table in section 7.6.

```
locate the slot; read capacity, entry count E and jump count J; code = words after the fixed jumps, up to the
    first zero word; everything after it must be zero
functions = split code after each `jalr x0, ra, 0`; each piece is one function with exactly one return

V1 decode:   every word is one of the permitted forms, with permitted registers:
             lui, addi, slti-family as emitted, slli, srai, add, sub, mul, div, rem, sll, sra, slt, sltu, xor,
             lw, lhu, sw, sh, the six branches, jal, and jalr only as `jalr x0, ra, 0`
             no instruction writes gp, tp or s0; sp, ra and s11 are written only by the forms named in V3, V4, V6

V2 control:  every branch and every `jal x0` targets a word of the same function, or the trap jump
             no target lies inside a check sequence (bounds check, division check, fuel sequence) except its first word
             every `jal ra` targets the first word of a function of the slot or one of the J trampolines

V3 return:   a function containing `jal ra` begins by storing ra to its frame at offset F - 4 and its last
             instructions load ra from that offset; no other instruction writes ra
             a function without `jal ra` never writes ra

V4 frame:    the first instruction is `addi sp, sp, -F` or the function never mentions sp
             the only other write of sp is `addi sp, sp, F` immediately before the return
             every sp-relative load or store has 0 <= offset < F; only the prologue stores to F - 4 and to the
             save places of s registers; only the epilogue loads s registers from them

V5 stack:    build the call graph from the `jal ra` targets; reject a cycle
             need = F plus the largest need of the callees, with the reactor stack table for trampolines;
             the need of each entry stub's target must not exceed stack_limit

V6 time:     every backward branch and backward `jal x0` is the last word of the fuel sequence of F3,
             with a positive cost; entry points load s11 and nothing else writes it except the fuel forms

V7 memory:   every lw, lhu, sw, sh whose base is not sp is one of:
             a field access: offset a multiple of 4, 0 <= offset <= 2047;
             a unit access: the last word of the bounds-check sequence (load of the length at offset 0 of
               base register b, unsigned compare of index register i against it, branch to a trap jump,
               address = b + 2*i, access at offset 4 or a literal's 4 + 2k), with b and i unchanged in between
             a store of a literal run: accesses at offsets 4, 6, ... from one address register after one check
```

**Steps.**
1. Write the decoder table from the emitter. Generate it if practical: a list of `(mask, value, name)` triples exported by a debug option of `typed-rv32.js`, so that the verifier's notion of "permitted" cannot drift from the backend without a failing check.
2. Implement V1 to V6. These need no knowledge of types.
3. Implement V7 as pattern recognition over the fixed sequences. Make the backend emit each sequence in exactly one shape.
4. Write the driver, which runs the verifier over a module file and prints `accepted` or `rejected: <function index> <word offset> <check> <reason>`.
5. Write the targeted rejections of the acceptance list as a script that patches one word of an accepted module.

**Worked example.** Input: the Files native module built by `02-check-files-rv32.mjs`. Expected output: `accepted: 7 functions, 4 entry points, stack need N`, with N at most 96. Then one word is changed: in `filesName`, the `bltu` of the first bounds check is given the register of the loop bound instead of the loaded length, which is Article 7's example of a compiler error. Expected output: `rejected: function 2 word <n> V7 bounds check compares against a register that is not the loaded length`.

**Acceptance on the host.**
- `sh $NEXT/scripts/12-check-verifier.sh "$GCC"` builds the driver with the host compiler and with the sanitizers, and reports `accepted` for the Files, Agenda and Editor native modules: 161 functions in all.
- Each of these single-word changes to an accepted module is rejected, with the named check: a store through a register that no check sequence produced (V7); `jalr` through `t0` (V1); `addi sp, sp, 16` in the middle of a function (V4); a store to the return-address slot (V4); a branch into the second word of a bounds check (V2); a branch to another function (V2); `jal ra` to the middle of a function (V2); the fuel `addi` replaced by an `addi` of zero (V6); the fuel sequence's `bgez` replaced by an unconditional skip (V6); a frame offset equal to F (V4); a write to `s11` outside a fuel form (V1); the bounds-check register exchanged as in the worked example (V7).
- A module with a call cycle, produced by patching one `jal ra` to target its own function, is rejected by V5.
- The verifier source is at most 600 lines and compiles without warnings for the host and for RV32.
- Verifying Editor's module takes under 5 ms on the workstation.

**Device qualification.** Build with the verifier enabled in `elf_load`. Predictions: the three typed applications load; the boot log shows one line per typed module, `<app> verify status=ok functions=N stack=N us=N`, with the time under 20,000 µs for Editor; a module patched as in the worked example and placed in the bundle of a test build is refused with the V7 message and the world does not start.

**What a wrong implementation looks like.**
- *Checking instructions and not sequences.* A verifier that accepts any `lhu` preceded somewhere by a `bltu` accepts a branch into the middle of the sequence, which skips the comparison. The targeted change "branch into the second word of a bounds check" is accepted by such a verifier.
- *Accepting what the decoder does not know.* A default case that skips unknown words accepts compressed or privileged instructions. The mutation test of F5 produces such words by the thousand.
- *Trusting the header.* A verifier that reads the number of functions from the module instead of deriving the boundaries from the code can be told there is one function; then every branch is "inside the function".

**Dependencies.** A7, F1, F3. **Size.** M. **Risks.** Two limits must be stated wherever the verifier is described. First, with pattern checking alone, memory safety still depends on the compiler having kept types straight: V7 confirms that an access is checked against the length word of *some* base register, not that the base is a buffer. Only F6 removes that dependence. Second, task E8 removes bounds checks that a guard makes redundant, and V7 cannot see the guard. A module compiled with guard facts is therefore rejected by V7. Until F6, source that is not trusted must be compiled with guard facts turned off; the verifier takes a flag for the trusted case in which V7 is skipped, and the receipt line records which mode was used.

---

## Task F5: mutation testing of the verifier

**Goal.** Change single bits of accepted modules at random and show that every changed module is either rejected or does no harm when executed under a monitor.

**Where to look.**
- The interpreter of A0 (`$NEXT/scripts/lib/rv32-interp.mjs`), which already fails on an undecodable word, on an access outside its memory and on exceeding a step limit.
- The verifier driver of F4.
- Article 7, section 7.6, last paragraphs; Article 10, section 10.7, fourth prediction.

**Files to change.** New `$NEXT/scripts/13-mutate-verifier.mjs`. The interpreter gains a policy mode.

**Core algorithm.**

```
policy mode of the interpreter (the definition of "harm"):
    a load or store outside the function's own frame, the buffers and records passed to the call, and
        the reactor stub's data                                     -> harm: memory
    a jump or call to an address that is not inside the slot's code, a trampoline or the trap jump  -> harm: control
    sp or an s register different after the call returns                                             -> harm: stack
    more steps than the fuel allows plus the largest reactor charge                                  -> harm: time

for each application module M (accepted by the verifier), for n random (word, bit) pairs, seeded:
    M' = M with that bit inverted
    if verify(M') rejects: count rejected[check]
    else: run every fixture call of that application's functions against M' under the policy
          if any run reports harm: FAIL, print (word, bit, check that should have caught it)
          else: count accepted_harmless
```

**Steps.** 1. Add the policy mode. 2. Write the mutation loop with a fixed seed and a `--count` option. 3. For Files and Agenda, drive the functions with the inputs their existing checks use (`agenda-lines.mjs`, the name cases of `01-check-files-wasm.mjs`). For Editor, drive `typedWorldEvent` with the reactor functions replaced by JavaScript stubs that enforce their own argument checks. 4. Record the counts per check.

**Worked example.** Inverting bit 7 of an `add t0,t0,t1` changes its destination register to `t1`; the module is accepted, the function computes a wrong value, and no policy rule is violated: accepted and harmless. Inverting bit 5 of a `lw` opcode makes it a `sw`: rejected by V7. Inverting a bit of the fuel `addi`'s immediate so that the cost becomes negative: rejected by V6.

**Acceptance on the host.**
- `node $NEXT/scripts/13-mutate-verifier.mjs --count 20000 --seed 1` for each of the three applications reports zero mutants that are accepted and harmful.
- The report lists how many mutants each check rejected and how many were accepted as harmless; every one of V1, V2, V4, V6 and V7 rejects at least one mutant, which shows that no check is dead.
- A deliberately weakened verifier, built with V7 disabled, makes the script fail with a memory-harm mutant within the 20,000. This shows that the test can detect a missing check.

**What a wrong implementation looks like.** A monitor that only checks for crashes calls a mutant harmless when it stores to an address that happens to be mapped in the test. The policy mode compares every address with the set of regions the call was given, and the weakened-verifier run above is the check that the monitor is strict enough.

**Dependencies.** A0, F4. **Size.** S. **Risks.** Article 7 says "or the changed module can do no harm when run" without defining how that is observed. The policy mode above is this plan's definition. Its coverage is the fixture inputs: a harmful mutant in a function that no fixture reaches is counted as harmless. Report, per application, how many mutated words lie in functions that the fixtures execute.

---

## Task F6: address masking (later, separate)

**Goal.** Make every store of native typed code land inside the world's own data region whatever the compiler did, and have the verifier check the masking instructions instead of trusting types.

**Where to look.** Article 7, section 7.6, "address masking", and the trust table at the end of that section. Literature: Wahbe et al. 1993. `native_elf_p4.c`, `elf_load` and the allocator at lines 49 to 82: where a module's memory is obtained. `$ISSUE/various/01-rv32-instruction-mix.txt`: Editor's code has 1,878 stores and 979 loads that are not relative to `sp`.

**Files to change.** `native_elf_p4.c` (allocate the module's data in a region whose size is a power of two and whose address is a multiple of that size); `rv32-slot.S` (`typedEnter` loads the region's base and mask into two reserved `s` registers); `typed-rv32.js` (emit `and t, t, s_mask; or t, t, s_base` before each non-frame store, once per run of literal stores); `typed_verify.c` (V7 accepts a non-frame store only through a register that the two instructions just produced).

**Steps.** 1. Establish whether the ELF loader can place a module's data segment at an aligned address. 2. Reserve the two registers; rerun A7's counts. 3. Emit and verify the masking for stores. 4. Decide from the measured size and time whether loads are masked too. 5. Remove the V7 exemption for guard facts, since masked code is safe without bounds checks.

**Acceptance on the host.** The verifier accepts the three applications with masking and rejects a module in which one masking instruction is replaced by a no-operation. In the policy interpreter, a fixture compiled with a deliberately wrong record offset stores inside the region and is reported harmless, where the same fixture without masking is reported as memory harm. Editor grows by at most 3,756 instructions (two per store, 1,878 stores) and still fits its 81,920-byte slot. All replays pass. F5's mutation run reports zero harmful accepted mutants with V7 in its masking form.

**Device qualification.** Editor's native CPU time over the workflow rises by at most 10 percent; `mem_kb` stays under 600.

**Dependencies.** F5. **Size.** M. **Risks.** The article gives masking as `base + (address AND mask)`; with absolute pointers, which is what the typed code holds, the form that works is the one of the original paper, in which the region is aligned to its size and the high bits are replaced. That requires control over where the loader puts the module, which is the first step and may not be available without changing Espressif's ELF loader.

## Key points of Scope F

- Today's typed stack need is 96, 320 and 896 bytes for the three applications, on a kernel stack of 80 KiB. F1 makes the number part of the compile result.
- A trap in native code is an `ebreak` today, and nothing on the device recovers from it. F2 replaces it by a jump to a routine that restores the reactor's registers and returns a fault. Fuel is not safe to enable before that.
- Fuel costs three instructions per loop and one to six per reactor call. A span charge must be clamped at zero.
- The verifier derives function boundaries from the code and applies seven checks. With pattern checking it does not make memory safety independent of the compiler, and it conflicts with the bounds checks that E8 removes; both limits end with address masking in F6.
