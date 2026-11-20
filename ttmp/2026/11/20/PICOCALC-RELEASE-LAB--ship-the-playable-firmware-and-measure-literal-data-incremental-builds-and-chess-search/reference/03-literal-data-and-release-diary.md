---
Title: Literal data and clean release investigation diary
Ticket: PICOCALC-RELEASE-LAB
Status: active
DocType: reference
Topics: [picocalc, esp32-p4, native, performance]
Intent: long-term
---

# Literal data and clean release investigation diary

## Step 1 — Rebuild the firmware profile from committed inputs

The installed smooth Chess firmware had been built from a private staging tree using a resolved dependency lock and SDK configuration that were not both tracked. I added one named profile that uses the normal chipset, keyboard, native apps, and smooth painter from a clean source archive.

### Prompt Context

**Director assignment** — Provide a named clean release profile, compare it with the installed ordinary image, and perform read-only keypad assessment without changing firmware.

**Commits** — `1593a9d` adds the profile and lock. `ad48b80` makes the selected SDK configuration values identical to the qualified run.

### What I did

- Added `picocalc-os/port/esp32p4/build-smooth-chess.sh`, its tracked defaults overlay, and the resolved offline ELF dependency lock.
- Built an archived source copy using the tracked project flags and predownloaded ESP-IDF components.
- Compared the emitted configuration with the original. Selected SDK keys now match, including PSRAM internal threshold, peripheral code in IRAM, and the mbedTLS allocation policy.
- Read `worlds`, `painter` and twice `stats` under the shared UART lock.

### Why

A GitHub firmware release needs an independently usable recipe. The raw application SHA identifies the shipped file. Generated Typed source, linked code, and the real SDK selection are additional checks that a clean rebuild keeps the same behavior.

### What worked

The read-only preflight saw all eight expected native worlds and the ordinary 33,840-byte painter installed in one compile with no rejects. I2C0 recorded 2,393 to 2,435 poll transfers and 9,583 to 9,752 bytes over the observation interval, with errors unchanged at zero. No physical key event or flash command was sent.

### What didn't work

A first read-only query with DTR and RTS forced low returned `TimeoutError: ordinary app did not acknowledge worlds`. Retrying with the repository's normal UART line defaults succeeded. No keypad activity conclusion came from the first query.

The first clean configuration selected several different default options, including the internal allocation threshold of 16,384 instead of 4,096 bytes. The tracked overlay now preserves the original options. A second build directory within that same source tree collided with the first CJI bootstrap. The build failed with `mv: cannot stat 'build/rv32/stage1/stage1.slir.tmp': No such file or directory`. I restarted from a separate fresh source archive. The release instructions call out separate checkouts for concurrent builds.

### What I learned

Runtime worlds and the mobile painter can be healthy while a separate physical input event remains untested. Bus counter deltas establish keypad polling health for the sampled interval. They do not prove that a key press goes through focus routing.

### What was tricky to build

CMake and the output SDK settings live in the selected build directory, while the CJI bootstrap also writes beneath the source root. Separate build directories alone do not isolate concurrent bootstrap runs.

### What warrants a second pair of eyes

Compare the native artifact hashes independently and keep binary reproducibility distinct from observed source and code identity.

### What should be done in the future

A build farm with concurrent configurations should use distinct source workspaces or serialize the CJI bootstrap at the source-tree boundary.

### Code review instructions

Run the ordinary profile and the comparison in `scripts/release/02-compare-build.py`. The read-only check is in `scripts/release/01-preflight.py`. [Keypad observation](../various/release-read-only-preflight.json)

### Technical details

The qualified installed release is `134f3a249589a860a1a85311e361498a9e6ba4f14bef34ca2397ea26ca86ebc1`. Native build dependencies resolve from the tracked lock for ELF loader 2.0.0 and ESP-IDF 5.4.2.

## Step 2 — Replace long literal store sequences with one bounded copy

The checked Typed operation already knows the literal and extent when it emits machine code. The representation can use a short copy and immutable code units. The researcher returned a tool-free design and critique, and I implemented an isolated backend option to test their arguments against real source.

### Prompt Context

**Director assignment** — Commission actual Opus High research, run Chess, Editor and held-out cases, and report generated code, pool, linked image and runtime consequences independently.

**Commit** — `39d489e` implements the private stage and host qualification.

### What I did

