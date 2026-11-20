---
Title: Function rebuild investigation diary
Ticket: PICOCALC-FUNCTION-REBUILD
Status: active
Topics:
    - picocalc
    - performance
    - quickjs
    - esp32-p4
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T20:54:18.8864934-05:00
WhatFor: ""
WhenToUse: ""
---

# Function rebuild investigation diary

## Step 1: Trace source-order resolution and native jumps

I traced frozen typed source from the Files app wrapper into the lexer, function emitter, and native assembly. The production backend already stores unresolved jumps during lowering. The session can retain that intermediate native representation and let the final assembler resolve jumps with the new function order.

### Prompt Context

The verbatim authored brief is preserved in the [lab research brief](../../PICOCALC-COMPILER-LAB--measure-cold-compilation-and-test-bounded-compiler-designs-on-the-handheld/sources/research-brief.md), under its fourth research question. The supervising experimentalist assigned this lane after the frontend study and asked for a standalone prototype with independent clean oracle, Files or a larger real app, host and device results, diary, design commit first, and explicit edit cases. The intended outcome is a measured result about editing latency and dependencies on a handheld.

### What I did

- Read the research brief, active lab design, frontend results, frozen compiler sources and Files entry points.
- Inspected the prior lab's flash staging, UART parser and guest execution harness.
- Wrote the [intern design](../design-doc/01-compile-one-edited-function-and-rebuild-its-native-links.md) and notified the supervisor about a separate two-boot device image.

### Why

An exact function source span can skip the body lexer safely only when the prior type and layout assumptions still hold. A cached resolved jump can become stale while the callee signature is unchanged. Those facts require separate data in the cache.

### What worked

The compiler cleanly separates source-order declaration validation, structured operations, and RV32 lowering. Files offers a short helper whose real behavior can be observed through the unchanged filename normalization entry.

### What didn't work

No implementation had run at this point.

### What I learned

The parser calls `lex.next()` when accepting a closing brace, so a reused function must perform that same lookahead. This can surface an invalid token immediately after a previously good body. The production streaming backend delays emission errors until after frontend validation, so the production diagnostic oracle remains authoritative if the optimistic path fails.

### What was tricky to build

The frozen frontend accepts only earlier declarations at call sites. Building a full declaration map and using it for all functions would silently permit forward calls. The prototype must produce candidates using the equivalent visibility at each function.

### What warrants a second pair of eyes

Review the lookups made while checking type annotations, field access and calls. Every dependency that changes the original emitter's result must be reflected in the reused fragment's validation.

### What should be done in the future

Implement the staged adapters and run the unchanged and edited cases against the frozen wrapper. Leave physical flash scheduling to the supervisor.

### Code review instructions

Start with `compileFunctions` in `picocalc-os/compiler/typed-wasm.js`, `FunctionCode.call`, `compile`, and `linkSlot` in `picocalc-os/compiler/typed-rv32.js`, then read the staged design and Files wrapper.

### Technical details

The control is `40bcf850a5809ef6d839127869faa952596ed157`. Native calls and local jumps encode a signed 21-bit byte delta in a JAL word. A word in the old image can therefore become stale when only a function's size changes.

## Step 2: Preserve source boundaries and qualify reusable native fragments on the host

The staged variant now recompiles only changed or invalidated functions. The Node oracle compared complete Files and fixture ELF bytes with a separate realm running the frozen compiler. The results include a `filesName` call that moved by 32 bytes when only `filesAlnum` grew.

### Prompt Context

See Step 1. The design was committed as `dbbff2f` before the prototype scripts were written. The supervisor clarified that a physical guest entry must execute the edited real-app artifact and that its clock stays separate from the compile clock.

### What I did

- Added a staging script that extracts and verifies original compiler anchors. It exposes a record parser, header and numeric body methods, native lowering, jump encoding, and app validation. The frozen clean realm has byte-identical compiler inputs.
- Created a revision-owned session with exact source spans, checked binding facts and compact native fragments. Added section timestamps and exact-source, fragment, rejection and stale routes.
- Built fixtures for a body edit, addition of one parameter, invalid return signature, shifted shared record offset, invalid field type, deletion, bad trailing token, tests for foreign revision and caller mutation, and reseeding once a stale fallback succeeds.
- Measured 40 host blocks. The full repeat data are in [host.json.gz](../various/host.json.gz).
- Built an isolated ESP32-P4 app partition using ESP-IDF 5.4.2 with the usual Files, Agenda and Editor RV32 flags. The staged Files reactor had SHA-256 `4c3a4594c7e637a4eae80872de71852cb2c92e74eb29804ce29c1b8e89606c93`. The built firmware hash was `4ec49cf9733f0e209a6fb284c6ccd22b120276cd7b6050f2c7816f701b188be3`. The host benchmark used the built reactor.

