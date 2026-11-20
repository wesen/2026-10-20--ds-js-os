---
Title: 'Scope E: language additions'
Ticket: PICOCALC-NATIVE-NEXT
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/compiler/typed-wasm.js
      Note: Frontend changed by every task of Scope E
ExternalSources: []
Summary: 'Tasks E1 to E9: else, for, break, !==, forward calls with a cycle check, enumerations with exhaustive match, distinct integers, an index type with guard facts, and a reactor-usage report.'
LastUpdated: 2026-11-19T15:05:40.8704705-05:00
WhatFor: Implementation guide for the language additions.
WhenToUse: When changing picocalc-os/compiler/typed-wasm.js.
---

# Scope E: language additions

This document describes nine additions to the typed language, one task each. Four are omissions that make the sources longer than they need to be (`else`, `for`, `break`, `!==`). One changes the order in which functions may appear and must bring an explicit check with it (forward calls). Three add types that change no generated code and reject classes of mistakes (enumerations, distinct integers) or remove run-time checks (an unsigned index type with guard facts). The last produces a report of which reactor functions each world can call.

Read Article 9 in full and Article 7, section 7.4, before this document.

## E.1 How the frontend is built

All nine tasks change `picocalc-os/compiler/typed-wasm.js`, so its structure is described once.

The frontend is one pass with no syntax tree. `Lexer` (lines 53 to 105) produces tokens with the regular expression `TOKEN` (line 20); the last alternative of that expression lists the operators, and `RESERVED` (line 21) lists the words that cannot be identifiers. `FunctionEmitter` (lines 107 to 454) parses one function and appends WebAssembly bytes to `this.code` as it goes. Its methods are a recursive-descent parser: `function()` (line 426) reads the signature and the body; `statement()` (line 365) handles `if`, `while`, `let`/`const`, calls, field and buffer writes, and assignments; `expr()` (line 236) is precedence climbing over the table `BINARY` (line 11), in which each operator has a precedence, an operand type, a result type and an opcode; `prefix()` (line 160) handles literals, `!`, unary minus, `Math.min`/`max`, calls, field reads, `.length` and `.charCodeAt`. A type is a string: `"i32"`, `"bool"`, `"string"`, `"buffer"` or a record name, and `want(type, expected)` (line 125) is the whole type checker. `compileFunctions` (line 456) reads the records, then the functions in order, and enters each function in the table `declared` after its body has been compiled (line 481).

Three properties of this design shape the tasks.

- **A function body must end in `return`.** `function()` loops over statements until the token `return` (line 445). An `if` is either `if (c) { … }` or the one-statement form `if (c) return e;` (lines 372, 373).
- **Code is emitted in source order.** A construct whose parts must be emitted in a different order than they are written, such as the update clause of `for`, has to be parsed into a separate byte list and appended later.
- **Both backends consume the same bytes.** A new opcode must be handled by the RV32 backend (`typed-rv32.js`) and, until task A8, by both of its lowerings, and by the counting model (`$NEXT/scripts/lib/model.mjs`).

One acceptance check is common to all nine tasks, and it is strong: **the existing sources must compile to the same bytes as before.** None of the new words is used as an identifier in the three applications; they occur only in comments and string literals. A task that adds a feature without using it in the applications therefore must leave `"wasmBytes":88255` for Editor, `"wasmBytes":49089` for Files and the RV32 instruction counts unchanged. The check is `01-run-host-replays.sh` plus `03-check-instruction-counts.mjs` with a tolerance of 0.

Each task also adds fixtures to `$NEXT/scripts/04-check-functions-differential.mjs` (task A0), which runs every fixture as WebAssembly in Node and as RV32 in the interpreter and compares the results, and a list of rejected programs with the expected diagnostic, in the style of `ttmp/2026/11/18/PICOCALC-AGENDA-COMPILER*/scripts/14-check-local-inference.mjs`.

---

## Task E1: `else`

**Goal.** Accept `if (c) { … } else { … }` and `else if`.

**Where to look.** `typed-wasm.js`, `statement()`, lines 367 to 376; `OP.else` (line 5) is already defined and both backends handle opcode `0x05` (`typed-rv32.js`, line 149), because `&&`, `||` and `Math.min` use it. `picocalc-os/worlds/editor/editor.typed`, lines 62 to 65 and 72 to 76, where the same condition is written twice because there is no `else`. Article 9, section 9.9.

