---
Title: 'Scope D: one interface description for the reactor functions'
Ticket: PICOCALC-NATIVE-NEXT
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://compiler/typed/typed-world.js
      Note: Import table that D1 generates
    - Path: repo://firmware/sdk/typed/rv32-slot.S
      Note: Trampolines that D1 generates
    - Path: repo://firmware/sdk/typed/world.c
      Note: The 28 reactor functions
ExternalSources: []
Summary: 'Tasks D1 and D2: one interface description that generates the import table, the trampolines and the C declarations of the 28 reactor functions, a drift check, and per-function capability, fuel and stack fields.'
LastUpdated: 2026-11-19T15:05:40.499514469-05:00
WhatFor: Implementation guide for the reactor interface description.
WhenToUse: When adding or changing a reactor function.
---

# Scope D: one interface description for the reactor functions

This document describes two tasks. D1 replaces three hand-written lists of the reactor's 28 functions by one description from which the lists are generated, and adds a build check that fails when a generated region differs from what the description produces. D2 adds three facts per function to the description that later scopes need: the capability the function requires, the fuel a call is charged, and the stack the function uses.

Read Article 10, section 10.2, before this document.

## D.1 Where the 28 functions are listed today

A typed application reaches the system through the functions whose names begin with `typedSdk`. Each appears in three files.

| File | What it holds | How it is used |
| --- | --- | --- |
| `picocalc-os/compiler/typed-world.js`, lines 11 to 40 | 28 rows of name, parameter types, result type | The frontend type-checks calls against it. The index of a row is the function's number. |
| `picocalc-os/sdk/typed/rv32-slot.S`, lines 20 to 47 | 28 lines `j typedSdk…`, and in line 6 the count word `0x1c0002` (28 in the high half, 2 entry points in the low half) | Native code calls function *k* with a `jal` to the *k*-th of these jumps. |
| `picocalc-os/sdk/typed/world.c`, lines 73 to 494 | 28 C definitions, each preceded by `SDK(name)` | The implementations. |

The two engines bind differently. For WebAssembly, `linkWorld` looks each function up by its exported name and compares signatures (`typed-wasm.js`, lines 625 to 632), so the order of the table does not matter. For RV32, `linkSlot` patches a call to import number *k* as a jump to `importOffset + 4 * k` (`typed-rv32.js`, line 321), so the order of the table and the order of the trampolines must be identical. `linkSlot` checks the count word (line 292) and that each trampoline is a `jal` (line 300). It cannot check which function a trampoline jumps to.

The consequence is specific. Exchange lines 28 and 29 of `rv32-slot.S`, `j typedSdkYield` and `j typedSdkCapture`. The count is still 28, every check passes, the WebAssembly build is unaffected, and in the native build every `typedSdkYield()` enters `typedSdkCapture` with whatever is in `a0`–`a2`. The comment in line 10 of `typed-world.js`, "Order matches the trampoline table in sdk/typed/rv32-slot.S", is the only protection.

The per-application reactors have the same structure for their entry points: `worlds/files/compile.js` lists four names, `worlds/files/rv32-slot.S` has four `entry` lines in the same order, and `worlds/files/slots.h` declares them.

---

## Task D1: interface description, generator and drift check

**Goal.** Describe the reactor's functions and entry points once, generate the compiler's table, the trampoline list with its count word and the C declarations from that description, and fail the build when any generated region is out of date.

**Where to look.**
- The three files and line ranges in the table above.
- `picocalc-os/sdk/typed/world.c`: the exact C signatures, for example line 74, `int typedSdkScreen(const void *screen, int length, const void *hint, int hint_length)`, line 85, `void *typedSdkBuffer(int slot)`, line 115, `const void *typedSdkView(void *buffer, int length)`, and line 342, where `typedSdkEventText` takes one `const void *` and one `void *` buffer.
- `picocalc-os/Makefile`, the `typed-world-reactor` target; `picocalc-os/port/esp32p4/main/CMakeLists.txt`, lines 226 to 280, where the firmware build compiles the RV32 reactor and bundles `typed/world.js`.
- `$ISSUE/scripts/03-register-cache-model.mjs`, line 21: an existing script that reads the table out of `typed-world.js` with a regular expression. The generated text must keep the row format that this expression matches.
- Article 10, section 10.2. Reference: the WebAssembly Component Model's WIT documentation, for owned and borrowed handles.

**Files to change.**
- New `picocalc-os/sdk/typed/interface.json`: the description.
- New `picocalc-os/tools/gen-typed-interface.mjs`: the generator, with a `--check` mode.
- `picocalc-os/compiler/typed-world.js`: lines 10 to 40 become a region between two marker comments, written by the generator in the present row format.
- `picocalc-os/sdk/typed/rv32-slot.S`: the count word and the `entry` and `j` lines become a generated region.
- New `picocalc-os/sdk/typed/typed_sdk.h`: generated declarations; `world.c` includes it.
- `picocalc-os/Makefile`: a target `check-typed-interface`, made a prerequisite of `typed-world-reactor`. `picocalc-os/port/esp32p4/main/CMakeLists.txt`: the same check as a custom command that the reactor build depends on.
- `worlds/files` and `worlds/agenda`: an `interface.json` each for their entry points, and generated regions in their `compile.js` and `rv32-slot.S`.

