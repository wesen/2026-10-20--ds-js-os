---
Title: Lead usability researcher diary
Ticket: PICOCALC-TRACE-REPL
Status: active
Topics: [compiler, performance, picocalc]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
---

# Lead usability researcher diary

## Step 1: Reviewing the frozen protocol, the five task cards and the scientific-decision rubric before any scored session

This step is a methodological review that comes before any scored participant session in the PICOCALC-TRACE-REPL usability round. I read the protocol `01-running-blind-compiler-engineer-persona-sessions.md`, including its section `Protocol revision after the task was clarified`, which holds the new scientific-decision rubric. I also read the common brief `brief.md` and the task cards `catalog.md`, `pass.md`, `ablation.md`, `allocator.md` and `optimization.md`. The methods come from the two playbooks, `ARTICLE - Playbook - Improving an Agent-Facing JavaScript API with Persona Runs - Lessons from homolog-bench.md` and `ARTICLE - Playbook - Persona Sessions with Agents - Improving Software and APIs from Usability Reports.md`. The review asked one question. Where can a card return a number that looks correct but refers to a different unit, filter or scope than the card names?

No code, card or key changed in this step. I did not execute the runner, the verifier, Pi or the REPL service. No receipts were supplied, so this entry contains no results. The outcome is a list of failure points in filtering, blindness, truth keys and scope, each paired with a test the supervisor can perform. The companion critique states those amendments and tests. The task cards are preserved word for word. Where a card's wording creates a confound, the confound is recorded for the analysis and the card is left unchanged.

### Prompt Context

**Supervisor commission (verbatim):** "You are the lab's lead usability researcher, commissioned at Opus High. Independent DeepSeek Flash high compiler engineers are the actual blind participants. Your work is methodological review, your own chronological investigation diary, and later a research article using real evidence for new compiler students. Ground every claim in the supplied records. Do not assert that you yourself ran a tool or that any model is a human. The two named playbooks supply the methods. Preserve the experimental task cards. No analogies, slogans, semicolons or sales pitch. Use exact names for queries and files. Explain evidence units where used. Return a single JSON object, no code fence, with the requested Markdown bodies as JSON strings. No frontmatter.
Review the pre-registered protocol and the new scientific-decision rubric. Write the first detailed investigation entry for your own diary in diary-skill format, including where filtering, blindness, truth keys and scope can fail. Write a concise usable preregistration critique with verification tests the independent supervisor can perform. No result claims or article yet. Keys: diary, critique."

**Assistant interpretation:** Write two Markdown bodies and return them in one JSON object under the keys `diary` and `critique`. The diary body is the first detailed entry of my investigation diary, in the `investigation-entry.md` format. The critique is a concise preregistration review with tests for the independent supervisor. Results and the student article are out of scope for this step. The participants are independent runs of one language model, which the user identifies as DeepSeek Flash at a high thinking level.

**Inferred user intent:** The user wants the protocol's weak points found and made checkable before any participant run is scored. A later article for new compiler students can then rest on numbers whose units, filters and provenance were fixed in advance.

**Commit (code):** None. The working directory `/tmp/trace-usability-researcher-6a8jujbb` is not a git repository, and no repository file was changed.

### What I did

- Read these sections of `01-running-blind-compiler-engineer-persona-sessions.md`: `What the experiment measures`, `Prepare a round`, `Conduct the session`, `Score, reproduce and improve` and `Protocol revision after the task was clarified`.
- Read `brief.md` and the five cards. For each card I identified the evidence unit it asks about, the filter that defines its scope, and the request whose evidence may be absent. The table under Technical details lists these.
- Reread four sections of the homolog-bench playbook: the anatomy of a run (§3), the held-out scenario (§13), the tester under test (§15), and hidden internals with blind rooms (§11). I also reread §16 on repeats and paired comparison.
- Reread three parts of the Chromobench playbook: verifying findings, classifying a confirmed finding by layer, and ending a round with the fixed, left and not-reproduced lists.
- Read `investigation-entry.md` for the format of this entry. Read the `textbook-authoring` and `obsidian-vault-writing` skills for the later article. The vault skill defaults to YAML frontmatter, but the commission requested Markdown bodies; the local ticket writer attaches frontmatter.
- Did not run `scripts/21-run-trace-persona.py`, `01-check-evidence.mjs`, Pi, the provider check or the service. Every statement below about their behaviour quotes or paraphrases the protocol.

