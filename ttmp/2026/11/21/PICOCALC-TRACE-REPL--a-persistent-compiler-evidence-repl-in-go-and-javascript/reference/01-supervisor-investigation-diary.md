---
Title: Supervisor investigation diary
Ticket: PICOCALC-TRACE-REPL
Status: active
Topics:
    - compiler
    - performance
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T14:20:47.00276564-05:00
WhatFor: ""
WhenToUse: ""
---

# Supervisor investigation diary

## Step 1: Commission the query language and set up a blind usability study

The previous workbook could check its assumptions against a real compiler archive, but could not execute the language it proposed. The new ticket makes those examples acceptance cases for a local service. One worker owns the Go session lifetime, one owns authenticated archive reads, and Opus owns the JavaScript query evaluator. A separate research worker owns blind usability trials and the living playbook.

### Prompt Context

**User prompt (verbatim):**

> Ok, write a go version using ~/code/wesen/go-go-golems/go-go-goja, with a REPL service so that you don't need to recompute everything all the time but can keep things in the sandbox emmory. Create a new docmgr ticket, use subagents at your leisure, run subagents as personas with pi coding agent deepseek-4.1-flash that pretend to be these compiler engineers / researchers, and analyze how well they use the tool / the API / the .
>
> Look at /home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/11/21/ARTICLE - Playbook - Improving an Agent-Facing JavaScript API with Persona Runs - Lessons from homolog-bench.md and
>
> Write up the design and spec and examples that you put out above, in the same level of detail (verbatim, if you want). Use opus xhigh to implement, and tell it to use deepseek-4.1-flash thinking high subagents (or a mix, if they want, with opus high and opus medium personas too), to do various optimization based tasks, simple but also complex. Have them write a playbook for the persona based testing (and update it as they improve their methods).

**Additional user instruction (verbatim):**

> also point them at Projects/2026/11/21/ARTICLE - Playbook - Persona Sessions with Agents - Improving Software and APIs from Usability Reports.md

**Assistant interpretation:** Implement a stateful Go-hosted evidence workbench, run the specified agents against its actual interface and preserve a repeatable testing method.

**Inferred user intent:** Learn both what the existing compiler evidence can answer and how independently working compiler engineers discover those answers.

### What I did

- Created `PICOCALC-TRACE-REPL` with docmgr. Identified the prior design, its 26 small modules, independently verified facts and the six indexed pass logs.
- Gave the Opus xhigh implementer an isolated work directory, the workbook, both requested articles and a precise native bridge. Its production output is subject to independent checks. The durable brief is `scripts/commission/opus-query.md`.
- The usability worker verified the installed Pi provider ID `lunaroute/deepseek-4.1-flash`. Isolated persona sessions receive the public interface and goals. Reviewers retain the answer key.
- Wrote the native installation boundary in `pkg/traceapi/install.go`. Go copies archive records into the requesting JavaScript VM as plain data. The host's mutable Go state stays behind read-only methods.

### Why

Persisting a VM saves the investigator's calculations and bindings. Sharing the immutable archive also saves decompression across investigators. Confusing those two kinds of reuse makes memory and performance claims difficult to test.

### What worked

The compiler archive, both source articles, the local go-go-goja checkout, Claude Code and the Pi provider catalog were present. The Goja checkout contains runtime and REPL implementations suitable for source-level inspection.

### What didn't work

The initial sandboxed `pi --list-models deepseek` returned `EROFS: read-only file system, mkdir '/home/manuel/.pi/agent/trust.json.lock'`. The usability researcher verified the installed provider with permission to perform ordinary Pi startup. No model name was inferred from a marketing label.

### What I learned

The source workbook includes several queries whose correct answer is missing evidence. The original study never recorded per-PC samples. A compiler workbook can test a negative capability as precisely as an integer count.

### What was tricky to build

LLVM offsets are bytes into the *inflated* log. A JS string offset would use UTF-16 code units. Keep slicing and integrity validation in Go and return strings only for already selected byte ranges.

### What warrants a second pair of eyes

Check that two identical pass names cannot collapse into one entry, missing scope cannot become zero, and user-owned state never crosses session boundaries.

