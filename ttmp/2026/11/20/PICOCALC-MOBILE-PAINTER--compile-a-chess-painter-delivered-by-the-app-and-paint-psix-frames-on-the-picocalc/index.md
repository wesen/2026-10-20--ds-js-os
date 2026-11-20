---
Title: Compile a Chess painter delivered by the app and paint PSIX frames on the PicoCalc
Ticket: PICOCALC-MOBILE-PAINTER
Status: active
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/nucleus/painter_commands.c
      Note: Validation and body rasterization
    - Path: repo://picocalc-os/port/esp32p4/main/painter_service.c
      Note: Kernel-lane retained view and asynchronous compiler
    - Path: repo://picocalc-os/worlds/chess/painter.typed
      Note: App-provided rendering program
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T15:44:53.531794284-05:00
WhatFor: ""
WhenToUse: ""
---

# Compile a Chess painter delivered by the app and paint PSIX frames on the PicoCalc

## Overview

<!-- Provide a brief overview of the ticket, its goals, and current status -->

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- picocalc

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