### Why

- The homolog-bench record shows that tester defects produce failures that look like the agent's own. Its §15 lists seven such defects, including step results cut to 300 characters and compute counted across parallel runs. The same record shows scenario metadata exposing answers until rooms were made blind (§11, `sim.scenarios()` in baseline2). Both risks have direct counterparts here: the receipt display limit, the shared in-memory archive and the content of `q.help()`.
- Each of the four areas named by the user decides whether a score refers to the unit the card names. Filtering decides which events or instructions are counted. Blindness decides whether the participant run derived the answer from the archive. The truth key decides what the score is compared with. Scope decides what a correct answer allows the later article to claim.
- I considered reviewing after the first receipts arrive and rejected that option. A key or filter definition written after reading answers can move toward those answers. The protocol requires the supervisor's key to state the expected unit and inputs, and that requirement only works if the key exists before the sessions.

### What worked

- The protocol already names four distinct units: a compiler event, a static instruction site, an executed instruction and an elapsed physical microsecond. It also requires the key to state the expected unit.
- It limits what a success establishes to this participant run, using the shipped interface, on this fixture.
- It requires an independent verifier that inflates each compiler log, checks its SHA-256 and never calls the service. It also states that agreement between two queries inside one VM cannot validate the evidence adapter.
- It tells scorers that a failed query does not establish absence. It gives credit for naming a concrete missing prerequisite, such as execution PCs and an image identity.
- The rubric keeps a prospective change a hypothesis until a matched experiment executes it. It scores help with experiment design separately from validation of a change.
- These provisions follow the playbooks closely. They are properties of the document, and none has yet been checked against the running harness.

### What didn't work

No command was executed, so there is no execution failure to report. Reading the documents found these gaps:

- `Prepare a round` says to choose three roles: intern, middle-end researcher and performance reviewer. The revision section counts three discovery cards, a reserved register-rewriter card and the optimization card. The protocol does not say whether `allocator.md` is the unused scenario, the equivalent of the held-out scenario in §13 of the homolog-bench playbook. It also does not say when that card runs.
- The rubric arrived after the discovery cards were frozen. Any rubric score on `catalog.md`, `pass.md` or `ablation.md` is assigned after the fact.
- Step 5 of `Prepare a round` requires a pre-registered ceiling on tool calls and on wall time. `brief.md` states a ceiling of 14 tool calls. No supplied document states a wall-time ceiling.
- The independent verifier covers compiler logs only. The protocol says to inspect dynamic summary JSON separately and names no independent check for it. The keys for `ablation.md` and `optimization.md` depend on that JSON.
- The finding category `evaluator defect` can mean a defect in the service's JavaScript evaluation or a defect in scoring. The two have different owners.
- The protocol asks for repeats, pairing by scenario, and an unused scenario and model. It sets no number of repeats and no comparison statistic.
- The receipt keeps each reply as Pi displayed it, with a 4,000-character limit. For findings about abbreviation, the protocol says to check the original evaluation outside Pi. It does not say that the full reply is stored.

### What I learned

- Filtering can fail at ordinal identity. `catalog.md` asks the participant to relocate the checked middle-end observation at ordinal 74. `allocator.md` asks for each occurrence's original ordinal. If the API renumbers results after a phase filter, position 74 in a filtered list and original ordinal 74 are different events. The key must say which ordinal space each card means and record both values.
- Filtering can also fail at the denominator of a count. `catalog.md` asks for the total number of archived observations and, separately, for counts per phase of the checked build. If the archive holds more than the checked build, the archive total and the sum of the checked-build phases differ. A participant run could report either one as the total.
- In `pass.md`, two consecutive whole-function prints can be separated by partial prints and skipped events. A decrease between them can be attributed to the later print's pass only when every intervening event is known not to change the function. The key therefore needs the full list of events between the two positions.
- Blindness has two sources outside the archive. `brief.md` tells the participant to use a new evaluation to reuse a name. The last sentence of `catalog.md` asks whether a binding survives a later call. Both point at REPL binding behaviour. The cards are frozen, so this round cannot measure discovery of that behaviour, and the analysis must report it as cued.
- The protocol keeps bindings per participant while sharing the in-memory archive. If the API registers named queries in the archive instead of the session, a later participant run can see an earlier run's queries.
- A truth key for an unavailable request must come from a positive inspection of the raw evidence, recorded before the sessions. Without it, a scorer cannot tell a run that correctly reports absence from a run whose query failed.
- Scope differs by card. `pass.md` and `allocator.md` concern static sites in printed functions. `ablation.md` and `optimization.md` concern executed instructions in emulation. Neither unit supports a claim about cycles or elapsed time. Wall time in a receipt includes model inference.

