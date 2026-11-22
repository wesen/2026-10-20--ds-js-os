---
Title: Extending the PicoCalc streaming typed language
Ticket: PICOCALC-LANGUAGE-E
Status: active
Topics:
    - picocalc
    - native
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://compiler/typed/typed-rv32.js
      Note: Streaming native lowering and fixups
    - Path: repo://compiler/typed/typed-wasm.js
      Note: Shared parser and type checker
    - Path: repo://compiler/typed/typed-world.js
      Note: World state validation
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T23:29:06.828495424-05:00
WhatFor: ""
WhenToUse: ""
---

# Extending the PicoCalc streaming typed language

The compiler reads typed PicoCalc world sources and immediately emits a small stack instruction stream for each function. The Wasm writer frames those instructions as function bodies, while the RV32 compiler lowers the same instructions as soon as a function closes. The additions here preserve function numbering, layouts, and the existing byte streams for inputs that do not use the new features. The Editor search phases and position coordinates provide concrete migrations.

## Structured statements

A Wasm branch names a surrounding control construct by its nesting depth. For a loop, the outer `block` is the exit and the inner `loop` is the back-edge. An `if` inside that loop adds one to the branch depth. Record the exit depth when creating each loop and compute the distance at `break;`. Expression-level blocks always close before the next statement. A bounded chain of nested `if`s expresses `else if`. Each arm opens its lexical scope.

Parse a `for` initializer before compiling the loop. Parse its update into a small separate instruction list while the initializer's bindings are visible. Emit that list after the body and before the back-edge. Branching to the exit skips the update. The initializer's scope ends after the loop. In RV32, inequality uses XOR followed by an unsigned comparison with zero. Consume the full `!==` token before considering the single-character `!` operator.

## Forward calls

Build the callable table before generating any body. Read signatures with the same lexer as the body parser, then scan over body text using braces, comments, and double-quoted strings. Record one edge per directly called typed function. Use an explicit depth-first traversal stack to detect cycles, report a cycle in source names, and return a callee-first order. This traversal covers dead functions too. Graph entries and order are source ordinals. Emission indexes still include the backend's import base.

The streaming RV32 compiler receives all function descriptors before the first body. It allocates one target label per source definition. Each generated call can refer to that label before the address is known. Assembly assigns actual addresses in source order and applies all relative jumps. This preserves backward call placement and avoids buffering every typed body.

## Nominal types and match

An enum has a map from member names to signed 32-bit values. A separate set detects repeated numeric values during declaration. Every enum is a distinct scalar type and occupies the same four bytes as an `i32`. A single temporary holds the scrutinee of an exhaustive `match`. Generated comparisons dispatch to the arms, and a value outside the enum traps. This matters because values passed as raw ABI words or read from world state can be corrupt. Match coverage is checked against the member names in declaration order.

A distinct integer type also keeps the existing four-byte layout. Integer literals are contextual and a bare literal inferred into a local still gives it type `i32`. Addition, subtraction, and comparisons can use two operands of the same distinct type, or a literal and a distinct type. Multiply, divide, remainder, and shift require regular integers. Explicit conversions produce no instructions. A position measured in UTF-16 code units can cross the SDK boundary with `i32(at)`; wrap the SDK's raw result in `Point(...)` to recover its source-level meaning.

## Verification boundaries

1. Compare the linked Wasm and the RV32 instruction bytes of stock Files, Agenda, and Editor to revision `289281c`.
2. Run differential fixtures through both Wasm and the RV32 interpreter, including forward calls and failing programs through both compiler entry points.
3. Measure the Editor frontend in QuickJS using the existing timing harness. Record the environment and comparison revision.
4. Compare enum migration size and Editor replays, then compare the bytes again across the distinct-type migration.

See the [professor's Scope E roadmap](../../PICOCALC-NATIVE-NEXT--a-smaller-rv32-backend-a-module-cache-safety-checks-and-await-for-typed-picocalc-worlds/design-doc/05-scope-e-language-additions.md).