### Why

An exact source edit can preserve a function's prior name and body while moving its declaration relative to others. Symbolic jumps let the backend keep its machine words after the compiler lays the program out again. A field access requires an actual layout fact. A function that passes a pointer to another function only needs the type to exist and the callee's compatible signature.

### What worked

- `node 04-host.mjs /tmp/pico-function-rebuild /tmp/pico-function-rebuild/build/esp-idf/main/files-reactor.elf 40` reported `host oracle: 18 cases; 1440 measured attempts`.
- Host Files body edit reused six of seven functions and retained the complete ELF identity with the clean build of that edited source. Candidate versus clean warm medians were 92.5 versus 266.5 microseconds, with 179.5 microseconds median paired savings.
- Host fixture body, signature and layout requests took longer than their warm clean comparisons. They reproduced the same output with ten, nine and nine of eleven fragments reused.
- The compiler and bundled Files source identities were present verbatim in the firmware. The physical runner was handed to the supervisor for the single-device queue.

### What didn't work

The initial unprivileged design staging command failed with `fatal: Unable to create '/home/manuel/code/wesen/2026-10-20--ds-js-os/.git/index.lock': Read-only file system`. The scoped add and commit completed with the sandbox's Git escalation. The first shell listing of the final firmware ran before IDF finished and reported `No such file or directory`. The unified build session then exited 0 and emitted the confirmed file. No compiler or host assertion failed in the recorded run.

### What I learned

A cached body can already encode its local jumps before publication. Local delta cancels the function start. Cross-function deltas must wait for final layout, while import offsets continue through the production slot linker. In the fixture the `caller → base` instruction moves from byte 236 to 260, retains target byte 144, and gets a distinct machine word even though the caller's source is unchanged.

### What was tricky to build

The parser's `records.has` recognizes record types whenever it sees a local binding. Using a layout fingerprint for that existence query would unnecessarily rebuild a caller that only passes along a record pointer. The adapter records existence queries and field lookups separately. The wide layout fingerprint still invalidates all readers of a changed record, so a function that reads a field whose offset happens to survive can be rebuilt.

### What warrants a second pair of eyes

The independent methods reviewer used production Editor source, runtime imports, a prior signature change and a shared `WorldState` layout change to exercise a different profile. Review the capture for how many full-code changes followed relocation and how many conservative layout rebuilds emitted identical bytes.

### What should be done in the future

Verify the executable slot copy on the scheduled board, then compare complete edits and stage costs with the stock wrapper's cold interval.

### Code review instructions

Read [02-incremental.js](../scripts/02-incremental.js) at `fragment`, `compile` and `createFunctionRebuild`. The [case table](../scripts/03-cases.js) defines both engines' assertions. Run [01-stage.py](../scripts/01-stage.py) in a new work path, then run [04-host.mjs](../scripts/04-host.mjs) with a produced Files reactor.

### Technical details

The stock wrapper in the firmware has its original frontend, backend and Files validation source. The warm comparison evaluates those original entry definitions in the session runtime, where the adapters also exist. The installed physical runner verifies the host oracle, UART diagnostics, whole ELF SHA-256, heap ceiling and the edited entry's output. C reads the linked Files slot and copies it to executable memory, including its entry jump. The run timer begins at the actual entry call.

## Step 3: Use the production ELF loader for the edited guest

The first guest harness would copy the linked slot into local executable memory. A configuration review before flashing established that this firmware's hardware memory split removes the requested executable flag from every eligible local heap. I changed the fixture to load the actual edited ELF through the ordinary loader into executable PSRAM and call the mapped Files entry stub.

### Prompt Context

See Step 1. The initial isolated prototype and board runner were committed in `ff03ea9`. The supervisor had queued the first binary but stopped the queue before it touched the port.