- Between the two existing bounds checks and the unchanged return count, select a private numeric operation for literals of at least 16 units.
- Append literal data to the image and patch AUIPC/ADDI pairs. Compare exact whole-string dedup with a separate occurrence pool.
- Add a guarded word-copy variant with halfword fallback and odd-tail handling.
- Compare the exact final Chess writer buffer against the authorized source. Execute the generated RV32 words in a model with separate read-only code mapping, load alignment checks and the same input arenas.
- Compare 180 boundary, alias, trap and side-effect cases with Wasm. Add 48 live-operand/alignment cases and the 1,023, 1,024, and 2,048 unit rejections.

### Why

The large Chess source is created by literal writes. Folding only the interpreter syntax would leave thousands of emitted native instructions. A literal representation removes those instructions while retaining checked writes, character units and caller execution order.

### What worked

Chess generated extent fell from 256,400 to 88,172 bytes with halfword pooling, and to 89,084 bytes with optional word copies. Chess's selected strings included no duplicates. Editor halfword dedup used 77,732 bytes versus 89,168 bytes stock. A repeated held-out case separated pooling and dedup concretely. Both streamed and buffered compiler paths output the same bytes within each arm. The unselected Typed Wasm equivalent stayed byte-identical. The fixed linked ELF envelopes preserved their original sizes.

### What didn't work

The initial external reviewer request was rejected by automatic approval review because the project description and workload measurements might be nonpublic. The user subsequently authorized this scoped toy compiler material explicitly. The approved retry produced the design and implementation critique; the request excluded raw device logs and credentials.

The first local copy implementation used a unit countdown. The design suggested an endpoint comparison, which saved one instruction per loop iteration. A guarded word path then reduced the instruction model below the stock writer for the aligned Chess input.

### What I learned

Smaller code and faster native execution are distinct outcomes. Halfword pooling increases the modeled instruction count for the Chess writer despite removing most static instruction bytes. The size benefit came from representation and not repeated literals in Chess.

### What was tricky to build

The stored address is the header base plus twice the start. The copy needs the extra four-byte capacity skip. t5/t6 and a0/a1 are scratch in the direct emitter; values from deeper surrounding expressions live in other registers or spills. The word variant checks real destination alignment and statically knows the source entry's residue. It only loads complete word pairs.

### What warrants a second pair of eyes

The embedded native writer can read its pool in mapped flash. The actual game loader path additionally needs verification of word alignment, data readability of executable PSRAM, and absence of aliasing against valid heap buffers.

### What should be done in the future

Test a smaller dedicated reactor or segment size to convert payload savings into measured full-module footprint. A live-loaded writer qualification is a separate acceptance gate before changing a release default.

### Code review instructions

Read `scripts/literal/01-stage.mjs` and run the host command in the design guide. [Board design](../design-doc/02-pool-checked-buffer-literals.md) [Host data](../various/literal/host.json)

### Technical details

The halfword copy loop uses 2,044 as its maximum source byte advance. The stock source writer executes 49,354 instructions in the model, halfword 82,066, and word 41,324. These are modeled counts and are not measured cycles.

## Step 3 — Measure compilation and literal copying separately on the ESP32-P4

The hardware experiment compiles the same two real programs through all variants. A second measurement times the exact generated source writers. It validates every output unit and unused destination cell after each timed sample.

### Prompt Context

**Previous prompt** — See Step 2. This stage consumed the reserved serial window after the independent Chess search measurement and before the incremental analysis.

### What I did

- Privately staged the compiler and a single `litbench` console action into an ordinary build. Ordinary app startup still uses the stock compiler mode.
- Ran five interleaved fresh QuickJS compilations per workload and variant on the already-running device. Captured status, wall time, tracked peak allocations and linked file length.
- Ran 11 rotated writer samples with warmup and eight calls each. Compared every UTF-16 unit against the bundled 16,316-byte authorized painter source. Checked the untouched tail and capacity.
- Verified the three writer snapshots in the final app image by parsing flash segment headers and hashing their exact mapped ranges. They include contiguous instruction and literal payload bytes from the host compiler.
- Restored and read back the installed ordinary app and partition, followed by an independent read-only recovery check.

### Why

Native copy latency and compile latency have different mechanisms. A large instruction stream is expensive to emit and may be expensive to fetch from flash, but a compact loop executes more dynamic instructions in the halfword model. Measurements need to preserve the exact input and disclose code placement.

### What worked

