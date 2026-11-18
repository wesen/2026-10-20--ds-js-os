---
Title: Catalog semantics investigation diary
Ticket: PICOCALC-CJI-DIALECT
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Manifest-wide AST audit, simulator behavior, and native-compiled Agenda and Files function checks."
LastUpdated: 2026-11-18T16:16:11.91473777-05:00
WhatFor: "Review the evidence behind the language decisions."
WhenToUse: "Before changing catalog semantics or using its test receipts."
---

# Catalog semantics investigation diary

## Step 1 — Census of the 22 manifest worlds and prelude

I parsed each manifest-listed JavaScript file and the prelude with Acorn and extracted syntax counts and representative use sites. The separation made it possible to see both the small apparent reach of direct JSON calls in app code and the prelude's JSON role in every world's lifecycle.

### Prompt Context

**User prompt (verbatim)** See [architecture diary, Step 1](01-architecture-and-board-investigation-diary.md#step-1--change-the-design-question-and-define-the-comparisons).

**Assistant interpretation** Ground the redesigned language in the real catalog, especially semantics that complicate lowering and can be synthesized or replaced.

**Inferred user intent** Give an intern the evidence to recognize an app behavior that a lighter compiler must preserve and the freedom to redesign the language elsewhere.

### What I did

- Read `picocalc-os/js/system.json`, `picocalc-os/js/prelude.js`, and the QuickJS/native bridge and kernel dispatch.
- Added `scripts/catalog/audit.cjs`, a per-world TSV, and optional source line/column output from the audit.
- Classified actual receiver schemas, reference identity, promise suspension, payload presence and Loader/Sandbox source handling by tracing call sites.

### Why

A regex or tally would conflate array indexing with dynamic record keys and mark the common loose null idiom as general equality. An Acorn traversal and lexical binding resolution gave us a reusable census and exact code to inspect.

### What worked

All 23 inputs parsed under Node 24.18.0 and Acorn 8.15.0. All 28 loose comparisons across both populations are missing-value checks. The 14 general collection constructors in the 22 worlds use strings. Prelude uses a numeric ID cache and an identity cycle set. The sole dynamic-evaluation call lives inside Sandbox.

### What didn't work

`node -p 'require.resolve("acorn-walk")'` returned `Error: Cannot find module 'acorn-walk'`. `node -p 'require.resolve("eslint-scope")'` returned `Error: Cannot find module 'eslint-scope'`. The script uses Acorn plus a local ESTree walk and a scope pass.

### What I learned

The event, scheduler and JSON contracts are larger than direct call counts. Kept syntax counts distinct from native ownership and scheduling as well as from user-loaded code.

### What was tricky to build

The computed member count includes integer indices and literal keys. Lexical capture records enclosing local references but leaves runtime allocation and escape as separate analyses. Some repeated method occurrences on a source line are separate AST nodes. The optional line/column output identifies those.

### What warrants a second pair of eyes

Treat the manifest AST as a bound on this revision's syntax. Check whether a future package or stored app requires module semantics or dynamic evaluation outside the prelude and Sandbox. Verify callback capture counts before deriving code generation decisions.

### What should be done in the future

Re-run the census when the app catalog changes. Use profile data to rank execution costs within the high-occurrence groups.

### Code review instructions

Start at [the catalog report](../analysis/02-catalog-contracts.md), generate the TSV with `node scripts/catalog/audit.cjs picocalc-os/js` using the ticket-relative script path, and inspect `--positions` for exact sites.

### Technical details

The audit counts intersection categories independently, so computed mutations are also computed accesses and null comparisons are loose equality occurrences. Direct JSON and event counts use callee spelling. They omit indirect bridge and wrapper calls.

## Step 2 — Establish quick host oracles and stage source simplifications

I ran the existing app and kernel test suites and added scoped checks using the actual QuickJS host binary. The new checks compare source behaviors at real message and persistence boundaries. They cover absent versus explicit null, falsy preservation across JSON, asynchronous reply timing, file capability aliasing and revocation, and Sandbox completion, persistent globals and errors.

### Prompt Context

**User prompt** See Step 1.

**Assistant interpretation** Validate selected simplifications on real journeys and state the evidence limitations.

**Inferred user intent** A migration must preserve the apps' useful outcomes and their scheduler/capability boundaries.

### What I did

- Ran `make -C picocalc-os test-apps test-agent test-fs test-clock test-sys`. All requested targets in this command passed. A normalized receipt records suite counts and offline Agent flows.
- Used the catalog simulator for Files/Editor file writes, Agenda task and reminder persistence, and Calc scientific history persistence.
- Staged exact source rewrites in a temporary copy. All 28 loose comparisons use a missing predicate, all ten standard maps use string tables, three sets use string sets, and Agenda sorts and deduplicates dates. Files orders Boolean directory flags explicitly.
- Ran 113 existing Node logic cases and the same twelve host outcomes through the staged catalog. Ran six focused native Wasm checks under the host kernel.

### Why

App-level oracles prove that the proposed simplifications encode useful cases under the current runtime. Codec, capability and continuation checks need a simulator with the kernel in the loop.

### What worked

The baseline and rewritten sources each passed all twelve host checks. The staged catalog passed 113 Node cases. The actual kernel's Wasm bridge passed six wire assertions. The offline Agent integration ran both provider envelope modes and persisted the approved note before continuation.

### What didn't work

- The first `python3 scripts/catalog/host-oracle.py` runs failed with an `AssertionError` for Editor content (the editor continued the Markdown list prefix), then for Agenda (the short date 10-20 means next October 20 from October 22). The Calc receipt lookup then raised `StopIteration`, because the host stores the record at `records/w/calc`. Corrected the baseline assertions against the current source and exact output. The strengthened Agenda test now also checks the persisted reminder key.
- `node --test --test-reporter=tap` gave a summary of seven test files. `--test-isolation=none` counted 113 individual cases.
- The broad `make -C picocalc-os test-apps test-agent test-fs test-clock test-sys test-native` run reached the native process tests and printed `test_a_driver_in_cpp (__main__.ProcessWorldTests.test_a_driver_in_cpp) ... ERROR`, followed by multiple other process errors. I stopped that invocation with SIGINT (status 130) and used the passing targeted Wasm suite as wire evidence. The native process runtime was outside the tested dialect paths.

### What I learned

General map behavior is removable from the counted world code. Captured cell identity and optional record fields still have observable effects. Agenda's reminder check needs file or store evidence, since the existence of a captured display frame only verifies the capture.

### What was tricky to build

A present null, an omitted object member, a no-payload envelope and false/zero/empty text need separate assertions. Sending the same delegated file twice also tests wrapper identity and verifies that revocation applies after the message exchange.

### What warrants a second pair of eyes

Check which generated source examples should become actual dialect migration changes. Host equivalence tests establish feature coverage for the supplied fixtures.

### What should be done in the future

Repeat the host oracles when there is a dialect runtime, including an epoch-restart fixture for stale completion and an adversarial-input review for parser quotas.

### Code review instructions

Open [host-oracle.py](../scripts/catalog/host-oracle.py), [stage-rewrites.cjs](../scripts/catalog/stage-rewrites.cjs), and the small receipts in [various/catalog](../various/catalog). Reproduction commands are in the analysis.

### Technical details

The host used deterministic boot wall time and filesystem seed. Provider tests used local fixtures. The staged string tables are ordinary JS and expose unchanged key and value behavior for the tested apps.

## Step 3 — Run unchanged function slices as native CJI machine code

I took exact code from the start of Agenda and Files up to a clear function boundary, appended a small driver to each, compiled with the local-policy CJI source compiler, and executed each slice with both x86-64 and RV32 machine code. A separate Node invocation established expected app outputs. The Files fixture treats the filesystem as a local asynchronous service, while Step 2 covers the real kernel path.

### Prompt Context

**User prompt** See Step 1.

**Assistant interpretation** Verify actual compiled behavior for task and date parsing and for file sizes and selection.

**Inferred user intent** Validate that representative language and library behavior survives the candidate code generator and runtime.

### What I did

- Appended drivers in `scripts/catalog/native-agenda-driver.js` and `native-files-driver.js`. Ran `python3 <ticket>/scripts/catalog/native-oracle.py --rv32 --compiler /tmp/cji-dialect-numeric-local-r1/source/cji.js`.
- Emitted SLIR with `node <compiler> <combined-source> --emit`. Assembled and ran with the saved CJI tree's `slas`, then used `slas-rv32 -c` and `rv32emu fw-test.elf`.
- Preserved both outputs and identities in `various/catalog/native-source-fixtures.txt`.

### Why

These slices retain regex capture interpretation, calendar validation, number formatting, row ordering and worker-style promise completion from the real app code. They add evidence beyond parser acceptance without requiring a physical deployment.

### What worked

Both CJI targets matched Node and explicit expected results. Agenda recognized the timed task and fifteen-minute reminder and left a February 29, 2026 date null. Files preserved `z.txt` selection, sorted directory `a` first, returned the truncation flag and free-space result, and formatted `723 B`, `1.0 KB`, `1.5 KB` and `1.0 GB`.

### What didn't work

The broader first Agenda slice included internal clock helpers. The plain `--emit` compiler reported `cji: error: clock is not declared`. Adding a stand-in declaration exposed `cji: error: argument 1 of a call: a value of type String[] cannot be a dynamic value (Any) in this subset`. Narrowing the probe to the exact parse/date-validation code made it independent of the original world wrapper. Relative-date expansion remains exercised end-to-end by the unmodified and staged QuickJS simulator runs.

### What I learned

The successful numeric-policy evidence covers scientific-number use at file unit formatting, Date validation and app-level conversions. Boundary boot and full-world UI remain distinct concerns. A plain extraction may lose type context supplied by the surrounding compiler world mode.

### What was tricky to build

Files' `fiLoad` returns before its promise settles. The driver awaits it before checking state, ensuring it reads the result of both list and free-space operations. The installed RV32 test firmware reports emulator diagnostics on stderr, leaving stdout available for JSON.

### What warrants a second pair of eyes

Check that any broader performance comparison carries the same source, assembler and runtime identities. The isolated files do not represent device latency or compare native and interpreter scheduling overhead.

### What should be done in the future

Keep these probes in the portable comparison suite and run full Agenda and Files on a bundled candidate when the timing trial is ready.

### Code review instructions

Open [native-oracle.py](../scripts/catalog/native-oracle.py) and [native results](../various/catalog/native-source-fixtures.txt). The report lists the full suite commands. Compare each outcome to its semantic app contract.

### Technical details

The x86-64 receipt is keyed by SLIR SHA-256. The RV32 receipt is keyed by assembled relocatable object SHA-256. Node's result is also checked against a separately specified expected dictionary, so identical wrong outputs do not pass.
