---
Title: Import diary
Ticket: PICOCALC-CJI
Status: active
Topics:
    - picocalc
    - esp32-p4
    - native
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-17T19:42:02.326223027-05:00
WhatFor: ""
WhenToUse: ""
---

# Import diary

Imported the original ZIP intact under sources/ and verified it against the download with cmp and ZIP CRC checks. SHA-256 is 4275d9447fca25e529683228be36a514da657eaeddacf6806c4142efc6ae97c1. Cross-checked chapters 24, 30 and 35 and saved emulator gates against the local native SDK, P4 loader and partition map.

## Step 1. Select the source and exercise the RV32 path

The initial import preserved the ZIP. For the hardware investigation I replaced that copy with the compiler and the files needed to reproduce the hosted RV32 test. I used the same repository SDK and JavaScript worlds that the prospective board build would use.

### Prompt context

> Create a new docmgr ticket and import ~/Downloads/cji-workspace-final*.zip and analyze it and tell me what this is, within the context of this project.

> Ok, import the important parts of the zip, not the zip itself, something that's reasonable to commit. Then, analyze how to make this work, I plugged in the picocal with esp23-p4.
>
> Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.
>
> The document is detailed, the design is elegant and simple, we don't want to add anything new for now. just make it work on the hardware. But we need to explain everything to our intern and flesh things out in detail.

> commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)

I interpreted this as a reproducible source handoff and bring-up design anchored in tests on this checkout. The intern needs to distinguish a working compiler from a working device integration.

### What I did

Verified the original download before deleting its ticket copy. Retained the SLJIT license, the upstream file paths, fixture outputs and three chapters. Built slas-rv32, compiled toplog and ran NOSNAP=1 sh tools/rv32/nw-test.sh with PICOCALC pointing to this checkout.

### Why

toplog logs during initialization and answers a message. It exercises the runtime, loader and service interface with two observable outcomes.

### What worked

Four compiled worlds and the C control matched their expected traces. See various/rv32-nosnap.txt.

### What didn't work

ld.lld was absent from the shell path. The ld.lld supplied with the installed Rust stable toolchain completed the emulator link after its gcc-ld directory was added to PATH.

### What I learned

The monolithic world option lets the first bring-up omit the separate shared JavaScript prelude unit. The common C runtime and ELF glue are still required.

### What was tricky to build

The tool named slas-rv32 executes on Linux. Its output executes on RISC-V. The emulator firmware is a third build product with its own linker and no ESP-IDF dependencies.

### What warrants a second pair of eyes

Check that the native fixture outputs and vendored license are tracked, and that no nested Git repository or binary is staged.

### What should be done in the future

Link the real runtime into the optional P4 component and compare a physical start and reply to the emulator trace.

### Code review instructions

Start with sources/README.md, then read sources/cji/tools/rv32/nw-test.sh alongside the recorded output.

### Technical details

toplog had 199,616 loaded bytes, 38,672 bytes of peak charged allocations and a 304-byte root-stack high-water mark in this emulator configuration.

## Step 2. Locate the gap between the emulator and the ESP32-P4

Commit 319c336 records the source selection and passing emulator baseline. I inspected the physical loader and probed the C runtime with the installed Espressif compiler. This separated the device build issues from the host serial issue.

### Prompt context

See Step 1. The requested intern guide needs a precise integration point and a physical acceptance test with a visible result.

### What I did

Compared the generated toplog ELF imports with native_elf_p4.c, inspected the newlib build and read the cached build-elf image size and partition table. Checked the USB descriptor against p4cap.py and used host lsusb -t to confirm the driver state.

### Why

The fake firmware already provides compiled-world imports. The physical loader currently exports a smaller table. A test that loads the module only on the emulator cannot validate the real resolver.

### What worked

The P4-target cji_elf.c object compiled and its layout assertions passed. readelf showed ELF32, RISC-V, DYN and single-float ABI. USB serial 5B61091051 matches the repository capture tool.

### What didn't work

With cc set to the installed Espressif GCC 14.2.0 and c pointing at the source snapshot, the probe was:

```sh
"$cc" -Os -march=rv32imafc_zicsr_zifencei -mabi=ilp32f \
  -I"$pc/sdk" -c "$c/runtime/runtime.c" -o /tmp/cji-p4-runtime.o
```

