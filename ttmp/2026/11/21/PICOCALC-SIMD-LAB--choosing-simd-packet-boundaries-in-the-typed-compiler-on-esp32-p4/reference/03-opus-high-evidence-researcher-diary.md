---
Title: Opus High evidence researcher investigation diary
Ticket: PICOCALC-SIMD-LAB
Status: active
Topics: [compiler, performance, picocalc]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Opus High evidence researcher investigation diary.
LastUpdated: 2026-11-21
---

# Diary: P4 SIMD evidence global (`simd`) for trace-repl

## Step 1: Orient in the isolated workspace and probe the REPL bridge

I began by reading the brief, the investigation-entry format, the textbook style guide and the existing project code that the new provider must imitate (`pkg/traceapi/hardware.go`, `install.go`, `hardware_test.go`, `cmd/trace-repl/main.go`, `main_test.go`, `README.md`). The goal of this step was to learn the conventions before writing any code: how an optional provider reports absence, how results are copied into JS, how errors surface, and where the server opens evidence before listening.

I also issued the first REPL bridge request (`request-1.json`) to learn what the running room exposes. The bridge is supervisor-controlled; I only write request files and read replies. I deliberately did not use `run-cell.py`, which performs an HTTP call and is outside the Read/Edit/Write/Glob/Grep tool set I was given.

### Prompt Context
**User prompt (verbatim):** "You are the Opus High evidence researcher for the PicoCalc SIMD research lab. Use relative paths inside this isolated work area. Read supplied ../input/investigation-entry.md and textbook.md, two REPL design guides, and prior PIE article. Start a detailed full-format diary EARLY in diary.md; update when milestones finish. Write intern design in design.md. Implement a real optional Goja global in pkg/tracesimd/study.go and pkg/traceapi/simd.go, tests pkg/tracesimd/study_test.go and pkg/traceapi/simd_test.go, and integrate --simd-study into cmd/trace-repl/main.go. Existing hardware.go demonstrates project conventions (same top-level module, errors, importer). Read/Edit/Write/Glob/Grep here. To run JS in your own REPL room, Write a JSON object {"source":"..."} as request-1.json, request-2.json etc in your working directory. A supervisor bridge writes reply-1.json shortly. Read it. Try it now. The supervisor alone controls the bridge. Supervisor runs gofmt, tests, integration, and sends measurements for you to author the final pedagogical article. Code and notes expected in files. Keep code compact. No external dependencies. Do not read outside this workspace and ../input. No remote calls. Contract (fixed shape): --simd-study is one JSON file {"format":"p4-simd-evidence-v1","images":[{"sha256":"...","code":"base64 raw image bytes"}],"decisions":[{"id":"pie-row","function":"typedRayComputeRow","source":{"path":"...","sha256":"...","lineStart":112,"lineEnd":122},"imageSHA":"...","plan":"...","alternatives":[{"plan":"...","status":"...","reason":"..."}],"ranges":[{"start":byteOffset,"end":exclusive,"role":"scratch-store"}]}],"traces":[{"id":"pie-opening","imageSHA":"...","workload":"opening-160-rows","steps":3131435,"counts":[{"pc":byteOffset,"executions":100}]}],"packetSets":[{"workload":"opening-160-rows","sourceSHA":"...","packets":[{"pose":"default","row":20,"group":4,"lanes":8,"hitMask":255}]}]}. Expose simd.help(), simd.decisions(), simd.traces() (metadata only, counts via simd.counts(traceID)), simd.packets(workload), simd.executions(decisionID,traceID,role) returns identity-bearing object including executions count and unit, refusing cross-image joins/unknown roles and ids. Return source interval, alternatives, image sha, and dynamic witnesses. Fixed-width RV32 image bytes verified by SHA, checked range nonoverlap per role (different roles may overlap intentionally), within-image aligned PCs/ranges, nonnegative counts, unique PCs, steps sum exactly, JS safe integers, sparse histogram omission means zero only inside complete identified trace. Optional empty/absent study explicit unavailable; reject malformed corpora before listening. JS values must be independent copies and service immutable. Add tests for identity, out-of-image, duplicates/overflow/sum, proof that modifying returned JS doesn't change subsequent calls. One file for image/decisions/traces: no paths outside dataset, no new input readers. Session state lives in Goja as existing service. Project root go.mod already exists. You don't have other project code or Go toolchain access; operator sends exact test failures. Keep everything in isolated work/. Parent implements the capture generator using the project's real host emulator; you receive resulting facts for final report. We will resume you when measurements arrive. Write code now."
**Assistant interpretation:** Build an optional, validated, immutable `simd` Goja global backed by one JSON study file, wire it into `trace-repl serve` via `--simd-study`, test it, document the design for an intern, and keep a full-format diary; the pedagogical article waits for supervisor measurements.
**Inferred user intent:** Give researchers an identity-checked way to join compiler decisions (source interval, chosen plan, rejected alternatives, code byte ranges) to dynamic execution counts from the same image, so no claim about SIMD lowering can silently mix images or invent zeros.
**Commit (code):** N/A — no git repository in this workspace.

