---
Title: Checking a handheld compiler experiment independently
Ticket: PICOCALC-LAB2-METHODS
Status: active
Topics:
    - performance
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T22:20:42.520157784-05:00
WhatFor: ""
WhenToUse: ""
---

# Checking a handheld compiler experiment independently

A compiler translates source into instructions for a processor. On this handheld its compiler and the compiled application both run on the ESP32-P4. Faster compilation, smaller output and faster execution therefore describe three different user experiences. This review checks how much of each experience the experiment actually observes. The eight study designs and the supervisor protocol predate this review. This protocol freezes the examiner's intended checks before any new examiner runs. Measurements already released by the authors may have informed the choice of tests.

## Start with an observable outcome

Consider an edit that changes a number in an Editor function. The compiler can reuse unaffected functions, link their instructions into an executable image and call an exported entry. Comparing that image byte for byte with a clean rebuild checks the entire emitted file. Observing a return then checks that one execution reached its endpoint. If the test also claims that the changed number affected the application, locate an input, path and observable value that distinguish that edit. Keep host simulation, native execution and static inspection identified in the record.

## Checks registered in advance

| Study | Independent examination | What would narrow the conclusion |
| --- | --- | --- |
| Frontend | Parse per-boot rows, verify complete cells, ordering, common image digest per app, calculate within-block scanner, token reuse, interaction and lazy contrasts. | Different reactor/source, incomplete blocks, inconsistent sign or unbalanced positions. |
| Conditions | Repeat all-app behavior on the compiled candidate where host tools permit. Inspect short-circuit fixtures and branch-vs-value outcomes. | A size reduction without agreement on effects and traps. |
| Typed operations | Verify observation parity and run combined typed-read, condition and register-home behavior, including checked reads. | A combined fingerprint without an execution oracle or a read that loses a check. |
| Editor fragments | Rebuild edits from source, compare clean and cached images, check logical budget and eviction, and trace native probe inputs and return. | A missed invalidation, an unobservable edit, or attribution of VM heap to fragment accounting. |
| Register homes | Reproduce combined application replays and compare per-image word counts with control. Inspect physical guest workload when available. | Static word count used as a substitute for cycles or an unmatched control. |
| Bounds | Inspect and rerun the proof boundary cases through the candidate. Identify static proof savings and the denominator of any dynamic result. | A rejected source reported as a trap or a kernel standing in for whole Editor. |
| Analysis selection | Recalculate held-out policies from one specified manifest. Inspect the feature and label construction, tie handling and binding budgets. | Training contamination, independent budget per function or a reward measured in estimated time. |
| Await | Inspect compiled path, liveness restrictions, actual cancellation stimulus and which runs reached native return. | Reconstruction from a design without a working runtime or a synthetic event described as a user action. |

## Unit of comparison and interpretation

A cold sample creates a compiler and produces a linked image. Define baseline minus candidate as savings. Within each complete block compute differences on matching app, boot and endpoint. Give count, median, range and signs. Also compute a median for each boot. For the factorial experiment, subtract the cursor saving under fresh records from the cursor saving under reused records to obtain the interaction in the same units. A lane median across all apps cannot answer the Editor question.

Keep native words, complete executable bytes, estimated retained payload, observed allocator high water, warm edit-to-return microseconds and hardware cycles in separate columns. Record the function or event sequence charged by each clock. Check whether hashes identify source, compiled image or restored firmware. A host executable image match supports an artifact claim. A physical speed claim needs matching device receipts. Mark missing observations as pending. Multiple boots on one board give information about repeatability on that device.

## Reproduction and escalation of findings

Use only host tools and saved board captures. Put original review scripts and minimal replay instructions in this ticket. Preserve inputs, commands, raw result identities and derived tables. Prefer remaining independent by computing contrasts directly from raw observations and writing one test with a distinct expected outcome. Report a discrepancy promptly to the supervisor and give a reproducer or exact source location. Treat an oracle mismatch, unsound proof, budget violation or mislabeled timed endpoint as blocking its corresponding claim. Treat a missing wider workload or architectural generalization as an explicit limit unless the original claim depends on it.