### What should be done in the future

Replay the original workbook, run the blind personas, reproduce their findings and repeat a revised task on a fresh session.

### Code review instructions

Start at `pkg/traceapi/install.go`, the commissioned evaluator brief and the original workbook appendix. Compare the command's session lifecycle with the archive's independent lifetime.

### Technical details

A middle/backend ordinal belongs to one variant and one stream. Every usable pass witness must include its stream SHA, ordinal and half-open byte range.

## Step 2: Move product ownership to Opus and define the scientific acceptance criterion

The user clarified both the product objective and the director's role. The research lab now grades a tool session on the engineering decision it enables. Opus xhigh owns the product implementation, including follow-up fixes. The other engineers' prior contributions remain identifiable as drafts made before that handoff.

### Prompt Context

**User prompts (verbatim):**

> what is your role in all this?

> yes, and the overall goal is: allow researchers/users to design and validate optimizations for compiler building. that is the entire goal here, and eveyrthing we are building should support that endeavour.

> i think you should let implementation entirely to opus xhigh, and focus on vision, direction, having the lab work well and getting the best out of each

**Assistant interpretation:** Conduct the experiment, calibrate the researchers and direct Opus. Retain independent verification.

**Inferred user intent:** Avoid letting the machinery become the research objective. Assign clear accountability for production code and reserve independent capacity for scientific review.

**Prior checkpoints:** `4a0da78` established the ticket and Opus brief. `f7447b1` and `b8456db` contain the initial Go archive and session work. `c5e3f69`, `06239ed`, `28db3be` and `ec61d4b` freeze the usability protocol and evidence checks.

### What I did

- Directed the service and archive engineers to stop editing product code. Transferred their current source, tests and working-tree changes to an isolated Opus xhigh implementation workspace. The full handoff is in `scripts/commission/opus-owner.md`.
- Included both requested playbooks in the query implementer's workspace, the ownership handoff and the independent usability protocol.
- Added a research decision cell. It asks whether the scalar-to-PIE change saves at least one percent on every measured pose in the original P4 study. The threshold is an explicit example decision rule.
- Asked the usability researcher to keep the original blind cards frozen and independently add a task that requires a design, a control and a falsifier.

### Why

A matched physical result can establish the effect of a particular compiler change on the test corpus. A static LLVM transformation can locate a mechanism worth prototyping. Distinguishing these claims is essential to the research objective.

### What worked

The upstream Node witness independently reproduces 41,949 fewer guest instructions with LLVM loop strength reduction. The physical-study engineer matched 144 comparison groups to the original board summary before handing off the draft. Both permit an evidence-based acceptance test independent of the public interface.

### What didn't work

The first checkpoint attempted to write a Git index in the restricted workspace and returned `fatal: Unable to create '/home/manuel/code/wesen/2026-10-20--ds-js-os/.git/index.lock': Read-only file system`. A scoped approved `git add` and `git commit --only` recorded the intended seven files. Independent changes in this worktree require path-scoped commits.

### What I learned

A REPL can make a weak claim convenient. The rubric must separately assess the population, treatment, outcome, control, correct interpretation of missing data and a proposed discriminating test.

### What was tricky to build

All visible persona cards and their answer checks were frozen before the implementation was exposed. The additional scientific decision card is labeled separately, preserving the interpretation of the baseline.

### What warrants a second pair of eyes

The physical trial provider has three treatment IDs and four phases. The primary and shading phase timings come from separate measurements. The clean-frame comparison must read its own measured column.

### What should be done in the future

Give Opus any reproducible product issue from the baseline. Have a fresh persona use the candidate and independently compare the scientific quality and path to the answer.

### Code review instructions

Read the ownership brief, the frozen task cards, the original hardware pairing script and `scripts/11-test-optimization-claim.js`. The checked-in selection and expected results supply independent acceptance evidence.

### Technical details

One complete default-frame comparison uses six matched hardware blocks. The ELF identities differ across treatments; the Typed source identity and fixture checksums agree. The per-pair percentage uses that pair's baseline, then the analysis takes the median.

## Step 3: Commission individual research reports and a coordinated vault publication

