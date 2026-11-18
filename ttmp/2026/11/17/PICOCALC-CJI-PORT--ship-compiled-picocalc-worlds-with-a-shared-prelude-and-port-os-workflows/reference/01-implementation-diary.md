---
Title: Implementation diary
Ticket: PICOCALC-CJI-PORT
Status: active
Topics:
    - picocalc
    - native
    - esp32-p4
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-17T20:08:57.470855748-05:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary

## Step 1. Build and exercise the shared unit

I moved the common JavaScript prelude into the firmware and selected Snake and Flaky in a derived copy of the shipping manifest. Both ran on the physical board with their existing names, quotas and claims.

### Prompt context

> Ok, create a ticket to do 1 . 2. 3. Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.
>
> Document is detaied, design is on point.
>
> implement, and commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)

The numbered stages refer to Snake, shared-world packaging and workflow migration. I kept separate tasks for each workflow so the hardware demonstration cannot accidentally close the entire port.

### What I did

Generated one ilp32f unit.o and its export list, included that same object in the resolver and final link, built per-world ELF modules and compared the physical Snake game with a pre-flash QuickJS capture. Published the intern guide to /ai/2026/11/17/PICOCALC-CJI-PORT. The uploader returned OK: uploaded.

### Why

Each world's identity and claims must stay attached to the same manifest record. Reusing the original source records avoids drift and supplies a control build.

### What worked

The P4 showed Snake as native with 113.2 KiB charged, versus 230.9 KiB observed for QuickJS. Flaky used 48.3 KiB. Its replies were pong 1, pong 2 after Snake's restart, and pong 1 after its own restart. Both game captures show the same score, food, GAME OVER dialog and four-cell body. The physical write completed with the serial interface present.

### What didn't work

The two physical captures differ in the status clock and the horizontal position of the snake by one cell. UART key scheduling against a live 110 ms timer makes the steering tick nondeterministic. These captures establish visual behavior but do not establish byte-for-byte frame equality.

### What I learned

The firmware holds one 189,390-byte block of prelude code. A module's file size and its total world memory answer different questions. toplog shrank from 199,616 to 3,680 loaded bytes while retaining its own heap and root stack.

### What was tricky to build

Both components need the same unit generation. The build declares the generated object and export list as outputs and establishes an explicit target dependency before assembling individual worlds.

### What warrants a second pair of eyes

Check CMake regeneration on source edits, world budgets under autopilot, and the physical behavior of asynchronous I2C before migrating both input drivers.

### What should be done in the future

Follow the open tasks in order of their capability dependencies and record workflow acceptance separately.

### Code review instructions

Start with the optional component CMake file, then the main component's manifest generation and module loop. Inspect the two PNG files in various and the imported Snake fixture.

### Technical details

The first mixed candidate was 0x2eb400 bytes. Flaky's counter test used kernel restart commands and ordinary REPL asks. These exercise the native loader and its state across independently scheduled worlds.
