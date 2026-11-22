---
Title: Candela's JavaScript front end as a QuickJS world on the PicoCalc
Ticket: PICOCALC-CANDELA-WORLD
Status: complete
Topics:
    - picocalc
    - esp32-p4
    - quickjs
    - rendering
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: 'Candela''s unchanged front end runs in a QuickJS world on the ESP32-P4: 21 modules loaded from build-time bytecode in 175 ms, B-01 built in 124-128 ms, 27 of 28 T0 presets built within 4 MB with digests equal to Node''s for 26 of them (D-02 random, M-12 over the 4 s long segment), a B-01 slider re-packed in a 15 ms turn; renderer seam (render.start/update/stop, candela.frame) with a stub.'
LastUpdated: 2026-11-22T17:20:52.589023992-05:00
WhatFor: ""
WhenToUse: ""
---

# Candela's JavaScript front end as a QuickJS world on the PicoCalc

## Overview

Puts Candela's build/compile/pack on the device so that Candela programs, not pre-built scenes, run on the PicoCalc. Parent design: PICOCALC-CANDELA-P4.

- Design (as built, with the device measurements and the FIRST-LIGHT checklist): `design-doc/01-design-stub.md`
- Investigation diary: `reference/01-investigation-diary.md`
- Scripts: `scripts/01-vendor-candela.py` (vendoring), `02-node-reference.mjs` (Node digests), `04-compare.py`, `08-run-device.py` (device run with restore), `10-summarize-device.py`, `12-after-health.py`; host scripts `03`, `05`, `06`, `09`, `11`
- Evidence: `various/02-node-reference.json`, `various/05-host-suite.cw.log`, `various/device-0{1,2,3,4}-*/` (`cw.jsonl`, `summary.json`, `uart.log`, health records)
- Parent ticket and design: `ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/design-doc/01-a-candela-subset-for-the-esp32-p4.md`
- Analysis and measurements: `ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/analysis/01-how-candela-turns-a-scene-program-into-pixels.md`

Status: implemented and measured on the device (2026-11-22). Code on branch `worktree-agent-a5ffe016ff270b9ad`: `picocalc-os/nucleus/candela_world.c`, `candela_render.h`, `candela_render_stub.c`, `picocalc-os/tools/candela-bc.c`, `picocalc-os/worlds/candela-world/`, `picocalc-os/third_party/candela/`; firmware option `PICOCALC_CANDELA_WORLD` (off by default).

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- picocalc
- esp32-p4
- quickjs
- rendering
- performance

## Tasks

See [tasks.md](./tasks.md) for the current task list.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.

## Structure

- design/ - Architecture and design documents
- reference/ - Prompt packs, API contracts, context summaries
- playbooks/ - Command sequences and test procedures
- scripts/ - Temporary code and tooling
- various/ - Working notes and research
- archive/ - Deprecated or reference-only artifacts
