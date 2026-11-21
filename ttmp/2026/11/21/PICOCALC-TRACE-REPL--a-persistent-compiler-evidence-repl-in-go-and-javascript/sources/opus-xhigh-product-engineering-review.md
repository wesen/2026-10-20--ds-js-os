# Owner report: PicoCalc compiler-evidence REPL, Go foundations

Owner: Claude Opus xhigh (product engineering). Date: 2026-11-21. Scope: `go.mod`/`go.sum`, `cmd/trace-repl`, `pkg/tracearchive`, `pkg/tracehardware`, `pkg/tracerepl`, `pkg/traceapi/install.go`, `pkg/traceapi/hardware.go`, all Go invariants and tests. `pkg/traceapi/query.js` belongs to the sibling owner. I did not create or edit it. No git operations were performed.

## 1. Outcome

The inherited drafts are sound in structure and mostly sound in detail. I kept them and made small, targeted corrections for each confirmed gap. Every correction has a regression test that fails against the draft behaviour.

| Area | Verdict |
| --- | --- |
| Archive and index integrity | Sound. One design gap fixed: references could be cited before their bytes were ever verified. The service now verifies the whole capture before it listens. One misleading contract comment corrected and pinned: dump ranges carry the *next* pass's announcement. |
| Device study and pairing | Pairing is correct and counterbalanced, and matches the published medians. Gap fixed: the cost side (on-device cold compile time and memory) and the ELF identities were validated but then discarded. Both are now exposed. |
| Session lifetime and interrupts | Interrupt and gate handling are correct (verified against go-go-goja `replsession`/`runtimeowner`). Three confirmed persona-class defects fixed: a failed declaration leaves the name unusable with no explanation, misreported `await` errors, and context-only interrupt messages. Two HTTP defects fixed: the capacity slot leaked for vanished sessions, and 500 was returned instead of 503 during shutdown. |
| Hardware JS facade | Fixed: the error when the device study is absent now addresses the agent and forbids substituting emulator counts; `pairs` returns `[]` instead of `null`; misuse errors show the call shape. Added `hardware.loads()` and generated field lists in `help()`. |
| Command | Fixed: `serve` now fails fast on an unverifiable capture and logs whether device data is present. The wiring moved into `newService` and is tested end to end over real HTTP. |

### Validation record (all run in this staging area)

| Command | Result |
| --- | --- |
| `go test -count=1 ./pkg/tracearchive/ ./pkg/tracehardware/ ./pkg/tracerepl/` | ok, ok, ok |
| `go test -race -count=1 -overlay owner-scratch/overlay.json ./...` | `cmd/trace-repl` ok; `tracearchive`, `tracehardware`, `tracerepl` ok. In `traceapi`, exactly three tests fail **by design** against the stub: `TestCompilerEvidence`, `TestUnknownVariant` (inherited, need the real library) and `TestWorkbookExamples` (new, needs the real library). Both new hardware tests pass. |
| `go vet -overlay owner-scratch/overlay.json ./...` | clean |
| `gofmt -l cmd pkg` | clean |

`pkg/traceapi` and `cmd/trace-repl` cannot compile until `pkg/traceapi/query.js` exists (`//go:embed query.js`). To validate my Go code there, I used a `-overlay` that maps that path to `owner-scratch/query.stub.js`, a clearly labelled stub that exposes nothing but `q.stats()`. Nothing was written to `pkg/traceapi/query.js`. **Once the sibling delivers query.js, run `go test -race ./...` without the overlay.** That runs the inherited `install_test.go`, the new 26-example harness and the command's end-to-end test against the real library.

### Files to delete when integrating (scratch from this review)

- `owner-scratch/` (the stub and overlay used for validation only)
- `pkg/tracerepl/probe_scratch_test.go` and `pkg/tracearchive/probe_scratch_test.go`. Both were emptied to a package clause because the allowed tools cannot delete files. Their findings are pinned in real tests.

## 2. Component review and disposition

Line numbers refer to the files as they now stand.

### go.mod / go.sum: **Retain (one integration action)**

