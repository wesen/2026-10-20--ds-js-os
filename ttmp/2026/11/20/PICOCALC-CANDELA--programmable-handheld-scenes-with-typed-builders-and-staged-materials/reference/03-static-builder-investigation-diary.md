---
Title: Static builder investigation diary
Ticket: PICOCALC-CANDELA
Status: complete
Topics:
    - picocalc
    - compiler
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: picocalc-os/compiler/typed-wasm.js
      Note: Shared static member and options mechanisms
    - Path: picocalc-os/worlds/candela/fluent.typed
      Note: Exercised production scene
ExternalSources: []
Summary: Isolated implementation, research consultation, normal compiler regression and cross-target graph execution.
LastUpdated: 2026-11-20T23:51:00-05:00
WhatFor: Reconstruct the choices and limits in the Team 2 frontend study.
WhenToUse: When validating an integration, reviewing a new builder or comparing research results.
---

# Static builder investigation diary

## Step 1. November 20, 23:38–23:42 EST. Freeze source bindings and an allocation-free literal

We started from a one-pass expression emitter, a declaration/signature pass and ordinary Typed records represented by pointers. I chose to bind each method to an existing direct function and to allow named arguments at an explicit options boundary. The runtime graph would keep the exact same representation as the hand builder.

### Prompt context

The user’s commission describes Team 2 as follows.

> Implement statically resolved receiver methods and namespaces in the frontend. Start with shape.sphere(...).at(...).material(...). Use existing direct functions underneath. Then add record literals for options such as { roughness: ... }.

> Compile the fluent scene and its hand-written direct-call equivalent on Wasm and RV32. Both must build the same scene graph. This team can test against recording functions before the renderer is ready.

The original includes all four teams and their interface agreement. The user’s diary instruction reported by the director was “Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill”. The director’s delegated brief was “New PICOCALC-CANDELA Team 2. Read ticket sources/commission.txt and design-doc/01 c065dc2. Own static receiver/namespace lowering and record options literals, compile full fluent vs direct scene Wasm+RV32 execute and compare graph meaning. Implement in isolated worktree under /tmp, separate from lambda lane; coordinate narrow extension points with me (I own lambda integration). Use Opus high via Claude CLI as researcher; diary skill full log, own intern design and detailed textbook vault article in ticket. Commit at intervals, notify me for cherry-pick. No board. Director publishes articles together.” [Original commission](../sources/commission.txt)

### What I did

Created a detached worktree at `/tmp/picocalc-candela-builders` from `c065dc2`. Inspected `FunctionEmitter`, its numeric subclass, the signature scan, and the async range type checker. Agreed with the director that my paths would be member lookup, postfix expressions and grouped call arguments. The callback lane could retain its hook at named-call entry. Sent the renderer team an explicit request for the graph APIs, geometry and floor colors.

Asked the designated Opus researcher a scoped compiler methodology question via `claude -p --model opus --effort high --tools "" --strict-mcp-config --no-session-persistence --output-format json`. The question described a generic one-pass frontend, fixed record layouts and the proposed tests in prose. Source files were not attached. The CLI returned a successful result from `claude-opus-5-5`. Its suggestions included a per-function region for borrowed record literals, direct-call byte comparisons, independently tagged side effects and unchanged-world tests. We adopted the experimental controls. The signature-grouping design met our particular options requirement without introducing new backend frame storage. Raw CLI output stayed in temporary storage.

### Why

Record arguments in this compiler are addresses. Constructing an addressable twelve-byte position would require rules for allocating, releasing and retaining that address. Our direct target already takes the three coordinate words. A group declaration can use a record to name and type those arguments at the call site.

### What worked

The director approved `namespace shape { sphere = makeSphere; }` and a nominal receiver group with an optional record type after the method name. The existing lexer already recognized every required delimiter.

### What didn't work

Parsing the CLI output initially assumed a top-level dictionary and raised `AttributeError: 'list' object has no attribute 'keys'`. The authenticated CLI used a JSON event array. Reading its final result event established both success and the returned model identity.

### What I learned

The native and Wasm emitters share the expression parser. Direct functions already implement graph mutations and nominal results can travel as ordinary words on either target.

### What was tricky to build

Streaming RV32 decides each function’s output separately while retaining the global signature map. Binding to a function after its code has been discarded still works if membership is resolved using that retained signature information. We made alias checking independent of the body emission order.

### What warrants a second pair of eyes

An alias feeding a direct function must require an exact nominal first parameter. A spelling that matches a namespace must lose to a local binding of the same name.

### What should be done in the future

Use a direct trace of side effects to check both value mapping and evaluation order before interpreting any scene-level results.

### Code review instructions

Start at the namespace and method declarations in `fluent-types.typed`. Follow `parseMembers`, `checkMembers` and `FunctionEmitter.memberCall` into the ordinary call emitter.

### Technical details

The graph spec reserves 303 unsigned 16-bit cells. A shape handle is `distinct i32` at the Typed interface and an integer row index when handed to the checked library.

## Step 2. November 20, 23:42–23:45 EST. Compile and execute the recorded calls and the real graph

The first tests made expression order observable, then the renderer team supplied its production buffer builders and evaluator. Both targets produced the expected side effects. The director cherry-picked the frontend and the two-sphere fixture separately.

### Prompt context

See step 1. The director also requested `candelaFluentShared(graph:buffer):i32`, returning one for success, zero for failure, and a separate declaration fragment for the source assembler.

### What I did

Implemented member resolution, namespace calls, postfix chains, expression statements and contextual options. Options arriving out of order use scalar temporaries starting at the first displaced field. Existing record references load each field from one evaluation of their address. In the async frontend I passed through the alias maps, recognized field labels in reference collection and allowed literal braces within call parentheses. Committed the implementation as `95f6395`, integrated by the director as `89512ad`.

