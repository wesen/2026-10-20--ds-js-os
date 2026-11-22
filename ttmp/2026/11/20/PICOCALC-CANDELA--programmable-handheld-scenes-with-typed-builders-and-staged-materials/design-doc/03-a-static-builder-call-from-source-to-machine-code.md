---
Title: A static builder call from source to machine code
Ticket: PICOCALC-CANDELA
Status: complete
Topics:
    - picocalc
    - compiler
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: apps/typed/candela/fluent-types.typed
      Note: Source-declared mapping to direct functions
    - Path: compiler/typed/typed-wasm.js
      Note: Shared Wasm and RV32 implementation
ExternalSources: []
Summary: An implementation and reproduction guide for an engineer extending the bounded Typed builder surface.
LastUpdated: 2026-11-20T23:50:00-05:00
WhatFor: Understand and reproduce the Candela authoring frontend.
WhenToUse: When developing or reviewing a static builder method, options record or scene fixture.
---

# A static builder call from source to machine code

A scene builder has two different consumers. The author chooses meaningful names such as `shape.sphere` and `at`. The renderer consumes a fixed buffer of descriptors. A third component, the compiler, translates between those representations by calling the same Typed graph operations an author could call by hand. An intern extending this surface should first be able to locate one shape, its returned handle and the direct functions that change its row.

## Reproduce a scene

The public entry is `candelaFluentShared(graph: buffer): i32`. It returns one for success and zero for a short buffer. An adequately sized buffer carries its usual four-byte Typed length prefix followed by at least 303 little-endian 16-bit cells. The graph lives in the caller’s storage. Compiler metadata for a namespace or a method does not occupy any of its rows.

From the repository root, run the following two commands. The assembler selects the production source files. The second command independently compiles and runs the hand, fluent and expanded versions on the Node Wasm engine and a checked host interpreter for emitted RV32 instructions. It writes the receipt to the path you provide.

```sh
python3 picocalc-os/worlds/candela/assemble.py --stage fluent /tmp/fluent.typed
node ttmp/2026/11/20/PICOCALC-CANDELA*/scripts/builders/qualify.mjs /tmp/builders.json
```

## Add a builder member

1. Give the receiver a nominal type, such as `type SphereHandle = distinct i32;`. The wrapper function can convert the graph builder’s raw integer to this type after performing its operation. An invalid handle continues to carry the graph API's negative failure result. The authoring fixture checks it at the scene boundary.
2. Define a direct Typed function whose first parameter has the receiver’s declared type. Normal functions may appear after users of their signature. A namespace member takes its arguments in the order the author supplied.
3. When a method accepts named options, declare a record before the group. Write a binding such as `at(SpherePosition) = fluentAt;`. Record field types, in declaration order, must match the direct target’s trailing parameter types. Field names belong to the record declaration. The target’s parameter names are independent. A literal supplies every field once. An existing value of the options record type may also be passed.
4. Add the binding to an existing `methods SphereHandle` or `namespace shape` declaration. Groups are unique within a source unit. A receiver type must be declared before its method group. A local called `shape` takes precedence over the namespace in member expressions. Group names and field names require ordinary Typed identifiers.
5. Make the target return the type expected by the next link. A shape-changing method returns a sphere handle. A query could return `i32`; subsequent lookup would then use that result type. The implementation registers receiver groups for declared record, enum and distinct types.

The normal graph API takes its buffer explicitly. It also validates geometry, handle ranges and capacities before writing. Method lookup changes neither rule. The fixture deliberately passes `graph` through the chain. A leaked raw `i32` handle should fail to select the sphere’s registered methods, even when its numerical value names a real sphere.

## Read the compiler

`parseDeclarations` collects optional namespace and receiver maps. `scanSignatures` collects the direct target signatures. `checkMembers` resolves all aliases, including unused ones, and reports an incompatible target at its declaration. The maps are absent in a unit without these declarations. They belong to the compilation of that source unit.

`FunctionEmitter.prefix` handles a namespace call when there is no local shadowing it. `postfix` follows selectors on an expression result. `memberCall` looks up the actual function then calls the existing emitter, which supplies type checking, call graph edges and numerical function indices. A receiver value already on the operand stack consumes the first formal slot. Statement paths discard the final result while preserving all effects. The Wasm writer and the native numeric-event writer share this frontend.

`optionArgument` parses a literal in its declared context. If fields arrive in order it emits them as it reads them. Once one arrives out of order, each remaining value goes into a separate scalar local and the final loads follow the declaration order. For a record reference the compiler evaluates the address once and loads its fixed offsets. Taking a field name as a source variable during async rewriting could rename a label and corrupt the call. The async type checker carries the same declarations and leaves syntactic field labels intact.

## Check the controls

The host receipt contains a hash of the entire descriptor and individual material samples at 0, 128 and 256. Review the shared expression edge as well as the hash. A future builder may produce identical geometry and material values with different internal node numbers. The current fixture establishes both exact allocation order and the more fundamental sharing relation.

`frontend-gates.mjs` checks the production C lexical index against the ordinary token path in vendored QuickJS. It also compares the unchanged Editor and Chess world images with the recorded base commit, using the project’s typed Wasm reactor. Compile the small harness from the existing host build, or substitute the corresponding objects from a separate build tree. The fourth command regenerates its report.

```sh
make -C picocalc-os -j4
cc -O2 -std=gnu11 -Ipicocalc-os/third_party/quickjs \
  ttmp/2026/11/20/PICOCALC-LEXICAL-INDEX*/scripts/03-native-qjs.c \
  picocalc-os/port/esp32p4/main/typed_lex_index.c picocalc-os/build/eng/*.o -lm -lpthread -o /tmp/index-qjs
make -C picocalc-os build/typed-world-reactor.wasm
node ttmp/2026/11/20/PICOCALC-CANDELA*/scripts/builders/frontend-gates.mjs \
  /tmp/index-qjs /tmp/fluent.typed picocalc-os/build/typed-world-reactor.wasm /tmp/frontend.json
```

For an additional negative input, change the second assignment in `{x: 100, y: 65, z: 105}` to `x: 65`. Both targets must reject the repeated x. For an order test, replace a constant with a function that appends to a trace. This test exercises semantics a pure numeric scene can hide. The scoped design ends at a call boundary. Giving an arbitrary literal first-class identity or exposing its address would require new storage and lifetime decisions. [Full cross-target receipt](../various/builders/host.json) · [Frontend checks](../various/builders/frontend.json)
