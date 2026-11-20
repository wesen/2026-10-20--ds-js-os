---
Title: Supervising experimentalist diary
Ticket: PICOCALC-COMPILER-LAB
Status: active
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T20:23:27.425585616-05:00
WhatFor: ""
WhenToUse: ""
---

# Supervising experimentalist diary

## Step 1: Read the brief, freeze the control and assign independent designs

I read the attached research brief before inspecting the repository. The current project head contains the previous combined trial. It supplies both the production compiler inputs and a tested physical qualification harness. I reserved the first device window for frontend measurement because the half-second target depends directly on the previously unattributed interval.

### Prompt Context

**User prompt (verbatim):** “Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
Chose opus high for researchers
Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill).
 Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.”

**User follow-up (verbatim):** “eacher resercher should create a design doc ofc (I don't know if i said that in the prompt already)”

**Attached scope:** [Verbatim lab brief](../sources/research-brief.md). **Assistant interpretation:** Three initially parallel experiments, followed by the incremental study, documented independently and jointly. **Inferred user intent:** Learn both the engineering results and how a lab can discriminate between architectural hypotheses on one physical device.

### What I did

- Read the diary, textbook-authoring and vault instructions. Verified the executable interface for `claude --model opus --effort high`, its local authentication status, and the available device nodes.
- Assigned local operators for three independent Opus-led studies. Requested researcher-owned designs before implementation and reserved publication for after actual measurements.
- Opened this ticket with four explicit completion tasks. Froze source revision `40bcf850a5809ef6d839127869faa952596ed157` and specified experiment boundaries in the design guide.

### Why

Running several experiments against one active serial interface would corrupt time attribution. A single device operator and isolated source trees allow parallel host research without competing for the board.

### What worked

The project worktree has the same compiler revision as the checkout used for the combined trial. The installed CLI exposes both the Opus alias and effort setting. The physical serial adapter is present at `/dev/serial/by-id/usb-1a86_USB_Single_Serial_5B61091051-if00` and identifies `/dev/ttyACM0` outside the sandbox.

### What didn't work

Sandboxed `ls -l /dev/ttyACM0 /dev/ttyUSB0` returned “No such file or directory”, while `/sys/class/tty` listed both and `lsusb` reported “unable to initialize libusb: -99”. An approved read-only outer-device inventory resolved the discrepancy. The built-in collaboration picker does not offer Opus; the authenticated local provider CLI is the research path being checked by the operators.

### What I learned

The older build used ESP-IDF 5.4.2 with the Python 3.13 environment. Its stored control reactors are available for checking artifact identity before any firmware changes.

### What was tricky to build

Host and device receipts require different evidence. A returned executable may have unchanged padded size while its machine code shrinks, and a faster compiler can still produce slower guest code. The design records each observable separately.

### What warrants a second pair of eyes

The source probe must distinguish time between 120 function callbacks from exclusive lexer time. The held-out program must not influence policy selection. An on-device replay should include a complete, independently derived expected ELF or an appropriate behavioral oracle.

### What should be done in the future

Obtain fresh current factory backup and phase observations, perform each comparison, publish separate reports, and independently replicate the strongest physical result.

### Code review instructions

Start with [the experimental design](../design-doc/01-experimental-design-for-cold-builds-and-bounded-compilation-on-the-esp32-p4.md) and this ticket's tasks. The production entry points and paired controls are linked there.

### Technical details

Pinned SHA-256 for `typed-wasm.js` is `cc7e638c562655725115e5bd15680c277c90390cb831f6de0dad765dbdda68f2`; for `typed-rv32.js` it is `64d5c1550442c161887d29982605cddac7e13237eb3259a5ccd1f3ca03834f38`. Hardware receipts will retain compile time in microseconds and peak heap in bytes.
