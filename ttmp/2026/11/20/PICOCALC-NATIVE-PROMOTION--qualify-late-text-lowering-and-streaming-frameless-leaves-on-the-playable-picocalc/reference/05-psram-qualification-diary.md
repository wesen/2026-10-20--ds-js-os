---
Title: Physical PSRAM Chess search qualification diary
Ticket: PICOCALC-NATIVE-PROMOTION
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-NATIVE-PROMOTION--qualify-late-text-lowering-and-streaming-frameless-leaves-on-the-playable-picocalc/scripts/psram/03-device.py
      Note: Verifies the release, validates the complete probe protocol and restores the playable image.
    - Path: repo://ttmp/2026/11/20/PICOCALC-NATIVE-PROMOTION--qualify-late-text-lowering-and-streaming-frameless-leaves-on-the-playable-picocalc/scripts/psram/main/bench.c
      Note: On-board loader, search timer and root-position comparison.
ExternalSources: []
Summary: Independent collection and interpretation of matched full-world Chess search timings in physical PSRAM.
LastUpdated: 2026-11-20T20:15:45-05:00
WhatFor: Reconstruct the physical fixed-work comparison and its restoration checks.
WhenToUse: When comparing the promoted and stock Chess programs at the normal execution memory placement.
---

# Physical PSRAM Chess qualification diary

## Step 1. Identify the measured work and test the collector offline

I inspected the two compiled worlds, the ESP-IDF probe, the old Wasm oracle and the attested playable firmware before requesting the physical handoff. The experiment moves an earlier fixed-work comparison into the executable PSRAM memory used by the ordinary world loader. The full event loop and display remain outside this search timer.

### Prompt context

The director’s delegated request was “Please author and run the supplemental physical PSRAM Chess study as your next assignment.” The director specified six blocks, both compiler arms and three cases, restoration to the newly qualified ordinary firmware, and exclusive use after handoff. I interpreted that as a requirement to validate every result and relocated address independently of the probe's final status.

### What I did

I wrote the [collector](../scripts/psram/03-device.py). It verifies the complete embedded ELF bytes against the two historical full-world hashes, the fresh fixture outputs against the frozen Wasm digest and all five result fields, the partition map and the specifically designated playable restore image. Each load includes the segment and both callable addresses. The collector checks the external RAM address range and each function’s displacement from the segment base, then validates the emitted block, arm and case order. It records 36 timings only if each row also passes the device's comparison of 135 restored position cells and the buffer capacity.

### Why

The runtime checks and the compile-time receipts answer different questions. A byte-for-byte match identifies the generated program. A relocated address and correct fixed-work result establish that the P4 actually executed that program at the intended placement.

### What worked

The offline preflight found both full 274,892-byte ELF programs in the same probe image, with instruction extents of 256,400 and 180,860 bytes. The restore image digest was `33b439d0a7bcdf85f01b373ed1ec71d654ce60d7079f2569fce4de859f29e813`. A synthetic six-block capture passed. Four corrupted versions independently changed the clock, load address, board check and final status. The collector rejected all four. No physical serial operation was necessary for these checks.

### What didn't work

Preflight and the synthetic positive trial completed on their first runs. The four deliberate negative inputs failed for the expected reasons.

### What I learned

Benchmarks of the smaller extracted engine have an independent operational oracle that the complete worlds can also exercise. The search state fields and slice count make early termination visible, even when the chosen move happens to match.

### What was tricky to build

The twelve relocations alternate arm order within each block, and the three cases rotate independently. Grouping received lines only by case would conceal duplicate samples and out-of-order loads. The collector consumes the registered sequence and verifies each code address after each relocation.

### What warrants a second pair of eyes

Six paired blocks in one boot support a matched comparison on the registered works. Position data, task placement, memory allocation and the absence of display traffic may still differ from an interactive world. These affect how a measured reduction can be transferred.

### What should be done in the future

Run the physical comparison after an exclusive handoff. Keep the keyed sample table and both percentage calculations. Confirm readback of the attested ordinary release and normal keyboard and painter operation before relinquishing the board.

### Code review instructions

Inspect the two program-header virtual starts and the search symbols exported by the [world exporter](../scripts/psram/01-export.mjs). Both ELFs start their loadable range at virtual zero. The allocation and entry addresses can therefore be checked directly against the ELF virtual offsets. In the [C timing boundary](../scripts/psram/main/bench.c), the clock begins immediately before search initialization and stops immediately after the last search slice. ELF relocation, fixture setup and comparison occur outside the clock.

### Technical details