**Files to change.** `typed-wasm.js`: `RESERVED`, the `if` case of `statement()`.

**Core algorithm.**

```
after the block or return of an `if`:
    if accept("else"):
        emit else
        if the next token is "if": statement(result)          # else if: a nested if inside the else arm
        else if the next token is "{": block(result)
        else: result(type, branch = true)                      # else return e;
    emit end
```

After task A6 an `if` is a `block` with conditional branches. The form with `else` is then `block block cond(c, false -> 0) A br 1 end B end`.

**Steps.** 1. Add the keyword and the branch above. 2. Add fixtures: `if`/`else` with assignments in both arms; a chain of three `else if`; `if (c) return 1; else return 2;` followed by the function's final `return`; an `else` arm containing a `while`. 3. Add rejected programs: `else` with no `if` before it (diagnostic `expected identifier`), `else` followed by neither a block, `if` nor `return`.

**Worked example.** Input: `function sign(x: i32): i32 { let s = 0; if (x > 0) { s = 1; } else if (x < 0) { s = 0 - 1; } return s; }`. Expected results: `sign(5)` is 1, `sign(-5)` is −1, `sign(0)` is 0. In the WebAssembly body the inner `if` lies between the `else` (`05`) and the `end` (`0b`) of the outer one, so the body ends `0b 0b 20 01 0b`: two block ends, `local.get s`, function end.

**Acceptance on the host.** The common byte-identity check; the fixtures pass on both targets; today the example fails with `1:68: unknown local else`, and after the task it compiles.

**What a wrong implementation looks like.** Emitting `end` before looking for `else` closes the `if` and makes the else arm unconditional. `sign(5)` then returns 0 or −1. The fixture with both arms assigning different values catches it on the first call.

**Dependencies.** None. **Size.** S. **Risks.** None beyond the ordering with A6, whichever lands second adapts.

---

## Task E2: `for`

**Goal.** Accept `for (init; condition; update) { body }` as an abbreviation of a `while` loop.

**Where to look.** `statement()`, the `while` case, lines 377 to 386: `block loop <condition> eqz br_if 1 <body> br 0 end end`. `block()` (line 355), which opens a scope for locals. Article 9, section 9.9.

**Files to change.** `typed-wasm.js`: `RESERVED`, a `for` case in `statement()`, and a helper that parses a simple statement without the trailing semicolon.

**Core algorithm.**

```
for (init; cond; update) body:
    open a local scope                               # the loop variable is not visible afterwards
    parse init as a `let` declaration or an assignment; emit it
    emit block, loop
    parse cond; emit eqz, br_if 1                    # after A6: cond(c, false -> 1)
    saved = this.code;  this.code = []               # the update is written before the body, emitted after it
    parse update (an assignment);  updateCode = this.code;  this.code = saved
    parse body
    append updateCode
    emit br 0, end, end
    close the scope
```

**Steps.** 1. Implement as above. 2. Today the example below fails with `unknown function for`. Fixtures: a sum from 0 to n − 1; nested `for` loops; a `for` whose body ends early through `if (…) return …;`; a loop with zero iterations. 3. Rejected: a missing clause; an update that is a declaration; use of the loop variable after the loop (`unknown local i`).

**Worked example.** `for (let i = 0; i < n; i = i + 1) { s = s + i; }` must produce exactly the bytes of `let i = 0; while (i < n) { s = s + i; i = i + 1; }` except for scoping. The acceptance check compiles both and compares the function bodies byte for byte.

**Acceptance on the host.** Byte identity of existing sources; the body comparison above; fixtures on both targets.

**What a wrong implementation looks like.** Emitting the update where it is parsed puts it before the body. The sum fixture then adds 1 to n instead of 0 to n − 1 and returns `n(n+1)/2` instead of `n(n−1)/2`.

**Dependencies.** None. **Size.** S. **Risks.** If E3 is present, `break` inside a `for` body must skip the update; the branch target is the outer `block`, which is already the case.

---

## Task E3: `break`

**Goal.** Accept `break;` inside a loop body, leaving the innermost loop.

**Where to look.** The `while` case of `statement()` (line 379 opens `block` then `loop`); `typed-rv32.js`, the `0x0c` case (line 157), which resolves `br n` against `this.control.at(-1 - n)` for any depth, so the backend needs no change. Article 9, section 9.9.