The publication plan now separates experimental roles. Two Opus xhigh sessions own the product. Opus High researchers study evidence, runtime lifetime and actual agent use. Pi DeepSeek Flash High sessions remain the independent test users. I will write the synthesis after the underlying reports and measurements are available.

### Prompt Context

**User prompt (verbatim):**

> Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
>   Chose opus high for researchers
>   Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
>   analogies, see skill).
>    Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.

**Assistant interpretation:** Assign explicit model, authorship, audience and publication responsibilities to each research group. Give every author the diary and textbook requirements.

**Inferred user intent:** Build institutional knowledge from the experiments and preserve how the lab reached each conclusion.

**Commit (design):** `bbb9d9e` — Define compiler optimization decision tests and hand product ownership to Opus.

### What I did

- Commissioned three distinct Opus High studies. The evidence scientist traces a compiler claim from a pass observation to a controlled dynamic comparison and a board trial. The runtime scientist studies the lifetime of a researcher's working state. The usability scientist studies how blinded compiler engineers use the actual workbench.
- Assigned a detailed investigation diary and an independently authored technical article to each scientist. The individual assignments specify both persona playbooks and the intended newcomer audience.
- Read the vault and textbook style instructions. Checked the vault remote and branch. At preflight the vault reported `## main...origin/main` with no changed files.
- Added a fresh-session benchmark to separate evaluating an expression, repeating the plan, and reading an explicitly saved result. Every timing includes the same evidence payload.

### Why

Using different models for engineering, research and blinded evaluation reduces the chance that the implementer's assumptions set the answer key. A single publishing editor can also keep citations and article revisions consistent without coordinating multiple pushes to main.

### What worked

The model registry, authorized Claude CLI, Pi harness and vault checkout are available. The evidence and service studies can run independently while the query implementer is generating code.

### What didn't work

The query implementer produced no intermediate source file during its first long generation. An initial elapsed-time check could not distinguish reasoning from a stopped request. Two narrow socket byte-count checks showed continued data delivery to that exact process. No second copy of the same implementation was started.

### What I learned

It is possible to distinguish a live external generation from a produced, reviewable artifact. Only the latter can qualify for the baseline persona run.

### What was tricky to build

The user requested both Opus High researchers and DeepSeek Flash test sessions. The assignments preserve the independent roles, model labels and evidence needed to audit authorship.

### What warrants a second pair of eyes

Check the reported version and effort against each actual provider run. Confirm each published article distinguishes independently executed probes from data reproduced from the older board study.

### What should be done in the future

Collect the findings, verify claims against code and artifacts, write the director's synthesis, push only the new article set, then verify the remote revision.

### Code review instructions

See the Opus briefs under `scripts/commission`, each researcher's diary and both named Articles in the November 21 vault folder.

### Technical details

The live REPL test uses one JavaScript binding across distinct HTTP calls, with isolated sessions and an immutable Go-side store. The publication is scoped to the go-go-parc vault; the compiler repository and the vault have separate Git histories.

## Step 4: Resume the implementation at a file checkpoint

The first long external response reached its per-generation limit before writing a file. The CLI had retained the session, so the implementation could continue with its original research and the same model. The revised instruction requested a small runnable first write followed by edits for the more advanced operators.

### Prompt Context

**User prompt (verbatim):** “what's the response limit, can't we just resume ?”

**Assistant interpretation:** Explain the observed limit and resume the original implementer with its context intact.

**Inferred user intent:** Preserve the expensive research and make the code incrementally available for validation.

### What I did

- Verified the provider transcript field `stop_reason=max_tokens` and the corresponding reported output-token count. Captured only these public operational fields in `various/opus-generation-checkpoint.json`.
- Confirmed the job had already begun another response with no source file on disk. Interrupted the specific supervised request, then resumed the same session using `claude --resume`, `--model opus`, and `--effort xhigh`. The follow-up is retained in `scripts/commission/opus-resume.md`.

### Why

A per-generation output limit does not erase the session's prior turns. Saving intermediate code lets the scientific test team validate an early capability while the implementer continues.

### What worked

