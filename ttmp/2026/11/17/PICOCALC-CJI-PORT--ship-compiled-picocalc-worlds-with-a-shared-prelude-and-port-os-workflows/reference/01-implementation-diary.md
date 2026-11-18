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

## Step 2. Move keyboard, power and Settings onto the native path

After the first checkpoint (58e27b9) I checked bus units, extended the kernel operations for Settings and ran the applications on the handheld. The driver asks and screenshots exercised the real firmware message path.

### Prompt context

See Step 1. I treated clock and network configuration as privileged device operations and reused the existing claim, validation and port functions.

### What I did

Converted the I2C read gap from milliseconds in the JS API to microseconds in the native ABI. Selected keyboard and power in the manifest. Added claim-checked network operations and wall-clock/time-zone bindings, rebuilt prelude exports and selected Settings. Captured the original time zone before changing it through the actual Settings UI.

### Why

Keyboard and power share the same chip and must keep the bus locked across the write, delay and read. A factor of a thousand matters even if an emulator fixture answers immediately.

### What worked

Physical driver stats showed 1,081 keyboard polls and 104 events, with zero keyboard or power errors. The sandbox's unauthorized backlight request returned null. The native Settings menu changed Eastern to Atlantic and back to Eastern, verified with the firmware console. A repeated Snake capture matched the QuickJS frame pixel for pixel below the status bar after shifting the injected steering key by one tick. One traced input took 35.642 ms from compositor receipt to Snake dispatch and 7.623 ms inside its machine-code key handler. These are traced inputs, not a measurement of LCD scanout. A framebuffer capture after compositor restart verified the retained power indicator.

### What didn't work

Two short screenshot runs ended during framebuffer transmission. I repeated the capture with extra time for the serial transfer. The original physical Snake trace also had one cell of steering jitter, resolved by comparing the same game state.

### What I learned

Sharing the prelude changes the cost per additional world. A complete future image still needs a flash budget. Even before adding capability code, agent.elf alone was approximately 726 KiB.

### What was tricky to build

Clock.wall needs a distinct unset sentinel and the OS's current time zone. The device runtime consults the kernel for Date.now while the host and emulator retain their existing virtual clock behavior. Scan results may exceed the small string buffer used for most syscall replies.

### What warrants a second pair of eyes

The remaining file and framebuffer workflows cross the native ABI's explicit prohibition on passing handles. I requested the interface-scope decision required by the repository instructions. A JSON string containing an integer must never grant authority by itself.

### What should be done in the future

Verify the chosen transfer design against both positive delegation and negative ownership tests. Qualify agent cancellation with deterministic transport.

### Code review instructions

Compare the keyboard and power source to NW_I2C in nucleus/native.c. Inspect the new native claim checks against the QuickJS bindings in vm.c. See various/hardware-checks.txt for serial evidence.

### Technical details

The installed Settings image took 0x323820 bytes. Filesystem, system, clock and agent host regression targets were also run; the host agent tests skip cases requiring a live transport configuration.

The shared-unit emulator gate also ran with UNITS=1 MULTI=1. Four worlds matched their traces, a fifth exhausted its own 320 KiB budget after three asks, and the negative control that omits the state swap produced wrong output for three of four worlds. The physical image preserved both the original time zone and network credentials.