### What was tricky to build

No code was built. Three parts of the review needed care.

- **Attribution in `pass.md`.** The symptom would be a correct pair of counts with the wrong pass named. The cause is that the two prints are consecutive only within the filtered sequence of whole-function prints, not within the pass pipeline. The fix has two parts. The key lists every event between the two print positions, with its kind: whole-function print, partial print or skipped event. The scoring rule accepts the later pass as responsible only when the participant states the intervening events and the key confirms that none of them changed the function.
- **Ordinal lifetime.** An ordinal assigned when the archive is imported stays stable across sessions. A position in a query result exists only for that result. The key must fix which one `catalog.md` and `allocator.md` mean before any session. Both cards are frozen, so neither can be clarified to the participant later.
- **Register-rewriter occurrences in `allocator.md`.** The card states a colleague's belief about the first occurrence and asks about each occurrence. The key must record every occurrence in the checked row's backend, with its original ordinal and its machine-function property. The verifier should read that property from the print's raw bytes, so the score does not depend on the API's own parsing of the same header.

### What warrants a second pair of eyes

- Session isolation in the shared in-memory archive. This includes any named-query registry, and whether evaluated JavaScript can reach other sessions or the network.
- Whether receipts store the full reply behind each 4,000-character display.
- Whether the two LSR arms in the dynamic summary JSON come from builds that differ only in loop strength reduction, with the same source, input and target. Also whether their outputs were checked for equivalence.
- Whether one scorer can apply the five rubric properties consistently. The homolog-bench playbook (§16) records that its judge was never calibrated against a person and treats that as an open caution.
- Whether `q.help()` or any help topic contains a key value or a conclusion, as `sim.scenarios()` did in homolog-bench baseline2.

### What should be done in the future

- Amend the preregistration as listed in the critique. Record the amendment's hash and time before the first scored session.
- Ask the supervisor to perform tests V1 to V13 from the critique and to attach their records to the round.
- Step 2 of this diary, once receipts exist, will do three things. It will score each card against the frozen key, classify each failed action by category, and end the round with the fixed, open and not-reproduced lists.

### Code review instructions

- Start with `01-running-blind-compiler-engineer-persona-sessions.md`, sections `Prepare a round` and `Protocol revision after the task was clarified`.
- Then read three items: `$TICKET/scripts/21-run-trace-persona.py`, the task-specific Pi extension that fixes the target session and limits evaluations, and the verifier `01-check-evidence.mjs` in the PICOCALC-TRACE-QUERY ticket.
- The commands below are for the supervisor. I have not run them. Angle brackets mark paths the protocol does not name.

```sh
TICKET=ttmp/2026/11/21/PICOCALC-TRACE-REPL--a-persistent-compiler-evidence-repl-in-go-and-javascript
git rev-parse HEAD
git status --porcelain
sha256sum <server executable> <supervisor key file> <rubric file> <dynamic summary JSON files>
node ttmp/2026/11/21/PICOCALC-TRACE-QUERY--design-a-composable-javascript-query-api-for-compiler-traces/scripts/01-check-evidence.mjs
```

The verifier path is resolved from the protocol's relative link `../../PICOCALC-TRACE-QUERY--design-a-composable-javascript-query-api-for-compiler-traces/scripts/01-check-evidence.mjs`. This assumes the protocol sits in a direct subdirectory of the PICOCALC-TRACE-REPL ticket. The protocol does not state the verifier's arguments.

### Technical details

Evidence units used in this entry:

| Unit | Meaning in this round |
|---|---|
| Compiler pass observation (event) | One archived record of one pass's print for one unit of work, identified by its original ordinal in the archive |
| Static instruction site | One instruction in one printed function, counted once however often it executes |
| Executed instruction | One instruction executed during emulation of a workload, counted on every execution |
| Receipt wall time | Elapsed time of a participant run, including model inference, so it cannot measure the compiler or the service |

The cards and what the key must define for each:

