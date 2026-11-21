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