### What I did
- Read `brief.txt`, `../input/investigation-entry.md`, `../input/textbook.md`.
- Read `pkg/traceapi/{hardware.go,hardware_test.go,install.go}`, `cmd/trace-repl/{main.go,main_test.go,README.md}`.
- Wrote `request-1.json` to probe the room.

### Why
- `hardware.go` is the declared convention source: absent-study behavior (`help()` answers, data calls throw a typed error with an instruction), `importer(vm)` JSON round-trip copies, `vm.NewTypeError` panics for argument errors, `jsonFields` for help field lists.

### What worked
- Conventions are clear and small enough to mirror directly.

### What didn't work
- No failures observed yet.

### What I learned
- `newService` opens and verifies all evidence before `net.Listen`; the SIMD study must be opened in the same place to satisfy "reject malformed corpora before listening".
- `importer` already gives independent copies per call (JSON marshal + `JSON.parse`), so immutability reduces to never handing out Go-shared mutable state and never mutating the study after `Open`.

### What was tricky to build
- N/A in this step.

### What warrants a second pair of eyes
- N/A in this step.

### What should be done in the future
- Read the two REPL design guides and the prior PIE article; write design.md; implement.

### Code review instructions
- N/A in this step.

### Technical details
- Module path: `github.com/go-go-golems/picocalc-trace`.
- Bridge protocol: write `request-N.json` `{"source": "..."}`, read `reply-N.json`.
- `reply-1.json` (verbatim): `{"ok":true,"value":{"globals":["q:object","hardware:object","simd:undefined","profiles:object"],"hw":true,"simd":null}}`. The room is the current service with the device study loaded and no `simd` global, the baseline my change extends.
- A second probe file (`request-2.json`) was written during this step. I did not use any reply to it, and nothing in the design depends on it.

## Step 2: Implement the study reader, the `simd` global, server wiring and tests

This step turned the contract into code. `pkg/tracesimd/study.go` decodes the single study file, checks every identity and arithmetic invariant once, and then exposes read-only accessors that return copies. `pkg/traceapi/simd.go` binds `simd.*` into a session VM the same way `hardware.go` does. `cmd/trace-repl/main.go` gains `--simd-study`, which is opened and verified inside `newService`, before `net.Listen`. Tests cover identity joins, refusals, every validation rule named in the brief and copy independence across calls and sessions.

I have no Go toolchain here, so nothing has been compiled or run yet. Everything below about behavior is what the code is written to do, checked only by reading it. The supervisor's gofmt/test output will be the first real evidence.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Write compact, dependency-free Go for the fixed JSON contract and its tests, and wire the flag.
**Inferred user intent:** A researcher can cite a per-role execution count with its decision, trace, image and source identity, and the service can never return a count from a mismatched image or a corrupt corpus.
**Commit (code):** N/A — no git repository.

