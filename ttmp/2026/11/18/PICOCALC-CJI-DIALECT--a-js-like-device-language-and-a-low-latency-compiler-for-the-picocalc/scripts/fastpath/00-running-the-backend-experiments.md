---
Title: Fast path experiment reproducers
Ticket: PICOCALC-CJI-DIALECT
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Commands for the QuickJS catalog replay, typed emitter checks and Linux WAMR integration diagnostic.
LastUpdated: 2026-11-18T16:45:00-05:00
WhatFor: Reproduce the fast path experiments.
WhenToUse: Run when reviewing a fast-path or typed compiler change.
---

# Fast path experiments

Run from the repository root.

```sh
ticket=$(printf '%s\n' ttmp/2026/11/18/*CJI-DIALECT--*)
python3 "$ticket/scripts/fastpath/03-run-quickjs.py" \
  --output "$ticket/various/fastpath/quickjs-host.json"
node "$ticket/scripts/fastpath/05-check-typed-wasm.mjs" \
  > "$ticket/various/fastpath/typed-wasm.json"
```

The QuickJS run requires a Linux x86-64 C compiler, Make, Python 3.10 or newer and Pillow for the About screenshot comparison. It rebuilds vendored engine objects, and then builds source and bytecode simulators from the same objects under temporary directories. Simulations use an isolated seed filesystem and a fixed clock. `--compile-only` skips simulator linking and event replays. For retaining scratch artifacts, use an empty directory with `--work-dir`. See the [analysis](../../analysis/03-fast-paths.md) and [diary](../../reference/04-fast-compiler-alternatives-investigation-diary.md) for the phase boundaries and normalization of reported metrics.

The typed test requires Node with its built-in WebAssembly engine. `04-typed-wasm.js` is a global script without Node dependencies. Evaluate it in QuickJS and call `compileTyped(source)` to retrieve the generated Wasm bytes as a `Uint8Array`. The separate Node test compiles `scroll.typed`, checks it against the compositor source and exercises changes to the number semantics. The output is a Wasm leaf function module and has no PicoCalc world ABI exports.


With Clang 18, the repository's existing `build/wasm-toolchain` and the ordinary PicoCalc host simulator, run the real WAMR event test.

```sh
node "$ticket/scripts/fastpath/07-check-wasm-world.mjs" \
  picocalc-os/build/picocalc-host > "$ticket/various/fastpath/wasm-world.json"
```

The optional second argument selects an existing unpacked WASI toolchain root. The runner writes generated binaries and temporary world files beneath the system temporary directory. It verifies the standalone compiler output against `typed-wasm.json`, then checks the copied function body and runs the repacked world through a real ask and reply. Its unchanged placeholder control makes an accidental test of the linked C function observable. The C code provides only the diagnostic lifecycle and JSON adapter.