It reported `fatal error: uchar.h: No such file or directory`. After removing that include from a temporary copy only, the compiler reported `'struct tm' has no member named 'tm_gmtoff'`. Host lsusb -t showed Driver=[none] on both interfaces. No tty was available for a baseline capture or flash.

### What I learned

A module matching the ELF header checks still needs real firmware definitions for both data and function imports. The generated resolver supports exactly this deployment mode.

### What was tricky to build

The generator consumes target object symbol tables. The firmware build must produce those objects before generating the table and link them once. Keeping the kernel's resolver first preserves per-world allocation charging.

### What warrants a second pair of eyes

Review the device-local time semantics, symbol provider ordering and the complete IDF link. The emulator permits hardware-independent regression tests but cannot qualify IDF memory placement or physical timing.

### What should be done in the future

Use the guide's implementation sequence and record the physical startup, ping reply and restart once firmware and serial access are ready.

### Code review instructions

Read the design guide alongside sdk/nw_elf.h and native_elf_p4.c. Start at elf_load, then follow cji_elf_entry and cji_elf_init. Compare the proposed manifest allowance with the measured rows in various/rv32-nosnap.txt.

### Technical details

Single-world no-snapshot mode avoids the shared JavaScript prelude unit. The smoke test keeps the C runtime in firmware and loads the emitted module through the existing trusted manifest. No board firmware or host driver configuration was changed.

### Delivery and verification

Compared all 163 imported files with their original ZIP members and checked each against git ls-files. All matched, totaling 3,363,718 bytes. The ticket passed docmgr doctor. The first remarquee upload bundle attempt failed with a sandbox DNS lookup error. Repeating the same upload with network access returned:

```text
OK: uploaded PICOCALC-CJI - First compiled world on ESP32-P4.pdf -> /ai/2026/11/17/PICOCALC-CJI
```

## Step 3. Link the physical firmware and identify the attached board

The optional native firmware now builds toplog on the workstation and links the CJI runtime and generated resolver into the ESP32-P4 application. I checked the real board's partition table before preparing an application-only write.

### Prompt context

> ok, Implement the ticket, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill).  If the serial interface disappears while flashing, stop. Subagents should keep their own diary

I took the physical start, ping and restart as the acceptance criteria. All investigation and implementation in this step were mine.

### What I did

Added a build-local host assembler, JavaScript compilation rule, target runtime object library and generated resolver table. Added toplog to the trusted manifest with a 320 KiB quota. Preserved kernel allocator precedence. Removed the unused uchar header and computed the UTC offset from calendar fields under ESP_PLATFORM.

### Why

The existing native loader already implements the module and kernel tables. Generating exports from the same objects that enter the firmware avoids hand-maintaining an address list.

### What worked

ESP-IDF 5.4.2 built a 0x2d0dc0-byte candidate, leaving 0x12f240 bytes free. The link map contains cji_elf_entry and cji_nresolve. The running console answered worlds and heap. After hold acknowledged the keyboard bus was idle, esptool read the partition sector and identified ESP32-P4 v1.3. The configured partition table matched the flash read byte for byte over its entire file length.

### What didn't work

The sandbox's /dev/serial/by-id was absent. Host access showed the expected bridge at ttyACM0, with cdc_acm bound. No driver change was needed.

### What I learned

This machine supplies both the Espressif toolchain and the host toolchain. The device linker needs target objects while the RV32 assembler itself must run on Linux.

### What was tricky to build

The generated C table depends on the contents of target objects. CMake's object-library dependency establishes ordering; the object-file dependencies also trigger regeneration when a runtime source changes.

### What warrants a second pair of eyes

Review the resolved dynamic symbol names, the physical startup log and measured heap after restart. A firmware link cannot establish those runtime properties.

### What should be done in the future

Flash the verified application slot while observing the serial interface. Stop immediately if the interface disappears during the write.

### Code review instructions

Inspect the two component CMake files, native_elf_p4.c and the manifest. Rebuild the build-elf configuration from the guide, then compare the generated module with its fixture.

### Technical details

The pre-flash console reported 67,383 internal and 27,009,252 PSRAM bytes free. The cached prior image was retained locally. The application slot begins at 0x10000 and is 4 MiB.

## Step 4. Recover kernel RAM after the first physical boot

Firmware commit 559addc reached flash and verified its hash. Boot reported the expected version and the network worker remained active. Across 42 seconds there were no world lists, calibration line or answers to console commands. The serial device stayed present during the entire write.

