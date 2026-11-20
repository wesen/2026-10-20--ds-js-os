---
Title: Testing the eager cursor scanner with the complete async Editor
Ticket: PICOCALC-LANGUAGE-E
Status: active
Topics:
    - picocalc
    - native
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/19/PICOCALC-LANGUAGE-E--control-flow-forward-calls-enums-and-distinct-integers/scripts/10-stage-eager-cursor.py
      Note: Historical scanner lineage and bounded token adaptation
    - Path: repo://ttmp/2026/11/19/PICOCALC-LANGUAGE-E--control-flow-forward-calls-enums-and-distinct-integers/various/eager-cursor/linked-cpu.jsonl
      Note: Linked native compiler CPU time
    - Path: repo://ttmp/2026/11/19/PICOCALC-LANGUAGE-E--control-flow-forward-calls-enums-and-distinct-integers/various/eager-cursor/parity.json
      Note: Cross-engine lexical and emitted byte parity
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T00:13:18.258623335-05:00
WhatFor: ""
WhenToUse: ""
---
# Testing the eager cursor scanner with the complete async Editor

The earlier factorial study measured a 307 ms median saving on P4 Editor compiles when the lexer moved from a sticky regular expression with fresh token objects to an eager cursor with a reused token object. That result used the synchronous compiler and application. This experiment carries the same scanner into the final G4 compiler and tests what it can recover after adding async Open and Find. The compiler and Editor source are pinned to `2e4fee1`. The exact pre-G comparison is `1357545`.

## Porting the token lifetime

The eager cursor scans code units, classifies a token and fills one object with its spelling, kind and original position. An ordinary parser checks or copies those properties before asking for the next token. The async frontend sometimes collects a list of tokens before type-checking an expression or a statement. Retaining the current mutable object in that list would make every entry refer to the last token scanned. The adapted `tokensFrom` copies the fields and the end offset into each retained token. It still uses the same parser and unmodified source coordinates when reporting errors.

The cursor adds `!==` to the studied punctuation scan. The remaining grammar comes from the original frontend. The lexer continues to honor seeks and bounded views of source text. This distinction matters when a range ends inside an identifier, a quoted value or a comment. In G4 the regex matches against the full source and then checks whether the token fits the requested range. The fast path uses the same test and defers to the original regex if it reaches an ambiguous boundary. For the pre-G control the fast path scans the same truncated view as that revision's regex. Both treatments retain the original regex fallback for cases such as a terminal comment whose slashes the legacy pattern can reconsider as punctuation.

## Evidence from the host

The stock and cursor versions of each revision produced identical Editor raw RV32 bytes, linked native ELF and linked Wasm. The G4 comparison also matched the generated async source, continuation layout, record metadata, signatures and import relocations. In Node and vendored QuickJS, 69,643 full-source token cases, 6,355 bounded or seek cases, and 323 ordinary compiler cases matched the stock traces. The ordinary cases compare emitted bytes or exact diagnostics through Wasm, streamed RV32 and buffered RV32. The cursor also passed the language differential suite, the 29-delivery continuation fixture in each target and mode, and all five real Editor interleaving cases.

Each timing block ran nine compilations after a warmup on logical CPU 6 of the same Intel Core i7-1165G7. The clock measures process CPU time around the ordinary `compileTypedWorldRv32` entry with a shared reactor ELF. QuickJS context creation and compiler script evaluation occurred before that interval. Pre-G and G4 each used their exact Editor source. Within each revision, only the scanner and its token lifetime adaptation changed during staging.

| Source and treatment | Initial linked CPU medians | Full reproduction medians |
| --- | ---: | ---: |
| Pre-G with regex | 64.65 / 69.44 ms | 63.44 / 63.44 ms |
| Pre-G with cursor | 57.17 / 57.55 ms | 60.15 / 58.43 ms |
| G4 with regex | 83.71 / 87.16 ms | 87.25 / 98.39 ms |
| G4 with cursor | 80.96 / 80.54 ms | 82.56 / 91.15 ms |

The cursor saved 2.75–7.24 ms across the paired G4 blocks. Its fastest linked result was still about 16% above the slowest unmodified pre-G baseline. On this host the cursor does not reach the 10% qualification target. The earlier P4 result makes a device comparison plausible, and these host timings do not establish how much time the scanner could save on P4 G4. In a separate 4 MiB host QuickJS allocation run, the raw RV32 compile peaked at 2,801,888 bytes for the regex and 2,803,576 bytes for the cursor. Both produced an 89,168-byte program with 70 state fields.

## Reproducing the staged candidate

From the repository root, run the staging command below. It verifies the historical cursor's SHA-256 and writes both compiler pins and their treatments to an external directory. The G4 cursor treatment changes two input files, `typed-wasm.js` and `typed-async.js`. Copy those into a detached `2e4fee1` firmware checkout to build a device comparison. The stage manifest records the hashes of all compiler inputs and sources. Production compiler files were outside the experiment.

```sh
lanes=$(mktemp -d)
python3 ttmp/2026/11/19/PICOCALC-LANGUAGE-E--*/scripts/10-stage-eager-cursor.py "$lanes"
```

The complete host runner accepts a receipt directory, an existing typed-world reactor ELF, the P4 cross-compiler and CJI RV32 interpreter paths, and an optional logical CPU. The existing `build/picocalc-host` and `typed-world-reactor` make targets provide QuickJS objects and the Wasm reactor.

```sh
sh ttmp/2026/11/19/PICOCALC-LANGUAGE-E--*/scripts/12-run-eager-cursor-experiment.sh \
  /tmp/cursor-evidence /path/to/typed-world-reactor.elf /path/to/riscv32-esp-elf-gcc /path/to/rv32emu 6
```

The implementation lineage is the [factorial scanner study](../../PICOCALC-FRONTEND-FACTORIAL--separate-scanning-token-allocation-and-lazy-text-on-the-picocalc/analysis/01-what-made-tokenization-faster-on-the-handheld.md). Raw timing and fixture evidence are in [the cursor receipt directory](../various/eager-cursor/).