**Core algorithm.**

```
interface.json:
  { "entries":   [ {"name": "typedWorldMeta",  "params": [["field","i32"],["value","buffer","write"]], "result": "i32"}, ... ],
    "functions": [ {"name": "typedSdkScreen",
                    "params": [["screen","buffer","read"],["length","i32"],["hint","buffer","read"],["hint_length","i32"]],
                    "result": "i32"}, ... 28 in all, in call-number order ] }

C type of a parameter:   i32, bool -> int;  string -> const void *;
                         buffer "read" -> const void *;  buffer "write" -> void *;  a record -> as buffer
C type of a result:      i32 -> int;  buffer -> void *;  string -> const void *

generate():
    typed-world.js region:  one row per function: ["<name>", "<types joined by comma>", "<result>"],
    rv32-slot.S region:     .word .Lend-.Lprogram, (<functions> << 16) | <entries>
                            entry <name>            per entry
                            j <name>                per function, same order
    typed_sdk.h:            one prototype per function and per entry
    each region starts with a comment naming interface.json and ends with an end marker

check():
    for each target file: regenerate the region in memory; compare with the bytes between the markers
    on a difference: print file, first differing line, expected and found; exit 1
```

Because `world.c` includes `typed_sdk.h`, the C compiler rejects a definition whose parameter types or count differ from the description. Because the table and the trampolines come from one list, they cannot differ in order.

**Steps.**
1. Write `interface.json` by transcribing the 28 rows of `typed-world.js` and the parameter names and `const` qualifiers of `world.c`.
2. Write the generator. Run it and confirm with `git diff` that `typed-world.js` and `rv32-slot.S` change only by the two marker comments and that the count word's value is still 0x1c0002.
3. Include `typed_sdk.h` in `world.c` and build both reactors (`make -C picocalc-os typed-world-reactor` and the RV32 reactor as `02-check-editor-world.mjs` builds it). Fix any `const` mismatch in the description, not in `world.c`.
4. Add the check target and wire it into both build systems.
5. Apply the generator to Files' and Agenda's entry lists.
6. Write `$NEXT/scripts/08-check-interface-drift.sh`, which applies each mutation of the acceptance list to a temporary copy of the tree and requires the check to fail.

**Worked example.** Input, one element of `functions`:

```json
{"name": "typedSdkCountUnit",
 "params": [["view","string"],["start","i32"],["end","i32"],["unit","i32"]], "result": "i32"}
```

Output, one line in each of the three targets:

```
typed-world.js:   ["typedSdkCountUnit", "string,i32,i32,i32", "i32"],
rv32-slot.S:          j typedSdkCountUnit
typed_sdk.h:      int typedSdkCountUnit(const void *view, int start, int end, int unit);
```

The C line agrees with the definition at line 156 of `world.c`.

**Acceptance on the host.**
- `make -C picocalc-os check-typed-interface` exits 0 on the committed tree.
- The module bytes are unchanged: `02-check-editor-world.mjs` still prints `"wasmBytes":88255` and the same `"elfBytes"` as before the task, and `01-check-files-wasm.mjs` still prints `"wasmBytes":49089`.
- `sh $NEXT/scripts/08-check-interface-drift.sh` reports that the check fails, naming the file and line, for each of these six mutations: two trampoline lines exchanged; two rows of the table exchanged; one trampoline deleted and the count word left alone; one parameter type changed in the table; a parameter added to one definition in `world.c` (here the failure is a C compile error); one function appended to `interface.json` without regenerating.
- For the first mutation the script also shows that the present protection is insufficient: with the check disabled, `linkSlot` accepts the mutated reactor.
- All replays pass.

**Device qualification.** None beyond the next scheduled qualification; the generated files are byte-equivalent to the hand-written ones, which the unchanged module sizes show.

**What a wrong implementation looks like.** A generator that sorts the functions by name gives a table and a trampoline list that agree with each other, so the check passes, but renumbers every function. The native build still works because both sides were renumbered together. What breaks is a cached module (Scope B) compiled against the old numbering, if the key did not cover the table; and any external record that refers to call numbers. The acceptance line "module bytes are unchanged" catches the renumbering at once, since a different order changes the `jal` offsets in the image.

**Dependencies.** None. **Size.** S. **Risks.** Existing ticket scripts import `typed-world.js` directly and one reads its table by regular expression; keeping the table inside that file in the same row format avoids touching them. A separate generated JavaScript file would be cleaner and would require a new bundle entry and a new `eval_file` call in `p4_typed_compile`; that is deliberately not done here.

---

## Task D2: capability, fuel charge and stack use per function

**Goal.** Record, for each reactor function in `interface.json`, the capability it needs, the fuel a call costs and the stack it uses, and generate from them the tables that E9, F1 and F3 read.