**Files to change.** `typed-wasm.js`: `RESERVED`; a counter of open WebAssembly blocks in `FunctionEmitter`; a stack of loop records; a `break` case in `statement()`.

**Core algorithm.**

```
this.open = number of WebAssembly blocks (block, loop, if) currently open in this function
on entering a while or for:   loops.push({exit: this.open});  then emit block (open += 1) and loop (open += 1)
break;                        if loops is empty: fail "break outside a loop"
                              emit br (this.open - loops.top.exit - 1)
on leaving:                   loops.pop()
```

Every place that emits `0x02`, `0x03` or `0x04` increments the counter and every `end` decrements it. That includes the blocks that `&&`, `||`, `Math.min` and the bounds check in `codeUnitAddress` (line 280) open and close inside expressions; they are balanced within the expression and `break` is a statement, so they are never open at a `break`.

**Steps.** 1. Add the counter and audit every emission of a block opcode. 2. Fixtures: search for the first occurrence of a value; `break` inside two nested `if`s inside a loop; `break` in the inner of two loops, checking that the outer loop continues. 3. Rejected: `break` outside a loop. Today any `break` fails with `unknown local break`.

**Worked example.** `while (i < n) { if (a === i) { break; } i = i + 1; }`: the `break` is inside `block`, `loop` and `if`, so three blocks are open and the loop's exit is the first of them: `br 2`.

**Acceptance on the host.** Byte identity of existing sources; fixtures on both targets, with the nested-loop fixture returning the count of outer iterations.

**What a wrong implementation looks like.** A depth that is one too small targets the `loop` and turns `break` into `continue`: the search fixture never terminates. The interpreter's step limit ends the test with `StepLimit`, and Node's WebAssembly run is given a timeout. A depth one too large leaves two loops; the nested-loop fixture returns 1 instead of the outer count.

**Dependencies.** None. **Size.** S. **Risks.** Task F3 places fuel checks at back-edges. A `break` is a forward branch and needs no fuel check; make sure F3 identifies back-edges by the target being a `loop` and not by the opcode.

---

## Task E4: `!==`

**Goal.** Accept `a !== b` for the operand types that `===` accepts.

**Where to look.** `TOKEN` (line 20), whose operator alternative begins `===|<=|>=|>>|…`; `BINARY`, the entry for `===` (line 13) with opcode `0x46`; `typed-rv32.js`, `binary` (line 108), which handles `0x46` as `xor` then `seqz`; the sources, which write `!(a === b)` in 15 places today. Article 9, section 9.9.

**Files to change.** `typed-wasm.js`: `TOKEN` (put `!==` first in the operator alternative, before `===` and before the single character `!`), `BINARY` (`["!==", [3, null, "bool", 0x47]]`). `typed-rv32.js`: opcode `0x47` in both lowerings (`xor`, `snez`; or a `cond` entry with base `eq` and `inv` set). `lib/model.mjs`: opcode `0x47` costed as `0x46`.

**Steps.** 1. Token and table entry. 2. Backend and model. 3. Fixtures over equal and unequal `i32` and `bool` operands, as a value and as a condition. 4. Rejected: `!==` on a `string`.

**Worked example.** `if (a !== 1) return 2;` today fails with `expected bool, got i32`, because the lexer reads `!` and then `==`. After the task it compiles to `local.get a`, `i32.const 1`, `i32.ne`, `if`. An `if` skips its block when the condition is false, so the register lowering emits `li` for the constant and one `beq` to the end of the block.

**Acceptance on the host.** Byte identity of existing sources; fixtures on both targets; `a !== b` and `!(a === b)` produce the same RV32 instruction count in the register lowering.

**What a wrong implementation looks like.** Adding the token after `===` in the regular expression leaves `!==` lexed as `!` followed by `==`, and the compile error does not change. Adding the opcode to the frontend only makes the RV32 backend throw `unsupported RV32 operator 71`; the differential fixture reports it because it compiles for both targets.

**Dependencies.** None. **Size.** S. **Risks.** None.

---

## Task E5: calls to functions defined later, with a cycle check

**Goal.** Allow a function to call one that appears later in the file, and reject every program whose call graph contains a cycle.