### What I did

- Checked `build/config/sdkconfig.h`, ESP-IDF's ESP32-P4 heap region capabilities, and the pinned loader's `esp_elf_malloc` and `esp_elf_map_sym` paths.
- Replaced the local slot copy with `esp_elf_init`, `esp_elf_relocate` and `esp_elf_map_sym`. Resolve the entry stub through the file offset in an executable load segment. Use the same source and ABI as the complete ELF passed to the stock loader.
- Rebuilt using `idf.py -C /tmp/pico-function-rebuild/tree/picocalc-os/port/esp32p4 -B /tmp/pico-function-rebuild/build build` in the activated ESP-IDF 5.4.2 shell. The rebuilt image was 4,577,008 bytes and SHA-256 `72769ef41bf952e4fee37dd5e762404294cc30ec75b78c5e8dd1305d408053af`.
- Returned the corrected image to the supervisor for the same two-boot queue.

### Why

The experimental firmware must retain the reference board's normal memory configuration. Loading the whole ELF exercises the executable mapping the real app expects and gives the entry clock a concrete predecessor.

### What worked

The repaired image built on the first attempt. Neither the candidate compiler scripts nor the reactor changed. The original host output digests still apply.

### What didn't work

The prior `heap_caps_malloc(capacity, MALLOC_CAP_EXEC | MALLOC_CAP_INTERNAL)` design was incompatible with `#define CONFIG_ESP_SYSTEM_PMP_IDRAM_SPLIT 1`. The IDF heap config omits `MALLOC_CAP_EXEC` from local SRAM when that option is active. This was a source and configuration preflight finding. The superseded binary was never flashed.

### What I learned

RV32 relative jumps are independent of where the slot is mapped. The device still decides which regions carry execute permission. In this firmware the ELF loader already owns the executable PSRAM path.

### What was tricky to build

The slot marker is found at an offset in the ELF file, but the loader expects a virtual address. The runner finds the executable load segment and maps `virtualStart + slotEntryOffset - fileStart`. The app's pure `filesName` routine can then run with the two ABI record arguments without initializing a whole world.

### What warrants a second pair of eyes

Check that a matching ELF, the loaded segment, and the entry receipt refer to the same object. The guest test must call the runtime-generated image under measurement.

### What should be done in the future

Capture the physical rows and restore the scheduled device's prior image.

### Code review instructions

Read `rebuild_guest` in [05-p4.c.inc](../scripts/05-p4.c.inc). The runner checks the SHA-256 and native output for each measured seed and body edit.

### Technical details

The stock firmware has `CONFIG_ELF_LOADER_LOAD_PSRAM=1`. The candidate hands the confirmed ELF bytes to that loader, verifies the mapped entry address, records load time, calls the pure entry once with `_Ab`, and frees the mapped ELF after the clock stops. The cache trial's compile times exclude all of that work.

## Step 4: Register the preboot symbol resolver and measure a complete edit

The first PSRAM-loader build compiled and fully linked the initial Files ELF on the device. The guest probe ran during the boot path before the ordinary native backend initialized its resolver. The loader reported `Can't find common strcpy` and ended the trial. The supervisor restored the original partition and verified the normal worlds before retrying.

The lab also needed a single continuous latency from a real changed source arriving at the compiler through native return. The component measurements intentionally stop before guest loading. I staged a second firmware with a small comparison that takes this continuous interval for both the seeded candidate and warm clean compiler.

### Prompt Context

See Step 1. The supervising experimentalist explicitly asked for a separate, continuous endpoint using the ordinary ELF loader, no comparison, JSON or output before the return timestamp, a warm clean control at the same endpoint, and candidate heap without a live oracle.

### What I did