Claude Code accepted the original session identifier for the resumed process. The preserved launch receipt identifies the resolved model as Claude Opus 5.5.

### What didn't work

The first long generation used 128,000 reported output tokens and stopped before creating `query.js`. Treating a live, receiving process as a finished deliverable would have falsely opened the qualification gate.

### What I learned

Use a source-file milestone and independently reproducible output as progress measures. Provider activity and long context alone establish neither.

### What was tricky to build

The CLI's JSON output can be an array of typed events. Extract only allowlisted model, stop and usage fields. Raw transcripts contain model and tool internals irrelevant to the research publication.

### What warrants a second pair of eyes

The observed 128,000 count belongs to this model run. It is distinct from session context capacity, the service's 512-KiB result bound and the persona tool's display excerpt.

### What should be done in the future

Check the resumed candidate against the archived evidence and baseline tasks before calling a source checkpoint functional.

### Code review instructions

Inspect the original and resumed briefs together with the small operational receipt. Confirm subsequent source changes are made by Opus and participant trials use the integrated executable.

### Technical details

The resumed session ID was `29795c5a-0bc3-4d46-a5b4-e7e7972ec2c9`. The public result of the interrupted CLI invocation was empty.

## Step 5: Freeze the service and test what researchers conclude

The resumed Opus query implementer delivered an embeddable language. The initial Goja integration exposed a discrepancy between LLVM's printed header and the normalized header stored in the event directory. After the Opus product owner repaired it, I froze the service for independent researchers. The scientific errors in their reports turned out to be more consequential than the first syntax errors.

### Prompt Context

**User prompt:** See Steps 1–3 for the implementation, ownership and scientist-report instructions.

**Assistant interpretation:** Qualify the real product on research decisions as well as query results.

**Inferred user intent:** Identify changes that make it easier to design and validate optimizations without teaching investigators to draw unsupported conclusions.

**Commit (code):** `df7a7b6` — Integrate the Opus compiler evidence language and verified persistent service.

### What I did

- Independently ran the archive, physical provider and session race suites after the Opus owner's review. The first integrated query run failed with `[unknownFunction] function in variant checked "row" is unknown. Valid:`. Examined checked event headers directly; the stored middle-end header reads `IR Dump After EarlyCSEPass on row`, while the query parser had required trailing asterisks.
- Resumed the Opus owner with the failing test, normalized headers, and the distinction between a loop block and a function. Re-ran the query suite in the actual repository before freezing its binary.
- Launched the blind baseline through the service operator. Executable SHA-256 starts `d8a8b5ae1c6f`. Startup verified all six streams (30,912,391 bytes). The serving process and the tests used the actual go-go-goja dependency.
- Ran the original 26 modules through HTTP, the saved-binding benchmark and the board-claim decision cell. Independently confirmed the default hardware result and twelve out of twelve poses below the example one-percent criterion. The preserved initial replay includes both an adapter failure at example 13 and a harness binding mistake at 26.
- Commissioned Opus fixes for three distinct issues: loop evidence and adjacency, attempted re-execution of already materialized descriptors, and ambiguous treatment/field descriptions. The baseline remains an immutable reference.

### Why

The baseline should capture the user's experience with a named executable. Modifying help or scope resolution in the live process during the first batch would invalidate comparisons between participants.

### What worked

The full `go test -race -count=1 ./...` passed on all five packages with loopback permitted. The first-decrease cell reported 73→74, 11→6 static sites. A fresh HTTP session took 170.56 ms to evaluate it. Median repeat-plan and saved-binding round trips were 2.26 ms and 0.52 ms across seven samples each. These timings include identical evidence serialization and measure this host under the study load.

### What didn't work

- The first sandboxed full race run failed at `listen tcp 127.0.0.1:0: socket: operation not permitted`. The loopback-enabled rerun passed. This was a transport test setup failure.
- A DeepSeek participant queried `scope.kind === "loop"`, obtained zero and included that false conclusion in its report. The raw compiler stream contains 42 checked-middle prints whose first nonempty body line is `; Preheader:`. Ordinal 88 identifies one by its byte range.
- Another investigator counted null owners and block names as functions. A researcher designing a two-register experiment interpreted `rowBytes` as a correctness artifact, although the original C capture defines this field as linked code size. A numeric answer checker alone passed these participants' numerical tasks.
- My first HTTP workbook wrapper invoked example 26 without binding its symbolic arm. The published example says to run it twice. Corrected the validation script to run both requested treatments.