**Where to look.**
- `typed-wasm.js`: `compileFunctions`, lines 476 to 483, where a function enters `declared` only after its body is compiled; `call()` (line 335), which fails with `unknown function` when the name is not in the table.
- Verified behaviour today: `function f(n: i32): i32 { return f(n); }` fails with `1:36: unknown function f`, and two functions that call each other fail with `unknown function b`.
- Article 7, section 7.4, last paragraph: the absence of recursion is a by-product of the registration order, and the stack bound depends on it. Article 9, section 9.9. Literature: Gay et al. 2003 (nesC, whole call graph known at compile time).

**Files to change.** `typed-wasm.js`: a new function `scanSignatures(source, records)`; `compileFunctions`; `call()`; a new function `checkAcyclic(functions, edges)`. The result of `compileFunctions` gains `edges`, a list of callee indexes per function, and `order`, the functions in an order in which every callee precedes its callers.

**Core algorithm.**

```
scanSignatures(source):
    walk the characters, skipping // comments and string literals, tracking brace depth
    at each `function` keyword at depth 0: run the Lexer from there to the opening brace;
        record name, parameter types, result type; the index is the order of appearance
    return the table

compileFunctions:
    declared = imports + scanSignatures(source)          # every function is known before any body is compiled
    for each function, in source order: compile the body as today;
        in call(): edges[current].add(callee.index) when the callee is a typed function
    checkAcyclic

checkAcyclic:
    colour every function white
    visit(f): colour[f] = grey; path.push(f)
              for g in edges[f]:
                  if colour[g] is grey:  fail "recursive call cycle: " + names of path from g to f + " -> " + name(g)
                  if colour[g] is white: visit(g)
              path.pop(); colour[f] = black; order.push(f)
    for each f in source order: if white, visit(f)
```

Function indexes are still assigned in source order, so the bytes of every program that compiles today are unchanged.

**Steps.**
1. Write `scanSignatures`. It must skip braces inside string literals such as the JSON fragments of `writeLiteral`; `worlds/editor/view.typed` contains many.
2. Change `compileFunctions` and record edges.
3. Write `checkAcyclic` with an explicit stack instead of recursion if the call depth of QuickJS on the device is a concern; Editor's longest call chain is short, but the check must not itself be the deepest recursion in the compiler.
4. Fixtures: a function that calls a later one; a chain of four functions written in reverse order.
5. Rejected, with the exact diagnostics: self-recursion (`recursive call cycle: f -> f`); two functions (`recursive call cycle: a -> b -> a`); a cycle of three reached only from a fourth function; a call to a name that is not defined anywhere (`unknown function g`, unchanged).

**Worked example.** Input:

```
function a(n: i32): i32 { return b(n) + 1; }
function b(n: i32): i32 { return c(n) + 1; }
function c(n: i32): i32 { if (n > 0) return a(n - 1); return 0; }
```

Expected: `SyntaxError: recursive call cycle: a -> b -> c -> a`. With the body of `c` replaced by `return n;`, the program compiles, `a(5)` is 7, and `order` is `[c, b, a]`.

**Acceptance on the host.**
- Byte identity of existing sources.
- The five rejected programs give the stated diagnostics from both `compileTyped` and `typedRv32.compile`.
- The frontend's time under QuickJS (`$ISSUE/scripts/04-compile-phase-timing.sh`, "frontend only") stays at or below 31.4 ms median, which is today's 28.53 ms plus 10 percent.

**Device qualification.** At the next scheduled qualification, the Editor compile time must not rise by more than 5 percent over the previous receipt.

**What a wrong implementation looks like.**
- *Forward calls without the check.* Mutual recursion compiles. Nothing fails until the stack bound of F1 is computed for a cyclic graph, where a naive recursive computation does not terminate, or until the program overflows the stack on the device. The three rejected cycle programs exist to make this impossible to miss.
- *A check that only looks for self-calls.* The two-function and three-function cycles compile.
- *A signature scan that counts braces in strings.* The scan loses track of depth after the first `writeLiteral(…, "{\"t\":…")` and misses every later function; Editor fails with `unknown function` for a function that exists. The byte-identity check on Editor catches it.

**Dependencies.** None. **Size.** S. **Risks.** Tasks E9, F1 and G1 read `edges` and `order`. Fix their format in this task and do not change it later.

---

## Task E6: enumerations with exhaustive `match`

**Goal.** Add `enum` declarations, enumeration-typed locals, parameters and record fields, and a `match` statement that must name every member.