- `go.mod:93` `replace github.com/go-go-golems/go-go-goja => ../go-go-golems/go-go-goja` makes the build depend on an adjacent checkout. The checkout resolves here (its `go.mod` is go 1.26.1 / toolchain 1.26.10 and matches), and `require` names v0.10.7. I could not confirm the checkout's tag without git. **Action for the director:** confirm the adjacent checkout is at v0.10.7, and drop the `replace` once that version is fetchable, so persona servers built elsewhere use the same code. No other module changes were needed; `go.sum` covers every package that builds.
- The product really uses go-go-goja's `engine.RuntimeFactory`, `replsession.Service` (session gate, lifetime contexts, unload and close), and `runtimeowner` (one owner goroutine per VM). That satisfies the "actual go-go-goja" requirement. Raw session options plus our own cell evaluator are a defensible choice: the instrumented profile's rewriting and persistence are not needed for an in-memory notebook.

### pkg/tracearchive/archive.go: **Retain, two fixes**

Reviewed and sound:
- `Open` (`:97`) validates variant names (`:112`, `validVariant` `:144`), so manifest-derived paths cannot escape the ticket. Query code never supplies paths.
- `openStream` (`:150`) checks digest length and rejects reordered or overflowing ranges (`:184`).
- `inflate` (`:286`) bounds decompression to `rawBytes+1` (`:300`), checks the SHA-256 against the manifest, and cross-checks line boundaries (`:313`) and every index header against the log (`:321`). Failures are never cached.
- Profiles are parsed once and handed out as private clones (`:360`). `ProfileSHA` is the digest of the bytes actually parsed (`:346`).
- Counters are atomic. Middle-before-backend ordering (`:131`) is a valid strict weak order.

Fixes:
1. **A citation could precede verification.** `Events` returns `Ref{streamSHA,start,end}` from the manifest and index. Until a `Text` call had inflated that stream, nothing had checked those claims against the bytes. A researcher who only lists events, as in workbook example 14, would cite unverified references. I added `Verify()` (`:277`), which uses the same path as `Text` through a shared `verified()` helper (`:258`), and `serve` calls it before listening (`cmd/trace-repl/main.go:132`). It costs one inflation of the 30,912,391-byte capture, under 100 ms on this host. It also keeps the first query from paying for decompression, so session latencies are comparable. Lazy behaviour for library callers is unchanged.
2. **Misleading contract comment.** `Text` said a range includes "printer diagnostics". In fact, middle-end ranges end with `-debug-pass-manager` lines for the **following** pass: ordinal 73 (SROA) ends `Running pass: EarlyCSEPass on row …`. I rewrote the comment above `Text` (`:239`) and pinned the layout in `TestMiddleEndRangesEndWithTheNextPassAnnouncement`. The byte contract itself is right and unchanged. See §4 for the consequence for query.js.

Left: `InitialModule` (`:391`) and the profile files have no recorded identity, so their digests (`:420`, `:346`) are truthful ("what we read") but not verified. The fix belongs in the archiver, which should add `raw.ll` and profile digests to `manifest.json`. `InitialModule` inflation is unbounded (`:414`), which is acceptable for operator-supplied local evidence.

### pkg/tracehardware/study.go: **Retain, cost side and identities exposed**

Reviewed and sound:
- `Open` (`:178`) requires one source SHA across the three treatments, valid image, ELF and CRC identities, and that every load's device CRC receipt matches `images.json` (`:253`).
- `validateLoads` (`:241`) requires 18 loads and all 6 distinct treatment orders (`:273`), a complete counterbalanced design.
- `pair` (`:279`) requires identical pose, stride and output CRCs for a fixture across treatments and blocks (`:304`): the optimization did not change output. It requires 12 fixtures (`:314`) and rotation consistent with load order (`:337`). Pairs are only formed within a block.
- Results match `summary.json` for all 144 published groups (inherited test).