- Traced the failed UART segment to `esp_elf_relocate` returning `-88` after failing to resolve `strcpy`. The ordinary native world loader installs the production resolver lazily at its first load. The compile and benchmark hook runs earlier.
- Added a staged initializer in the same translation unit as the existing production ELF resolver. Both trial paths call it before any guest loads. The resolver, runtime allocator, board memory configuration and reactor remain as in the stock port.
- Archived the failed boot and restored ledger under `/tmp/pico-function-rebuild/rejected-72769ef4`. The failed boot log SHA-256 is `a4417677da8dbbf6570c92f24ec8315eb38d2dab1e2af71cb965c8553482896e`. A compact excerpt is in [failed-loader.txt](../various/failed-loader.txt).
- Added a [separate run wrapper](../scripts/10-endpoint.c.inc), [JS request](../scripts/09-endpoint.js), alternate physical log parser and per-boot paired summary. The continuous clock starts immediately before supplying the changed source to JS and ends immediately after the loaded native entry returns. Verification and output follow the end timestamp.
- Built fresh images for both paths. The primary image SHA-256 is `cef741f93d6f0322ad8b619ed4d56db62856533fc44464bf463d01b345e9a0b9`. The endpoint image in `/tmp/pico-function-endpoint` has SHA-256 `67773793a4645aaa0063c2dd7532d4222fdaee5b6a9738d67f255a38f17042ae`.

### Why

The fallback archive separates an early firmware harness failure from measured candidate results. The plain rebuild clock exposes what compilation costs, while the continuous clock includes bridge and loader work between a ready source string and a runnable entry. The split measurement cannot be added together as a directly observed endpoint because it runs other work between clocks.

### What worked

The new primary and supplemental images built successfully with the stock memory settings. The compiler and edited source hashes stayed unchanged. The endpoint firmware contains its new script and markers and exports the staged initializer. The previous physical ledger has a verified restoration and zero accepted boots.

### What didn't work

The earlier physical image stopped at `REBUILDERROR guest ELF load -88` following `ELF: Can't find common strcpy`. Its one successful seed output matched the host SHA-256, but the run supplies no accepted component measurements. The failing log and firmware have separate identities from both scheduled images.

### What I learned

A loader can have executable memory available and still require its caller to register framework symbols before mapping even a pure entry. The enclosing ELF contains C runtime code and relocations beyond the function the probe calls. The product's normal resolver configuration is part of the measurement environment.

### What was tricky to build

The comparison needs a warm baseline without preserving a candidate or oracle result in the QuickJS heap. Each endpoint request runs in its own realm. The control performs one clean compile of the initial input and discards the result. The candidate seeds its session on the same input and keeps its intended cache. The controller creates the edited source before timing and hands it to either warmed compiler through the same call. The test alternates order in six paired blocks per boot.

### What warrants a second pair of eyes

Check the start and end timestamps in [10-endpoint.c.inc](../scripts/10-endpoint.c.inc) and [05-p4.c.inc](../scripts/05-p4.c.inc). There is no oracle, checksum, JSON receipt or serial output on the successful measured path. Compare candidate and control allocator intervals under the independently prewarmed runtime settings.

### What should be done in the future

Require two accepted boots and a restored image for both timing boundaries. Compare the body edit with a warm clean compile of exactly the same source and retain the separate reasons that make fixture requests rebuild.

### Code review instructions

Generate the component run with `python3 01-stage.py WORK --p4` and the continuous run with `python3 01-stage.py WORK --endpoint`. Each uses a fresh work directory and the ESP-IDF flags from Step 2. The same [board runner](../scripts/06-board.py) selects the endpoint via `--endpoint` and verifies the complete edited ELF hash and the return result on every sample.

### Technical details

The supplemental request stops at the first return from the tested native `filesName` entry loaded by the normal ELF loader. It excludes editing the file, runtime startup and seed, submitting an OS world, unrelated UI work, output verification, and cleanup after the native return. The record includes both the live JS allocation before and after the request and the request's peak. Only the candidate retains old fragments and its private artifact. ELF loader PSRAM belongs to its own allocator.

## Step 5: Reproduce the Files speedup and retain the fixture crossover

Both corrected firmware trials completed and restored the original factory partition. The component run matched 288 complete output or diagnostic requests across two boots, plus 32 direct guest-entry checks and eight fresh stock Files builds. The supplemental run qualified 12 pairs through native return after an actual edited source handoff. All 24 endpoint executions matched the independent edited ELF digest and returned the expected filename.

Files saved roughly 66 ms before ELF loading and about 63 ms through the separate measured native endpoint. Its candidate seed takes longer than warm clean, and its measured resident compiler state and request peak are higher. The small fixture's body retest was near zero. Repaired signature and shared-layout edits were slightly slower. The report preserves both outcomes.

### Prompt Context