**Where to look.**
- Observations in the sources: `worlds/files/files.typed`, lines 53 and 69, return 15 and 14 as action codes; `worlds/editor/editor.typed` tests `event.kind === 4` in five places; `worlds/editor/find.typed`, lines 30 to 77, use `state.findPhase` with the values 0 to 5 in 15 places.
- `typed-wasm.js`: `Lexer.type` (line 99), which accepts a type name; record parsing in `compileFunctions` (lines 461 to 475); `want` (line 125); the `===` rule in `expr` (line 244), which allows equality on `i32` and `bool` only.
- `typed-world.js`, `validate` (line 42): `WorldState` may contain only `i32` and `bool` fields (line 49).
- Article 9, section 9.2. Literature: Maranget 2007, for exhaustiveness and useless cases in the general setting; for enumerations without data the check is a set comparison.

**Files to change.** `typed-wasm.js`: `RESERVED` (`enum`, `match`); declaration parsing; `Lexer.type`; `prefix` (member access `Name.Member`); `expr` (equality on two values of the same enumeration); a `match` case in `statement`. `typed-world.js`: `validate` accepts enumeration-typed fields in `WorldState`. The compile result gains `enums`.

**Core algorithm.**

```
enum Name { A, B = 4, C }        members get 0, 1, 2 ... or the given number, then count on from it (C is 5)
                                 duplicates of a name or a number are rejected
representation:                  i32; a field of enumeration type occupies 4 bytes like any scalar
Name.A in an expression:         i32.const <number>, type "Name"
a === b, a !== b:                allowed when both have the same enumeration type
arithmetic, <, >, passing as i32: rejected by want()
i32(e):                          the number of an enumeration value, type i32; emits nothing
match (e) { A, B: { … }  C: { … } }:
    evaluate e once into a fresh local t
    seen = {}
    for each arm: every listed member must belong to e's type and not be in seen ("useless case C"); add to seen
                  emit  t === m1 || t === m2 ...  as comparisons joined by i32.or-free code: nested if / else chain
    if seen != all members: fail "match on Name does not cover: " + missing members, in declaration order
    after the last arm: emit unreachable in the final else        # a stored number outside the enumeration traps
```

**Steps.**
1. Parse declarations; they may appear before or between records and before the first function.
2. Type rules in `Lexer.type`, `prefix`, `expr`, `want`.
3. `match` as an `if`/`else` chain over a temporary local. Do not use `br_table`; the backends do not implement opcode `0x0e`.
4. `validate` in `typed-world.js`.
5. Demonstration: declare `enum FindPhase { LineSuffix, LaterLines, EarlierLines, LinePrefix, NotFound, Found }` in `worlds/editor/state.typed`, give `findPhase` that type, and rewrite the tests in `find.typed`. The comparisons `state.findPhase < 4` and `>= 4` become `match` statements.
6. Fixtures and rejected programs: a `match` missing one member; a member listed twice; a member of another enumeration; an enumeration value passed where `i32` is expected; arithmetic on an enumeration value.

**Worked example.** With the declaration above, this statement

```
match (state.findPhase) {
    LineSuffix, LaterLines, EarlierLines: { n = 1; }
    NotFound: { n = 2; }
    Found: { n = 3; }
}
```

is rejected with `match on FindPhase does not cover: LinePrefix`.

**Acceptance on the host.**
- Before step 5: byte identity of existing sources.
- After step 5: all thirteen Editor workflows pass on both targets; `--find`, `--dense-search` and `--tail-search` exercise every phase. Editor's RV32 instruction count changes by at most 40 instructions from its value before the step, and the count of `WorldState` fields is still 71.
- The rejected programs give the stated diagnostics.

**What a wrong implementation looks like.** An exhaustiveness check that counts arms instead of comparing sets accepts a `match` in which one member appears twice and another is missing. The fixture "member listed twice" has exactly as many names as the enumeration has members and must be rejected with `useless case`.

**Dependencies.** None. **Size.** S. **Risks.** The article does not say how a number becomes an enumeration value. This plan provides no such conversion: values enter through literals, typed fields and typed parameters, and a field holding a number outside the enumeration traps in `match`. If a reactor function must return an enumeration, that belongs in the interface description of D1 and is a later change.

---

## Task E7: distinct integer types

**Goal.** Add `type Name = distinct i32;` so that values in different coordinate systems cannot be mixed without an explicit conversion, with no change to generated code.

