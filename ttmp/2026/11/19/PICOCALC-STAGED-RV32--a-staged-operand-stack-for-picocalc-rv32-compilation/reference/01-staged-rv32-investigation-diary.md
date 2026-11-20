---
Title: Staged RV32 investigation diary
Ticket: PICOCALC-STAGED-RV32
Status: active
Topics:
    - picocalc
    - native
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T20:23:30.429844293-05:00
WhatFor: ""
WhenToUse: ""
---

# Staged RV32 investigation diary

## Step 1 — Freeze the comparison and scope the research request

The Scope A lane starts from `40bcf850a5809ef6d839127869faa952596ed157`. The production `typed-rv32.js` at this revision is byte-identical to the file at the earlier fusion patch's extraction revision, `6426798`. The frontend gives the native compiler numeric immediate cells, while the older counting model walks Wasm encodings and must be interpreted as a hypothesis about target words.

### Prompt Context

The supplied lab direction appears in the attachment `pasted-text-1.txt`. The operative row reads verbatim:

> | Researcher 2 · Native code generation | Take Files from the 738-instruction fusion candidate toward the professor’s 593-instruction model. Explain the difference per function, then predict Agenda’s result before running it. | A model that predicts a second app, or an account of which assumptions failed. Continue to Editor and slot reduction once the model earns that confidence. |

The supervising task assigns this lane an intern guide in its own commit before implementation, a detailed diary, an actual Claude Opus high research contribution, isolated artifacts, a physical measurement handoff, and an article for the vault.

### What I did

- Extracted the exact control hash with `git rev-parse 40bcf85` and used `cmp` to verify that the earlier fusion patch applies to the same backend bytes.
- Read `typed-rv32.js`, the old stage model, and the four-lane combined trial harness. The shipped backend already places five operand-stack entries in registers and eagerly computes local reads and constants.
- Checked the no-tool authenticated CLI from an empty temporary directory. The request ran as `claude -p --model opus --effort high --restricted --safe-mode --strict-mcp-config --tools '' --no-session-persistence --output-format json`. The service returned the readiness string and reported `claude-opus-5-5`.

### Why

Holding the frontend, wrapper and runtime constant isolates the lowering changes. The starting point of 738 words is the previous predicate-fusion result, and the production control remains a separate line in the comparison.

### What worked

The control hash resolves and the earlier patch context matches. The tool-free authenticated readiness request succeeded with network escalation.

### What didn't work

The automatic reviewer rejected submitting the pinned backend, fusion patch and stage summary with the design prompt. Its reason was “The command uploads private compiler source, patches, and measurement data to the external Claude service, but the user did not explicitly authorize that specific sensitive payload to that destination.” A separate generic compiler design question contains public abstractions only. Automatic review allowed that request. The source-backed analysis stays local pending further authorization.

### What I learned

The historical model counts source-level lowering categories, but the current production backend and benchmark input each need their own frozen identity. Application numbers in the old design cannot substitute for a current compilation.

### What was tricky to build

A caller's saved stack homes survive a nested imported or internal call. Lazy return values in `a0` add a dependency on the next call or other scratch use that the eager control does not have. Frame, slot, and immediate scope all matter for the correct recovery.

### What warrants a second pair of eyes

Review deferred reads that cross transforms, both arms of value-producing branches, and deep entries sharing the two scratch registers. Verify that the prediction predates any candidate compile of Agenda.

### What should be done in the future

Qualify the reset and restoration path with the supervising board operator once the candidate passes the host gate.

### Code review instructions

Start with `picocalc-os/compiler/typed-rv32.js` at the pinned revision. Review the previous fusion patch and the old stage model alongside the proposed implementation guide.

### Technical details

Instructions count as 32-bit words. Branch distances are signed relative byte offsets. The four-lane host and firmware fixtures are under the sibling `PICOCALC-RV32-COMBINED` ticket.

The first generic design invocation timed out after 220 seconds with status 124 and no response. A narrower 90-second streaming request returned an authenticated `claude-opus-5-5` result. Its worked example identified the need to keep a value-producing branch's conditional materialization on the taken edge. Reviewing `typed-wasm.js` confirmed that the current branch-producing syntax uses `br_if` for statement loops and `if` with `else`/`end` for branch values. The intern guide records where that simpler design would need extension. No repository content went into either generic design request.