Fixes:
1. **The cost of an optimization was invisible.** `loads.json` carries on-device `compilerUs`, `peakJSBytes`, `elfBytes` and `segmentBytes` per cold compile. The draft decoded only the identity fields. On a handheld that compiles on device, this is half of the decision. Scalar lowering makes the cold compile **+45.0 % slower (median 454,132.5 → 658,508.5 µs) and adds ~94 KB of peak compiler JS memory (680,004 → 773,820 bytes)**. In return it saves ~2.4 % of clean render time. I added `Load` and `Study.Loads()` (`:72`, `:95`) and validated the new fields (`:256`).
2. **Truthful provenance per cell.** `Metadata` now carries `images` (treatment → program, image SHA, ELF SHA, ELF CRC) and `timerArm` (`:52`–`:69`). A pair can be traced to the exact ELF that was timed. The paired arm is now a named constant (`:22`, used at `:340`) that matches `scripts/09-paired-results.py`. I deliberately did **not** label what arms 0 and 1 measure: the archive does not say.

Left: the unpaired arms 0 and 1, and `cycles`, stay unexposed until the PIE-LOOPS ticket documents their meaning.

### pkg/traceapi/install.go: **Retain (comment corrected)**

The bridge is sound. `__trace` is removed after `query.js` captures it (`:66`), and every result is materialized as plain JSON (`:80`), so no Go slice or map is shared across sessions. I corrected the concurrency comment above `Install` (`:20`): it runs in the runtime initializer before the session is published, not on the owner goroutine. Panicking with `vm.NewTypeError` correctly surfaces Go errors as JS exceptions. The adapter signatures `Install(vm, archive)` and `InstallHardware(vm, study)` are unchanged.

### pkg/traceapi/hardware.go: **Fixed**

- The study is absent by default. The draft's error was "start the service with --device-study", an instruction the agent cannot follow, and it did not forbid the scientifically dangerous fallback. `missingStudy` (`:14`) now says timings are unavailable in this session, says not to substitute guest instruction counts for device time, and names the operator path. `help().available` is false and `help().absent` carries the same text.
- `pairs` (`:72`) returned `null` for an empty selection. It now returns `[]` (`:85`). Calling it with missing arguments now says `needs three strings` and shows an example call (`:75`) instead of reporting `unknown hardware phase ""`, which named a symptom as the cause.
- New `hardware.loads(treatment?)` (`:95`). `help()` lists `pairFields` and `loadFields` generated from the struct tags (`jsonFields`, `:20`), so they cannot go stale. It also states the unit, the design and the provenance limit: device times are **not** identity-linked to `profiles('typed')` counts.

### pkg/tracerepl/service.go: **Retain core, three fixes**

Reviewed against go-go-goja and sound:
- `WithRuntime` holds the session gate for the whole cell.
- `Owner.Call(context.WithoutCancel(opCtx))` (`:151`) waits for the owner callback even after cancellation. The `AfterFunc`/`stop()`/`<-interrupted`/`ClearInterrupt` sequence (`:156`–`:165`) means an interrupt can never leak into the next cell.
- A queued cell whose deadline passes never runs: `beginOperation` fails, or the `opCtx.Err()` check at `:152` stops it.
- `require` is deleted and source maps are disabled (`:51`–`:52`).
- Console output is capped (`:62`), and results are capped at 512 KiB (`:333`).