**Where to look.**
- `worlds/editor/positions.typed` and `layout.typed`: positions as byte counts, UTF-16 code units, code points and display rows, all `i32`. The reactor functions `typedSdkCodePoints` and `typedSdkPointIndex` (`world.c`, lines 185 and 195) convert between code units and code points.
- `typed-wasm.js`: `want` (line 125); `BINARY` (line 11), where arithmetic operators require `"i32"` operands; `prefix`, the integer-literal case (line 183).
- Article 9, section 9.3. Literature: Kennedy 1994 (dimension types); this task implements the fragment without products of units.

**Files to change.** `typed-wasm.js`: `RESERVED` (`type`, `distinct`); declaration parsing; `Lexer.type`; `expr`; `prefix`.

**Core algorithm.**

```
type Unit = distinct i32;         a new type name whose representation is i32
integer literal:                  type "literal": accepted where i32 or any distinct type is wanted
a + b, a - b:                     both of the same distinct type D (or one a literal): result D
                                  both i32: result i32;  D with i32, or D with another distinct type: rejected
a < b and the other comparisons, ===, !==:   the same rule; result bool
*, /, %, >>:                      i32 operands only
Unit(e):                          e of type i32 -> type Unit; emits nothing
i32(e):                           e of a distinct type -> i32; emits nothing
```

**Steps.** 1. Declarations and `Lexer.type`. 2. The literal type: `prefix` returns `"literal"` for an integer literal and `want` accepts it for `i32` and distinct types; a `let` initialized by a bare literal still gets type `i32`, as today. 3. Operator rules in `expr`. 4. The two conversion forms in `prefix`. 5. Demonstration: declare `Unit` and `Point` in the Editor sources and annotate the column functions of `positions.typed`. 6. Rejected programs: `Unit + Point`; `Unit` passed for a `Point` parameter; `Unit * Unit`; `Unit + i32` variable.

**Worked example.** `function columnOf(text: string, at: Unit): Point { return Point(typedSdkCodePoints(text, 0, i32(at))); }` compiles to the same WebAssembly as the version with `i32` in place of `Unit` and `Point` and without the two conversions: `local.get text`, `i32.const 0`, `local.get at`, `call`, `end`.

**Acceptance on the host.**
- Before step 5: byte identity.
- After step 5: Editor's WebAssembly module is still 88,255 bytes and its RV32 instruction count is unchanged to the instruction, because the annotations emit nothing. All replays pass.
- The rejected programs give `expected Point, got Unit` and its counterparts.

**What a wrong implementation looks like.** Treating a distinct type as an alias makes `Unit + Point` compile; the first rejected program catches it. Emitting a conversion call or a copy for `Unit(e)` changes the byte count, which the unchanged module size catches.

**Dependencies.** None. **Size.** S. **Risks.** Reactor functions take and return `i32`, so call sites need `i32(…)` and `Unit(…)`. That is noise. Declaring distinct types in the interface description would remove it and is left for later.

---

## Task E8: an unsigned index type and guard facts that remove bounds checks

**Goal.** Add the type `index` and make the compiler omit the bounds check of `s.charCodeAt(i)` and `s.setCharCodeAt(i, …)` while a guard `i < s.length` on an `index` variable is known to hold.

**Where to look.**
- `typed-wasm.js`: `codeUnitAddress` (line 277), which emits the check `local.get pos`, `local.get recv`, `i32.load`, `i32.ge_u`, `if`, `unreachable`, `end` before every access; the `.length` case of `prefix` (line 217); the `charCodeAt` case (lines 222 to 230); `bufferWrite` (line 287).
- The count of sites: Editor's WebAssembly has 376 `unreachable` operations, Agenda's 35, Files' 8.
- The loops that have the guard the rule needs. Of the 66 `while` loops in the three applications, 10 have a condition containing `x < s.length`: `worlds/agenda/entry.typed` lines 163 and 229; `worlds/agenda/reminder.typed` lines 67, 113, 148 and 168; `worlds/files/files.typed` line 36; `worlds/editor/layout.typed` line 46; `worlds/editor/positions.typed` lines 13 and 24. Most of Editor's loops are bounded by a variable such as `stop` or `end` instead.
- Article 9, section 9.4. Literature: Tobin-Hochstadt & Felleisen 2008 (occurrence typing); Xi & Pfenning 1998 for the next rung, which this task does not build.