### Prompt context

See Step 3. The required test includes a real reply and a second reply after restart.

### What I did

Inspected the target library with nm --size-sort -S. The field cache alone occupied 0x18000 internal bytes. Selected the runtime's existing uncached path on ESP and added a diagnostic for a failed 80 KiB kernel task allocation.

### Why

A module's literal and shape addresses can be reused after unload. Keeping a firmware-global cache indexed by those addresses would also risk a stale field index on restart.

### What worked

All 82 dynamic import names in the generated module had providers. The post-port emulator gate passed four worlds and its C control. Five workstation probes of the ESP-specific time calculation passed UTC, spring DST transition and both directions across New Year.

### What didn't work

The first p4cap.py capture booted firmware version 559addc and printed main_task: Returned from app_main(), then only Wi-Fi retries. None of the requested kernel console commands executed.

### What I learned

Flash headroom does not predict whether the internal allocator can supply the kernel task stack. The board can keep running network tasks when the nucleus never gets its own task.

### What was tricky to build

Disabling the address cache preserves the ordinary field search. At the device build's optimization level this also removes the entire cache array.

### What warrants a second pair of eyes

Compare the second link map and the boot-time internal heap. Verify both replies independently.

### What should be done in the future

Record the second hardware run and any further physical diagnosis.

### Code review instructions

Inspect field_index in runtime.c and the kernel task creation at the end of main_p4.c. Compare target symbol sizes and the two physical boot logs.

### Technical details

First image size 2,952,640 bytes, SHA-256 b7c7243bf2e2157e669fa7eb1caf9515053ece8503cb8a552fe75aa65c4a7c19. The boot-time heap showed 266,255 internal bytes free before peripheral initialization.

## Step 5. Qualify firmware 6a8e1a0 and establish the next porting boundary

The corrected image started the kernel and toplog. I exercised two independent restart cycles through the physical PicoCalc REPL. I also compiled the current system manifest to identify the distance between this ticket and a system-wide migration.

### Prompt context

See Step 3 for the implementation request. During acceptance the user asked:

> wait, that's all the ticket does? what's the full picture of porting everything over big time?

I treated this as a request to quantify the broader work and explain its sequence alongside the completed bring-up.

### What I did

Flashed only the factory application and monitored the stable by-id serial node throughout. Captured boot, heap, world lists and two tagged replies. Ran a second pair of direct asks around another restart to display both return values. Ran cji.js with --world-unit --emit on all 22 manifest entries.

### Why

The first pair provides machine-readable serial evidence. The second shows exactly what a user sees on the display. The compile sweep distinguishes language coverage from missing OS APIs.

### What worked

The flash hash verified. The board reported version 6a8e1a0 and boot-time internal free memory of 363,727 bytes. toplog logged its initialization twice in the tagged run and sandbox printed CJI-A pong and CJI-B pong. Its final state was idle, charged 232.7 KiB against 320 KiB. The subsequent screen capture passed CRC and visibly displays two pong responses. The compiler emitted world-unit SLIR for 20 of the 22 built-ins.

### What didn't work

calc and sandbox did not emit world-unit SLIR. Their precise diagnostics and migration implications are in analysis/02. The existing nat-import negative-control module still reports a missing path_open as designed.

### What I learned

The 96 KiB cache reduction restored enough internal memory for the kernel and peripheral tasks. Restarts invalidate module literal addresses, which independently justifies the uncached device lookup.

### What was tricky to build

The flash monitor had to run on the host where the device node exists. Both application-only writes completed with the same serial node present. For the second write the prior kernel could not acknowledge hold; the initial firmware had never dispatched keyboard events.

### What warrants a second pair of eyes

The physical evidence covers one trusted CJI service in a mixed image. Whole-system migration needs a multi-world state isolation test, feature parity, image sizing and physical application tests.

### What should be done in the future

See analysis/02 for the staged migration and acceptance criteria.

### Code review instructions

Read various/p4-acceptance.txt, open various/p4-repl-pong.png and compare the two ping replies with tests/native/toplog.out. Inspect the system-wide coverage matrix before selecting the next application.

### Technical details

The final image uses 0x2d0d70 bytes with 0x12f290 free in the application partition. Normal kernel operation returned with a measured 113.2 ms calibration loop. Both direct REPL asks showed 16 ms on screen, including sandbox and scheduling overhead.
