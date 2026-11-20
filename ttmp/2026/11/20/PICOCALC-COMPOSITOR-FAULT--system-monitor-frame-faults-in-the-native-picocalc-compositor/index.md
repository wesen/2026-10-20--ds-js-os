---
Title: System monitor frame faults in the native PicoCalc compositor
Ticket: PICOCALC-COMPOSITOR-FAULT
Status: active
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T07:12:07.530549262-05:00
WhatFor: ""
WhenToUse: ""
---

# System monitor frame faults in the native PicoCalc compositor

Opening System on the PicoCalc produced two frame-budget faults and two native fatal returns. The adjacent console lines identify both fatal returns as out-of-memory errors. This ticket tracks the producer-side fix, review and physical qualification on the latest playable firmware.

## Read in order

1. [Architecture and debugging guide](design-doc/01-from-a-system-sample-to-a-panel-update.md). Follow a single update from the sampler to the panel and trace a world restart.
2. [Supervisor investigation diary](reference/01-supervisor-investigation-diary.md). Find the original fault evidence, rejected explanations and test decisions.
3. [Frame producer study](analysis/01-how-much-of-a-system-screen-must-cross-the-mailbox.md) and [native receiver study](analysis/02-reading-the-two-faults-behind-a-compositor-restart.md).
4. [Supervisor synthesis](analysis/03-diagnosing-a-handheld-compositor-from-the-first-key-to-the-last-pixel.md). Read the physical qualification results and the remaining limits.

The scripts directory contains the researcher assignments, differential renderer and board qualification schedule. The various directory contains the evidence.
