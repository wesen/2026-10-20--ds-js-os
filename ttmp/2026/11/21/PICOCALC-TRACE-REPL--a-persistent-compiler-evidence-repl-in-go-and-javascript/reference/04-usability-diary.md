---
Title: Usability diary
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
LastUpdated: 2026-11-21T14:23:49.083979257-05:00
WhatFor: ""
WhenToUse: ""
---

# Usability investigation diary

## Step 1: Commission three blind sessions

I prepared three role cards and one tool that evaluates JavaScript on a named loopback session. I checked that Pi could reach the requested provider using a generic transport prompt before exposing any study data.

### Prompt Context

The full implementation request is recorded in the supervisor diary. The user's additional instruction was “also point them at Projects/2026/11/21/ARTICLE - Playbook - Persona Sessions with Agents - Improving Software and APIs from Usability Reports.md”. I took this to require fidelity to the observed-query and independent-reproduction methods of both named playbooks.

### What I did

- Read both vault playbooks and the project verifier. Created separate briefs for a compiler intern, a middle-end engineer and a performance reviewer. Every role receives the same common brief with both method references.
- Confirmed provider and model using `pi --list-models deepseek`. Added an explicit provider extension and `--thinking high` for the subsequent real calls.
- Implemented a Pi tool accepting exactly one string and a standard-library Python runner that creates and deletes a fresh service session, starts Pi in an empty directory and retains only actions and final answers.

### Why

A token representing a name can occur in several compiler prints. The optimizer persona must establish identity and adjacency. A summary of aggregate executed instructions can justify a pass ablation on a workload, but it cannot by itself identify the critical PC. These two examples test different kinds of evidence discipline.

### What worked

Pi listed `lunaroute/deepseek-4.1-flash` with thinking support. The scoped transport probe returned exactly `READY`. Pi also loaded the isolated analysis extension and listed the same model without an extension error.

### What didn't work

`pi --help` in the workspace sandbox failed with `EROFS: read-only file system, mkdir '/home/manuel/.pi/agent/trust.json.lock'`. Running Pi with the necessary access resolved its local lock. A generic probe using `--no-extensions` then returned `No API key found for lunaroute.` Explicitly loading only the installed Lunaroute provider extension restored model discovery and authentication.

### What I learned

The user's default Pi configuration loads unrelated tools. The provider supplies both model discovery and authenticated transport through an extension. A controlled room needs an explicit provider plus an explicit tool selection.

### What was tricky to build

The measurement needs the executed queries, not just a fluent final answer. Pi's JSON mode emits both public events and private thinking deltas. The runner filters event types and retains only tool-start, tool-end and final user-visible message data.

### What warrants a second pair of eyes

Check whether any claim in the final debrief is unsupported by the retained replies. Exact numerical answers can mask accidental disclosure through a help example.

### What should be done in the future

Run the baseline against the stable executable, reproduce findings and rerun affected cards.

### Code review instructions

Read the common brief and all three cards, then the runner, its Pi extension and the two source playbooks linked from the operator guide.

### Technical details

Every session has a ceiling of fourteen evaluations and eight minutes of wall time. Service loopback is fixed by the host. The model sees neither a session ID nor a general-purpose network primitive.

## Step 2: Freeze the answer key and preserve completed queries

I independently inspected the compiler archive before running any participant. I added a fourth card for a register-allocation reviewer to use after the main round. That card exercises machine IR and repeated pass names, a different input path from the three initial tasks.

### Prompt Context

See Step 1. The research question is whether independent compiler engineers can learn a public query interface well enough to answer real optimization questions. The harness checkpoint was `c5e3f69`. The initial oracle and three pre-registered questions were committed at `06239ed`.

### What I did

- Used the checked middle index to locate ordinal 74 at byte 240363, with the next record starting at byte 248127. Verified the inflated stream digest.
- Ran the original TRACE-QUERY Node verifier and added an independent scoring script reading the raw checked stream, checked backend and C execution JSON.
- Required a serving revision or executable digest on each receipt. Each completed public tool action is saved by atomically replacing the receipt. A repeated invocation requires a new output filename.

### Why

