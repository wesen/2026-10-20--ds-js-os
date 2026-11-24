---
Title: 'Candela''s fixed kernel in Typed at C++ speed: values in registers, measured against the 1.76x baseline'
Ticket: PICOCALC-CANDELA-KERNEL-CODEGEN
Status: active
Topics:
    - compiler
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-23T12:44:05.634771362-05:00
WhatFor: ""
WhenToUse: ""
---

# Candela's fixed kernel in Typed at C++ speed: values in registers, measured against the 1.76x baseline

## Overview

The Typed Candela kernel is regenerated with value records, record results, `continue`, `?:`, `u32` and local arrays.
It was profiled on B-01 and R-01, and six RV32 compiler changes for f32 functions under the kernel policy follow from
that profile: `rows`, `coalesce`, call-free homes, open inlining of record results, record-result leaves straight into
their locals, and affine `rows`. Integer programs keep their 84 digests. On the host, B-01 went from 1.79× to about
1.43× the C++ arm's instructions per sample. On the device (paired study, image 22abf5aa) the Typed/C++ cycle ratio
went from 1.764 to 1.463 (geometric mean, 18 scenes) and from 2.593 to 2.034 on the kernel-bound scenes. The target
(1.3 and 1.5) is not reached. See the
[design doc](design-doc/01-candela-s-kernel-at-c-speed.md) (its Refinements section) and the
[diary](reference/01-diary.md).

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- compiler
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
