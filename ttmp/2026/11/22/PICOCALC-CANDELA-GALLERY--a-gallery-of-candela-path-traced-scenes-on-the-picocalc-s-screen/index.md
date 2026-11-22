---
Title: A gallery of Candela path-traced scenes on the PicoCalc's screen
Ticket: PICOCALC-CANDELA-GALLERY
Status: active
Topics:
    - picocalc
    - esp32-p4
    - rendering
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/22/PICOCALC-CANDELA-GALLERY--a-gallery-of-candela-path-traced-scenes-on-the-picocalc-s-screen/design-doc/01-render-candela-s-presets-progressively-on-the-picocalc-s-screen.md
      Note: the as-built design and its results
    - Path: repo://ttmp/2026/11/22/PICOCALC-CANDELA-GALLERY--a-gallery-of-candela-path-traced-scenes-on-the-picocalc-s-screen/scripts/01-prepare-scenes.mjs
      Note: host preparation of the 18 scenes
    - Path: repo://ttmp/2026/11/22/PICOCALC-CANDELA-GALLERY--a-gallery-of-candela-path-traced-scenes-on-the-picocalc-s-screen/scripts/06-run-device.py
      Note: device run under the board lock
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-22T08:42:08.661408936-05:00
WhatFor: ""
WhenToUse: ""
---

# A gallery of Candela path-traced scenes on the PicoCalc's screen

## Overview

The PicoCalc path-traces 18 of Candela's presets on its own screen. The scenes are prepared on the host (CPU-KERNEL's packing, SECTIONS' bytecode); the firmware renders them on core 1 with CPU-KERNEL's kernel and SECTIONS' interpreter, progressively (a first image after 1/16 of a pass), tone maps them with Candela's AgX and shows them through a build-time copy of the compositor. Everything is behind `PICOCALC_CANDELA_GALLERY` (off by default); without it the playable build is unchanged (scripts 05 and 08 against main 5c01d81).

Status: Milestone A done. On the device all 18 scenes' frame-0, accumulation and display digests equal the RV32 references; B-01 shows its first image after 312 ms and runs at 0.88 s per 160 x 160 pass. The gallery image (`/tmp/picocalc-candela-gallery-a396d3b/build`, app SHA-256 `28d9a812...03a6`) is installed as the playable firmware. Milestone B (the Candela world on the real renderer) is planned, not done.

- Design and results: [design-doc/01-render-candela-s-presets-progressively-on-the-picocalc-s-screen.md](design-doc/01-render-candela-s-presets-progressively-on-the-picocalc-s-screen.md) (Section 9: results; Section 10: Milestone B)
- Diary: [reference/01-investigation-diary.md](reference/01-investigation-diary.md)
- Device evidence: `various/device-04-a396d3b/` (summary-tables.txt, contact-sheet.png, uart.log, run.json)
- Vault report: `Projects/2026/11/22/PROJECT REPORT - PicoCalc Candela - Eighteen Path-Traced Scenes on the Handheld's Own Screen - A Technical Deep Dive.md` in go-go-parc

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- picocalc
- esp32-p4
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