**Files to change.** `typed-wasm.js`: `RESERVED` (`index`); `Lexer.type`; `BINARY` handling for `index` operands; a fact table in `FunctionEmitter`; `codeUnitAddress`; the `if` and `while` cases and, after A6, `cond`. `typed-rv32.js` and `lib/model.mjs`: the unsigned comparisons `0x49` (lt_u), `0x4b` (gt_u), `0x4d` (le_u).

**Core algorithm.**

```
types:      index is an unsigned 32-bit integer.  s.length has type index.
            index used where i32 is wanted converts silently (this keeps every existing source valid).
            i32 to index needs index(e), which emits a check that e >= 0 and traps otherwise; a literal needs none.
            index + literal, index - literal, index + index: index.
compare:    both operands index: the unsigned opcode.  Otherwise the signed opcode, as today.

facts:      a set of pairs (i, s): "local i, of type index, is less than the length of local s"
record:     when the condition of an if or while, or the left operand of &&, is exactly  i < s.length
            (or s.length > i) with i an index local and s a string or buffer local:
            the fact (i, s) holds in the guarded block, and in the right operand of the &&
discard:    assignment to i or to s: drop the facts that mention it
            any call, typed or reactor: drop all facts
            end of the guarded block: drop the facts recorded for it
            start of a loop body: facts from outside the loop are dropped unless the loop assigns neither variable;
                                  the simple rule is to drop them all
use:        codeUnitAddress(recv, pos): if pos is the plain local i and (i, recv) is in the set, emit the address
            computation without the seven check bytes
```

`charCodeAt`, `setCharCodeAt` and `.length` are compiled in place and are not calls, so they do not discard facts.

**Steps.**
1. The type and its conversions; `.length` returns `index`. Run the byte-identity check: every existing comparison has an `i32` operand and stays signed.
2. Unsigned comparison opcodes in the backend and the model.
3. The fact table with recording, discarding and use.
4. Demonstration: in the 10 loops listed above, declare the loop variable as `index` (`let at: index = 0;`).
5. Fixtures: the `countUnit` loop with an `index` counter, called on strings of length 0, 1 and 100; a loop that assigns the counter before the access (the check must remain); a loop that calls a function before the access (the check must remain); an access to a different string than the guarded one (the check must remain); `index(-1)` traps.

**Worked example.** `countUnit` with `let at: index = 0;`. The WebAssembly of today contains, inside the loop, `20 02 21 04 20 04 20 00 28 02 00 4f 04 40 00 0b` before the address computation: copy `at` to a temporary, load the length, compare unsigned, trap. With the fact `(at, text)` recorded on entering the loop body, the last seven of those operations (`20 04 20 00 28 02 00 4f 04 40 00 0b`, twelve bytes) are not emitted. In the register lowering the loop loses the three instructions `lw` of the length, `bltu` and `ebreak`, and with locals in the frame also the two loads that feed them: model A goes from 33 to 28 instructions for the function, model B from 17 to 14.

**Acceptance on the host.**
- After step 1: byte identity of existing sources.
- After step 4: the number of `unreachable` operations is at most 7 in Files (from 8), at most 29 in Agenda (from 35) and at most 373 in Editor (from 376). All replays pass, including Agenda's 3,924 cases on both targets.
- `countUnit` with an `index` counter is at most 29 instructions after A3 and at most 15 after A7.
- The three "check must remain" fixtures still trap on an out-of-range index, on both targets.

**What a wrong implementation looks like.** A fact that survives an assignment removes a check that is needed. In `while (at < s.length) { at = at + 2; x = s.charCodeAt(at); }` the access after the assignment can be out of range. The fixture calls it with a string of odd length and expects a trap; an implementation that kept the fact reads the two bytes after the string and returns a number. On the WebAssembly target the read stays inside linear memory and no engine check fires, so only the comparison with the expected trap shows the error.

**Dependencies.** A3 (the instruction-count acceptance needs the fused bounds check), E7 (the conversion syntax). **Size.** M. **Risks.** The measured yield in Editor is small: three of its loops qualify, so at most a few of its 376 trap sites go away. Article 9 states that most checks are redundant and visibly so. That holds for the example in the article and for Agenda's parsers; in Editor the visible guard is usually `read < stop` or `at < end`, where `end` is not a length. Removing those checks needs a second kind of fact, "`end` is at most `s.length`", which is the next rung of the article's ladder and is not planned here. Report the measured counts and let them decide whether that rung is worth building.

---