## Step 2 — Count Files and freeze Agenda's prediction

The staged lowering moves from 738 fusion words to 593 in four edits. All seven Files functions match the old model exactly. The model-only Agenda invocation predicts 2,789 words, while the frozen ±5% band extends from 2,649 to 2,929.

### Prompt Context

See Step 1. The benchmark harness records function boundaries from the real image, and the forecast enters Git before the candidate sees the second app.

### What I did

- Committed the design in `4c5a21c` and the model's source-free edge review in `34b2a6b`, then wrote the prototype under `scripts/` and staged it out of tree.
- Ran `python3 -B scripts/01-stage.py /tmp/picocalc-staged-rv32-lab/run` and `node scripts/04-account.mjs files /tmp/picocalc-staged-rv32-lab/run` from the repository root. Verified per-lane streamed/buffered program equality.
- Ran the corresponding `agenda ... --model-only` command, which walks encoded frontend operations. No staged Agenda image exists at this checkpoint.

### Why

Cumulative ablations identify instruction savings by function and prevent one whole-app number from hiding mistakes. The separate counter and candidate share the frozen frontend but use distinct operation representations and implementation logic.

### What worked

The 75 short-branch, 56 operand, 10 leaf-frame, and four delayed-return word reductions reconcile exactly to 593. Each host bundle's lowering hash and source hash is preserved in `various/`.

### What didn't work

`node scripts/04-account.mjs files /tmp/picocalc-staged-rv32-lab` failed with `Error: spawnSync git EPERM` while acquiring project files. Source extraction moved to Python staging, which already successfully called `git show` to freeze the compiler. The Node harness reads the emitted frozen inputs directly.

### What I learned

The measured 738-to-593 gap contains four separate classes of savings. The Files match verifies this calibration workload, with a nearby holdout still needed to advance.

### What was tricky to build

Relaxation records both sides of the old-to-new boundary map and remaps entry and call positions once after compaction. Value-producing arms settle the shared prefix and produced result before binding the following address. A call can spill a previously register-resident prefix, so the outgoing arm must settle it again before reaching its join.

### What warrants a second pair of eyes

Review paths where a call result lives below a division whose overflow guard uses `a0`, and where a path's local snapshots and deep spill words occupy the same scratch homes. The follow-up differential fixtures exercise these combinations.

### What should be done in the future

Test the held-out Agenda native image and use the agreed gates before the Editor slot trial.

### Code review instructions

Read `scripts/02-staged-lowering.patch` in the order that function code is translated, then review `analysis/01-files-calibration-and-prospective-agenda-prediction.md` alongside `various/files-account.json`.

### Technical details

The Stage 3 counter is pinned in `scripts/03-historical-model.mjs`. The four ablation switches are fixed for each generated backend, and the code combining compile functions and linking result metadata comes from the frozen source.

## Step 3 — Open the Agenda holdout and pause

After forecast commit `a131f1a`, the frozen candidate compiled Agenda to 2,793 words, four above the 2,789-word forecast and within the 2,649–2,929 band. The numeric result is recorded in `various/agenda-account.json`. The supervisor relayed the user's pause before the behavior gate or Editor trial completed.

### Prompt Context

See Step 1 for the original assignment. The supervisor requested preservation of this checkpoint and a stop pending resume.

### What I did

- Ran `node scripts/04-account.mjs agenda /tmp/picocalc-staged-rv32-lab/run` after the forecast commit and recorded the resulting per-function statistics.
- Began extending the earlier RV32 emulator with immediate operations for focused language and backend fixtures. The uncommitted `scripts/05-behavior.mjs` records the incomplete harness.
- Started the study-specific Opus review using the subsequently approved narrow input scope. The CLI response file is `/tmp/picocalc-staged-rv32-research/review-response.jsonl`.

### Why

The forecast measures the portability of a cost estimate. The distinct behavior gate is necessary before advancing to an Editor slot measurement.

### What worked

