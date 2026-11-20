---
Title: Measuring scanning and token lifetime independently on the PicoCalc
Ticket: PICOCALC-FRONTEND-FACTORIAL
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T21:53:37.588908645-05:00
WhatFor: ""
WhenToUse: ""
---

# Measuring scanning and token lifetime independently on the PicoCalc

The previous physical comparison changed the scanner and the record it returned in one step. Editor compiled faster with the cursor scanner on that board, while its allocator peak grew. Either change could have contributed to either result. This study measures the four combinations in one firmware image and keeps the native code generator, application source, reactor, and compiler limits fixed. A second image tests a parser that reads source spans and requests text when semantic operations need it.

## What the frontend does

The typed compiler accepts a restricted JavaScript syntax and emits function bodies for Wasm or the RV32 backend. For a fragment such as `let gap:i32 = 3;`, the lexer returns one token at a time. The identifier `gap` has kind `id` and occupies the half-open UTF-16 range `[4, 7)`. The parser needs the string `gap` as a key in its local-variable map. It only needs to recognize the semicolon to check the end of the statement.

On the PicoCalc, a cold native compile starts with the application source and a prebuilt ELF reactor, initializes QuickJS, evaluates the compiler and linker, compiles and links the code, copies out the returned ELF, and destroys the realm. Each sample exercises that path with streaming enabled. The native backend receives one emitted function at a time. Reusing one token record applies to the lexer inside each realm. No realm or compiled result persists between samples.

## Four ways to produce the same current token

| Lane | Scanner | Lifetime | Current token data |
| --- | --- | --- | --- |
| `base` | Sticky regex | Fresh record | kind, string value, start |
| `regex_reuse` | Sticky regex | Reused record | kind, string value, start |
| `cursor_fresh` | Cursor over UTF-16 code units | Fresh record | kind, string value, start |
| `cursor_reuse` | Cursor over UTF-16 code units | Reused record | kind, string value, start |

The checked-in baseline compiler pair comes from `40bcf850a5809ef6d839127869faa952596ed157`. The board lab is `dbe26be`. Each candidate keeps the same grammar, parser, and backend. The regex scanner retains the production pattern. The cursor scanner uses the previous study’s lexical categories and character checks. Both scanners write equivalent token data. Fresh lanes construct a new record on every advance. Reuse lanes assign to one record, including after the legacy regex path and at EOF. Keep the baseline’s token field order and assignment expressions wherever the intended change allows it.

A failed cursor scan falls back to the production regex at the original position. This also covers an unusual success: the production sticky pattern can backtrack out of a comment at the end of input and return its first slash as punctuation. Returning an ordinary EOF at the trivia-adjusted position would silently change the accepted token sequence or error column. The diagnostic location is based on the original start of the unconsumed span when no token matches, and on the matched token’s start otherwise. Compare these behaviours directly.

A reused object must never be retained across `next()`. The current parser reads a token’s primitive fields or captures string values before advancing. The lexer differential will check that fresh and reuse variants exhibit the intended record identity on success, fallback, and EOF in addition to comparing their observable token data.

## A fifth parser that reads source spans

Keep the cursor scanner and one record lifetime. Replace the record’s eager string with kind, start and end offsets and keep the source on the lexer. Give the parser operations for kind, literal comparison, and asking for text. A literal check first verifies the span length, then compares against the source at the start offset. For operator precedence, map the punctuation span to the existing table’s canonical operator key without extracting a string. Identifier and type bindings, numeric conversion, JSON string decoding, and messages that include a spelling may request text. Cache the slice only for the current span and invalidate it on advance. If the regular expression is required for a compatibility case, its own temporary match strings can still allocate.

For `let gap:i32 = 3;`, the parser can recognize `let` and each punctuation token from the source. It obtains the identifier to insert a map key, the type name to record its type, and the number text to preserve the existing conversion semantics. This design changes actual parser call sites. An accessor that returned a slice for the original `.value` expression would leave failed keyword tests and punctuation probes materializing text.

