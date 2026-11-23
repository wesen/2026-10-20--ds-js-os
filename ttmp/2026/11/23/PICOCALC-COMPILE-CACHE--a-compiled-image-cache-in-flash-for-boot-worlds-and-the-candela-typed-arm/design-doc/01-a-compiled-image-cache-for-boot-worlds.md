---
Title: A compiled-image cache for boot worlds
Ticket: PICOCALC-COMPILE-CACHE
Status: active
Topics:
    - firmware
    - picocalc
    - compiler
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-23T12:44:19.814138193-05:00
WhatFor: ""
WhenToUse: ""
---

# A compiled-image cache for boot worlds

## Executive Summary

<!-- Provide a high-level overview of the design proposal -->

## Problem Statement

<!-- Describe the problem this design addresses -->

## Proposed Solution

<!-- Describe the proposed solution in detail -->

## Design Decisions

<!-- Document key design decisions and rationale -->

## Alternatives Considered

<!-- List alternative approaches that were considered and why they were rejected -->

## Implementation Plan

<!-- Outline the steps to implement this design -->

## Open Questions

<!-- List any unresolved questions or concerns -->

## References

<!-- Link to related documents, RFCs, or external resources -->

# A compiled-image cache for boot worlds

## The problem

The P4 compiles every Typed boot world from source at every boot. `kernel_boot` adds the worlds of the machine-code manifest one at a time. For each, `add_world` reads `NAME/compiled.bin`, and `port_read_file` turns that read into a synchronous compile (`p4_typed_world_read` → `p4_typed_app_compile` → `p4_typed_compile`, in `firmware/port/esp32p4/main/typed_p4.c`). No world runs until every compile has finished, so the first frame of every app waits for all of them.

On the playable image the boot compiles measured (PICOCALC-AGENDA-TYPED-WORLD, PICOCALC-CANDELA-TYPED):

| World | Compile | Deadline |
|---|---:|---:|
| Chess | 4.19 s | 6.0 s |
| Chess painter | 5.75 s | 8.0 s |
| Editor | 3.42 s | 6.0 s |
| Agenda | 2.65 s | 4.0 s |
| Files | 1.45 s | 3.0 s |
| Candela scene | 2.54 s | 8.0 s |

Moving Agenda and Files into Typed made the boot about 2.8 s slower; Agenda's first frame (kernel-traced) moved from 16.26 s to 19.07 s. The Typed Candela arm compiles in 84.8 s with a 16.3 MB QuickJS peak, which keeps it out of the playable gallery.

Most of these compiles produce the same bytes every time. The firmware is reproducible, and the same source, reactor, compiler and policy give the same module. Only an edited source (Agenda's `reminder.typed`, an Editor build from the store) or a new firmware changes the result.

## The design

A content-addressed cache of compiled modules on the FAT partition (`/files`, about 8 MB, `fs_p4.c`).

- **Key.** SHA-256, using mbedTLS, which ESP-IDF accelerates on the P4, over:
  - the app's assembled source text, as compiled, including an edited source;
  - the reactor ELF bytes;
  - the bytes of every compiler bundle the compile evaluates: `typed/tape.js`, `typed/wasm.js`, the app's compiler modules, the RV32 backend, and the pass-group bundles. A group the compile may load counts too: include the groups the policy names, or all groups.
  - the linker and entry names;
  - the policy name;
  - a format version constant.

  A new firmware therefore changes the key whenever the compiler or reactor changed, without any explicit invalidation. Decide in the Refinements whether to hash bundle bytes at boot or embed their digests at build time (`typed_apps.py`), and measure the hashing cost either way.
- **Layout.** `/files/.cache/typed/<first 32 hex digits of the key>.elf`, plus a small header holding the full key, the module length and a checksum of the module. A read verifies the header and checksum. A mismatch counts as a miss and deletes the entry.
- **Write.** After a successful compile, write `<name>.tmp`, then rename it, so a power cut never leaves a torn entry that the checksum fails to catch.
- **Read path.** `p4_typed_app_compile` computes the key, tries the cache, and on a hit returns the module with a log line in the same shape as the compile line (`NAME cache hit us=… module_bytes=…`). On a miss it compiles as today and then stores the result. The deadline and heap rules apply only to a real compile.
- **Eviction.** Keep at most N entries per app name (N = 2: the current and the previous firmware). Add a console command `typed cache [clear]` to list or clear entries.
- **The fallback still works.** A failed compile is never cached. A corrupt entry is a miss.
- **Editing.** `typed WORLD build` compiles the edited source. Its key differs, so the result is cached under its own key and the bundled one stays.

## Milestones

1. **Host model.** A host test of the key function, covering which inputs change the key and which do not, and of the file format, including torn and corrupt files.
2. **Device, boot worlds.** Measure on the playable profile:
   - cold boot after a fresh flash (all misses);
   - second boot (all hits);
   - first-frame time per app on both, using the kernel trace as AGENDA-TYPED-WORLD did and its paired-comparison caveat;
   - the hit path's time per app;
   - the FAT write time of the misses.

   Every boot app must still pass health on both boots.
3. **The Candela Typed arm.** Cache its 788 KB module the same way. The first use compiles (85 s) and every later use reads the cache. Then add the arm to the playable profile, decide whether the gallery defaults to it (see below), and run `gallery.py --arm typed` and `--arm cpp` 18/18.
4. **The default arm.** If the cached Typed arm loads in well under a second, its digests match, and the device health passes, make Typed the playable gallery's default arm, with C++ selectable as the benchmark. The very first use after a firmware update still compiles for 85 s. Decide how that is presented: compile in the background while the C++ arm draws, then switch, or show a "compiling" frame. Recommend one in the Refinements and implement it.

## Gates

- `make test`, and `make test-host` with both policies (25/25).
- The playable boot passes health with peripherals on, on a cold flash and on a warm boot.
- A cache hit must give a module byte-identical to a fresh compile: compare once on the device for every boot app.
- A deliberately corrupted cache file is a miss and the boot is healthy.

## Out of scope

- Compiling ahead of time on the host. The device compiles its own code; that is the point of the project.
- Running a world before its compile finishes. That is the other remedy for boot latency; record it as a follow-up if the cache leaves the cold boot too slow.
