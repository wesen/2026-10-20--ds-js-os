---
Title: Bounded screen snapshots and compiled layouts for the PicoCalc compositor
Ticket: PICOCALC-RENDER-NEXT
Status: active
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T10:30:49.210549412-05:00
WhatFor: ""
WhenToUse: ""
---

# Bounded screen snapshots and compiled layouts for the PicoCalc compositor

This ticket is the research program for representation, partial evaluation, layout and painting on the PicoCalc. Its control is the qualified playable compositor. The first studies have completed. The next decision is whether to integrate the native binary reader with the Chess painter and measure the full path to the panel.

## Start here

1. [From producer to panel](design-doc/01-a-bounded-screen-renderer-from-producer-to-panel.md) introduces the running system, invariants, candidate APIs and implementation sequence.
2. [Lab phases and decision gates](design-doc/02-lab-phases-independent-studies-and-device-qualification.md) assigns the work, names controls and workloads, and says when an experiment should stop.
3. [Research families and promotion criteria](design-doc/03-research-families-primary-sources-and-promotion-criteria.md) organizes the literature by the four decisions.
4. [Independent Astra review](analysis/01-independent-astra-review.md) identifies the raw-message boundary, restart hazard, feedback loop in System measurements and the two different held-out tests.
5. [Sending a typed view program to the compositor](design-doc/04-sending-a-typed-view-program-to-the-compositor.md) extends P2 with Chess. It compares a resident view, a delivered module and source compiled on the receiving device, with measured host baselines.
6. [Department briefs and dispatch order](design-doc/05-department-briefs-for-bounded-rendering-and-typed-view-programs.md) is the handout for the director, Opus, Astra, the implementation researchers and the board operator. It scopes the first authorization and the evidence required for later studies.

See [tasks](tasks.md) for executable study milestones and [the director diary](reference/01-director-investigation-diary.md) for authorship, review decisions, and delivery evidence. Consult the [earlier physical incident](../PICOCALC-COMPOSITOR-FAULT--system-monitor-frame-faults-in-the-native-picocalc-compositor/index.md) for the original fault and verified correction.

## Results from the first five research groups

The [director’s research report](../PICOCALC-RENDER-LAB--measure-bounded-screen-readers-and-semantic-views-across-picocalc-applications/analysis/02-where-a-picocalc-should-build-its-screen.md) compares measured outcomes across both design documents and the separate binary study. The [binary format and application handoff](../PICOCALC-RENDER-LAB--measure-bounded-screen-readers-and-semantic-views-across-picocalc-applications/reference/03-how-application-researchers-can-evaluate-the-binary-screen-api.md) identifies which results transfer to System, Snake and Chess and how to measure the proposed integration.