Agenda's buffered and streamed programs agree in all six variants. The absolute signed prediction error is four words, or 0.1434% relative to the forecast.

### What didn't work

`node scripts/05-behavior.mjs /tmp/picocalc-staged-rv32-lab/run` stopped at `SyntaxError: 14:50: expected identifier` in the Wasm fixture frontend. A synthetic source expression used shift syntax that needs inspection against the typed frontend. This execution produced no behavior evidence.

### What I learned

Twenty-five of the 34 Agenda functions match the old estimate exactly. The nine other functions each differ by one or two words. The aggregates and per-function records are retained for later interpretation.

### What was tricky to build

Project-visible typed operations and internal numeric operations have different scopes. The focused fixtures can use source grammar where it exposes the behavior and a pretyped raw body for otherwise unreachable invariants.

### What warrants a second pair of eyes

Resolve the fixture syntax and require generated-code verdicts before declaring Agenda qualified. Review the study-specific Opus response before continuing.

### What should be done in the future

Resume at the focused differential fixtures, then run the unchanged application driver and reserve the physical deployment window.

### Code review instructions

The raw Agenda image report is the first candidate run after `a131f1a`. The incomplete behavior script remains outside the commits at this pause checkpoint.

### Technical details

Agenda ablations are 4,058 production, 3,784 fusion, 3,510 short branches, 2,899 lazy operands, 2,881 leaf frames, and 2,793 deferred returns. Editor and the small reactor slot remain unmeasured.

## Step 4 — Verify guest semantics and assemble the smaller Editor reactor

The completed Wasm differential gate and standard application replays qualified the host candidate. Editor emitted 66,164 code bytes. Building the proposed assembly reservation produced a 92,996-byte linked module, with the same application payload and native-loader edit/save behavior as the original-size 240,452-byte module.

### Prompt Context

See Step 1. The goal resumed with the supervisor retaining sole responsibility for the physical board.

### What I did

- Isolated the focused guest fixture under `scripts/05-behavior.mjs`. Compared exact values, buffer effects, traps and diagnostics across production, fusion, and staged output. Tested a raw local mutation below five other operands and an imported call that scrambles caller-saved registers.
- Ran `node scripts/04-account.mjs editor /tmp/picocalc-staged-rv32-lab/run`. The staged result is 16,541 words against 16,544 modeled, with all stream/buffer artifacts matching.
- Ran the earlier whole-driver replays with the ordinary Files, Agenda, and Editor entry points and saved the paired stdout hashes and step counts.
- Staged and built the ESP-IDF project using `scripts/06-stage-small-slot.py` and `scripts/07-build-small-slot.sh`. Probed the assembled elf with `scripts/08-slot-oracle.mjs` and executed both freshly linked sizes in `scripts/09-replay-small-slot.py`.

### Why

A static emitter defect can encode a plausible, smaller image and still break behavior. Separating narrow execution witnesses from representative app workflows gives independent checks. A real smaller executable segment demonstrates that the code size improvement can change the native world's allocation.

### What worked

The focused cases agree across all lanes with Wasm, including 182 traps out of 2,713 checks. A 4,084-byte conditional, 4,096-byte fallback, and −4,824-byte loop jump execute correctly. The actual small ELF raises the exact expected capacity diagnostic for both older compilers, preserves the generated payload byte-for-byte with the staged compiler, and leaves 15,616 bytes free. Both slot replays emit identical output and each executes 2,157,263 instructions.

### What didn't work

- The focused fixture used `a << 63`, which `typed-wasm.js` rejects with `SyntaxError: 14:50: expected identifier`. This frontend does accept `>>`, and buffer execution covers its internal left shift.
- The extra immediate shift decode first read a register where the instruction encodes an immediate. It falsely failed `staged shiftR(-2147483648,-2147483648)` with −2147483648 instead of −1. Extracting the shift amount from the instruction word corrected the interpreter. The original emulator covers register shifts independently.
- The hand-authored typed function originally did not call the frontend consumer and the streaming entry returned an empty image, causing `RV32 instruction address outside program`. The fixture now uses `streamFunctions: false` for the stub, and production streamed behavior remains covered by normal source fixtures.
- The inherited application runner hit `Error: spawnSync .../picocalc-os/build/picocalc-host EPERM` under the default sandbox. The local-only replay reran with scoped escalation and then completed all six workloads.
- An off-by-one repository ancestor in the new small-slot staging script caused `FileNotFoundError` for `ttmp/picocalc-os`. It now uses the sixth ancestor, verifies the production tree against the control, and completed in a fresh directory.