## Task E9: reactor-usage report checked against manifest claims

**Goal.** Compute, for each typed world, the set of reactor functions it can call, and compare the capabilities those functions need with the claims the manifest gives the world.

**Where to look.**
- `typed-wasm.js`, `call()` (line 335): every call site names its callee, and a callee with an index below `functionBase` is a reactor function.
- `edges` and `order` from task E5; the capability field of each function from task D2.
- `picocalc-os/js/system.json` and the manifests generated for typed builds: Files claims `fs:/`, Agenda claims `fs:/notes`, Editor has no claims and receives file handles.
- Measured today: Editor's typed code calls all 28 reactor functions, from 145 call sites. Files and Agenda are compiled with no imports; their reactor calls the typed code and not the other way round.
- Article 9, section 9.7. Literature: Lucassen & Gifford 1988 (effect systems); Dennis & Van Horn 1966 and Miller 2006 for least privilege.

**Files to change.** `typed-wasm.js`: `compileFunctions` returns `effects`, one set of import indexes per function. `typed-world.js`: the compile result of both targets gains `usage`. New `picocalc-os/tools/check-typed-usage.mjs`.

**Core algorithm.**

```
direct[f]  = the reactor functions f calls itself (collected in call())
effect[f]  = direct[f]  ∪  effect[g] for every typed g that f calls
             computed after the whole file is read, in `order` (callees first), one union per edge
usage      = effect[typedWorldMeta] ∪ effect[typedWorldEvent]
report     = { used: names, unused: the other reactor functions, capabilities: the set of their D2 classes }

check-typed-usage.mjs manifest.json:
    for each typed world in the manifest: compile it, take the report
    excess:  a claim of the world that no used function's capability needs
    missing: a used function whose capability needs a claim or a handle the world can never hold
    print one line per world; exit 1 on any excess or missing entry
```

**Steps.** 1. Collect `direct` and compute `effect`. 2. Attach `usage` to the result. 3. Write the tool and its mapping from capability classes to claims. 4. Fixtures: a small world that never calls `typedSdkFileRead`; the same world with a manifest entry that gives it a file-system claim.

**Worked example.** For the Editor sources the report is `used: 28 of 28`, `unused: none`, with every capability class present. For a fixture world consisting of `typedWorldMeta` and a `typedWorldEvent` that calls only `typedSdkBuffer` and `typedSdkScreen`, the report is `used: typedSdkBuffer, typedSdkScreen`, 26 unused, capabilities `none` and `screen`. If the fixture manifest gives that world `"claims":["fs:/notes"]`, the tool prints `fixture: excess claim fs:/notes (no reachable function uses the file system)` and exits 1.

**Acceptance on the host.**
- Byte identity of existing sources (the report does not change the module).
- `node picocalc-os/tools/check-typed-usage.mjs` on the typed-Editor manifest exits 0 and prints `editor: 28 of 28 reactor functions reachable; claims []; no excess, no missing`.
- The two fixtures give the reports above.
- A function that is defined but never reachable from an entry point contributes nothing: a fixture with a dead function that calls `typedSdkFileRead` reports that function as unused.

**What a wrong implementation looks like.** Computing the effect of each function when its body ends, as Article 9 describes for the language of today, is wrong once E5 allows forward calls: a callee defined later has no effect set yet, and its reactor calls are missing from the caller's set. The world then appears to need less than it does. The fixture with four functions in reverse order, where only the last-defined one calls the reactor, shows an empty report under the wrong implementation.

**Dependencies.** D2, E5. **Size.** S. **Risks.** The "missing" direction has no real instance to test against. None of the 28 functions of the shared reactor needs a manifest claim: file access goes through handles that another world passes in. The check for excess claims is concrete; the check for missing ones becomes meaningful when a reactor function that opens a path by name is added. Report this to the project owner as an open definition.

## Key points of Scope E

- Every task must leave the bytes of the existing applications unchanged until its demonstration step. That one check catches most frontend mistakes.
- Forward calls must arrive together with the cycle check. The check is a depth-first search that reports the cycle by name, and it also produces the callee-first order that E9, F1 and G1 need.
- Enumerations and distinct integers change no generated code; the acceptance checks state that as an unchanged byte count.
- Guard facts remove a check only for an `index` variable guarded directly by `i < s.length`. Ten of 66 loops qualify, three of them in Editor, and the plan's prediction is correspondingly small.