The lazy image includes both `base` and `cursor_reuse` so the primary comparison stays within one image. Compare lazy against cursor-reuse to quantify the added representation change. The baseline on both images gives a cross-image stability check, with the two image results kept distinct.

## Validation before trusting a timing

1. Check token data and successive record identities with a test-only hook. Compare kind, value, start, end or consumed offset, and exception class and message for every UTF-16 code unit in context and for deterministic edge cases. Include terminal comments, malformed strings, CR vs LF, Unicode whitespace and surrogate units, integer runs and overlapping operators.
2. Compile valid input through the real Wasm and native frontends. Compare emitted byte arrays and native ELF bytes for Files, Agenda and Editor. Compare exact diagnostic class and message through Wasm and both buffered and streamed native routes on deliberately invalid inputs, including valid prefixes followed by later lexer or parser errors and an error crossing function boundaries.
3. Generate the generic lab’s host oracle from the same compiled reactors bundled in each image. Require all arms to produce identical full linked ELF SHA-256 and sizes from matched source and reactor identities before starting a board run. On each boot require every printed full ELF hash and streamed-functions marker to match the host oracle, the guest smoke results to complete, and the previous firmware to be restored.
4. Run the production limits of 2 MiB and 1.7 s for Files and Agenda and 4 MiB and 6 s for Editor. Peak is the maximum of usable QuickJS allocations outstanding at once. The report also computes headroom under these budgets. Source and reactor allocations owned by C are outside this counter. A faster treatment may justify a measured heap increase inside the current limits.

## Pairing and interpretation

Use the existing generic balanced runner. A block visits every lane once for all three applications. With four lanes, four rotations followed by four reverse rotations give eight blocks per boot and each arm visits each slot twice. Repeat through two boots with validated complete traces. The three-lane lazy run has six blocks per boot. For each application and boot report medians, sample ranges, and within-block differences. Negative differences indicate reduced cost.

For outcome `Y`, compute the scanner effect at both lifetimes and the lifetime effect at both scanners before averaging:

```text
cursor change at fresh = Y(cursor_fresh) - Y(base)
cursor change at reuse = Y(cursor_reuse) - Y(regex_reuse)
reuse change in regex = Y(regex_reuse) - Y(base)
reuse change in cursor = Y(cursor_reuse) - Y(cursor_fresh)
interaction = cursor change at reuse - cursor change at fresh
lazy change = Y(cursor_lazy) - Y(cursor_reuse)
```

Calculate each contrast for both microseconds and bytes in each block. Report sign consistency and exact distributions, since a handful of board boots does not establish a population-wide confidence interval. The interaction states whether the measured scanner contrast changes under reuse. An allocator high-water mark can be set well after parsing, so allocations avoided during tokenization need not cause the peak to decrease. Main effects average the two simple effects even when the interaction makes one treatment materially different.

## Implementation order and review

1. Stage isolated compiler pairs and board trees and pin the lane digests before any board access.
2. Qualify scanner and parser equivalence, then build both images with the same toolchain and production limits.
3. Give image and factory backup identities to the supervisor’s serial owner. Save raw UART logs and structured receipts and verify restored firmware after each run.
4. Recompute the contrasts and trace them back to the per-block values. Publish a newcomer explanation with figures and the exact conditions in which the result holds.

Read the [previous frontend study](../../PICOCALC-FRONTEND-COLD--measure-cold-typed-compiler-frontend-costs-and-compare-a-cursor-lexer-on-picocalc/analysis/01-where-cold-typed-compilation-time-goes-on-picocalc.md) for the two-factor predecessor. The [compiler lab](../../PICOCALC-COMPILER-LAB--measure-cold-compilation-and-test-bounded-compiler-designs-on-the-handheld/index.md) records the original general-purpose physical runner.