Five-sample Chess medians were 5.255 s stock, 2.659 s halfword and 2.677 s word. Chess tracked QuickJS heap medians were 3,181,936, 1,681,944 and 1,692,172 bytes. Editor showed a much smaller compile change from 4.532 s to 4.333 s and 4.351 s. Exact writer checks passed with medians of 6,465,714, 94,909 and 42,300 cycles per call in the flash-mapped harness. All 30 compiler calls linked within the same release slot sizes.

The separately archived clean release profile also finished. It matched every source entry recorded for the released artifact, the complete SDK configuration, the game and painter code identities, the compositor ELF, the default world template and the partition. The full firmware hash differs across the two builds. Build segment bytes and some lengths differ, so this is functional code identity evidence and not bit-reproducibility certification.

### What didn't work

The first post-restore health snapshot arrived while the ordinary painter was still compiling asynchronously. It returned `installed:false` with one compile and zero rejects. The independent read-only recheck confirmed the installed 33,840-byte painter, all eight native worlds and clean keypad polling. The reusable runner now waits for that completed status.

### What I learned

The actual halfword flash microbenchmark was much faster than the stock flash writer even though its instruction-model count was larger. The measured routines are in mapped flash and have very different fetch footprints. No cache-miss counter or proof of the same ratio in live-loaded gameplay is available. Actual compilation time and peak allocation improved much more for Chess than Editor.

### What was tricky to build

A single same-firmware paired comparison was needed to keep source identity and SDK settings fixed. The generated writer functions contain PC-relative data, so the harness had to include untouched contiguous blob bytes in a readable executable section. The installed product follows a separate PSRAM ELF loader path.

### What warrants a second pair of eyes

Check the flash fixture comparison independently of the loaded process claims. The experiment linked pooled full game and Editor images on the device, but its live gameplay and flash fixture did not run those live-loaded candidate images.

### What should be done in the future

Qualify the actual loaded application and smaller slot separately. Retain the existing release by default.

### Code review instructions

Read `05-device.py` and the three receipt types. [Physical timing receipt](../various/literal/physical.json) [Flash writer identities](../various/literal/flash-writers.json) [Restore health](../various/literal/ordinary-ready.json) [Clean release comparison](../various/release-clean-rebuild.json)

### Technical details

The compile probe used CPU1 with the device's 4 MiB QuickJS limit, with each test launched in a new runtime under the same firmware boot. The writer used CPU1 at 360 MHz, flash-mapped text and a 64-byte-aligned PSRAM destination. This report keeps Flash, PSRAM ELF loading, compilation, and end-to-end game timing distinct.

## Step 4 — Review the commissioned account against the measured artifacts

The Opus High lead received a scoped, tool-free description and the aggregate results after both board probes succeeded. It returned the long-form manuscript. I preserved that draft and edited the published version against the program source, dump and receipt.

### Prompt Context

**Previous prompt** — See Step 2. The final article must distinguish generated extent, the fixed linked file and actual device results.

### What I did

- Replaced the draft's conflation of the 61,022-byte Typed game file with the 16,316-byte painter output.
- Clarified that a failing range check prevents literal writes while preserving earlier evaluation side effects.
- Used the emitter's actual signed-low-bit calculation in the code example and replaced typed C aliasing in the word-copy sketch with machine pseudocode.
- Removed an inferential test that required exchangeability and replaced it with the observed ranges for all arms.
- Kept instruction-model counts separate from measured flash cycles and linked the exact region hashes.

### Why

The commissioned draft had enough narrative detail to teach the mechanism, but readers need measured scope and correct execution order before acting on a result.

### What worked

The final article gives reproducible code/data accounting, both physical timing boundaries and the limitations of a fixed slot. It credits the researcher and preserves the original draft alongside the editorially checked text.

### What didn't work

The draft called the Chess input a JavaScript source written to the buffer. The staged game and exact source-writer check establish the distinct two sizes. The draft also said the word-arm ranges were unavailable, though the raw receipt has all five samples per arm.

### What I learned

A large out-of-line data transformation can improve compile time and used image extent directly. A small halfword loop can still have more dynamic instructions. The negative host model and fast flash microbenchmark answer different questions.

### What warrants a second pair of eyes

Compare the linked-reservation paragraphs and the physical timing labels against the actual test. A good interpretation distinguishes those measurements from a live-loaded candidate PSRAM execution.

### Code review instructions

Start at the checked article and follow the source and hardware evidence links. [Final article](../analysis/02-literal-data.md) [Commissioned draft](../sources/literal/opus-high-article.md)
