---
Title: Program diary
Ticket: PICOCALC-TYPED-NEXT
Status: active
Topics:
    - compiler
    - firmware
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-23T12:44:23.526013874-05:00
WhatFor: ""
WhenToUse: ""
---

# Program diary

## Goal

<!-- What is the purpose of this reference document? -->

## Context

<!-- Provide background context needed to use this reference -->

## Quick Reference

<!-- Provide copy/paste-ready content, API contracts, or quick-look tables -->

## Usage Examples

<!-- Show how to use this reference in practice -->

## Related

<!-- Link to related documents or resources -->

# Program diary: PICOCALC-TYPED-NEXT

## Step 1: The next program, five tickets and their designs

PICOCALC-TYPED-FIRST finished with a list of follow-ups. This step turned the ones that pay off into five tickets with designs. It also recorded the user's instruction to run complex tickets on Opus subagents at `xhigh` effort.

### Prompt Context

**User prompt (verbatim):** "Ok, continue then. same approach, always write diaries according to skill format (including subagent), and write vault report in a textbook authhoring style at important milestones."

**User message mid-step (verbatim):** "for complex tasks, run opus xhigh subagent"

**Assistant interpretation:** Run the follow-up list as a new program the same way as TYPED-FIRST: tickets with designs, subagents in worktrees, merges with gates, a program diary, and textbook-style vault reports at milestones. Complex tickets go to Opus at `xhigh`.

**Inferred user intent:** Keep the project moving toward Typed-first with the same evidence discipline. Use the strongest agents for the hard tickets.

### What I did

- **Saved the subagent preference** as a feedback memory (`subagents-opus-xhigh.md`).
- **Read the code the designs depend on.**
  - Boot compiles are synchronous: `kernel_boot` → `add_world` → `port_read_file` → `p4_typed_world_read` → `p4_typed_compile`. So every first frame waits for every compile.
  - The FAT partition `files` (0x7D0000 bytes) is mounted at `/files` (`fs_p4.c`).
  - `JS_SetStripInfo` exists in our QuickJS (`quickjs.h:969`) and is never called.
  - The pass groups are built by `compiler/typed/rv32/build.mjs`; `split` is in the loop group.
- **Created the umbrella ticket PICOCALC-TYPED-NEXT and five tickets,** each with a design doc:
  - COMPILE-CACHE;
  - TYPED-VALUES;
  - COMPILER-DEVICE-COST;
  - BOARD-HARNESS;
  - CANDELA-KERNEL-CODEGEN (wave 2, after TYPED-VALUES).

### Why

- **The cache first.** Boot latency is the largest user-visible regression TYPED-FIRST left. It also blocks the Typed Candela arm.
- **Value types before Candela codegen.** The generator's workarounds are where the kernel's 2.5× gap comes from. Language support has to exist before the generator can drop them.

### What warrants a second pair of eyes

- **The cache key must include every compiler bundle a compile may load,** including the lazily loaded pass groups. A key that misses one serves stale modules after a firmware update that changed only that group.