| Card | Unit asked for | Filter the key must define | Request whose evidence may be absent |
|---|---|---|---|
| `catalog.md` | Events | Archive total versus checked build, the phase assignment rule, and the ordinal space for ordinal 74 | None stated. Binding persistence is a cue. |
| `pass.md` | Static sites: direct i32 loads through the first argument's address, per whole-function middle-end print | The direct-load matching rule, the whole-function test, the treatment of partial prints and skipped events, and the checked row function | The original source line for each eliminated load |
| `ablation.md` | Executed instructions over the checked opening-scene row workload, for both LSR arms | The workload region, the denominator and the matched arms | The program counter responsible for the largest share of the gain |
| `allocator.md` | Events: each virtual-register rewriter occurrence and its machine-function property | The checked row's backend and the original ordinal | A comparison with spills executed at runtime |
| `optimization.md` | The executed-instruction mix of the stock Typed build on the opening scene, plus at least one existing candidate | The region, and which candidates exist in the archive | Validation of the two-register temporary cache, unless the archive already holds a matched build of it |

Rubric properties and their scoring risks:

| Property | Checkable from | Scoring risk |
|---|---|---|
| Measured premise | A tool reply in the same receipt containing the number, with its unit, region and workload | Crediting a number taken from recall or from the card |
| Mechanism | The final answer | Crediting an explanation that is not tied to the generated operations on this workload |
| Discriminating evidence | The final answer, optionally with a query | Requiring the protocol's own example, which participants never see |
| Controlled validation | The final answer | Crediting a design that is described as already validated |
| Refutation | The final answer | Crediting an outcome that has no threshold or direction |

## Step 2: Reviewing the observed rounds, the independent grades and the repaired build, then writing the student article

This step closes my part of the PICOCALC-TRACE-REPL round. I read the nine participant receipts, four on the baseline build and five on the repaired build. I also read the replay files, the raw loop census, the independent baseline grades and the supervisor's analysis and diary. I compared them with the concerns recorded in Step 1, recomputed from the reply values every derived number I intended to publish, and wrote the vault article for new compiler students. I did not run the REPL service, Pi, the raw verifier or any script. Every statement about a reply quotes or paraphrases a receipt or a supervisor record.

The records support the primary numerical answer of every card on both builds. One silent scientific defect was reproduced on the same archived bytes and repaired: loop prints had been classified as functions. After the repair, the middle-end participant gave the correct account of partial coverage. My review found eight observations that the existing grades and analysis do not record. Most are participant claims that their own replies do not support, and they are listed under "What didn't work". The article separates measured effects of existing compiler options and treatments from proposals that were never built.

### Prompt Context

**User prompt (verbatim):** The request is quoted exactly, with one change. Its single semicolon is rendered as a paragraph break, so that this diary contains no semicolons as the commission requires.

> You are the lab's lead usability researcher, commissioned at Opus High. Independent DeepSeek Flash high compiler engineers are the actual blind participants. Your work is methodological review, your own chronological investigation diary, and later a research article using real evidence for new compiler students. Ground every claim in the supplied records. Do not assert that you yourself ran a tool or that any model is a human. The two named playbooks supply the methods. Preserve the experimental task cards. No analogies, slogans, semicolons or sales pitch. Use exact names for queries and files. Explain evidence units where used. Return a single JSON object, no code fence, with the requested Markdown bodies as JSON strings. No frontmatter.
>
> The observed rounds and independent grades now accompany this request. Author the final vault technical article for newcomers (roughly 2000–3000 words, concise when the evidence is thin). Work one real participant's question step by step from input through query, first failure/recovery, evidence and scientific recommendation
>
> teach static vs dynamic vs physical units. Describe method refinements, retests, remaining limitations, actual signature changes and which compiler optimizations were only proposed vs genuinely validated. Favor excerpts of real queries over reproducing whole transcripts. Include one diagram or pseudocode for reconstruction and an example of what a falsifying experiment would measure. Avoid duplication of the supervisor's results table. Check your draft against the actions, read it once as a newcomer, revise. Also write your final detailed diary step about review, observations and limits. Keys: diary, article.

**Assistant interpretation:** Return one JSON object with two Markdown strings.

- `article` is the final vault article for newcomers. It is built around one participant's question and covers the units, method refinements, retests, limitations, interface changes, measured versus proposed optimizations, a reconstruction and a falsifying experiment. It does not repeat the supervisor's attempts table.
- `diary` is this entry, written in the `investigation-entry.md` format.

**Inferred user intent:** The user wants a durable teaching note in which every claim can be traced to a recorded reply. They also want a diary record that leaves the round's open questions checkable by the supervisor.

