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

## Step 2: Verify the download, count renderer gates and isolate literal expansion

I checked the published files from a fresh download and independently compiled programs whose literal length and repetition count I controlled. The renderer supervisor reconciled the parent roadmap against the narrower child experiments. I used the original task IDs so the reader can distinguish completion of an experiment from deployment across all widgets.

### Prompt Context

**User prompt (verbatim):** “approve sending to anthropic, it's a toy compiler”

**Assistant interpretation:** Authorize the researchers to use project-specific compiler material for the requested Opus studies. **Inferred user intent:** Let Opus reason about the actual implementation and measurements. **Commits:** 24fc00e (release receipt and literal controls), 79574db (render roadmap).

### What I did

Downloaded the application, partition table and checksum manifest from the tagged GitHub release into a fresh temporary directory. Verified both checksums and compared the downloads to the release artifacts. Ran the release frontend and backend on six literal lengths and three function counts with a sentinel just after the destination. Relayed the approval to all three research operators. Reviewed the six open IDs in the reconciled rendering ticket.

### Why

Literal expansion can consume code space before any renderer executes. Generating tiny controlled functions permits attribution that would be difficult in an entire Chess renderer. A recorded device observation and a synthetic host result answer separate questions.

### What worked

All 18 Wasm programs produced the expected UTF-16 values and preserved their sentinels. Four functions each copying 1,022 ASCII units occupied 49,600 native bytes. Both fetched assets matched the saved files byte for byte. The renderer checklist now records eight completed gates and six open gates.

### What didn't work

The initial commit check caught trailing whitespace from the quoted user prompt. Removing line-end whitespace preserved the text and allowed the commit. The first project-specific Claude request was held for external disclosure review. The user subsequently granted the approval quoted above.

### What I learned

The earlier device capture contained keypad NACKs. A new read-only observation of the ordinary firmware recorded 42 additional I2C0 transfers, 169 additional bytes and zero errors. This qualifies peripheral polling during that interval. Testing key-to-app behavior still requires a physical press.

### What was tricky to build

The renderer roadmap pairs multiple scope labels on some lines. Counting the boxes yields fourteen tasks. Counting scope labels individually would give a misleading percentage.

### What warrants a second pair of eyes

The literal control executes emitted Wasm. Its native byte length is a static observation. Native destination bounds and actual native execution are separate candidate acceptance tests.

### What should be done in the future

Compare the candidate against these controls and verify whole-image storage, cold build cost and behavior on the physical target. Compare actual edit latency and search execution under their own input controls.

### Code review instructions

Run the ticket's scripts/director/01-literal-growth.mjs with Node from the repository root, supplying a temporary output filename. Compare it to various/literal-growth.json. Inspect the grouped roadmap in PICOCALC-RENDER-NEXT/index.md and the clean polling interval in various/release-read-only-preflight.json.

### Technical details

The standalone controls pass the destination at address zero, set its 32-bit capacity, fill its 16-bit elements including a trailing sentinel, call each exported writer, then verify returned unit count, destination contents and sentinel. Only the ASCII character x is varied in length. Character encoding or a long displacement can change native instruction selection outside this range.
