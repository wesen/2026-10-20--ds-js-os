---
Title: Independent host qualification diary
Ticket: PICOCALC-NATIVE-PROMOTION
Status: active
Topics:
    - picocalc
    - compiler
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-NATIVE-PROMOTION--qualify-late-text-lowering-and-streaming-frameless-leaves-on-the-playable-picocalc/scripts/host/qualify.mjs
      Note: Replays the locked oracle and checks both native compilation modes and both backend linkers.
    - Path: repo://ttmp/2026/11/20/PICOCALC-NATIVE-PROMOTION--qualify-late-text-lowering-and-streaming-frameless-leaves-on-the-playable-picocalc/scripts/host/edge-cases.mjs
      Note: Tests register lifetimes, fallback frames and UTF-16 trap ordering with full memory comparison.
    - Path: repo://ttmp/2026/11/20/PICOCALC-NATIVE-PROMOTION--qualify-late-text-lowering-and-streaming-frameless-leaves-on-the-playable-picocalc/scripts/host/app-suites.py
      Note: Runs the normal app suites and Chess engine and event oracles with the local CJI model.
ExternalSources: []
Summary: Released inputs and independent numerical oracles qualify the promoted compiler on the host.
LastUpdated: 2026-11-20T19:59:36-05:00
WhatFor: Inspect the host evidence and repeat it against a candidate compiler.
WhenToUse: Before comparing the playable P4 firmware with the baseline.
---

# Independent host qualification diary

## Step 1. Pin the control and identify the production entry points

I used code from commit `5f77855` for the stock compiler and the existing playable firmware for the app inputs. I exercised the compiler as a consumer would by calling the public world compilers, accepting the default RV32 mode, then explicitly requesting buffered functions. The promoted sources match `8052db7`. The old wave’s output hashes and frozen numerical oracle provided independent expectations for the candidate.

### Prompt context

The director delegated the following task verbatim.

> Independent host qualification for promotion of late text lowering + streaming frameless leaves, baseline 5f77855. New ticket ttmp/2026/11/20/PICOCALC-NATIVE-PROMOTION--qualify-late-text-lowering-and-streaming-frameless-leaves-on-the-playable-picocalc. Create durable scripts and compact evidence under scripts/host and various/host and investigation diary reference/04-host-qualification-diary.md. Test released pathway with new sources once ready: compare combined candidate images to prior study where appropriate, heldout 1603 cases, traps/side effects UTF-16/edge cases, spills and calls, full worlds/link and retained Wasm (incl streaming/nonstream). Preserve original study scripts and significant regression cases. Run relevant normal existing host app suites, coordinate with compiler author on failures. No device. Commit your files and report; independent work only, no external clients.

I interpreted this as a qualification of the independently authored production implementation. Historical source and firmware were read locally. All physical qualification remains with the device operator.

### What I did and why

I used the pinned release SHA-256 `134f3a249589a860a1a85311e361498a9e6ba4f14bef34ca2397ea26ca86ebc1`. The prior ledger located the exact Editor and Chess source/ELF bytes. I independently found the Agenda and Files sources and reactors byte-for-byte in that release. The Agenda C caller inserts one newline between reminder and entry sources. The host reproduction does the same. Candidate and stock use the identical desktop Wasm reactor for each comparison, whose identity is recorded in the receipt.

### What worked, and what needed attention

The complete default and buffered native links matched for all four apps. Both the unlinked images and final ELF digests matched the prerelease late/frameless experiment for Editor and Chess. The maintained Wasm world linkers returned byte-identical, validated modules to stock across all four apps. Stored ELF file size stayed fixed. [World evidence](../various/host/combined.json)

| Released source | Candidate instruction bytes | Linked ELF bytes | Linked desktop Wasm bytes |
|---|---:|---:|---:|
| Editor | 75,812 | 242,124 | 92,162 |
| Chess | 180,860 | 274,892 | 215,498 |
| Agenda | 15,304 | 66,364 | 67,429 |
| Files | 2,980 | 24,424 | 49,089 |

The suite's first sandboxed `node qualify.mjs` invocation stopped at `spawnSync git EPERM` when reading the pinned baseline. I reran it with the approved local subprocess permission. The underlying data and compiler options stayed the same.

### Review and follow-up

Inspect the asset hashes, compiler-input hashes and the equality assertions in the [qualification runner](../scripts/host/qualify.mjs). The earlier combined-arm receipt gives an exact comparison only for the two worlds it examined. Physical timing, firmware boot and keyboard interactions require their own measurements.

## Step 2. Exercise results, trap timing, memory effects and frame fallback

I compared return values, traps and observable memory. An emitted program can produce the same final integer while changing which writes precede a trap. For register-only code, an argument can remain live across a division check or an ordinary call. The directed cases exercise both failure modes.

### Prompt context

See Step 1. The director confirmed that production sources were ready before I qualified the candidate.

### What I did and why