A plausible final number with the wrong denominator or evidence unit can mislead compiler work. The scoring helper explicitly labels matches as lexical. The reviewer checks that pass positions, totals, percentage signs, source availability and per-PC attribution match the actual evaluated records.

### What worked

The two independent readers agreed on 4,133 headers, the first reduction at 73→74, and 41,949 fewer executed instructions for the LSR-enabled controlled run. The backend index contains two register rewrites at 74 and 78.

### What didn't work

A first attempt to stage the protocol inside the restricted checkout returned `fatal: Unable to create '/home/manuel/code/wesen/2026-10-20--ds-js-os/.git/index.lock': Read-only file system`. A scoped, authorized Git add and commit recorded the intended files only.

### What I learned

Use a whole-function print to count direct load sites. A missing function body breaks the adjacency required to interpret a pass delta. The digest belongs to the inflated stream, and byte offsets use the same representation.

### What was tricky to build

A transient tool or provider failure may end a session before Pi produces a final answer. The runner now persists completed public tool actions during the session; it never stores thinking events.

### What warrants a second pair of eyes

Check endpoints and adjacent pass names from the raw archive and inspect the denominator in the ablation report. Confirm that an error from a wrong method is never accepted as evidence that the underlying data are unavailable.

### What should be done in the future

Run the fourth card independently with no access to the first round's answers or tool log.

### Code review instructions

Run the preceding ticket's `scripts/01-check-evidence.mjs` with Node and compare it with `read_ground_truth` in this ticket's `scripts/22-audit-persona-receipts.py`.

### Technical details

The independent static verifier counts the literal capacity pointer in this known C fixture. That spelling is a fixture-level oracle and does not generalize to arbitrary LLVM IR.

## Step 3: Commission a methodological reviewer and separate optimization design from evidence retrieval

The lab director requested an explicit test of whether researchers could design and validate compiler improvements. I retained the original baseline tasks and the register-allocation holdout word for word. A separately identified fifth card asks the researcher to propose and falsify a temporary-register-cache optimization.

### Prompt Context

See Step 1. The study supervisor instructed this lane to retain DeepSeek Flash high as the actual participants and commission a separate Opus High methodological researcher and textbook author. The experiment scripts/briefs belong to this study; the separate Opus xhigh implementer owns product fixes.

### What I did

- Pre-registered `scripts/personas/optimization.md` and added the five scientific-decision dimensions to the playbook at `ec61d4b`.
- Prepared a two-stage tool-free Claude Code commission at `ea22e97`. The first stage receives the task cards, operator methodology, both requested vault playbooks, and the diary and writing guidance. The publication stage additionally requires real completed trials and an independent grade.
- Restricted retained model output to the user-facing result and the model/effort identity. Filtered private model stream events out of the response before interpreting it.

### Why

Finding the right number exercises lookup. Designing a compiler intervention also requires proposing a code-generation mechanism, understanding the missing variable, and specifying a matched correctness and performance experiment that can reject the hypothesis.

### What worked

The new card and independent truth checks were committed before any participant saw the final service. Its rubric separates measurements the archive validates from proposals the current evidence can only motivate.

### What didn't work

The initial Opus protocol wrapper failed after the provider returned. The local error was `TypeError: list indices must be integers or slices, not str` at `result["result"].strip()`. This CLI returned an event list. I updated the reader to select its terminal result event, detect an error result, and keep only the public response when a structured document needs repair. I reissued the same protocol brief.

### What I learned

A methodological lead, participant and product implementer require distinct records and permissions. The lead may read the answer key after participants finish. The participants need only a public API. The product implementer receives concrete reproduced failures.

### What was tricky to build

If an outcome dimension was never asked for by an original task, assigning it a failure after changing the rubric would give a misleading comparison. The report records those cells as not elicited and uses a fresh decision task for the new question.

### What warrants a second pair of eyes

Inspect whether the independent scientific grade gives credit only for evidence the participant actually obtained and whether the proposed control preserves the algorithm and input.

### What should be done in the future

Complete the two-stage reviewer commission using the same written protocol. Publish the article only after its claims can be checked against the observed trials.

### Code review instructions

Review the stable earlier task cards with `git show c5e3f69`, the decision rubric with `git show ec61d4b`, then compare the final public action receipts to the findings table.

### Technical details