See Step 1. The physical fixture changes that made the run possible were committed in `8cbb4ea`. The supervisor ran the exclusive device queue, including the two captures and verified restoration for each image.

### What I did

- Checked the corrected component ledger from [06-board.py](../scripts/06-board.py) on both boots. Preserved every structured setup, candidate, clean, diagnostic, hash, timing, heap and guest receipt in [p4-rebuild.json.gz](../various/p4-rebuild.json.gz).
- Checked the second ledger in endpoint mode. Verified 12 rotated pairs across two boots, the same edited ELF hash from both warmed compilers, and the same output code units in every execution. Archived [p4-endpoint.json.gz](../various/p4-endpoint.json.gz).
- Generated [timing-summary.json](../various/timing-summary.json) with [07-summarize.py](../scripts/07-summarize.py) and rendered the physical phase and edit figure. Kept the full UART logs in the two local scratch directories. The tracked data contains the complete selected measurement series and the focused loader failure receipt.
- Wrote the [standalone newcomer report](../analysis/01-what-picocalc-can-reuse-after-editing-a-function.md), reread it as a new reader, and reconciled its timing table and worked examples with the raw per-boot results.

### Why

The physical questions concern two distinct boundaries. The component run explains where the candidate spends time and verifies all correctness cases. The separate endpoint applies the same continuous clock to both compilers through a real native return. It also measures candidate heap without a simultaneously live clean ELF.

### What worked

- Files rebuild-to-linked median paired savings were 65,592 and 65,928.5 µs. Every unmarked comparison saved at least 64,938 µs.
- In the independent endpoint setup, the two paired medians saved 63,346 and 63,538 µs. The smallest saving was 62,157 µs. The isolated candidate peak medians were 477,272 and 477,266 bytes. The clean peaks were 389,448 and 389,446 bytes.
- Files increased the generated body image from 3,216 to 3,248 bytes while preserving the full 24,424-byte reactor contract. On every component boot the old native filename entry returned −1 for `_Ab` and the edited entry returned three with code units 95, 65 and 98.
- All recorded frozen diagnostics preserved their original source locations. For example, the changed number of arguments gave `22:18: expected ,`. The tests also saw the previous token rejected and the fresh cache reseeded.
- The retained original partition was written back and the board runner verified Files, Agenda and Editor running through the original native files in both restoration ledgers.

### What didn't work

The two earlier loader approaches remain documented in Steps 3 and 4. The verified final firmware runs had no loader or diagnostic mismatch. The small fixture did not show an editing-speed benefit on its repaired signature or layout changes. The profiler also exposed a roughly 20 KB difference according to whether the clean oracle was still live in the shared realm, so the report describes that memory by order and relies on the isolated endpoint for the clean/candidate heap comparison.

### What I learned

The fixed cost of walking declarations and relinking the complete reactor nearly covers the clean compiler's time for the fixture. Files has enough long body work to make reuse pay even though the candidate retains more memory and still emits a complete native image. The device supports a useful edit result without establishing a new cold build result.

### What was tricky to build

A per-function output cache still needs to account for changing JAL displacements. The Files body edit forces that relocation in an unchanged caller. The cache for a successful revision also contains a separate immutable ELF copy, so an exact-source cache hit can preserve byte identity independently of later caller mutation.

### What warrants a second pair of eyes

Check that the continuous endpoint starts at source handoff with both compiler realms already warmed. Do not include the physical app-world startup in that result. The full Editor host replay is separate evidence about invalidate-and-relink correctness and conservative layout work.

### What should be done in the future

Field-level dependency precision and resident Editor compiler-cache memory on the actual board remain open research questions beyond the tested Files case.

### Code review instructions

Read the [report](../analysis/01-what-picocalc-can-reuse-after-editing-a-function.md) alongside [timing-summary.json](../various/timing-summary.json). Recompute the summary and figure using the preserved host, physical component and endpoint JSON and their scripts.

### Technical details

The component trial uses four marked and four unmarked blocks per application on each boot. The endpoint trial uses six independently prepared pairs per boot and alternates order. The edited program SHA-256 is `7be267e2787cf2767dc6b94cbc4c4589679d0f2cd5b57fdf11a3f18ca2bed9d9`. Original compiler and stage script hashes are in [sources.json](../various/sources.json) and supplemented by the per-image ledgers.