### What I learned

The strongest finding concerned silent misclassification. A rejected type of input costs an extra query. A plausible zero with the wrong scientific meaning can survive into the final report.

### What was tricky to build

Headers for loop passes sometimes name only a basic block, while module and function prints use different scopes. A missing ownership fact should interrupt a pass-attribution claim; it cannot be filled by the investigator's confidence. The physical clock, emulated counts, linked symbol size and verified output size also require distinct labels.

### What warrants a second pair of eyes

Retest original ordinal 88 and the two-function checked module against the repaired process. Verify any proposed attribution to an individual pass across a gap in original ordinals. Compare descriptor diagnostics and treatment metadata directly before judging the fresh personas.

### What should be done in the future

Freeze the converged release, run the same probes and a held-out allocator question, then record independently graded outcomes and remaining problems.

### Code review instructions

Inspect the two physical/raw fixture producers, `pkg/traceapi/query.js`, the public receipts under `various/personas/`, and the exact operational scripts. The young library's own integration tests and the direct archive oracle provide independent ways to check the same research claim.

### Technical details

Both ablation inputs are checked LLVM builds on the same 160 opening-scene rows. A 41,949-instruction reduction describes this controlled pipeline comparison; attributing the entire gain to a specific PC requires data absent from its published aggregates.

## Step 6: Qualify a second frozen executable and replay the research decisions

The corrected service keeps source facts, tentative interpretations, and experimental treatments separate in its public answers. I kept the baseline live and checked the new process first with user programs written before this implementation. This gave the usability researchers two independently addressable builds with the same underlying evidence.

### Prompt Context

**User prompt:** “what's the response limit, can't we just resume ?”

**Assistant interpretation:** Check the actual Opus CLI receipt and continue the original implementing session across an output cutoff. Preserve the lab director's ownership of scientific review.

**Inferred user intent:** A per-response limit should not interrupt a multi-step experiment or transfer implementation to the director.

### What I did

- Coordinated a second release from four Opus implementation work areas. Qualified the three integration intersections covering loop provenance, materialized values, and treatment descriptions. Required a conservative distinction between an adjacent owner and an owner actually named by a loop header.
- Left the original process on port 3791 and received the corrected executable on port 3792. The on-disk executable hashes begin `d8a8b5ae1c6f` and `523f185499f3` respectively. The candidate embeds the query library beginning `482260a43163`.
- Ran the original 26 modules through one named HTTP session. Each returned a result. Read the absence diagnostics in examples 12, 13, 17 and 22 and checked that example 26 received both parameter bindings. Kept full small responses and a digest plus excerpt for larger ones.
- Independently replayed the device decision cell and the session-reuse measurement. The candidate reproduced the rejection of the one-percent claim on all twelve poses. For an already running host server, seven repetitions returned the identical witness. Median end-to-end times were 1.883 ms for rerunning the plan and 0.383 ms for reading the saved result.
- Checked the service operator's executable identity and asked the usability lane to conduct four fresh blind retests and a held-out allocator question against that immutable process.

### Why

The workstation runs several builds of the same experiment. A listening port or an invocation of the latest source alone cannot establish which language answered a blind question. The executable digest, embedded JavaScript digest and archive digests distinguish the relevant variables.

### What worked

The original workbook reached the genuine evidence boundary at checked event 88. The new API answers the function-wide question with a typed absence and preserves the exact loop evidence. Static and dynamic ablation estimates and physical paired measurements remain independently reproducible.

### What didn't work

Two tests from an intermediate work area required ownership from pass-manager adjacency. Those expectations contradicted the integrated conservative semantics. I returned the failures to the Opus author to keep their positive coverage for names and anchors while checking uncertainty explicitly. The manuscript for the baseline service was already final, so it stays labelled with its baseline digest.

### What I learned

