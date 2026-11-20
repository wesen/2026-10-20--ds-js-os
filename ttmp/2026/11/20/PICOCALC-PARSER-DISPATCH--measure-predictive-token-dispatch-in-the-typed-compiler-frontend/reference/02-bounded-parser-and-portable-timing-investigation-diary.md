---
Title: Bounded parser and portable timing investigation diary
Ticket: PICOCALC-PARSER-DISPATCH
Status: active
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-PARSER-DISPATCH--measure-predictive-token-dispatch-in-the-typed-compiler-frontend/scripts/05-stage-bounded-dispatch.py
      Note: Construct the parser study arms
    - Path: repo://ttmp/2026/11/20/PICOCALC-PARSER-DISPATCH--measure-predictive-token-dispatch-in-the-typed-compiler-frontend/scripts/11-run-portable-history.sh
      Note: Repeat historical behavior tests with both provider settings
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T01:27:27.83147745-05:00
WhatFor: ""
WhenToUse: ""
---

# Bounded parser and portable timing investigation diary

## Goal

<!-- What is the purpose of this reference document? -->

## Context

<!-- Provide background context needed to use this reference -->

## Quick Reference

<!-- Provide copy/paste-ready content, API contracts, or quick-look tables -->

## Usage Examples

<!-- Show how to use this reference in practice -->

## Related

<!-- Link to related documents or resources -->

## Step 1. Recover the original elapsed-time benchmark

The existing prefix-dispatch study measured a small reduction in JavaScript parser work, but the professor had specified an absolute elapsed-wall threshold. I restored the separate C and JavaScript benchmark, recovered the pre-E Editor in historical source-list order, and compiled the original host C against the local vendored QuickJS object files.

### Prompt context

The [user’s E and G request](01-parser-dispatch-experiment-diary.md) establishes the qualification effort. The parent agent assigned the pre-E Editor, the original frontend-only phase and exact 31.4 ms threshold, an implementation with a pure JavaScript path, and a comparison of elapsed and process CPU time. I interpreted this as an obligation to demonstrate the gate using the exact unmodified elapsed clock and driver while making the optional C dependency visible.

### What I did

I built C binaries for the original clock, a process CPU variant, and the same two clock variants with only C token-index registration added. I kept the original benchmark JS in all four arms. The stage runner also archives the two source digests, QuickJS object digests, reactor digest, and the archived Editor source digest. I compared `289281c`, language milestone `c5e2839`, and the source-span/prepass composition. I wrote a separate timing runner to store complete original stdout per process and startup load prior to each run.

### Why

Changing the clock to rule out host noise also changes the meaning of the gate. Process CPU is useful for diagnosing preemption but cannot establish a wall requirement. Running identical input and compilation through the original clock and comparing lanes in an interleaved order reduces the effect of machine drift on the conclusion.

### What worked

The unchanged control reached 29.63–30.84 ms in six early no-binding sessions. The same sessions produced 34.09–35.06 ms for the exact source-span/prepass composition with no native registration. In six matched quiet sessions with registration, that composition reached 20.56–22.00 ms. This exposed which dependency was required to pass before optimizing the fallback.

### What didn't work

An initial CPU-6 run started while several local jobs were active. The historical compiler reported a wall median of 234.54 ms. The process CPU run, in another launch, reported 99.96 ms. The first loaded runs of indexed parser changes reached 31.93 ms at best and did not establish a pass. A five-session loaded trial of the composed direct arm had a 35.00 ms median of session medians. The direct arm had only two individual session medians under the 31.4 ms gate in that trial. I moved to CPU 7, used a two-reading startup criterion rather than waiting after a poor result, alternated launch order, and retained all runs from the new blocks.

### What I learned

“Frontend-only” here includes Wasm body framing. It excludes the separate body-to-RV32 and linking phases. The unchanged JS driver obtains SDK import metadata from the evaluated compiler or its existing source-text path. It warms up one call and takes 15 wall observations for every phase.

### What was tricky to build

The native C registration takes place after `JS_NewContext`. It does not itself establish that the compiler will use the provider. The optional arm requires both the original producer source and the JavaScript cursor that consumes its row and symbol buffers. The pure JS arm uses the same compiler files under an embedder that never registers the provider.

### What warrants a second pair of eyes

Check the exact gate phase line and source assembly. The reproduction command should invoke the unchanged `professor-wall` host with the original JS driver. Check that a reproduction has enough CPU access for the absolute threshold.