**Commit (code):** None. `/tmp/trace-usability-researcher-albs5vdt` is not a git repository, and no file was written there.

### What I did

- Read every receipt step by step and compared each final answer with the replies it cites.
  - Baseline build `d8a8b5ae…`: `baseline-catalog.json`, `baseline-pass.json`, `baseline-ablation.json` and `baseline-optimization.json`.
  - Repaired build `523f1854…`: `candidate-catalog.json`, `candidate-pass.json`, `candidate-ablation.json`, `candidate-allocator.json` and `candidate-optimization.json`.
- Read the replay and census files: `usability-loops-baseline.json`, `usability-loops-candidate.json`, `usability-replay-baseline.json`, `usability-replay-candidate.json` and `usability-raw-loop-census.json`.
- Read the grades and supporting documents: `10-independent-baseline-grades.md`, `01-what-compiler-engineers-found-in-the-trace-repl.md`, `04-usability-diary.md`, the amended protocol `01-running-blind-compiler-engineer-persona-sessions.md` and the design document `02-research-questions-and-executable-queries-for-the-ray-row.md`.
- Chose `candidate-pass.json` as the worked example and traced it from the card through steps 3, 4, 5, 10, 11, 12, 13 and 14.
- Recomputed by hand every derived figure in the article.
  - LSR ablation: 1,275,560 − 1,233,611 = 41,949, and 41,949 / 1,275,560 = 3.289 %.
  - Stock Typed stack pool: 936,328 + 353,778 = 1,290,106, and 1,290,106 / 3,608,697 = 35.75 %.
  - Scalar treatment: 206,775 + 44,167 = 250,942 accesses removed. That is 61.39 % of the 408,787-step difference and 19.45 % of the 1,290,106 accesses.
  - Abandonment thresholds: 10 % of 1,290,106 rounds up to 129,011, and 2 % of 3,608,697 rounds up to 72,174.
  - Filtered gap: 73 − 8 + 1 = 66 skipped ordinals.
- Checked the draft against the recorded actions.
  - Every query excerpt in the article is a substring of a recorded `source` field or of help text.
  - Every number is tied to a named receipt and step.
  - Two error replies contain a semicolon, so the article paraphrases them and quotes only their `fix:` lines.
- Read the draft once as a newcomer and found six gaps, then revised each one.
  - "Ordinal" and "stream" were used before they were defined. Both definitions now appear in section 1.
  - "Plan" was undefined. A definition now appears in section 1.
  - The unit table conflated the two dynamic counters. A paragraph now separates them.
  - Section 3.5 discussed adjacency before the rule that defines it. It now points ahead to section 4.
  - The optimization table mixed an observed LLVM pass with measured treatments. Each row now carries a separate status.
  - The falsifying experiment began with a build. It now begins with the observation that discriminates between mechanisms.

### Why

- The `pass.md` card was the best worked example for two reasons.
  - It is the only card where the baseline participant's numbers were right while an extra claim was false, and where the repair can be checked on identical bytes.
  - Its answer depends on both units and adjacency, the two ideas a newcomer most needs.
- The article omits the supervisor's per-role attempts table. It gives attempt counts only for the worked participant, because a second copy of that table would duplicate the analysis.
- Section 4 is a reconstruction from help text and observed rows, because the implementation is not among the supplied records. It is labelled so that no reader takes it for source code.
- The falsifying example uses the repaired optimization participant's abandonment thresholds. They are labelled as decision rules fixed in advance, because the archive supplies no basis for deriving a threshold.

### What worked

The concerns from Step 1 resolved as follows.

- **Ordinal space.** `q.help("timeline")` states that filtering never renumbers. Both catalog participants reported ordinal 74 as stream-local, contrasting `EarlyCSEPass` in checked middle with `virtregrewriter` in checked backend.
- **Archive total against checked build.** Both catalog participants reported 4,133 events archive-wide and 311 for the checked build.
- **Wall-time ceiling.** `04-usability-diary.md` records eight minutes per session, which closes the gap noted in Step 1.
- **Abbreviated replies.** Each step records `bytes`, `fullReplySHA256` and `abbreviated`, so a shortened reply can be matched to a local replay.
- **Held-out scenario.** `allocator.md` ran only on the repaired build, after the main round.
- **Absence key.** The raw loop census is a positive inspection of the bytes. It lets the zero-loop claim be scored false rather than merely unconfirmed.