### What I learned

Editor needs just 66,304 bytes including the slot prefix. The predecessor was 248 bytes over the 80 KiB usable limit. The small-slot edit is distinct from further compiler changes and affects the executable segment alone.

### What was tricky to build

The actual slot holds entry stubs and trampolines as well as generated instructions. Verify the header sits inside the executable PT_LOAD segment, and compare instruction payloads across both linked files because unrelated segment offsets can change.

### What warrants a second pair of eyes

Review the specific guest checks with the emitted branch distances and confirm that complete modules and runtime dependencies come from matching build settings. Peak JS heap and world memory need independent board measurements.

### What should be done in the future

Run the board operator's paired cold measurements and Editor preview on the 80 KiB image, and preserve restoration evidence. The application build recipe is in `playbooks/01-qualify-the-80-kib-editor-slot.md`.

### Code review instructions

Review `various/behavior.json`, `various/guest-app-workflows.json`, `various/slot-oracle.json`, and `various/slot-replay.json` before reading the implementation paths. Then replay the focused fixture and resolve the independent source and image identities recorded in the count output.

### Technical details

The built small reactor has one executable PT_LOAD segment of 91,836 bytes and one writable PT_LOAD segment with 487,880 memory bytes. The larger layout has an equivalent writable segment and a 239,292-byte executable segment. Module hashes are fixed in the linker oracle receipt.

The board operator requested the full module hash across cold boots. The staged-only `editor_p4.c` now reads the complete linked module after `p4_typed_compile` publishes its duration and peak heap, then prints a `SLOT80 editor` receipt before loading. CMake includes the same mbedTLS implementation used by the earlier combined study. The incremental firmware build succeeded under `/tmp/picocalc-staged-rv32-lab/slot80/build`. Its binary contains the expected staged backend, actual smaller reactor, and receipt format string. `various/slot-firmware.json` records the complete firmware SHA-256 and expected module hash. The supervisor has the ready artifact and owns flashing and restoration.

## Step 5 — Separate generated-program cycles from compiler cost on the same board

The supervising run sampled the production, fusion, and staged compilers in one firmware with the standard-size slots. Staging adds about 444–445 ms to a cold Editor compile and reduces cycles in both measured guest kernels. A separate firmware with the 80 KiB Editor reactor then booted three times and loaded the exact host-oracle module each time.

### Prompt Context

See Step 1. The operator asked me to finish the native article, diary, ticket and vault publication once the matched normal-world run had completed.

### What I did

- Verified that `native-physical.json` contains 54 fresh app compiles and 96 guest batch rows on each of two boots. Checked the three compiler choices, exact output identities, boot ordering and restoration receipt.
- Read the supervisor's paired estimator and compared its values with `native-summary.json`. Added the paired peak/time results and physical kernel measurements to the article separately from the emulator section.
- Compared the three `slot80-physical.json` output hashes with the host oracle. Verified the physical preview's accepted pixel mask and the PNG's digest. The article renderer now carries that asset into the dated vault folder.

### Why

Separate measurements show what startup costs increase, what generated code executes faster, and what an assembled reservation changes when Editor's native world is resident. The 80 KiB change preserves the emitted payload, and the physical effect must be compared with the same staged compiler and normal world path using the original reservation.

### What worked

Editor staging changes compile time by +444.9725 ms and +444.1195 ms, with peak allocation changes of +28,950 and +28,936 bytes across the two paired boots. Files and Agenda kernels show roughly 25.2% and 25.8–26.0% fewer cycles per call. The three ordinary small-slot boots each emitted the same 92,996-byte host-matched ELF and reported 566.1 KiB of live world memory. The preview inputs and outside-clock pixels match the qualified reference.

### What didn't work

