---
Title: Integrate qualified compiler optimizations into the PicoCalc toolchain
Ticket: PICOCALC-COMPILER-INTEGRATION
Status: active
Topics:
    - picocalc
    - native
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://compiler/typed/typed-rv32.js
      Note: Numeric instruction selection and optional per-function lowering
    - Path: repo://firmware/port/esp32p4/main/typed_p4.c
      Note: Device option forwarding and physical compiler measurements
    - Path: repo://ttmp/2026/11/19/PICOCALC-COMPILER-INTEGRATION--integrate-qualified-compiler-optimizations-into-the-picocalc-toolchain/various/production-report.md
      Note: Production A/B results and executable parity
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T17:20:46.761232059-05:00
WhatFor: ""
WhenToUse: ""
---

# Integrate qualified compiler optimizations into the PicoCalc toolchain

## Overview

This ticket moves two experiments into the compiler that the PicoCalc runs during boot. The first changes how the frontend hands operands to the RV32 backend. The second lets the native backend consume one function at a time to reduce peak compiler allocation. Files, Agenda and Editor use the same frontend and provide different workloads for measuring the tradeoff.

Native builds now stream by default. The dated production report describes the A/B experiment made before this policy decision. The guide gives the current settings.

- [Production integration and intern guide](design-doc/01-production-integration-of-the-typed-compiler-optimizations.md)
- [Supervisor’s implementation diary](reference/01-compiler-integration-diary.md)
- [Hardware qualification script](scripts/qualify-production.py)
- [Production performance report](various/production-report.md) and [board measurements](various/production-p4.json)
- [Independent streaming review](reference/independent-streaming-review.md) and [streaming parity](various/streaming-parity.json)
- [Numeric transition receipt](various/numeric-parity.json)
- [Task list](tasks.md) and [changelog](changelog.md)

The experimental articles, original measurements and independent examination are in the sibling PICOCALC-COMPILER-THESIS ticket. The articles for each requested change are also in the go-go-parc vault, under Projects/2026/11/19.