### What I did
- `pkg/tracesimd/study.go`: types `Source`, `Alternative`, `Range`, `Decision`, `Count`, `Packet`, `PacketSet`, `TraceInfo`, `CountTable`, `ImageInfo`, `Execution`; `Open(file)`, `Parse(data)`, `checkKeys`, `checkDecision`, `checkTrace`, `checkPackets`; accessors `SHA256`, `Empty`, `Images`, `Decisions`, `Traces`, `Counts`, `Packets`, `Executions`.
- `pkg/traceapi/simd.go`: `InstallSIMD(vm, study)` with `help/decisions/traces/counts/packets/executions`; absence codes `missingSIMDStudy` and `emptySIMDStudy`.
- `cmd/trace-repl/main.go`: `SIMDStudy` setting, `simd-study` flag on `serve`, `tracesimd.Open` in `newService`, `InstallSIMD` in the runtime initializer after `InstallHardware`.
- Tests: `pkg/tracesimd/study_test.go` (4 positive tests, a 29-case rejection table and a trailing-data case), `pkg/traceapi/simd_test.go` (absent/empty, join and refusals, copy independence across two VMs), `cmd/trace-repl/main_test.go` (simd absent by default, empty study served as unavailable, malformed study refused by `newService`, `--simd-study` in `serve --help`).
- `cmd/trace-repl/README.md`: one paragraph on the flag. `design.md`: intern design.