For each mode I ran the frozen telemetry oracle, pinning all five input files and using the RV32 interpreter from the prior combined-arm study. In a temporary copy I supplied the production-compiled programs and interpreter to the existing case generator. All source-level expected-value and byte-array comparisons stayed intact. I separately checked 98 directed calls against named expected results and independently constructed 4,096-byte memory images. I used Wasm, stock RV32 and both candidate RV32 modes for those calls.

The directed fixture includes a destination check before a right-hand-side effect, a right-hand read that can trap after changing a marker, a header alias whose length shrinks in a callee, literal writes of 0/1/7/8/511/1,022 UTF-16 units, both halves of a surrogate pair and endpoint integer indices. The scalar cases cover divide overflow and zero divisors, signed remainder, argument reuse, non-leaf calls, local mutation and a deep eight-argument expression that spills. I checked for a frame allocation in selected fallback functions and for frameless entry in three eligible scalar functions. Two rejections retain the stock diagnostics, at 1,023 literal units and nine native arguments.

### What worked and what I learned

Both modes passed all 1,603 telemetry cases, including 101 expected traps. Each emitted the same 2,332-byte image, SHA-256 `16f1275848fd5990d72d59ef0d4c71b3b329b59066446d8368b6e9ecc7e310e9`, and reproduced the 135,475 modeled instructions and ordered result digest of the independent earlier study. The 98 directed calls included 44 expected traps. Full memory equality held after every call. Both modes also passed the two diagnostic comparisons. [Directed fixture](../scripts/host/edge-cases.mjs) · [Oracle results](../various/host/combined.json)

### What warrants a second pair of eyes

The original frozen oracle predates an RV32 immediate instruction used by the combined compiler. The runner uses the same fuller instruction model as the prior combined trial and checks its ordered instruction-count digest as well as result and memory. The physical core exercises a different runtime boundary.

## Step 3. Replay normal app tests and the complete Chess host trace

I ran `make -C picocalc-os test-apps` plus the established two-target Chess engine and generic UI event oracles. The generic UI trace drives game state through key inputs, search slices and async wake recovery. Its generic Chess source differs from the complete playable 3D Chess source checked in Step 1.

### Prompt context

See Step 1. This step covers host app behavior and distinguishes the generic UI harness from a playable-firmware run.

### What worked

All 65 normal tests passed across Editor, Calculator, Agenda, system apps and the production RV32 compiler tests. The engine compared 6,981 words across 13 chess positions. The generic UI matched all 98 events between Wasm and RV32, with 18 screens, 78 search slices and the expected reply `Last b8-c6   Depth 3   Nodes 1600   Eval 12`. The stale wake and failed wake scenarios also passed. [App and Chess receipts](../various/host/app-suites.json)

### What did not work, and how I recovered

The original engine and world commands first reported `spawnSync …/riscv32-esp-elf-gcc EPERM` in the sandbox. The approved local toolchain execution completed the engine run. The unmodified world driver with the contemporary generic reactor reported `rv32emu: it links to __floatsidf, which picocalc-os does not give a module`. The reactor named by the older reproduction recipe instead failed earlier, with `SyntaxError: invalid RV32 reactor slot header`. I checked the current release reactor’s dynamic symbols and registered `strcmp` and `__floatsidf` in a temporary copy of the historical host driver's resolver. The host C library and math helper already implement these two imports. The original event oracle then ran to completion with the release’s generic reactor. The production compiler, firmware, test events and historical scripts received no changes from this recovery. An interim report collector expected four app suites and raised `AssertionError` when the compiler author added a fifth. It now records the passing count by suite name.

### Reproduction and review instructions

From the repository root, build the desktop Wasm reactors with the normal PicoCalc Makefile. Provide the 2026-11-20 ordinary release binary, the local ESP RISC-V GCC and the CJI RV32 emulator. Its sibling host runtime objects must be available for the Chess drivers. Use an empty output directory of your choice.

```sh
ticket=$(dirname "$(git ls-files 'ttmp/2026/11/20/PICOCALC-NATIVE-PROMOTION--*/reference/04-host-qualification-diary.md')")
host="$ticket/../scripts/host"
out=$(mktemp -d /tmp/native-promotion-host.XXXXXX)
release=/tmp/picocalc-release-download/picocalc-os-p4.bin
gcc=/home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20241119/riscv32-esp-elf/bin/riscv32-esp-elf-gcc
make -C picocalc-os typed-world-reactor build/agenda-reactor.wasm build/files-reactor.wasm
node "$host/qualify.mjs" "$release" "$out/combined.json"
python3 "$host/app-suites.py" "$gcc" cji/build/rv32/rv32emu "$release" "$out/app-suites.json"
cmp "$out/combined.json" "$ticket/../various/host/combined.json"
cmp "$out/app-suites.json" "$ticket/../various/host/app-suites.json"
```

The [app suite runner](../scripts/host/app-suites.py) records the two extra host-service registrations with the trace digest. Review those registrations along with the generic Chess fixture before interpreting this event run as evidence about the playable 3D UI.