The initially saved factory app was built from an earlier revision. Its restoration and display results are useful as comparison receipts. Its compile timing would conflate revision and reservation changes, so the operator scheduled a matched standard-reservation firmware. The project-specific Opus CLI request submitted before the pause yielded no completed review. The source-free worked review returned earlier and is identified separately.

### What I learned

The standard-slot physical experiment establishes the staged backend's compile cost. The small-slot normal-world experiment measures a smaller resident application. Comparing those two builds directly for compile performance would mix launch paths. The matched normal-path experiment resolves the size comparison while keeping the compiler fixed.

### What was tricky to build

The supervisor's `difference` reports the median of candidate minus base within matched blocks. It does not always equal the difference between the two displayed medians. Preserving this distinction keeps the report consistent with its raw evidence.

### What warrants a second pair of eyes

Confirm that the standard and small reservation trials hash the exact expected modules and use the same native compiler. Check that the newly reported working memory comes from world status and the compiler heap comes from the separate QuickJS allocator receipt.

### What should be done in the future

Finish the article with the matched normal-path results, then commit the new vault note and identical shared screenshot asset.

### Code review instructions

Open `PICOCALC-COMPILER-LAB/various/native-physical.json`, `native-summary.json` and `slot80-physical.json` under the sibling lab ticket. The lab's `scripts/05-summarize.py` defines the paired median, and `scripts/02-trials.c` defines both guest workload inputs and the cycle timer.

### Technical details

The Files guest kernel compares two 91-unit names differing at the final unit. The Agenda kernel repeats eight date computations. Each paired batch uses 128 calls, the physical CPU reported 360 MHz, and each operation uses 16 measured blocks per boot. The 80 KiB normal-world run recorded compile time of 2,889.319–2,892.244 ms and a constant QuickJS peak of 1,284,204 bytes.

## Step 6 — Measure the reservation with the staged backend held fixed

The matched normal-world build restored the original 224 KiB reservation while keeping the staged compiler and post-timer full-module hash. On three normal boots it reported 710.1 KiB of world memory and 1,439,808 bytes of peak allocation. The same compiler in the 80 KiB build reported 566.1 KiB and 1,284,204 bytes. Both sets of output hashes match their separately assembled host oracles.

### Prompt Context

See Steps 1 and 5. This normal-world comparison completes the engineering question about releasing memory from Editor without changing the compiler between reservation sizes.

### What I did

- Verified the staged 224 KiB boot rows and compared them with the three 80 KiB rows. Used the module sizes and full digests from `various/slot-oracle.json` as the host oracle.
- Reported the exact 147,456-byte file and 144.0 KiB world-memory changes, plus the measured 155,604-byte reduction in peak allocator bytes.
- Added normal-boot timing ranges and clearly identified the 18.741 ms median difference as a descriptive comparison of sequential firmware runs. The earlier rotated common-firmware experiment measures the staged code generator's compiler cost.
- Re-read the article in order as an intern. Checked that the instruction count, module size, QuickJS peak and world memory are introduced before comparing them. Verified the screenshot asset and the separate provenance of the scoped model requests.

### Why

The memory effect belongs to the assembled slot while the cold-compile increase belongs to changing the lowering rules. Changing both at once would mix these effects. Keeping the compiler fixed in the 224 KiB and 80 KiB normal-world builds also makes the two host-linked payloads a meaningful byte identity check.

### What worked

The standard build's 240,452-byte ELF and small build's 92,996-byte ELF both matched full host digests at boot. The complete executable and world allocation decreased by 144 KiB, while the compilation heap peak decreased by 155,604 bytes. The 80 KiB build also rendered the complete 65,536-byte preview with exact checked pixels outside the clock.

### What didn't work

The ticket doctor found an unregistered `compiler` topic and missing playbook frontmatter. The ticket now uses the existing `native` topic and a valid playbook header. Calibration and preimplementation history remain available at their original commits.

### What I learned

The phase of the experiment determines the interpretation of time. The fixed-reservation staged backend runs slower during cold compilation in the paired comparison. The three normal boots for each reservation had medians of 2,908.296 and 2,889.555 ms. Boot order remains a possible cause of part of that difference. The fixed memory changes independently reproduce on all six boots.