**Where to look.**
- `world.c`: what each function calls. `typedSdkFileRead` (line 389) calls `nw_fs_read`; `typedSdkWriteSnapshot` (line 396) calls `nw_fs_write`; `typedSdkStoreLoad` and `typedSdkStoreSave` (lines 437, 446) call `nw_store_load` and `nw_store_save`; `typedSdkSend` (line 478) calls `nw_send`; `typedSdkYield` (line 488) calls `nw_sleep(0)`; `typedSdkScreen` (line 74) calls `nw_screen`. The span functions (`typedSdkSeek`, `typedSdkLastIndex`, `typedSdkCountUnit`, `typedSdkNthIndex`, `typedSdkCodePoints`, `typedSdkPointIndex`, `typedSdkUpper`, `typedSdkCopySpan`, lines 130 to 331) loop over `end - start` units; `typedSdkMove` (line 468) moves `count` units.
- `picocalc-os/js/system.json`: the claims of each world. Files has `fs:/`, Agenda has `fs:/notes`, Editor has none and works on file handles that other worlds pass to it.
- `picocalc-os/port/esp32p4/compiler/install.c`, line 17: a comment recording stack sizes obtained with `-fstack-usage`, which is the measuring method to reuse.
- Article 7, sections 7.4 (stack need of a reactor function) and 7.5 (charging reactor calls); Article 9, section 9.7 (effects as capabilities); Article 10, section 10.2, last paragraph.

**Files to change.** `interface.json` (three new fields per function); `gen-typed-interface.mjs` (emit a second generated region in `typed-world.js`, a map from function name to `{capability, fuel, stack}`); new `$NEXT/scripts/09-measure-reactor-stack.sh`.

**Core algorithm.**

```
per function in interface.json:
    "capability": "none" | "file-handle" | "store" | "send" | "screen" | "timer"
    "fuel":       {"base": B}                               # a constant number of units
               |  {"base": B, "per": K, "span": ["start","end"]}   # B + K * (end - start), computed at run time
               |  {"base": B, "per": K, "count": "count"}
    "stack":      S                                         # bytes, including the functions it calls inside the reactor

stack measurement:
    compile world.c, nw_elf.c and libunicode.c for RV32 with -fstack-usage and -fcallgraph-info
    for each typedSdk function: S = its own frame + the largest S of anything it calls (the reactor has no recursion)
    round up to 16; write the result into interface.json; the script fails if the file's value is smaller than measured
```

**Steps.**
1. Classify the 28 functions by capability from the `nw_` calls they make. The functions that make no `nw_` call touch only the reactor's own buffers and are `none`; these are the majority.
2. Set `fuel`. For a function without a loop, `base` is its instruction count rounded up to the next ten, read from the disassembly of the RV32 reactor. For a span function, `per` is the instruction count of one loop iteration.
3. Measure `stack` with the script and record it.
4. Generate the map and expose it as `typedWorldInterface` next to the `imports` table.

**Worked example.** `typedSdkCountUnit` scans a span comparing each unit: `"capability": "none"`, `"fuel": {"base": 20, "per": 4, "span": ["start","end"]}`, `"stack": 16`. A call over a 65,536-unit document is charged 20 + 4 × 65,536 = 262,164 units. The constants 20, 4 and 16 are placeholders that step 2 and step 3 replace by measured values.

**Acceptance on the host.**
- `make -C picocalc-os check-typed-interface` passes with the new region.
- `sh $NEXT/scripts/09-measure-reactor-stack.sh "$GCC"` prints one line per function and exits 0; every recorded `stack` is at least the measured value and at most the measured value plus 32.
- Every function has all three fields; the generator rejects a description with a missing field or a `span` that names a parameter the function does not have.
- All replays pass; module bytes are unchanged.

**What a wrong implementation looks like.** A span function given a constant fuel charge lets a program do 65,536 units of work per call for the price of a few; a loop of such calls then runs far beyond the turn budget before the back-edge charges add up. Task F3's acceptance has a fixture for this: a loop that calls `typedSdkCountUnit` over the full document must exhaust the fuel after the number of iterations predicted from `per`, not after 20 million.

**Dependencies.** D1. **Size.** S. **Risks.** Two things in this task are less certain than the rest of the plan. First, the articles name "the capability the function requires" without listing capabilities; the six classes above are this plan's reading of what `world.c` calls and must be confirmed against the checks the nucleus actually performs for each `nw_` call. Second, a native world runs on the kernel task's stack, and a reactor function that calls into the nucleus continues on that stack in kernel code; the measured `stack` covers the reactor's own code only. Task F1 states what bound follows from that and what does not.

## Key points of Scope D

- The table in `typed-world.js` and the trampolines in `rv32-slot.S` must agree in order, and today only a comment says so. An exchanged pair of trampolines passes every existing check.
- One JSON description generates the table, the trampolines with their count word, and a C header that `world.c` includes. A check target regenerates and compares.
- The generated regions stay inside the existing files, so the bundle layout and every existing script remain valid, and the task is accepted by showing that the module bytes do not change.
- D2 adds capability, fuel and stack fields that the usage report, the stack bound and the fuel counter read.