Claude used `--model opus --effort high` with no agent tools. Pi uses a separate provider and `--thinking high`. These settings label different roles.

## Step 4: Observe the researchers and reproduce a silent scientific error

I ran the three original compiler engineer personas and the separate optimization-decision card against the same frozen local binary. The numerical test key passed on all primary cards, yet two participants drew incorrect extra conclusions from the interface. That difference changed the priority of the implementation findings.

### Prompt Context

See Step 1 and the scientific decision instruction in Step 3. Baseline transcripts and raw verification are committed at `4efbbca`; the additional decision study and its initial manual grades are at `253f0fb`.

### What I did

- Recorded running ELF SHA-256 `d8a8b5ae1c6ff2c76f2e94e4f7a8c8c0dacb1c417d92c73a13b3adfcaa3f2dd4` and created separate VMs on loopback for each Pi participant.
- The live control allocated two additional rooms and checked binding persistence and isolation. It inspected all 13 named help topics. None of the six selected aggregate numbers appeared verbatim. Several help topics named a matching pass and supplied example ordinals, so I recorded the opportunity for guided discovery.
- Sent the confirmed errors to the xhigh implementer through the supervisor. Added small probes for the descriptor error and for the wrongly classified LLVM loop.
- Read the archived compressed bytes at the returned ordinal and independently counted prints whose first nonempty body line is `; Preheader:`. Recorded the count with the source digest.
- Commissioned an Opus High regrade with the action receipts and independent facts. My initial manual grades are withheld from this audit commission.

### Why

An agent's subjective experience is different from its scientific answer. Looking only at whether the instructor's expected numbers appeared in the final would have awarded the misleading loop conclusion full credit.

### What worked

All three original participants recovered the expected counts or matching ablation and supplied query evidence. Separate VMs preserved individual bindings. Starting a second participant did not alter the first. The optimization reviewer proposed a falsifiable experiment and distinguished it from its current measurements.

### What didn't work

Five actual calls in the first three sessions failed with `[notAPlan]` for values such as `arm.describe()`, `q.help()` and `a.streams()`. The baseline correction suggested an unrelated event count. More importantly, the actual call `q.run(a.variant("checked").events("middle").where(e => e.scope.kind === "loop").count())` succeeded with value 0. Ordinal 88 in that exact stream contains an explicit LLVM loop fragment. Its scope was reported as function `for.cond`. The intern's extra nine-function conclusion also included basic-block names and missing values.

### What I learned

Numeric correctness, units, scope classification, and causal attribution must be graded independently. Only 19.45% of the original direct stack accesses were removed in stock→scalar. The same difference is 61.39% of the change in overall instruction count. The latter percentage cannot establish that the candidate removed most stack traffic.

### What was tricky to build

A prompt requesting reusable evidence should count **all** tool attempts, also identifying tool calls refused before reaching the service. The ablation persona made 15 attempts, of which the first 14 reached the evaluator. When reading debriefs I matched each reported claim against actual replies rather than relying on the participant's own numbering of batched calls.

### What warrants a second pair of eyes

Check the scope of the full row-timeline differences. Some original ordinals contain only fragments. Recognizing a loop locally does not establish its enclosing function when the archive lacks an explicit ownership witness. Also distinguish the code size in `rowBytes` from pixel data used to check rendering.

### What should be done in the future

Replay the original ordinal-88 selection against the repaired binary, compare its source reference byte for byte, recheck the explicit fragment lower bounds and run the held-out allocator plus fresh discovery and optimization participants. The operator guide documents how to preserve those receipts.

### Code review instructions

Start with `various/personas/baseline-pass.json`, especially the scope-filter query and its final debrief. Compare `various/usability-loops-baseline.json` with `scripts/26-source-loop-census.py`. For the optimizer, read `various/personas/baseline-optimization.json` beside the raw C collector's calculation of the row symbol size.

### Technical details

For the checked stream, the original ordinal is 88, the start is 346976 and the exclusive end is 348729. The independent census found explicit preheaders in at least 42 checked, 42 unchecked and 437 firmware middle-end prints. The `typed-stock` direct stack-access pool is 1,290,106 across the opening scene's 160 verified row outputs; it does not classify accessible temporaries by depth.