### What should be done in the future

Preserve host and device qualification as separate evidence. A new absolute host threshold must state source input, clock, runtime objects, workload boundary, and launch conditions.

### Code review instructions

Start at [stage script 09](../scripts/09-stage-bounded-lanes.sh), [timing script 10](../scripts/10-time-professor-bounded.sh), [C registration patch](../sources/02-professor-native-binding.patch) and [input digests](../various/professor-bounded/inputs.sha256).

### Technical details

The historical input has 70,857 UTF-16 code units, digest `f37f60f3b0c646cd35f13c41bc893a136732ebe769e328cfb906b0fe7531a6ed`. The driver reports 16,792 tokens from its tokenizer phase. The timing runner takes the median exactly as computed by the benchmark and keeps each process’s original min and max. Interleaving is at the process level.

## Step 2. Reduce ordinary parser work and add the compact fallback

The composed compiler already preserved source ranges and graph behavior. I staged smaller changes in the typed lexer and ordinary function emitter to reduce repeated token comparisons, match captures, and body copies. The portable version combined the successful changes under a single exact patch.

### Prompt context

See Step 1. The parent asked me to retain an exact patch against the matched span and prepass sources and to show that the stock professor host could meet the gate without the C binding. Code and first wall receipt are in `73f8aee`, “Stage the bounded portable parser and pass the historical wall gate.”

### What I did

I staged fixed operator lookup, statement switch dispatch, fast scalar-local reads, direct literal lookahead, and one-pass Wasm function framing. I tested a table-driven ASCII cursor and a compact regexp. For the indexed path I added a sequential whole-source borrowed cursor. I kept a bounded seek implementation for other cursors. The final version replaced named token captures with one capture and classified token values from their leading code unit. The existing grammar and fallback boundary still apply.

### Why

One failed `accept` still enters a method and reads token state, which explains why the smaller prefix experiment watched that path. Several grammar decisions need only the current spelling. A one-capture regular expression preserves the backtracking behavior of the original scanner for comments and whitespace, including cases where an end-of-input comment becomes a tokenized slash. The ASCII table experiment remained isolated, since the portable compact regexp preserved more of the original lexical behavior through its construction.

### What worked

At an intermediate checkpoint the compact-only peer reported medians of 25.85, 25.88, 26.24 and 26.36 ms. The ASCII table peer reached 24.44, 24.46, 25.02 and 25.82 ms in that exploratory block. The composed direct compiler with the old fallback still missed in all four of those no-binding sessions. The completed portable arm passed in all six qualifying no-binding sessions at **24.99, 24.89, 25.25, 25.34, 25.68 and 25.55 ms**. The matched composed control medians were **34.75, 34.57, 34.77, 35.29, 35.13 and 35.42 ms**. The actual patch applies with zero fuzz and matches the generated file’s SHA-256.

### What didn't work

While building the table experiment, an embedded source fragment broke the Python staging script with `SyntaxError: invalid syntax`. I moved the JavaScript into a separate included template. A first direct-method rewrite generated an expression beginning `this.(`, which failed with `Unexpected token '('`. I matched the receiver as a unit, including the optional `this.`, and confirmed the staged compiler parses. During artifact creation a zsh command attempted to assign `status` and returned `zsh: read-only variable: status`. I used a dedicated `dispatch_diff_rc` variable for the patch operation.

### What I learned

Reduced method-call overhead helps under QuickJS, but the native source path had already solved much of the tokenizer cost. The composed control depended on that producer for the historic no-binding gate. Changing the JavaScript fallback moved the stock host across the threshold while leaving native indexing available.

### What was tricky to build

Retained async cursor tokens must preserve object identity across advances. Only the parser’s private, lookahead-style cursors borrow one token object. The generic indexed algorithm still handles a caller that supplies arbitrary seek offsets, which includes positions in trivia and inside tokens. The whole-source fast cursor is installed only on full sequential borrowed lexers. For scalar-local expressions the follow-on punctuation may change the grammar production. The fast read leaves a `(` call to the established expression and diagnostic logic.

### What warrants a second pair of eyes

Check the sites that retain token state across another read, the sticky regular expression’s final comment and maximum-match behavior, and the null-prototype operator table on names such as `constructor`. Review early parser paths where a token may represent a field or a call before the fast read chooses a local.

### What should be done in the future