Every primary number in `10-independent-baseline-grades.md` and `01-what-compiler-engineers-found-in-the-trace-repl.md` that I checked agrees with the replies.

### What didn't work

No command was executed, so there is no execution failure. The eight observations below come from the records and are absent from the existing grades and analysis.

1. **Trailer, not encoding** (`candidate-catalog.json`, step 10). The participant found a 7,764-byte span and a 7,699-character `print`, and suggested non-ASCII bytes as the cause. The same reply shows a one-line `trailer` excluded from the snapshot. On the baseline build the print length equalled the span (`baseline-catalog.json`, step 11). The excluded trailer is the likelier explanation for the 65-unit difference. It is untested, because no record gives the trailer's length.
2. **Not a conventional median** (`candidate-optimization.json`, step 9). The participant's median function returns `v[Math.floor(v.length/2)]`. For 72 values that is the upper of the two middle elements, so the reported 7.664 and 9.001 are not conventional medians. The size of the difference cannot be computed from the receipt.
3. **Static versus dynamic contrast** (`candidate-pass.json`, step 14). The contrast used `checked-gcc`, a GCC build, so its 1,136,142 executed instructions are not executions of the LLVM IR whose sites were counted. The same answer also misreads the help. It says help keeps execution figures separate from static numbers, but `q.help()` says that physical timings are never mixed into `profiles`.
4. **Help example misattributed** (`candidate-allocator.json`). The answer credits the ordinal-78 example to "LLVM's own help example". The example is in the REPL's `q.help("machine")` and `q.help("compare")`.
5. **`q.explain` refusal without a fix** (`candidate-pass.json`, step 3). The `[notAPlan]` refusal from `q.explain(hdr)` names an internal key, `_spec`, and has no `fix:` line, although this build's `q.run` refusals carry `err.fix`. The homolog-bench playbook judges an error by whether the next step succeeds. By that test this error failed: the participant abandoned the call rather than correcting it. This is an open interface finding.
6. **Repeated unevaluated plan** (`candidate-ablation.json`, steps 7 and 8). The participant evaluated a bare `q.bundle({ c: … })` twice. Both times it received the unevaluated plan display, with `note: "not evaluated yet: q.run(plan) or plan.run()"`. The display named the fix and still cost two calls.
7. **Unreconciled timeline rows.** The repaired `row` timeline has 144 change rows, against 99 on the baseline. The 42 loop events and the module prints at ordinals 23 and 26, which the baseline listing lacks, account for 143. I could not identify the remaining row.
8. **Evidence confound in the optimization card.** The `hardware` global appears only in the repaired build's help. The repaired optimization participant used it for physical pairs that the baseline participant could not reach. The two optimization answers therefore do not compare the interface builds cleanly.

### What I learned

- The repair changed the justification of the middle-end answer, not the answer. On the baseline, the 73→74 row was labelled `known` by a rule that also labelled 87→106 `known`. The correct label rested on an unsound rule.
- Most failed calls in both rounds had two causes: confusing a plan, a metric definition and an eager value, and reusing persistent top-level `const` names. Missing vocabulary caused few failures.
- "Executed instructions" names two counters in this archive: QEMU instructions inside the C row symbol, and RV32 interpreter steps over the whole Typed call. A comparison across sources must state which counter each side uses.
- Treatment descriptions in the repaired `describe()` carry `provenance.measured: false`. The repaired ablation participant cited them as labels, not as measurements, which is the correct use.

### What was tricky to build

- **The no-semicolon rule.** It conflicts with verbatim evidence in three places: the `[notAPlan]` and `[badArgument]` replies, the `sourceLocations` explanation, and LLVM's preheader comment. I paraphrased each and quoted only fragments without a semicolon. The `q.help()` binding example is shown one statement per line, and the article says so.
- **Branch order in the section 4 pseudocode.** The loop-fragment test must come before the unavailable-predecessor test. Otherwise ordinal 89, a loop fragment after the unavailable ordinal 88, would be classified `unknown`. The receipt shows it as `unavailable` with `before: null`, which the chosen order reproduces.
- **Attribution of findings.** The census, the replays and the maxRows correction are the supervisor's. The eight items above are mine, drawn from reading the receipts.

### What warrants a second pair of eyes