Fixes (each reproduced first with a probe against the real engine):
1. **A failed declaration makes the name unusable.** In goja, `const header = typo.count()` declares `header` and then throws. `header` stays uninitialized for the life of the session: reading it gives "Cannot access a variable before initialization" and redeclaring it gives "already declared". Neither message names the cause. For a notebook built on top-level `const` (the workbook's common bindings), this loses names silently. `explainFailure` (`:271`, called at `:306`) collects the cell's top-level `let`/`const`/`class` names from the AST (including destructuring), probes each with `typeof` (`:275`) and names the unusable ones with a fix. It also adds hints for "already declared" and for "before initialization" errors in later cells.
2. **`await` errors.** The workbook writes `await q.run(plan)`. Agents will also write `const r = await q.run(plan)`, which script syntax rejects with "SyntaxError: SyntaxError: … Unexpected identifier". A leading-`await` multi-statement cell was also wrapped, so its error column pointed into the *wrapper*. `parseCell` (`:206`) now wraps only when the wrapped form parses. Otherwise it reports against the cell as typed (`:214`), removes the doubled prefix, and appends "drop `await` … `const r = q.run(plan)`". The parser options are unchanged (source maps stay disabled).
3. **Interrupt reason.** "context deadline exceeded" / "context canceled" now become "cell stopped at its evaluation deadline … bindings from earlier cells remain", "…its session was closed" or "…the trace service is shutting down" (`stopReason`, `:179`).

Left (needs an observed persona failure first): `NaN`/`Infinity` serialize as `null`, and object fields whose value is `undefined` are dropped by `JSON.stringify`. Both are silent. Candidate fix: annotate `Result.Kind` for a non-finite top-level number. The `undefined`-field case is best avoided in query.js records.

### pkg/tracerepl/http.go: **Retain, three fixes**

Sound: Host and Origin checks against DNS rebinding and browsers (`:97`); strict JSON with unknown fields rejected; the size cap accounts for JSON escaping (`:49`); per-session serialization.

Fixes:
1. **Capacity leak.** If a session vanished outside the handler, `DELETE` returned 404 but kept its `live` slot. After 32 such cases, every new session got 429. The fix is at `:84`–`:87`.
2. The 429 text (`:31`) now names only paths a client may take: close *your* session, or ask the operator. I deliberately added **no** session-listing endpoint. In a shared persona lab, listing would let one agent close another tester's session, which is exactly what the old text ("close an unused session") invited.
3. Service closing or closed now maps to 503 instead of 500 (`:132`).

Left: `DELETE` holds the handler mutex during `Release`. This briefly delays new opens while a running cell is interrupted. Acceptable.

### cmd/trace-repl/main.go, README.md: **Retain, wiring extracted and verified**

`newService` (`:126`) opens the archive, `Verify()`s it (`:132`), logs stream count, bytes and time, opens the optional device study (`:139`) and logs `device study available` or `no --device-study`. It then builds the service. `serve` (`:104`) is unchanged otherwise, and so are the HTTP timeouts, shutdown and client. The README now describes startup verification, `hardware.loads`, the default-absent behaviour, the unusable-name rule and the `await` rule.

## 3. Confirmed gaps, edits and regression tests

| # | Gap (confirmed how) | Edit | Regression test |
| --- | --- | --- | --- |
| 1 | References cited before the stream was verified (read: `Events` only uses the index) | `Archive.Verify`, called by `serve` | `TestVerifyCertifiesAndWarmsEveryStream`; `TestIndexIntegrity…/verify before serving`; `TestServeRefusesUnverifiableArchive` |
| 2 | Ranges end with the next pass's announcement (probe of real bytes) | Corrected contract comment | `TestMiddleEndRangesEndWithTheNextPassAnnouncement` |
| 3 | Compile cost and ELF identity discarded (read) | `Load`, `Loads()`, `Metadata.Images`, `TimerArm` | `TestLoadsReportColdCompileCost` (published cold medians, +45 %); `TestPairsArePhysicallyMatched`; two new damage probes |
| 4 | Absent-study error not actionable for an agent, no guard against substituting emulator counts | `missingStudy` text, `help().absent` | `TestHardwareAbsentByDefault`; `TestServeWiresVerifiedEvidenceAndOptionalDevice` |
| 5 | `pairs` → `null`; misleading no-argument error | `[]`; call-shape error | `TestHardwareExposesPairedTimesAndCompileCost` |
| 6 | A failed `const` leaves the name unusable with no explanation (probe) | `explainFailure` | `TestFailedDeclarationNamesUnusableBinding` |
| 7 | `await` misuse misreported (probe: wrapper column, doubled prefix) | `parseCell` | `TestAwaitMisuseIsReportedAgainstTheCell` |
| 8 | Interrupt reason only "context …" (probe) | `stopReason` | `TestDeadlineNamesItselfAndKeepsEarlierBindings`; `TestCloseInterruptsRunningCellsAndSaysWhy` |
| 9 | HTTP slot leak for vanished sessions (read) | `http.go:84` | `TestHTTPReleasesCapacityOfVanishedSession` |
| 10 | 500 during shutdown (read) | `http.go:132` | `TestCloseInterruptsRunningCellsAndSaysWhy` |
| – | Lifetime invariant, previously untested: a queued cell must never run after its deadline | none needed (holds) | `TestQueuedCellNeverRunsAfterItsDeadline` |

### Test categories requested

- **Lifetime and interruptions:** `pkg/tracerepl/lifetime_test.go` (6 tests) plus the inherited 5. All pass under `-race`.
- **Archive and index integrity:** inherited forgery, reorder, damage and multibyte tests, plus Verify and range-layout tests.
- **Truthful provenance:** Verify before serving; `Metadata.Images`/`TimerArm`; pair-to-load ELF CRC checks; the provenance statement in `help()`; absent evidence is an error, never an empty answer (oracle subtests 17/22/26).
- **Physical pairing and absent by default:** `TestPairsArePhysicallyMatched` checks the 864 pairs against raw rows and loads (same block, fixture, pose, stride and output CRCs; different positions; device-confirmed ELFs; 72 per contrast×phase; 6 blocks per pose). `TestHardwareAbsentByDefault` and the command end-to-end test cover the default-absent path.
- **26 examples:** two layers.
  - *Independent oracle* (`pkg/tracearchive/workbook_oracle_test.go`, runs now). It recomputes every **verified** workbook number from bytes and JSON with no query library: 01–02 (4,133; 195/116); 03; 05–06 (11 → 6); 07 (first decrease 73→74, −5, found by scanning consecutive full row prints and resetting across gaps); 09–10 (16 → 0 allocas, 3 phis); 12 (no debug locations); 14–16 (virtregrewriter only at 74 and 78 for `row`, NoVRegs false → true); 18–21 (1,136,142; 1,290,106; 1,233,611; LSR ablation −41,949, −3.2886 %); 17/22/26 (absent artifacts and arms are errors). All agree with the workbook.
  - *Product harness* (`pkg/traceapi/workbook_test.go`, **runs once query.js lands**). It evaluates all 26 bodies verbatim, plus 26 once per arm binding, in one persistent session of the real `tracerepl.Service`. Assertions do not depend on result shapes. Verified examples must succeed and contain the oracle's numbers, booleans or strings somewhere in their JSON. Contract examples may fail loudly, but never succeed with null or an empty object. If a contract example succeeds, it must carry what the workbook specifies, and examples 12 and 22 must name `missingDebugLocations` and `missingPCSamples`. Every result is logged for reading.
- **Simple and complex optimization evidence:** *simple* is a single pass between two snapshots (SROA 16→0 allocas; EarlyCSE removes five redundant capacity loads). *Complex* covers a whole-pipeline ablation (LSR −3.29 % net), a property across a gap of passes (the first rewriter is not the final allocation), and the device trade (stock→pie default/clean median saves 1,616 µs, 2.80 %, against a 45 % slower cold compile).

## 4. Findings for the query.js owner (cross-owner; not edited)

1. **P0: pass names in range tails.** `Text`/`Ref` ranges end with `Running pass: <next pass>` and `Running analysis:` lines. `excerpt({contains})`, a text-based `pass` check, or any search for a pass name must stop at the first line that starts with `Running ` (the pinned test shows the layout). Otherwise the SROA snapshot "mentions" EarlyCSEPass. If the sibling prefers Go to compute it, I can add `Event.BodyEnd` (the offset where trailing pass-manager lines begin) as a backward-compatible field.
2. **P0: device versus emulator.** `profiles('typed')` arms (`stock`, `scalar`, `pie`) share names with the device treatments but carry no image identity and use another workload (opening-160-rows against 12 device fixtures). Emulator instruction reductions (scalar −11.3 %, pie −13.2 % against stock) look 4–5× larger than the measured device savings (~2.4–2.9 % clean). The two are not comparable, which is exactly why a naive answer misleads. Any join or comparison helper must refuse to merge them, or label the comparison "not identity-matched".
3. **P1:** `q.run` is synchronous. The session now tells users to drop `await` from `const r = await q.run(…)`. If query.js ever returns Promises, tell me, because the hint would then be wrong.
4. **P1:** avoid `undefined`-valued fields in records. `JSON.stringify` drops them silently in session results; prefer `null` plus a reason.

## 5. Priorities and playbook guidance for the DeepSeek 4.1 flash tester team

The tester team is separate and runs blind cards, so the guidance below is about what to measure and how to run batches. It contains no expected answers for the persona.

### Fix and experiment priorities (harm order, from the homolog playbook)

1. **Wrong science (fix first).** Watch for:
   - device-time questions answered from `profiles` when `--device-study` is absent, or when present;
   - a pass attributed from range-tail text;
   - an ordinal hard-coded from another variant or phase (the workbook's lab exercise);
   - a difference across a gap credited to the last pass (examples 08 and 16);
   - the normal build's machine state attributed to the `checked-llc-nolsr` arm (example 26);
   - an emulator percentage quoted as device speed-up;
   - compile cost omitted from an "is it worth it" answer.
2. **Lost conversations.** A name made unusable by a failed cell (now named in the error); `const r = await …`; the 15 s deadline; the 32-session cap.
3. **Wasted steps.** Unknown names, field guesses, and help reads per run.

### Running batches

- **One fresh server per persona run**, started from a fixed build and never changed mid-batch. This keeps sessions isolated (there is deliberately no session listing) and avoids the cap. Start timing only after the `trace REPL ready` log line: verification and warming happen before it, so the first query is not penalized.
- Run every scenario twice, once **with and once without** `--device-study`. The objective check for the absent arm is that no device number is stated and `missingDeviceStudy` is reported as unavailable.
- **Truth facts for the judge come from the Go oracle tests**, never from the agent's room. Use `workbook_oracle_test.go`, `TestLoadsReportColdCompileCost`, `TestStudyAgainstPublishedMedians`, and `summary.json` for per-pose medians.
- **Objective checks per run:**
  - stated numbers that match the oracle;
  - device claims that cite `hardware.*` against claims sourced from `profiles`;
  - claims with a citation (`ref`, `streamSHA`, `artifactSHA`, `images`, `baselineRow`/`candidateRow`);
  - failed steps by error class, including `hint:` lines (cells that made a name unusable, `await` misuse);
  - repeated identical cells, as an efficiency signal independent of the judge;
  - archive counters (`textReads` per run), if query.js exposes the bridge's `stats()`.
- **Persona cards that exercise distinct paths:**
  - a skeptical compiler reviewer (evidence per number);
  - an embedded performance engineer (device µs, warming and order effects through `baselinePosition`/`rotation`, compile cost);
  - a newcomer student (vague phrasing, phase/ordinal confusion);
  - a hypothesis-first researcher (example 26: predict, then check);
  - a tool builder (fragments and params, examples 23–24).
  
  Hold out the "replace checked with unchecked" exercise as the unseen scenario.
- **Scenario seeds with known truth:**
  - Did EarlyCSE remove capacity loads in `row`, and how many?
  - Is the first rewriter snapshot the final register allocation?
  - Does disabling LSR cost instructions, and is the effect net or per pass?
  - Is PIE lowering worth it on the device? An honest answer gives paired render savings by phase and pose, the cold compile cost and memory, and says that emulator counts are not identity-linked.
  - What can the archive *not* tell you? Source locations, remarks, PC samples, the ablation arm's machine pipeline.
- **Recording.** Follow both playbooks' rules: each fix lands with its evidence count and a regression test. End each round with three lists: fixed, left (with reason and home), not reproduced (with the probe). The director supplies observed failures; I take product fixes from them.

## 6. Follow-ups I can take next

- Run the full product suite as soon as query.js is delivered, and triage any `TestWorkbookExamples` failures with the sibling: a verified mismatch is a defect; a contract gap is a backlog item.
- Optionally add `Event.BodyEnd` (finding 4.1) and a `Kind` annotation for non-finite results, if persona runs show either costs steps.
- Drop the go.mod `replace` once the go-go-goja tag is confirmed.