### Why
- **Required-key pass before the strict decode.** `encoding/json` decodes a missing `"start"` or `"executions"` as 0, and for this data that would silently mean "offset zero" or "never executed". A generic `UseNumber` decode plus a table of required keys per path rejects missing and `null` fields without duplicating every struct with pointer fields. I considered wire structs with `*int64`; that doubled the type definitions for no extra safety.
- **RV32 check limited to ranges and executed PCs.** Checking every word of an image would reject legitimate constants or padding. Words that a decision claims as code, and PCs that actually retired, must be 32-bit encodings (low bits `11`).
- **Empty study is unavailable, not an error.** The brief groups "empty/absent" as explicitly unavailable. A malformed file is still refused before listening.
- **Per-role results only.** Different roles may overlap on purpose, so summing roles would double count. The API has no all-roles total.
- **Source path validated, never opened.** "No paths outside dataset, no new input readers": `Open` reads exactly one file, and `source.path` must be a clean relative path with no `..`, no leading `/`, no `\`, `:` or NUL.

### What worked
- Nothing has been verified by execution yet. All 7 Go files were written without tool errors.

### What didn't work
- No compile or test run is available to me. Awaiting the supervisor's exact output.

### What I learned
- The `importer` round trip already gives per-call independence in JS. The remaining immutability risk was Go-side slice aliasing, handled with `clone` in every accessor.
- `traceapi_test` already has `jsError` (in `hardware_test.go`). A `value` helper is used there but not defined in the files I can see, so it probably lives in another test file in the real package. I defined `simdChecks` instead so neither redeclaration nor a missing helper can break the build.

### What was tricky to build
- **Overflow ordering.** The sum check must happen before the addition (`c.Executions > MaxSafe-total`). Checking after adding could overflow int64 for adversarial inputs, although each term is already bounded by 2^53-1.
- **Witness order.** One role can list ranges out of order (the fixture lists `[28,32)` before `[16,20)`), so witnesses are sorted after collection. Counts are sorted once at parse time so each range uses `sort.Search`.
- **Validation order.** Images are validated first, then decisions, traces and packets, so a broken image is reported as an image error rather than as a dangling reference later.

### What warrants a second pair of eyes
- Duplicate JSON keys are last-wins in both decode passes and are not detected.
- `help()` with absent study: `absent` is an `any` holding a string. The test checks `.startsWith`, so it relies on the importer returning a JS string.
- `goja` argument conversion: `simd.executions('a','b')` relies on a missing argument converting to `""`, as `hardware.pairs()` already does.

### What should be done in the future
- Run gofmt, `go vet` and `go test ./pkg/tracesimd ./pkg/traceapi ./cmd/trace-repl`, and record the exact failures here.
- Once the parent's capture generator produces a real study, run `simd.executions` on PIE and matched scalar for each role and author the pedagogical article from the measured numbers.

### Code review instructions
- Start at `tracesimd.Parse` and `checkTrace`, then `Study.Executions`; then `traceapi.InstallSIMD`; then `newService`.
- Validate: `gofmt -l pkg cmd && go vet ./... && go test ./pkg/tracesimd ./pkg/traceapi ./cmd/trace-repl`.

### Technical details
- Error codes: `malformedStudy`, `badDigest`, `imageDigestMismatch`, `duplicateImage`, `notFixedWidth`, `malformedDecision`, `pathOutsideDataset`, `badSourceInterval`, `unknownImage`, `malformedRange`, `rangeOutsideImage`, `misalignedRange`, `overlappingRanges`, `malformedTrace`, `unsafeInteger`, `pcOutsideImage`, `misalignedPC`, `duplicatePC`, `countOverflow`, `stepsMismatch`, `malformedPacketSet`, `malformedPacket`, `duplicatePacket`, `duplicateDecision`, `duplicateTrace`, `duplicatePacketSet`; query-time `unknownDecision`, `unknownTrace`, `unknownRole`, `unknownWorkload`, `crossImageJoin`.
- `tracesimd.MaxSafe = 1<<53 - 1`; ranges are half-open `[start,end)` byte offsets; static instructions = `(end-start)/4`.

## Step 3: Query the merged :3794 corpus with my own joins and record the evidence

The operator reported that my implementation loaded the real corpus and that the extended service on :3794 is live (`../input/results.txt`). In this step I used my own candidate room on that service. I wanted three things: to confirm the merged corpus identity myself, to rerun the original and candidate workbook joins independently, and to collect the specific demonstrations the article needs. Those are the physics join, an observed zero, an absent role, cross-image refusals, and the boundary between emulator counts and physical device time.

All five cells returned `ok: true`. The service identifies the corpus as study SHA `4548c1192cfd1f660947fe1387ed1b9ea8f2ccd2a7094c2183d87cb3c5fbc203`, with 8 images, 22 decisions and 75 traces. That matches the operator's description. My own segment accounting turned up one finding the workbooks do not state: in all four packet arms, the instructions outside the four inner-loop segments total exactly 2,434,380.

### Prompt Context
**User prompt (verbatim):** "Resume your original implementation session as evidence researcher. Your load implementation passed the real corpus; the live integration on the original three 3793 images and the extended :3794 service works. REQUIRED: you now have your own room on :3794. Write request-candidate-1.json, request-candidate-2.json etc in your current working directory as before, read reply-candidate-1.json etc. Query simd.help and run your own scientific joins, including new candidates and the independent physics join simd.executions('physics-guarded_soa_pie','physics-guarded_soa_pie-particle-n128','packed-arithmetic'), with absence vs zero example and cross-image refusal. Read ../input/results.txt, workbook.json, candidate-workbook.json, and the two collector scripts. Author a clear substantive newcomer textbook vault article in report.md (~1800–2800 words), no analogies. Explain mathematical join, evidence identity, full group/leading lane differences, missing vs observed zero, original and novel optimization outcomes, uncertainty and exact reproducible calls with real results. Include a diagram, table, code, file references. Extend diary.md with full-format entry incl actual evidence and failed attempts and source revisions; update design.md if final interface changed. First code checkpoint f0df85a. Full final Go test result awaited; do not assert it unless read from a fresh operator receipt. Operator handles vault commit and push. Deadline broad but save early. Do not modify code without a specific test failure. Mention sourceSHA claimed by capture, images independently verified; workload IDs are names, not result or fixture digests. Distinguish uninstrumented physical paired timings vs instrumented emulator. Research subject is the evidence system: do not generalize to unseen cases. Precise measurement statements, readable prose, no analogies."
**Assistant interpretation:** Use the live provider as a researcher, verify the reported numbers with my own cells, then write a newcomer article grounded only in replies I have read.
**Inferred user intent:** A publishable account of what the identity-checked join proves and what it does not, with calls that a reader can replay.
**Commit (code):** f0df85a is the first code checkpoint, per the operator. I made no code changes in this step.

### What I did
- Read `../input/results.txt`, `workbook.json`, `candidate-workbook.json`, `03-capture-ray.mjs`, `07-capture-packet-candidates.mjs`, `04-simd-workbook.js`, `09-candidate-workbook.js` and `03-evidence-lane-coordinator-diary.md`.
- `request-candidate-1.json`: `simd.help()` and a listing of every decision and trace.
- `request-candidate-2.json`: 13 roles × 5 ray arms via `simd.executions(arm+'-row', arm+'-opening', role)`.
- `request-candidate-3.json`: the required physics join; guarded PIE and scalar helpers at n7/n8/n64/n127/n128; an observed zero at n7; absent roles; two cross-image refusals; a same-image join to another function; an unknown trace.
- `request-candidate-4.json`: segment overlap and coverage per arm from `simd.counts`; packet census; source SHA of ray decisions; a packet query for a physics workload.
- `request-candidate-5.json`: the board image identities matched to emulator traces; uninstrumented scalar→PIE paired device medians; whether the candidate images were ever on the board.

### Why
- The workbooks were produced by the coordinator. Replaying the numbers in my own room tests the provider's public API and keeps the article from repeating figures I have not observed.

### What worked (actual replies)
- `help()`: `available: true`, `absent: null`, and 8 images (bytes): stock 9,564; scalar 10,384; pie 10,308; empty 10,332; full 12,684; physics `48f9254b…` 1,652; `ced49a39…` 1,476; `79809bfa…` 3,400.
- Ray `function` role executions equal trace steps in every arm: 3,608,697 / 3,199,910 / 3,131,435 / 2,983,602 / 2,954,486. `pcsOutsideFunction: 0` in all four packet arms.
- Scalar→PIE: producer 175,065 → 106,095; control 34,845 → 35,340; full-packet store 25,080 (8 PCs) → 3,135 (1 PC); prefix store 990 → 990; lane load 26,070 → 26,070; hit continuation 399,200 → 399,200; backedge 156,420 → 156,420.
- Empty arm: input load 3,135; min-reduction 3,135; packed-subtraction 1,024; store 1,024; lane load 9,182; producer 53,257; backedge 61,425. Full arm: max-reduction 1,024; store 282; lane load 3,246; extract 5,936 (8 PCs); producer 35,271; hit continuation 60,106 (69 static); backedge 389,389 (595 static).
- Segment check: in each of the four packet arms the 45 segment ranges do not overlap. In-segment executions are 765,530 / 697,055 / 549,222 / 520,106, and outside-segment executions are 2,434,380 in every arm.
- Packets: 3,135, all 8 lanes, pose `default`, 100 rows with packets. Of those, 2,111 are all-miss, 282 mixed and 742 all-hit, with 6,983 hit lanes. `sourceSHA` is `b0a7c02b…143e0f`, the same value as every ray decision's `source.sha256`.
- Physics join: 16 executions, executedPCs 1 of 2 static, witness `{pc:740, executions:16}`, traceSteps 126, image `79809bfa…`.
- Observed zero: guarded_soa_pie n7 packed-arithmetic returned executions 0 at 0 of 2 PCs, the PCs are not listed in the histogram, and traceSteps is 107.
- Absent role: `empty-row` has no `single-prefix-scratch-store` and no `extract-full-hit-lane`, so both return `unknownRole`.
- Refusals: `crossImageJoin` for physics (79809bfa… vs 48f9254b…) and for ray (`pie-row` × `full-opening`). The same-image join `physics-guarded_soa_pie` × `physics-guarded_aos_pie-particle-n128` is legal and returns 0/0/2/938.
- Board: stock/scalar/pie board image SHAs equal the emulator trace images (ELF CRC `0d2e18b8` / `bd9a8467` / `ab91b817`). The empty and full images are not among the board images. Scalar→PIE default pose: clean median 242 µs (n=6, 217–307, 0.4295%); primary 251 µs (n=6, 202–271, 1.527%).

### What didn't work
- Earlier, in Step 1, a response of mine was stopped by a safety classifier after `request-2.json` had been written. I neither reissued that request nor used its reply. In this step no cell failed.
- No Go test failure has been sent to me since Step 2, and I have not seen a fresh operator receipt for the full final Go test run. I make no claim about it.

### What I learned
- The join is defined at image granularity. A decision for one function can legally be joined to a trace that ran a different function in the same image, and the result (0 here) is a true count, not an error.
- Role names are labels written by the collectors. In the full arm, `scalar hit continuation` fell to 60,106 while `packet backedge` grew to 389,389 with 595 static instructions. Comparing those labels across arms compares where the emitter attached each label, so the article reconciles step deltas over segment sums, not over single labels.
- The candidate collector does not define `single-prefix-scratch-store`. The 990 leading-lane operations are still present arithmetically (9,182 = 8 × 1,024 + 990), but the provider correctly refuses to report a role that was not recorded.

### What was tricky to build
- Telling missing from zero required two different demonstrations. A role that exists, with PCs omitted from a complete histogram, is a zero (n7). A role that does not exist is a refusal (`unknownRole`), even though the work may have occurred.

### What warrants a second pair of eyes
- The constant 2,434,380 outside the segments is my own derivation from public calls (`request-candidate-4`). It depends on the collectors' segment boundaries.
- The physics n7 and n127 traces retire more instructions than n8 and n128. I report this but do not explain it.

### What should be done in the future
- Physical timing for the empty and full images, and an operator receipt for the final Go test run.

### Code review instructions
- Replay `request-candidate-1..5.json` in a fresh :3794 room and diff the replies against `reply-candidate-1..5.json`.

### Technical details
- Source revisions: none in this step. The code in `pkg/tracesimd`, `pkg/traceapi/simd.go` and `cmd/trace-repl` is unchanged since Step 2 as far as this workspace shows.

## Step 4: Write the newcomer article and record the interface lessons

I wrote `report.md`, a textbook-style vault article built only on replies from Step 3 and the supplied inputs. It covers evidence identity, the join as a formula, the original scalar→PIE outcome, full groups versus leading lanes, the two candidate strategies, missing versus observed zero, the physics join, emulator versus device evidence, uncertainty, and replayable calls. It has one mermaid diagram, four tables, code cells with their real results, and file references. I also added a short section to `design.md` on what the real corpus taught about using the interface. The interface itself did not change, so I did not revise the API description.

### Prompt Context
**User prompt (verbatim):** see Step 3.
**Assistant interpretation:** Produce the final pedagogical article and keep the design document truthful.
**Inferred user intent:** A newcomer can understand and replay the evidence without overreading it.
**Commit (code):** none. The operator handles the vault commit and push.

### What I did
- Wrote `report.md`. Edited two sentences after rereading. The first claimed the 990 leading lanes were unchanged in the candidates, but no role observes them there; it now says the 990 term appears in the arithmetic decomposition. The second was an editorial phrase about the decision reason.
- Added "Lessons from the real corpus (interface unchanged)" to `design.md`.

### Why
- The brief asks for precise measurement statements and no generalization. Every number in the article appears in `reply-candidate-1..5.json` or the supplied workbooks, or is arithmetic on those values, and the arithmetic is shown.

### What worked
- The candidate workbook's predicted/observed pairs (16,888 and 5,936) and the scalar→PIE gap (68,475) reproduced in my own room.

### What didn't work
- No failures in this step.

### What I learned
- The per-label comparison for the full candidate would mislead (hit continuation −84.9%). The article uses reconciled segment sums instead.

### What was tricky to build
- Keeping three kinds of identity apart in prose: verified image SHA, the capture's claimed source SHA, and workload names.

### What warrants a second pair of eyes
- Article length is near the upper end of the requested range once tables and code are included.
- The physics n7/n127 observations are reported without explanation, which is deliberate.

### What should be done in the future
- Add the operator's fresh Go test receipt to this diary when it arrives. Run a paired board study before making any physical claim about the empty or full images.

### Code review instructions
- Check `report.md` numbers against `reply-candidate-2.json` (ray roles), `-3` (physics, zero, refusals), `-4` (segments, packets) and `-5` (board, paired timings).

### Technical details
- Derived values used in the article: 3,131,435 − 2,983,602 = 147,833 (4.7209%); 3,131,435 − 2,954,486 = 176,949 (5.6507%); 2,983,602 − 2,954,486 = 29,116 = −17,986 + (−11,130) + 0; 175,065 − 106,095 = 68,970; 68,970 − 495 = 68,475; 8 × 282 + 990 = 3,246; 8 × 1,024 + 990 = 9,182.