- Whether the 65-character difference at checked middle ordinal 74 equals the trailer line. Check it by reading bytes 240363 to 248127 of stream `bbd3b983…`.
- Which change row of the repaired `row` timeline the loop events and ordinals 23 and 26 do not account for.
- Conventional medians for `hardware.pairs('stock','scalar','primary')` and `hardware.pairs('stock','pie','primary')`, recomputed outside the participant's function.
- Ownership of the 42 checked loop prints. The repaired build keeps every unowned loop in every function timeline. Loops of `element` may therefore appear as `unavailable` rows in `row`'s timeline and reset the next comparison to `unknown`. This cannot create a false `known`. It can hide comparisons that are in fact adjacent for `row`.

### What should be done in the future

- Before stating any efficiency effect, repeat each card several times on each build, pair by scenario, and include an unused scenario and model, as the protocol requires.
- Separate the evidence confound from the interface change. Run the optimization card on the repaired build with `hardware` withheld, or on the baseline with it supplied.
- Give the `q.explain` refusal a `fix:` line that shows how to turn a metric into a plan.
- Before anyone builds the two-register candidate, capture per-access stack attribution for `typed-stock`: PC, offset, access kind and function.
- Capture the checked row with debug locations, so that the source-line question becomes answerable.
- Calibrate the grade scale against at least one human grader.

### Code review instructions

- For the worked example, read in this order:
  - `candidate-pass.json`, steps 3, 5, 10, 11, 12 and 13
  - `baseline-pass.json`, steps 7 and 11
  - the two `usability-loops-*.json` files
- For the interface changes, read in this order:
  - the first examples of `usability-replay-baseline.json` and `usability-replay-candidate.json`
  - `candidate-pass.json`, step 2
  - `candidate-allocator.json`, step 10
- The commands below are for the supervisor. I have not run them, and the verifier path is resolved as in Step 1.

```sh
node ttmp/2026/11/21/PICOCALC-TRACE-QUERY--design-a-composable-javascript-query-api-for-compiler-traces/scripts/01-check-evidence.mjs
```

Then evaluate these in a fresh REPL session on the repaired build.

```js
q.run(a.variant("checked").events("middle").where(e => e.scope.kind === "loop").count())
q.run(a.variant("checked").events("middle").at(74).text())
```

### Technical details

| Item | Value |
|---|---|
| Participants | `deepseek-4.1-flash`, provider `lunaroute`, thinking `high`, tool `trace_eval`, 14 evaluations per session |
| Baseline build | ELF SHA-256 `d8a8b5ae1c6ff2c76f2e94e4f7a8c8c0dacb1c417d92c73a13b3adfcaa3f2dd4` |
| Repaired build | ELF SHA-256 `523f185499f3b3fb48d1a25f7792d1993294aa93695034babe153559652e5d71` |
| Checked middle stream | SHA-256 `bbd3b983cff150aeb56d99e517331a1ea0b4af5afc86869c730b9dca2ac795b4`, 195 events |
| First observed drop | ordinal 73 `SROAPass`, 11 sites, to ordinal 74 `EarlyCSEPass`, 6 sites (static instruction sites) |
| Loop witness | ordinal 88, bytes [346976, 348729). The repaired build reports 42 checked loop events. |
| LSR ablation | 1,275,560 to 1,233,611 executed guest instructions, 160 verified rows |
| Stock Typed pool | 1,290,106 direct stack accesses in 3,608,697 RV32 interpreter steps |

Units used in this entry:

- **Events** are print headers.
- **Static instruction sites** are matching lines in one IR print.
- **Executed guest instructions** and **RV32 interpreter steps** are dynamic emulator counts, summed over the 160 rows of `opening-160-rows`.
- **Elapsed microseconds** are board measurements in `hardware.pairs`.
- A **machine-function property** is a boolean read from the header line of one machine-code print.

## Editorial verification after the final author submission

The supervisor and operator checked the complete public timelines on both frozen services. This resolves final-author observations 7 and 8. Baseline and repaired services both expose six default clean stock→PIE pairs; only the repaired root help mentions the hardware global. There are 45 additional ordinals in the repaired checked row timeline: 42 loop subjects, module prints 23 and 26, and function print 144. Both evaluators also accepted a real plan with valid `bindings` and `maxRows`. Option validation and materialized-descriptor behavior changed. The article was corrected against these checks, and the original observations above remain as a record of the author's initial submission. The paired primary medians calculated from both middle observations are 7.664203% and 8.999664%. See `various/usability-timeline-reconciliation.json`.
