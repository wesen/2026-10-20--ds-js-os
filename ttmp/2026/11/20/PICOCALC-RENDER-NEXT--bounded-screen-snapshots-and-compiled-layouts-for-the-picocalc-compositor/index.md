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

**Decision pending.** This ticket is the research program for representation, partial evaluation, layout and painting on the PicoCalc. Its control is the qualified playable compositor. The implementation studies below await the project owner's validation.

## Start here

1. [From producer to panel](design-doc/01-a-bounded-screen-renderer-from-producer-to-panel.md) introduces the running system, invariants, candidate APIs and implementation sequence.
2. [Lab phases and decision gates](design-doc/02-lab-phases-independent-studies-and-device-qualification.md) assigns the work, names controls and workloads, and says when an experiment should stop.
3. [Research families and promotion criteria](design-doc/03-research-families-primary-sources-and-promotion-criteria.md) organizes the literature by the four decisions.
4. [Independent Astra review](analysis/01-independent-astra-review.md) identifies the raw-message boundary, restart hazard, feedback loop in System measurements and the two different held-out tests.

See [tasks](tasks.md) for executable study milestones and [the director diary](reference/01-director-investigation-diary.md) for authorship, review decisions, and delivery evidence. Consult the [earlier physical incident](../PICOCALC-COMPOSITOR-FAULT--system-monitor-frame-faults-in-the-native-picocalc-compositor/index.md) for the original fault and verified correction.