An invalidated loop pass can print the containing module while the event's subject still names a loop. This accounts for the 438th firmware loop event beyond 437 explicit preheader prints. Subject attribution and measurement coverage require separate fields.

### What was tricky to build

Reconciling public query behavior, the pass-manager evidence and tests developed against earlier prototypes required retaining a single frozen candidate during the persona sessions. An implementation note from a scratch checkout records the author's local results, while the independent release receipts describe the code the participants exercised.

### What warrants a second pair of eyes

Review adjudications for causal claims and for quantities labelled as output correctness. Compare observed agent behavior with the scientific controls independently of task completion.

### What should be done in the future

Complete the authored usability report and synthesize the conclusions across the archive, runtime and investigator studies. An independently observed behavior change is stronger evidence than a help change that only looks clearer.

### Code review instructions

Start with `pkg/traceapi/release_test.go`, then the checked-loop fixture and the three release replay files in `various/`. The panel's answers belong to the usability report.

### Technical details

The workbook verifies executable programs and defined absence results, without asserting that every possible compiler question has a corresponding captured observation. Runtime measurements include transport and serialization. The shared archive could already be warm when the fresh VM was opened.

## Step 7: Review the blind retest and qualify the compiler research recommendation

Nine investigators finished. The corrected pass-scope results survived a raw-stream census and a held-out allocator investigator distinguished a machine-function flag from execution. I accepted these as individual scientific observations, then checked a remaining performance extrapolation against the populations each experiment sampled.

### Prompt Context

**User prompt:** “the overall goal is: allow researchers/users to design and validate optimizations for compiler building.”

**Assistant interpretation:** Qualify the workbench through an experiment somebody could actually run, including evidence against the claim and evidence that remains missing.

**Inferred user intent:** Give the lab a tool, a way to improve that tool, and a report through which a new engineer can reconstruct the reasoning.

**Commit (code):** `6494e30` — Preserve compiler scope uncertainty and identify measured optimization treatments.

### What I did

- Reviewed all nine persona outcomes recorded by the usability lane at `64d6dda`. The candidate catalog, pass, ablation and optimization cards repeated the original questions. The fifth card asked a new allocator question.
- Read the independent grade, the baseline and candidate receipts, and the correspondence between raw print and normalized loop event. Checked one remaining unsupported roughly 3.9% whole-frame extrapolation against its primary-phase physical numerator and opening-row emulation denominator.
- Ran the full Opus candidate regression set unmodified on the research host. The six final integration checks and the conservative loop-coverage regressions passed. Ran `go test -race -count=1 ./...` on the real five-package module with loopback enabled and `go vet ./...`. Both succeeded.
- Wrote the director's report and executed its exact two JavaScript blocks against port 3792. They returned the original 73→74 change and six paired opening-scene records. The new article includes the candidate versus stock control choices and a proposed two-value register treatment with its own correctness and hardware gates.
- Validated the ticket with `docmgr doctor --ticket PICOCALC-TRACE-REPL --stale-after 365 --fail-on error`. Added a local ignore for two directories of original experiment inputs so the validator scans the actual managed documents.

### Why

Running programs and checking numeric answers could not detect the two baseline investigators' additional false statements or the incorrect follow-up hardware projection. The scientific object of review was the inference from an observation to a proposed compiler change.

### What worked

The corrected input semantics, raw-stream oracle and held-out allocator witness agreed on what each question could establish. All five Go packages passed the race detector. The held-out problem did not use a repeat participant.

### What didn't work

The revised optimization metadata did not prevent the fresh optimizer from constructing a quantitative projection across different units and populations. There was also a residual type error when an eager descriptor was put into a query bundle. Both findings are retained in the usability report.

### What I learned

Improving the honesty of a single API result is practical. Correctly combining good results into a new causal claim is a harder research problem. Each comparison needs its own explicit population, denominator and control.

### What was tricky to build

The original test author had used an earlier version of the loop provenance contract. The Opus engineer revised the test to independently assert absence of an established owner and presence of the observed adjacent hint. The verified implementation and running candidate share the exact embedded language digest.

### What warrants a second pair of eyes