Physical integration timing belongs to the main qualification. Keep staged parser and source-span artifacts so the host pass can be reproduced independently of the board firmware packaging.

### Code review instructions

Inspect [the stage generator](../scripts/05-stage-bounded-dispatch.py), [the indexed cursor](../scripts/07-borrowed-indexed-advance.js.inc), [the exact patch](../sources/03-parser-and-portable-fallback.patch), and [the original wall receipt](../various/professor-bounded/portable-reference-wall.jsonl). The [analysis](../analysis/01-qualifying-the-portable-typed-frontend-on-the-historical-editor.md) provides the complete three-command reproduction.

### Technical details

The composed `typed-wasm.js` digest was `f5d2ea51472a4616ebea62dee54ae8f60e1dcae8e9908c08c043f016ebb024d5` before the patch and `d6dc04692d29596a43b6c15414745023aaa8fa4280353a434b8820e65dab9a0b` after. With the optional C registration, the final portable wall session medians were 18.42, 19.23 and 28.62 ms. The separate process CPU arm gave portable session medians of 34.42, 34.94, and 35.22 ms. It ran later and has no role in the absolute elapsed-clock pass.

## Step 3. Verify generated bytes and historical runtime behavior

I reran the shared compiler oracle with the final portable arm and compared historical runtime test receipts to their unoptimized reference. This checks the same lowering through native-index and JavaScript-only entry points.

### Prompt context

See Step 1. The parent’s final receipt request covered both reference and native bindings, along with exact generated outputs and the genuine unmodified host invocation.

### What I did

I ran [oracle 08](../scripts/08-check-bounded-dispatch.mjs) with the local QJS index subprocess and the same Wasm and ELF reactors. I ran [history runner 11](../scripts/11-run-portable-history.sh) with the historical tree, local QuickJS helper, ESP32 P4 cross-compiler and CJI RV32 emulator. The history runner executes the original three test scripts under two provider conditions and compares stdout to the historical reference.

### Why

Digest agreement tests backend compatibility on the exact Editor, while negative tests catch changes in error ordering and diagnostics. Retaining source ranges and borrowing token objects introduce separate correctness risks. Testing start and end offsets independently of full compilation exercises offsets and trivia that ordinary valid programs rarely expose.

### What worked

Thirteen lanes matched across seven positives, six graph and source-range cases, and 35 diagnostic/adversarial inputs, including 34 genuine rejects. The three lexer variants agreed on 6,151 bounded and seek cases each. Both composed variants also linked the full G4 ELF in Node without a native provider. The historical E, continuation and Editor tests matched byte for byte under the JavaScript reference path and actual native index provider. The G4 Wasm, RV32 and ELF identities and 70-field layout are recorded in the [parity receipt](../various/professor-bounded/dispatch-parity.jsonl).

### What didn't work

No mismatch occurred in the final runs.

### What I learned

The no-binding path qualifies with both the original host benchmark and the full G4 compiler. The C registration is optional for that host conclusion. Signal from the benchmark applies to function processing on the pre-E input. It gives no direct count of savings from asynchronous rewriting on a handheld Editor build.

### What was tricky to build

The provider-enabled Node test communicates with the native C helper. That process must start successfully for the provider arm to test actual native rows. The Node fallback check uses a separate VM context with no provider and compares emitted ELF bytes.

### What warrants a second pair of eyes

Keep the historical suite’s input tree pinned. In the generated-byte comparison, use the same linker reactors for all lanes. Verify the driver’s frontend label on the original elapsed-clock invocation before interpreting timing.

### What should be done in the future

Link the published educational note and retain the replay commands. The functional and timing evidence can then be regenerated together.

### Code review instructions

Review [parity oracle 08](../scripts/08-check-bounded-dispatch.mjs) and [history runner 11](../scripts/11-run-portable-history.sh). Pass the baseline and candidate reactors from the same qualification run. The [historical receipt summary](../various/professor-bounded/portable-history.jsonl) links the corresponding [E](../various/professor-bounded/language-e.json), [continuation](../various/professor-bounded/continuation-g.txt) and [Editor](../various/professor-bounded/editor-g.jsonl) receipt files.

### Technical details

The parity oracle snapshots token value, kind, start and end after each advance, and compares error type and message if advancing fails. Its full-Editor ELF path runs in a clean VM. The history binary comparison uses the actual RV32 emulator for the Editor behaviors. The host work accessed no serial device.