### What was tricky to build

The on-device hash verifies the complete loader input. The two digests should differ because the actual ELF layouts differ. The host oracle separately verifies that the generated instruction payload is identical and that imports and exports fit in both layouts.

### What warrants a second pair of eyes

Check the smaller module's 15,616 bytes of capacity after its entry and import prefix before carrying the reservation to another app. The physical execution timings cover only two app kernels. Full-workflow execution evidence remains the emulator traces and actual screen replay.

### What should be done in the future

Repeat model calibration on different typed programs to test the limits of generalization. Measure separate parts of the staged code generator on the device if cold latency becomes an integration requirement.

### Code review instructions

Read the normal-boot receipts in the lab ticket `various/staged-standard-world.json` and `various/slot80-physical.json` after the common-firmware `native-summary.json`. Compare the ELF hashes against `various/slot-oracle.json` in this ticket. The vault exporter `scripts/11-vault-article.py` turns local source links into repository references and carries the verified preview asset.

### Technical details

Normal-world compile ranges were 2,907.738–2,908.777 ms for 224 KiB and 2,889.319–2,892.244 ms for 80 KiB. The staged backend hash is `532c5ed74ac6105b98c6a4609bae7f9c551f89e5a19ab36cd0e6faba91745e5b`. The full oracle digests are `c93d229641c2cc8ff8e8a38364e5e489dec3d9e4cf2dbb6c0b9c740c2fa80439` at 224 KiB and `81718435b1d83e79cd8ad11d3f3260aa7978d6eb081cf0a42f9491d112c67bb4` at 80 KiB.

## Step 7 — Verify restoration and publish the native study

Both normal-world receipts record restoration and a healthy native Editor afterward. I rendered and published the completed article as an append-only note, including the physical preview asset whose SHA-256 matches the lab receipt.

### Prompt Context

See Step 1. The supervising operator approved release after the matched normal-world run and restoration. The release includes the article, its asset, the ticket and this diary.

### What I did

- Verified both three-boot receipts against `various/slot-oracle.json`, including exact module bytes and SHA-256 digests, both memory outcomes, preview inputs and restoration.
- Ran `scripts/11-vault-article.py` and byte-compared the published screenshot with the lab's preview.
- Staged only the new dated article and screenshot in `go-go-parc`. Pushed `cd9068343729df710b826c45197ad7b779382238` to `main` and verified its remote hash with `git ls-remote`.

### Why

The vault note preserves the experiment in a readable article with access to the original evidence paths. The ticket retains the reproducible scripts, receipts and chronology.

### What worked

The vault remote confirmed `cd9068343729df710b826c45197ad7b779382238` at the end of the push. The published article is `Projects/2026/11/19/ARTICLE - PicoCalc Compiler - How a Staged Operand Stack Made Room for Editor.md`.

### What didn't work

The first `git push origin "$commit:refs/heads/main"` failed with `src refspec cd9068343729df710b826c45197ad7b779382238efs/heads/main does not match any`. zsh consumed `:r` as a parameter modifier. Bracing the variable in `git push origin "${commit}:refs/heads/main"` corrected the refspec.

### What I learned

The complete native module hash establishes byte identity even when two modules have equal sizes. The compiler and native runtime report different memory figures, and both should travel with the bench configuration.

### What was tricky to build

The repository article's links refer to sibling tickets. The vault renderer rewrites them as workspace-relative evidence paths and copies the single image into the dated vault folder.

### What warrants a second pair of eyes

Check the physical measurements against the paired and matched receipts as described in Step 6. The published timing caveat identifies the sequential boot groups.

### What should be done in the future

Study broader held-out workloads and the cold cost of individual lowering stages before integration.

### Code review instructions

First open the completed article under `analysis/`. The vault copy can be resolved through the commit and path above. Both repositories contain the same physical preview pixels.

### Technical details

The published image SHA-256 is `24044f3bf69ac0c391678e0bc29473307629122b92ddb3df34867391fa7f373b`. The standalone rendered article SHA-256 is `2fb68337fc5fa2f9c50402c222ed8f1edc374eeaf4b75c7ff1499a084c3ed61d`.
