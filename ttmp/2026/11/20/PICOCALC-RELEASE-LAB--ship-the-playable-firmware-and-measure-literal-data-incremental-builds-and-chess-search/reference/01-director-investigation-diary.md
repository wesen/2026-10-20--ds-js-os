---
Title: Director investigation diary
Ticket: PICOCALC-RELEASE-LAB
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T17:55:31.797227524-05:00
WhatFor: ""
WhenToUse: ""
---

# Director investigation diary

## Step 1: Publish the qualified ordinary application and assign three measured studies

The last device qualification produced a specific binary and partition readback. I verified the saved files, fast-forwarded the configured upstream and published these exact assets before commissioning the research. A separate operator is qualifying the named release profile from a clean tree.

### Prompt Context

**User prompt (verbatim):** “Ok, opus is back, so ship the firmware, then launch both, and also use the chess engine itself as a computational benchmark (potentially searching deeper if that gives better insight?)
.
  Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
  Chose opus high for researchers
  Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
  analogies, see skill).
   Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.”

**Additional request (verbatim):** “update progress in RENDER-NEXT< and of the unchecked tasks, make a list and group them by topic and approach.”

**Assistant interpretation:** Ship the working image, measure literal lowering and incremental recompilation, and compare execution on real search positions. **Inferred user intent:** Maintain a reproducible release and separate scientific results for cold compilation, edits, and generated-code speed.

### What I did

Created this ticket. Ran git push origin a079a3e:refs/heads/main. Published tag picocalc-p4-smooth-chess-20261120 and application, partition, and SHA256SUMS with gh release create. Assigned separate Opus-led departments, a single-board schedule, and an evidence review of the rendering roadmap.

### Why

The observed image includes test hooks. The ordinary release was already read back and booted with eight native worlds. Publishing that tested binary makes its identity independent of a fresh IDF build's metadata.

### What worked

Remote main advanced 5996d3e..a079a3e. The ordinary application hashes to 134f3a249589a860a1a85311e361498a9e6ba4f14bef34ca2397ea26ca86ebc1 and its partition table to 72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30.

### What didn't work

The initial sandboxed gh release list returned “error connecting to api.github.com”. The authorized network publication succeeded.

### What I learned

Source revision, ordinary application checksum, and observer receipts answer different release questions. A key injected into the keyboard world does not prove a working keypad peripheral.

### What was tricky to build

One board must serve three independent measurements. Preserving a fixed release image and serialization across the experiments avoids a silent change to the comparison baseline.

### What warrants a second pair of eyes

The checksum attached to GitHub should match the saved release and the receipts. Each compiler comparison must account for the actual target program and all persistent data.

### What should be done in the future

Run and independently inspect the experimental outcomes and publish each researcher's article plus the supervisor synthesis. Reconcile roadmap tasks with the actual breadth of qualification.

### Code review instructions

Start with the release link in the ticket and scripts/director/release-notes.md, then inspect the previous PICOCALC-CHESS-3D smooth-device receipt.

### Technical details

The tag identifies the shipped source revision. The firmware assets are for already-provisioned ESP32-P4 boards with this partition layout and bootloader. Application address 0x10000; partition table address 0x8000.
