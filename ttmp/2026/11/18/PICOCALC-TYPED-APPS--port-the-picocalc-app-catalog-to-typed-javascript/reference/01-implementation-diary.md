---
Title: Implementation diary
Ticket: PICOCALC-TYPED-APPS
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-18T23:03:48.269863043-05:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary

## Step 1 — Inventory the catalog and implement the Files world

The stock manifest contains 15 applications. Agenda already has a qualified typed port. The catalog guide records which outcomes must carry forward for each app. The first new port moves Files' filename validation, command selection, ordering, and cursor bounds into typed source. The reactor owns the native SDK interaction and view.

The Wasm world reached workflow parity in a matched host fixture. The RV32 smoke test ran the relocated ESP32-P4 ELF with a deterministic kernel driver. Files still uses the original JS entry in the stock firmware manifest, and the powered board has not been tested with this port.

### Prompt Context

**User request (summary):** Port all shipped apps to typed JavaScript, commit at appropriate intervals, and keep a detailed diary. Earlier requests specify Files first and an intern guide with reMarkable delivery before consequential work.

**Assistant interpretation:** Preserve original workflows under the existing manifest authority and test the typed application through both backends.

**Inferred user intent:** Get an app catalog that the PicoCalc can compile and run in practical device times.

### What I did

- Created `PICOCALC-TYPED-APPS` in docmgr. Related the guide to the shipped manifest, Files source, existing Agenda linker, and filesystem worker.
- Uploaded the guide as `/ai/2026/11/18/PICOCALC-TYPED-APPS/Typed PicoCalc App Catalog and Files.pdf`. The upload returned `OK: uploaded`.
- Added `worlds/files/files.typed` and the linker/SDK reactor around it. Added `nw_fs_op` to the existing native filesystem dispatcher and reused `fs_prepare` to validate each request. Shared the strict UTF-16 decoder with Agenda.
- Implemented an end-to-end Wasm fixture with stock compositor and Editor, and an RV32 ABI smoke test with a deterministic kernel driver. Both scripts are in this ticket.

### Why

The stock Files app owns the root filesystem claim and Editor gets a narrowly scoped grant. Reusing the filesystem worker preserves the path checks, request settlement and world-lifetime rules. The two artifacts isolate the target-specific linker from the behavior in the shared source.

### What worked

- `node scripts/01-check-files-wasm.mjs` from the repository root via the full ticket-relative path passed 18 filename cases and all 26 settled screens, matching the original JS world. The fixture verified the existing and new Editor saves byte for byte and checked the untouched root file. The linked Wasm artifact was 49,089 bytes.
- `node scripts/02-check-files-rv32.mjs <p4-gcc> <rv32emu>` with the repository-relative script path produced a 24,400-byte linked P4 ELF. The relocated program opened the root claim, sorted the directory first, formatted 1,280 bytes as 1.3 KB, and created and refreshed a folder.
- `make -C picocalc-os test-apps test-native test-fs` passed, including 34 native tests and nine filesystem tests. Those runs used the existing kernel and shared SDK dispatch implementation.

### What didn't work

- The first source used nested early returns that failed typed compilation with `SyntaxError:58:9` and `SyntaxError:67:9`. Direct guard returns and a separate helper for prompt actions fit the compiler's accepted control flow.
- Running the simulator via Node under default sandboxing produced `spawnSync ... EPERM`. The authorized local-process run proceeded.
- Comparing all frame publications exposed legitimate scheduling differences, including the original's temporary old listing under a new directory heading. The first settled-frame implementation then failed `assert(states[6][1].some(([label]) => label === 'Sub/'))` because the sample clock only accounted for script waits. Accounting for the simulator's 70 ms per key and 90 ms per typed character matched the 26 settled results.
- The emulator rejected the linked module as `not an rv32 relocatable object` when named `files.elf`. Its CLI exercises the shared-object loader for `.so` paths. Using that suffix made it load the same ET_DYN data.

### What I learned

Stable-screen comparison can verify the user-visible results while allowing a different publication schedule. Formatting sizes with C's `%.1f` can round a halfway value differently from the existing JS `toFixed(1)`. The port rounds the displayed positive size in tenths, and both harnesses include the 1,280-byte example.

### What was tricky to build

The reactor uses `NW_LATER` until the current request token settles. On a successful Editor reply it revokes the previous narrowed capability and focuses Editor. On failure it revokes only the offered capability. The Wasm fixture exercises saved files and returning focus without direct access to Editor's filesystem handle.

### What warrants a second pair of eyes

Review all capability retirement paths and confirm that the directory item and filename limits agree with the kernel worker. The full editing and deletion fixture currently runs under Wasm. The RV32 harness uses stubbed I/O and covers a smaller workflow.

### What should be done in the future

Wire the two Files artifacts into the existing P4 build and boot paths. Run the matched Files scenario on the physical board and measure source-to-first-frame time. Then port Editor, using its existing save-path coverage and preserving its file-grant boundary.

### Code review instructions

Begin with `worlds/files/files.typed` and `worlds/files/world.c`. Follow `nw_fs_op` into `nucleus/native.c` and `nucleus/fs.c`. Run `make -C picocalc-os build/picocalc-host files-reactor` before the Wasm script. For RV32, pass the ESP32-P4 GCC and the CJI `build/rv32/rv32emu` executable as script arguments, with its existing companion objects in the same directory.

### Technical details

The typed ABI takes length-prefixed UTF-16 strings and buffers. Four checked exports occupy the typed slot in both reactors. The manifest grants `fs:/`. `nw_fs_op` returns a token for list, info, mkdir, rename, and remove. `nw_fs_at` and `nw_ask_file` handle the narrower Editor grant. The linked Wasm and RV32 artifacts are generated by the evidence scripts and are omitted from source control.
