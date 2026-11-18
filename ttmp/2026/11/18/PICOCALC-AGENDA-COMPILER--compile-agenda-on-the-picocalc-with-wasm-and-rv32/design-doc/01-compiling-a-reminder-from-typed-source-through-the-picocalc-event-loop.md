---
Title: Compiling a reminder from typed source through the PicoCalc event loop
Ticket: PICOCALC-AGENDA-COMPILER
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-18T17:49:07.530552217-05:00
WhatFor: ""
WhenToUse: ""
---

# Compiling a reminder through the PicoCalc event loop

A stored line such as `- [ ] dentist @2026-11-03 14:30 !15m` identifies a task, civil date and time, and a lead in minutes. Agenda must read it after restart, draw it in the appropriate group, and issue a reminder at 14:15 in the configured timezone. Persist the fired identity so the next clock tick does not repeat the notification.

## Implementation boundaries

1. Compile typed source locally into a validated Wasm module. The application owns parsing, calendar validation, task fields and collection traversal. The kernel owns authority, civil clock and durable I/O. Compare the typed parser field by field with agParse.
2. Generate the normal world entry points and route startup, events, render requests and settlements through them. Use the same seeded todo file, clock and messages in the simulator for both implementations. Retain unrecognized file lines on mutation.
3. On the P4, time cold source capture through the first real response. Record compile, validation/load, dispatch, peak memory and turn latency independently. On the assembled handheld measure the physical keypress through the changed frame. Record instrumentation endpoints and hardware configuration for each result.
4. After the Wasm path works, compile the same application to RV32 for the trusted operator path. Use the same behavioral oracle, input and measurement definitions. Compare the two-second cold-response target with the measured distributions.
5. Publish reproducible milestone reports to the go-go-parc vault with code references, hardware receipts and limitations.