Constructed the full fixture with production Typed builders, a hand-authored direct expansion and the renderer team's independent hand fixture. Committed `5f5ceb7`, integrated as `3ef4ae6`. Ran `qualify.mjs` with the directory of the renderer’s production sources, which were being written outside my isolated worktree. The later joint evaluation used the assembled source unit.

### Why

Exact binary identity can answer whether the canonical syntax adds instructions. Equality with the hand-built scene is a different question. It requires running the programs, comparing the persistent graph and independently predicting the materials' values as the parameter changes.

### What worked

Six runs matched every descriptor cell. The three weights yielded right-sphere RGB (30,70,150), (125,120,95) and (220,170,40) while the left stayed (30,70,150). The floor checks straddled x=12. Both targets rejected short input storage, returned zero and left it byte-identical. The output/instruction equality controls passed. A reordered literal's trace was 123 and its call result was 132. Three expression-statement forms produced effects 4567.

### What didn't work

The published API's convention differs between constructors returning a handle and setters returning a success flag. Reading the actual library showed `candelaInit` and `candelaFloor` return zero or one. I used explicit zero/failure checks and return forwarding in the fixture, and tested the short-buffer path.

### What I learned

A physical handle need not be stored twice to show sharing. The derived material’s mix references the left material's blue root. Inspecting that operand establishes sharing even at a weight where both surface colors coincide.

### What was tricky to build

It is tempting to reorder expressions to match member layout before evaluating them. With a side-effecting receiver and side-effecting fields this changes which operations the renderer sees. The compiler preserves the prefix already in order and permutes only evaluated words.

### What warrants a second pair of eyes

The direct reference source should preserve receiver/argument ordering and names when we claim binary equality. The separate hand fixture may allocate the same data using different calls.

### What should be done in the future

Evaluate the actual physical frame, commit-to-device separation and cold compile cost in the independent board study. No board was used in this lane.

### Code review instructions

Run the host script and inspect both `modes` and `samples`. Its input library hashes identify the exact shared source at qualification time.

### Technical details

Each input buffer receives a four-byte capacity prefix. The receipt hashes 606 descriptor bytes. The digest is `2b7747f2ef002dcee8841048295221eea19fb1e6388fcc1898c1c79d95cccd94`. [Receipt](../various/builders/host.json)

## Step 3. November 20, 23:46–23:51 EST. Check the indexed frontend and separate historical regressions

I compared an unchanged compiler baseline with this lane’s compiler on the repository Editor and Chess sources. I also exercised the actual C token index in the vendored QuickJS host, then tested an options literal in a generated async continuation.

### Prompt context

See step 1 and the director’s request to cover range/indexed lexer paths and expression-statement chains.

### What I did

Built a local QuickJS probe from the historical harness and current `typed_lex_index.c`. Compiled the assembled scene with the index on and off, comparing exact Wasm and RV32 bytes. Checked the archive's large-literal testcase separately against `c065dc2`, and compiled a continuation with a shadowing x label plus a namespace-mediated cycle. Ran the regular app tests. Reread the chapter, clarified the direct expansion versus the hand-built sphere, and added explicit coordinates to the floor samples and a suggested falsification test.

### Why

The release can use an index produced by C, while host V8 usually scans with a regular expression. A successful Node run alone leaves a distinct source-reading path unchecked. The pre-existing worlds also exercise field access in unchanged sources that never declare a builder group.

### What worked

The indexed/regexp QuickJS outputs matched. The unchanged Editor and Chess produced identical linked Wasm and RV32 images against `c065dc2`. Both outputs accepted the async/option case; both rejected a call cycle mediated by a namespace alias. All 68 tests from `make -C picocalc-os test-apps` passed. [Frontend receipt](../various/builders/frontend.json)

### What didn't work

Running `frontend-gates.mjs` initially returned `spawnSync git EPERM` in this sandbox. The approved local child-process rerun completed. An older independent test, `PICOCALC-LANGUAGE-E.../scripts/01-check-functions-differential.mjs`, requires both a cross-GCC and a `rv32emu` path. Supplying them ran its semantic checks through its final historical assertion, `assert(largeRv32.length > 300_000)`. The assertion failed. Direct comparison showed a 248,108-byte image with identical SHA-256 on both this lane and its pre-feature baseline. The historical test has been preserved as written; its failing size expectation is recorded here.

### What I learned

A byte threshold recorded before literal lowering changed cannot distinguish this frontend change from the parent compiler. Measuring the exact same source on the pinned base provides that distinction.

### What was tricky to build

A compiler can reject a recursive lowered chain while naming generated continuation helpers in its error. The control checks the presence of the cycle diagnostic rather than assuming names from an earlier stage.

### What warrants a second pair of eyes

The Editor and Chess source lists in this check are the repository versions. A firmware release selecting a different mobile painter or source layout needs its own release check. Whole-world byte equality measures output and does not measure cold compilation time.

### What should be done in the future

If an application needs long-lived addressable literals, design an explicit ownership and lifetime model first. The current grouped-literal proof ends at an ordinary scalar call.

### Code review instructions

Use the exact four-command indexed-host recipe in [the intern guide](../design-doc/03-a-static-builder-call-from-source-to-machine-code.md). Compare image hashes, sizes and the SDK reactor input before calling two configurations equivalent.

### Technical details

The regular Editor RV32 text measured 75,812 bytes, and Chess 46,928 bytes. The matching linked Wasm modules measured 92,162 and 76,616 bytes. The later scene receipt was regenerated after the renderer author updated the shared evaluator; its source hashes identify that snapshot. The three material samples and descriptor digest remained unchanged.
