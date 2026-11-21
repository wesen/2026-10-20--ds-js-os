---
Title: Running blind compiler engineer persona sessions
Ticket: PICOCALC-TRACE-REPL
Status: active
Topics:
    - compiler
    - performance
    - picocalc
DocType: playbooks
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T14:23:46.358347782-05:00
WhatFor: ""
WhenToUse: ""
---

# Running blind compiler engineer persona sessions

## What the experiment measures

A compiler engineer receives a question and a persistent JavaScript VM containing a public API and a fixed compiler archive. We observe whether this engineer reaches the archive-supported conclusion, the query that supplies it, and where the interface produces a wrong answer or a recoverable error. The personas in this study are independent runs of one language model. A successful result establishes that this particular researcher used the shipped interface on this fixture.

The two source playbooks explain how to conduct the observation. The homolog-bench study provides the principles of blind sessions, action histories, shared scope for caches, and independent mechanical checks. The Chromobench study adds task lists, reproduction before prioritization, and classification of the cause of a finding. The common brief names both studies without handing the persona an answer key. [Homolog-bench playbook](</home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/11/21/ARTICLE - Playbook - Improving an Agent-Facing JavaScript API with Persona Runs - Lessons from homolog-bench.md>) · [Chromobench playbook](</home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/11/21/ARTICLE - Playbook - Persona Sessions with Agents - Improving Software and APIs from Usability Reports.md>)

## Prepare a round

1. Choose a question at a well-defined observation unit. A compiler event, a static instruction site, an executed instruction and a physical elapsed microsecond are four different units. Write the expected unit, inputs and independently recoverable facts in the supervisor's key. Keep it out of the REPL.
2. Choose three roles. Our intern counts indexed events and relocates one. Our middle-end researcher measures a structural change across adjacent full prints and asks for source locations. Our performance reviewer compares the two checked LSR experiment arms and asks what the counters can prove about individual PCs. The two harder tasks include a request whose evidence may be absent.
3. Pin the executable and archive. Record the revision and, if building from pending changes, a hash of the executable or relevant sources. Run one loopback service in tmux. Keep it stable until each participant in this round finishes. Create a separate service session for every participant, retaining the in-memory archive across participants. Bindings belong to the participant. A shared warmed archive cannot answer questions about that participant's cold-start time.
4. Check the provider in isolation. The installed Pi reads the authenticated model registry through the Lunaroute provider extension. Select it explicitly while disabling other extensions. A convenient generic check is the prompt “Reply with exactly READY.” Record the provider, model ID and thinking level. Have the supervisor inspect the tool declarations.
5. Verify the actual service with a disposable session. Evaluate a local variable, read it on a second call, delete the session. Pre-register a ceiling on tool calls and wall time. Distinguish an operational failure from an incorrect research answer.

## Conduct the session

Launch the runner from the repository, using a distinct receipt filename for every repeat. Start the service as described in the design guide. The session side uses standard-library HTTP and Pi's `trace_eval` extension.

```sh
TICKET=ttmp/2026/11/21/PICOCALC-TRACE-REPL--a-persistent-compiler-evidence-repl-in-go-and-javascript
python3 "$TICKET/scripts/21-run-trace-persona.py" pass \
  "$TICKET/various/personas/baseline-pass.json" --port 3791
```

Each runner creates its own VM with `POST /sessions`. Pi receives the common brief, one task card and one tool taking a string of JavaScript. Its working directory is empty. Project context, skills, built-in tools and MCP discovery are disabled. The provider extension supplies the model. A task-specific extension fixes the target session and limits evaluations. HTTP source is always sent to the service's public evaluation endpoint. Use the same command in parallel for the other cards.

The last user-facing answer and the actual query and reply for each tool call form the receipt. Hidden reasoning and per-token deltas are discarded. A 4,000-character display limit ends in an explicit abbreviation message. When a finding concerns abbreviation or serialization, check the original evaluation outside Pi. Each receipt includes the provider the runtime reported, wall time and process exit. Wall time includes model inference, so it cannot estimate compiler or database performance.

## Score, reproduce and improve

Use the independent raw-data verifier in the preceding TRACE-QUERY ticket to recover the reference values. It inflates each captured compiler log, verifies its SHA-256 and scans headers and bytes directly. Inspect dynamic summary JSON separately. The verifier never calls the service. A match between two queries inside one VM cannot validate the evidence adapter. [Independent verifier](../../PICOCALC-TRACE-QUERY--design-a-composable-javascript-query-api-for-compiler-traces/scripts/01-check-evidence.mjs)

For each card, compare the final numerical answers with the supervisor's key, identify which actual tool reply supports each claim, and read any caveat. The answer must include the scope of the observation. For an unavailable request, give credit for naming a concrete missing prerequisite, such as execution PCs and an image identity, and for declining attribution. A failed query does not establish that an archive lacks evidence. Check whether the tool's capabilities or a genuine inspection of the evidence support the conclusion.

Read failed actions in sequence. Record the first guess, exact reply and next action. Classify the finding as a harness error, archive defect, evaluator defect, API discoverability problem, missing scientific observation, or erroneous persona interpretation. Prioritize a demonstrated incorrect result over the number of wasted calls. Reproduce the issue with the smallest query at the normal entry point, write a regression case and record its result. Log cases contradicted by the replay.

Repeat an affected card in a fresh VM and a fresh Pi session. Keep its wording, inputs and call budget identical. The tester's independent result matters even when a subsequent persona avoids the formerly failing sequence. Counts across a single run per role are descriptive. To estimate whether a change improves an agent population, repeat each version multiple times, pair by scenario, and include an unused scenario and model. Conclude a round with fixed findings, open findings and unreproduced claims.