The chip's external RAM window spans addresses from `0x48000000` through `0x4bffffff`. The compiler baseline is `5f77855` and the promoted compiler is `8052db7`. The shared oracle digest is `f204dc1ad6f54df3b72cc7ac61871b73ac75db6c412d870d52cd44bd77bfd860`. Each slice receives the same 48-step allowance. The bench uses application cases 0, 6 and 15.

## Step 2. Measure six paired blocks, restore the ordinary image and audit the result

After the explicit handoff I ran the prepared probe under the shared serial lock. All twelve relocations and all 36 searches passed in one boot on core 0 at 360 MHz. After collection I reinstalled the promoted ordinary release, verified the app and partition bytes, checked the eight native worlds, keyboard and painter, then returned exclusive serial ownership to the director.

### Prompt context

The director authorized the run with “EXPLICIT SERIAL HANDOFF NOW. Ordinary candidate installed and flash verified; all eight, keyboard and painter healthy. You alone own serial.” This finished the offline assignment recorded in Step 1. The director also requested a separate 900-word or longer publication chapter and full investigation headings in this diary.

### What I did

Ran the following command from the repository root after the handoff. The collector's raw UART and flashing logs stayed in the fresh temporary output directory. Only the validated, structured receipt entered the ticket.

```sh
python3 -B ttmp/2026/11/20/PICOCALC-NATIVE-PROMOTION--qualify-late-text-lowering-and-streaming-frameless-leaves-on-the-playable-picocalc/scripts/psram/03-device.py \
  /tmp/picocalc-native-promotion-psram-b \
  /tmp/picocalc-native-promotion-rev1/build \
  /tmp/picocalc-native-promotion-psram-physical1
```

### Why

The earlier benchmark executed an extracted search image from flash-mapped instructions. The promotion combines two code-generation changes, so the release question concerns their joint effect when the complete application runs from relocated PSRAM. A repeated search with full output and board checks isolates this compute interval from display and turn scheduling.

### What worked

All six promoted times were shorter for every position. Relative to the same-block stock run, the median elapsed-time reductions were **14.160%** for the opening, **14.117%** for Kiwipete and **14.227%** after e2–e4. For the shipped 1,600-node search the arm medians were 241.0105 ms and 206.7225 ms. All loads used segment base `0x48008fc0`. Stock search began at `0x4800fcd4` and the promoted one began at `0x4800f124`. Both slice entry addresses were likewise inside PSRAM, matching their compiler-specific offsets.

The captured marker announced success and the collector printed `validated 36 search timings`. After writing the ordinary firmware back and reading it back against the attested files, the runner printed `verified restored playable firmware and health` and exited zero. Agenda, Chess, Compositor, Display, Editor, Files, Keyboard and Snake passed the native world checks. The painter had one compile, one call, an installed image and zero rejections. Keyboard polling passed. [Physical receipt](../various/psram/physical.json)

### What didn't work

The physical run completed on its first attempt. The time for an ordinary UI event remains outside this probe; the release's interactive qualification measures that separately.

### What I learned

For the shipped position the absolute compute saving was 34.288 ms by difference of arm medians. Kiwipete saved 189.760 ms with a comparable proportional reduction. The different absolute amounts matter when comparing search with other work on the path to a visible frame.

### What was tricky to build

Both arms share the segment allocation address, but their search symbols have different offsets. Comparing absolute entry pointers between arms would incorrectly reject a valid load. I checked each reported pointer relative to the current allocation and the linked addresses specific to that arm.

### What warrants a second pair of eyes

The sample count is six matched blocks in one boot. The fixed ordering inside each rotated arm and the data and instruction cache state may affect the measured times. All 18 pair differences were positive, but the experiment supplies no variation estimate across boots or across boards. A search returning with the same recorded fields and 135 root cells also does not imply an identical internal visit order for every node.

### What should be done in the future

Use these observations for the combined release decision. A study separating the effect of late checked operations from that of frameless leaves would need additional compiler arms under the same PSRAM loading, oracle and timing boundary. The current study provides the combined-versus-stock comparison.

### Code review instructions

A second parsing pass matched the original 36 UART rows by block, case and arm, verified all 36 board-check flags and recomputed each six-pair median from integer microseconds. It agreed with the archived receipt within floating-point rounding. Consult the [companion chapter](../analysis/02-how-fast-does-the-chess-world-search-in-psram.md) for the per-arm medians, both statistical definitions and their interpretation.

### Technical details

Probe SHA-256 was `4742920ed99fee450ff10755c73c64025ad9a578abdd216557ff4244da10b7c0`. Restored ordinary SHA-256 was `33b439d0a7bcdf85f01b373ed1ec71d654ce60d7079f2569fce4de859f29e813` and partition SHA-256 was `72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30`. To preflight the recorded image and oracle without opening a serial device, add `--preflight` to the collector invocation.