The study has one participant in each build and card cell. Worked examples expose several names and ordinals. Preserve these limitations in the vault reports and in any future performance or usability claim.

### What should be done in the future

Collect instruction-address-level Typed counters for identical inputs, isolate the register choice, add invalid-input tests, then collect new device data. The manuscripts describe the decision rule; this work did not implement the proposed raytracer treatment.

### Code review instructions

Read `scripts/32-replay-director-article.py`, the nine public receipts, the Opus scientific reports, and the frozen executable's identity. A new investigator can replay the study from the CLI without access to the authors' temporary directories.

### Technical details

The candidate binary was frozen while its source was in the working tree. The committed `pkg/traceapi/query.js` at `6494e30` hashes to `482260a431634db8de4dcea6f17d8600dc4fc75b1e1d9ce2feca023db7f25dea`, the same full JavaScript bytes found in the executable on 3792.

## Step 8: Reconcile the final manuscript and publish four vault articles

The final Opus High article returned with enough detail to reproduce the candidate pass query. During editorial review I asked the researcher to check which board data the baseline process supplied, whether the original service already accepted plan options, and the larger checked-row timeline. The author and operator checked the live services before publishing.

### Prompt Context

**User prompt:** “Each researchers when done, and you once you have all the results: write a detailed project report for the obsidian vault ... Commit and push ...”

**Assistant interpretation:** Publish the three researcher articles and the director's final synthesis together, with individual authorship, reproducible evidence and source revisions.

**Inferred user intent:** Make each investigation accessible to newcomers and give future researchers enough detail to audit the lab's conclusions.

**Commit (code):** `1fdb07f` for the reviewed usability study and `4b436b2` for the final director synthesis and publication preparation. The remote vault commit is `9114af1a208584e44e5f0557314a97c774047bba`.

### What I did

- Checked the final opus-authored study against the running baseline and candidate receipts. Both processes returned physical observations. Only the candidate root help mentioned hardware. Valid bindings and maxRows already worked in both. The revised text records the differences participants actually experienced.
- Read the exact 99→144 checked timeline reconciliation: 42 loop events, two module events and function-subject event 144. Included the independently recovered remainder in the director’s article.
- Staged four vault notes from their committed manuscript bytes with `scripts/31-stage-vault-articles.py`. Checked relative research links before copying, added author and source-revision metadata and linked each article to the other three.
- Copied four new notes into the user's 2026/11/21 vault folder. Checked source and destination bytes, committed only the four notes, pushed main and read back the remote branch head. The vault working tree was clean and matched origin/main.

### Why

A researcher’s failure to find a provider is evidence about discovery. Treating it as proof of missing measurement data would change how a reader interprets the two builds. The correction and the final note revisions belong in the reproducible study.

### What worked

The publications are distinct studies of the underlying observations, the Goja runtime, the behavior of research users, and the compiler experiment suggested by all three. Original query bindings and both service processes remain available to their existing users.

### What didn't work

The first draft treated differences in visible help as differences in access. A first accounting of the timeline change also left one event unexplained. The live readback resolved both before publication.

### What I learned

The release identifier and original ordinals allowed an unexplained single-event discrepancy to be settled after the main experiment had ended. A qualitative research report can benefit from the same replay discipline as a numerical benchmark.

### What was tricky to build

A ticket-relative source link is correct in the project and can point to a nonexistent file in another Git repository. The publishing script resolves such links against the checkout while retaining a source path and revision in each note.

### What warrants a second pair of eyes

The three long researcher articles distinguish captured experiments from proposed future ones. PC-level evidence and new physical timings still have to be collected before claiming a speedup for a two-register cache.

### What should be done in the future

The proposed compiler experiment and the remaining usability findings are documented for a separately commissioned investigation.

### Code review instructions

Compare the four manuscript revisions in the publication metadata with the note bodies in the vault commit. Read `various/usability-timeline-reconciliation.json` for the live control comparison and `various/director-article-cells.json` for the numerical examples in the director's report.

### Technical details

The vault's local and remote SHA-1 were identical after the push. The project has local implementation and documentation commits. This publication touched only the four new files in the vault.
