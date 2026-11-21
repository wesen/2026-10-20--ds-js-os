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
