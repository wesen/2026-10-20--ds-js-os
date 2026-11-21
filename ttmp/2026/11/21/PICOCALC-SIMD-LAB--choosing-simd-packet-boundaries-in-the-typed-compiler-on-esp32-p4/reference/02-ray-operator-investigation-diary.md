---
Title: Ray-row operator investigation diary
Ticket: PICOCALC-SIMD-LAB
Status: active
Topics: [compiler, performance, picocalc]
DocType: reference
Intent: long-term
---

# Ray-row operator investigation diary

## Step 1: Establish physical and host comparison conditions

I took responsibility for the serial board and the ray controls while an independent Opus High researcher develops and documents the packet treatments. A standalone benchmark image lets the six experiments share one board visit. A valid cross-arm comparison requires identical input buffers, code placement conditions, observable writes and timers.

### Prompt Context
**User prompt (verbatim excerpt):** “Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill”
The full research commission was issued in the conversation and is recorded by the lab director. My lane covers experiments 1–3 and the physical board window.

**Assistant interpretation:** Run, audit and preserve the strongest matched scalar and packed comparisons available.

**Inferred user intent:** Decide whether the compiler should retain scalar or vector representation at each boundary, accounting for runtime and correct fallback.

### What I did
- Checked both the sandbox's tty namespace and the host, then resolved the serial bridges. Host /dev/ttyACM0 is the CH343 used for earlier qualified trials; /dev/ttyUSB0 is a separate CH340.
- Staged only the Typed compiler, closed ray source and related prior experiments, skills and documentation in /tmp/p4simd-ray-1121. Started an authenticated Claude Opus High file-tool-only researcher in restricted mode and created a dedicated live session on the local research REPL.
- Re-ran the existing six-pair primary and clean measurements. The primary median saving was 251 µs (1.527177%) and the clean median saving was 242 µs (0.429523%).
- Wrote the generator of flash-linked, byte-identical stock, matched scalar and packed Typed RV32 functions; the three executable images have 9564, 10384 and 10308 bytes. Each exposes typedRayComputeRow at image byte 3056.
- Established a minimal standalone ESP-IDF build with the P4 target at 360 MHz. Reserved a common entry point and UART capture strategy for three independent teams.
- Wrote the board operator driver with flash readback before any experimental write, app-slot-only replacement, a finally block to restore the normal image, verification and runtime health checks.

### Why
Measuring a native arm under another firmware or a different allocation policy would confound packet choice and program context. Using the host compiler's exported image reproduces the unchanged Typed machine instructions in the same ELF and arm timing harness as handwritten candidates.

### What worked
Vendor toolchain successfully linked the initial 543-target minimal project and three original binary images. The archived REPL returned the earlier paired timings on the actual service.

### What didn't work
The namespace without device permissions returned “No such file or directory” for /dev/ttyACM0 despite /sys/class/tty/ttyACM0 being present; host permissions confirmed the actual port. The first IDF configuration failed with “CONFIGURE_DEPENDS is invalid for script and find package modes.” Removing that optional file-glob mode and using explicit reconfigure succeeded.

### What I learned
The compiler emits fully position-relative code with named byte offsets and no imports for this workload. The linker can expose a function at that offset without modifying executable bytes. It still changes code placement relative to a dynamically loaded production image, so cross-harness frame claims require care.

### What was tricky to build
ESP-IDF component registration evaluates CMake both in script and normal configure phases. Multiple firmware images from earlier studies are locally cached. Verify the actual running image before choosing one as a restore source.

### What warrants a second pair of eyes
Review the unaltered machine-code comparison and original scene geometry. Review the serial health/readback and restoration receipts before interpreting physical data.

### What should be done in the future
Complete the physical run once the independent control implementations and oracle are ready.

### Code review instructions
Start at scripts/ray/01-emit-typed.mjs and 02-run-board.py. Inspect the complete symbol address and SHA identities in various/ray.

### Technical details
The verified REPL endpoint is port 3792. Firmware experiments use only app slot 0x10000; the preceding partition table and the following world and file data are outside the experimental write.

## Step 2: Compare generated ray rows against a guarded expert schedule

I built two matched handwritten schedules and arranged for every generated row function to run on the same physical chip. The first independent researcher session stopped with a provider-side refusal before delivering a file. A separate high-effort Opus researcher received a numerical correctness experiment in its own working directory and REPL session. I wrote the executable timing controls and kept their authorship distinct.

### Prompt Context

**User prompt (verbatim excerpt):** “Write a hand-scheduled PIE version of the hot region and a strong scalar version with hot values kept in registers.”
**Assistant interpretation:** Find attainable speed and compare packet boundary choices on identical input.
**Inferred user intent:** Decide what code a compiler should emit before investing in a pass.
**Commit (code):** 30032c9 established the first host and board controls.

### What I did

- Wrote a preflight checking row, sphere count, center, radius and buffer capacity. An ineligible invocation falls through to the original checked C kernel.
- Implemented register scalar, input-minimum PIE and input-minimum/maximum PIE schedules. Wrote the horizontal reductions in vendor assembly and verified them with the ESP objdump.
- Generated all 480 precomputed full-buffer CRC references from the actual Wasm backend on three scenes. Allocated the same aligned, 4,100-byte work object for all nine treatments.
- Linked the five actual Typed versions along with the C schedules, the physics group's diagnostic and the director's held-out selector into an app-only firmware. Rotated all nine arm positions across nine blocks.
- Flashed, read back and measured the ESP-IDF 5.4.2 image over USB. Reinstalled the exact verified playable bytes and queried the active world set and painter health. The image and restoration SHA receipts are in various/ray.

### Why

A packed minimum of the original unsigned squared distances decides whether eight subtracts, scratch writes, reloads, tests and dependent lookups can all be skipped. An empty group makes no observable writes. A scalar control with identical guards measures the contribution of classification separately from hoisting checks.

### What worked

All 38,880 timed calls returned success and matched the independent Wasm CRC for their entire output buffer. On opening rows, the minimum schedule saved 12.81% against the strong register scalar control. The new compiler-generated empty-group schedule saved 4.74% against the previous compiler PIE output. These are medians of nine paired percentages.

### What didn't work

The first Opus session returned no usable file. I removed the unimplemented researcher placeholder from the device build and recorded the resource failure. The comparison remained runnable using the clearly identified operator implementation. Percentages aggregated across the three fixture types would conceal the much smaller sparse result.

### What I learned

A small packed classification can avoid thousands of ordinary lane visits. Expert loops with preflighted access contracts also have substantial scalar headroom. The direct native comparison measures the specific emitted images; the handwritten-to-Typed gap combines several changes.

### What was tricky to build

The uint16 work data begins four bytes after its aligned object header. The scalar prefix aligns the actual input address, leaving six pixels before the first eight-wide group and two pixels at the end. I used an unsigned input reduction so that large unsigned squared distances remain misses, independent of signed subtraction saturation.

### What warrants a second pair of eyes

The C preflight's upper bounds must cover each lookup and output index, including a radius of 32 selecting table entry 1024. The row wrapper includes timing reads but excludes buffer restore, CRC and UART. It calls each row from its original snapshot; whole-frame timing belongs to the follow-up image.

### What should be done in the future

Check complete frames on the same original twelve pose/stride fixtures, and separate size, code placement and execution effects.

### Code review instructions

Inspect scripts/ray/board/main/ceiling.c, ceiling_reduce.S, 03-ceiling-fixtures.mjs and 05-score.py. Compare various/ray/ceiling.csv and ceiling-summary.json. Rebuild using 06-stage-board.sh from the checkout root.

### Technical details

Physical ESP32-P4 CPU clock 360 MHz. The typed-stock/typed-scalar/typed-pie module row entry offsets are in typed-images.json. The expert scalar baseline measured 313,477 cycles over the 160 opening rows; input-minimum measured 273,307. Hand minimum/maximum was slower than the simpler minimum schedule.

## Step 3: Validate integer specialization including exceptional behavior

I added a narrow experimental change in an isolated compiler realm. A literal threshold can eliminate the range guard or rule out PIE before code generation. The production compiler remains behind the same opt-in policy; the two changes here are in the replay script.

### Prompt Context

**User prompt (verbatim excerpt):** “Compare unconditional scalar, statically proven narrow arithmetic, and one runtime range guard per region with scalar fallback.”

**Assistant interpretation:** Test static range reasoning separately from choosing a profitable packet shape.

**Inferred user intent:** Preserve every observable effect and quantify what proving one fact contributes.

**Commit (code):** 7f8a1d3 — research(simd): measure guarded ray schedules and exact narrowing on P4.

### What I did

- Generated three Typed source functions with a literal 32766, literal 32767 or runtime ceiling. Compiled each with stock scalar generation, runtime-guarded generation and literal-specialized generation.
- Compared all three machine-code implementations against a one-lane JavaScript oracle. Recorded the first failing receiver/index on the RV32 breakpoint, every guest halfword store into public buffers, final bytes and normal return.
- Tested physically valid C ABI calls at four numeric conditions and lengths 8, 32 and 127. Each sample batches 64 calls and compares the final entire output array with the reference after checking every return.
- Included overlaps at equal and shifted addresses, three header alignments, truncated input and output, i32 extremes and tails. Took numeric proof results separately from the full ray images.

### Why

Proving a constant is within range only eliminates its own test. Bounds, wraparound, aliasing and ordered fallback remain live obligations. Numerical equality at the end cannot reveal a prematurely raised trap or a missing observable prefix.

### What worked

All 2,520 distinct host cases passed on each of three generated plans. Among these cases, 723 trapped and 618 had observable writes before the trap. Literal 32766 shrank from 704 to 688 bytes, literal 32767 from 704 to 264 bytes, dynamic remained 696 bytes. Each of 216 physical batches passed its reference. At length 8 the 32766 specialization saved 4.63% of runtime-guarded cycles, shrinking to 0.43% at length 127.

### What didn't work

Extending the packed numeric predicate to 32767 admits a false hit when input is 65535. The signed hardware subtraction saturates to 32767. The ordinary i32 result is −32768. The literal simplifier therefore rejects that packed candidate. The byte-identical dynamic pair has small measured timing differences, so placement noise prohibits attributing small physical differences entirely to an eliminated branch.

### What I learned

Static proof exposed an inexpensive opportunity for constant thresholds, but the ray row threshold varies with sphere and row. Its gains cannot be counted as a ray-frame improvement.

### What was tricky to build

The simulator needs to observe the faulting receiver/index and ordered application stores without counting the compiler's private spills as application effects. The test snapshots registers before each instruction executes; the checked-address helper's breakpoint has the receiver in t6 and index in t5. The oracle re-reads capacity from the live bytes after every preceding write, including header overlaps.

### What warrants a second pair of eyes

Keep the distinction between preserving a hit's exact difference and proving that every miss has its exact mathematical difference in a halfword. The implementation needs the latter only as a reliable rejection.

### What should be done in the future

Consider symbolic range facts only when a new workload exposes them cheaply. This experiment proves propagation of an existing literal, not a general range-analysis algorithm.

### Code review instructions

Compare the two replaceOnce overlays, oracle and pre-instruction hook in scripts/ray/04-static-proof.mjs. Check the exact cases and counts in various/ray/static-proof.json and the per-block physical cycles in proof.csv.

### Technical details

The 32766 and 32767 hardware candidates have six observations per arm/length/family. The output is cleared between treatments. Repeated calls within a 64-call batch write the same values. Counts distinguish invocation count from separately generated test cases.

## Step 4: Time full frames, restore and reconstruct both images

The director supplied the same three complete generated Typed images used to test packet classification, plus a separate prospective length-gate study. I linked them into a second temporary firmware alongside the static predicate experiment and scheduled another physical visit.

### Prompt Context

**User prompt (verbatim excerpt):** “Did the primary stage get faster on the same scenes? Did the gain survive in the complete frame?”

**Assistant interpretation:** Confirm the isolated row improvement end to end on all previous pose/stride fixtures.

**Inferred user intent:** Select the schedule on the basis of device behavior over the complete workload.

### What I did

- Integrated the separate frame and gate harnesses and retained full physical capture locally. The public ticket holds the decoded measurement records, build fingerprints and restoration receipts.
- Flashed image 6e9ffd864a5de97aabed5112eeef85eed6b2980df78b1a10d36ebd7414f82ba5. Collected 432 frame samples, 234 gate samples and 216 physical range-proof samples. Each suite completed and emitted its end marker.
- Restored e7b771aabc1a9cb0719caa5e30a1b7beed7d4ed33e05e600766246ea492a19b5 and verified all 4,804,016 app bytes and 3,072 partition-table bytes. Reconnected to the running OS. All eight expected worlds were present and the native painter was installed.
- Rebuilt both trials from fresh directories using only the committed script inputs. Both have the same lengths as their flashed counterparts. A byte inspection found 69 differing bytes per image, at application description time, ELF hash and final firmware checksum/digest locations. Executable payload bytes matched across both full rebuilds.

### Why

Whole-frame timing introduces instruction and data working sets for later stages and includes PSRAM access. A schedule can win an independently reset row benchmark and lose to a more compact competitor while rendering full frames.

### What worked

Opening whole frame: 56,243.5 µs prior PIE median, 55,737.5 µs empty-exit median; six paired differences saved a median 508.5 µs (0.904%). Opening primary saves 546.5 µs (3.346%). The additional full-hit extraction arm was slower than the empty-only arm on every pose's complete-frame median. Both experimental visits finished with the same playable bytes.

### What didn't work

The first full-frame assembly trial used 64-byte section alignment. ESP-IDF's memory map made .flash.text begin at 0x40000040, causing an overlap with .flash_rodata_dummy. Bringing the section's declaration back to 16-byte alignment allowed normal linking with identical generated function bytes. The director updated the permanent generator.

### What I learned

A reduction from 3,135 scratch stores to 282 loses complete-frame time against a smaller plan that still performs 1,024 stores. Code size, locality and surrounding work can outweigh a further reduction in modeled instruction count. No hardware cache-counter measurements were taken here.

### What was tricky to build

The full-frame package contains native Typed images in flash, a PSRAM work state, and separate clean and instrumented frame paths. Timing boundaries and correctness checks must match the preexisting experiments. Rebuilding after adding a C file also required reconfiguring the ESP-IDF component source list.

### What warrants a second pair of eyes

Recompute frame medians with the six block pairs in each fixture. Compare direct full-minus-empty pairs instead of subtracting separately aggregated medians. Check various/ray/rebuilds.json for the distinction between equivalent executable code and different complete-image hashes.

### What should be done in the future

A separate code-placement-controlled experiment, or an instruction-cache counter study, could distinguish causes of the full-path reversal. Keep that explanation as a hypothesis.

### Code review instructions

Start at scripts/ray/06-stage-board.sh. Compare scripts/director/frame.c and scripts/director/08-score-frames.py with various/director/frame-fixtures.json and frame-result.json. For physical restoration see first-restoration.json and second-restoration.json.

### Technical details

Final second app size 226,752 bytes. Frame data includes both active pixel bytes and padding/sentinels validated using independent Wasm hashes. Time ends at image availability in memory.

## Step 5: Separate empty, mixed and full packets on hardware

The completed row trial combined three distinct execution paths. I returned to the board for a controlled packet-call experiment, after the director confirmed the shared device schedule was clear.

### Prompt Context

**User prompt (verbatim excerpt):** “Measure empty, mixed and full packet frequencies, scratch traffic and cycles per packet.”

**Assistant interpretation:** Obtain actual physical per-class costs as a distinct measurement with explicit denominators.

**Inferred user intent:** Explain why extending a packet helps on some inputs and costs time on others.

### What I did

- Implemented scripts/ray/board/packet_classes.c. Used actual per-sphere and per-row inputs from the opening, dense and sparse fixtures and verified every eight-input address is 16-byte aligned.
- Collected 243 timing records over nine blocks. Measured scalar, unsigned-minimum, and unsigned-minimum/maximum hand schedules separately. Reset the eight depth/ID cells across treatments and checked each result against an independent scalar oracle outside the timestamp pair.
- Verified all 208,791 outputs. The opening packet census reproduced the independent interpreter trace exactly. Scored CSV rows as cycles per class occurrence within a block, followed by a median across blocks.
- Pinned historical compiler reads in the row and static-proof replays to revision 9a1ff99 after the director integrated the qualified empty exit. Regenerated typed-images.json and static-proof.json; both matched the captured originals.
- Kept separate author and numerical study sessions active with the external Opus High researchers and sent the director the results as they became available.

### Why

Whole-row time does not identify the cost of a single empty packet or the penalty when a classifier passes a mixed one. Using the same squared distances and independently classifying them avoids guessing which branch would have taken which path.

### What worked

Opening scalar and minimum-only schedules measured 55.208→40.242 cycles per empty packet, 95.110→128.259 per mixed packet, and 132.745→164.982 per full packet. The nine-block paired median saving for empty was 27.209%. There were 2,111 empty, 282 mixed and 742 full opening packets per block. The dense and sparse fixtures agreed on the directions.

### What didn't work

Summing these class costs cannot reconstruct the complete row or give cycle-accurate attribution for the compiler's emitted instructions. The microbenchmark has a call per packet, controlled destination values and a scalar hand consumer. We retain the independent complete frame and row experiments for those claims.

### What I learned

When measured in isolation the same classifier can cost over 30% on mixed packets while saving over 25% on empties. Predicting frequency alone is insufficient without knowing the unit cost of each class and the context in which it runs.

### What was tricky to build

The held-out proof case and physical renderer both expose buffers as a four-byte header followed by halfwords. Six scalar lanes align the first load for these fixed fixtures. A separately allocated row array with different alignment would produce a different census.

### What warrants a second pair of eyes

Verify the equalized initial nearest-depth state, direct use of original per-sphere squares, nine-block balanced arm order, and division by actual class frequencies. Internal input/state initialization, correctness evaluation and UART are outside the timer; the candidate call and return are inside.

### What should be done in the future

If per-PC cycle attribution inside the emitted Typed image is needed, use a minimally perturbing hardware sampling experiment or a separately calibrated instrumented image. The third visit measures a hand region and the earlier visit measures actual emitted complete rows.

### Code review instructions

Review scripts/ray/board/packet_classes.c, the classes branch in 06-stage-board.sh and 07-score-classes.py. Inspect various/ray/packet-classes.csv and packet-classes-summary.json; the compact table in design-doc/02-ray-schedule-and-exact-narrowing.md reproduces the opening medians.

### Technical details

Physical image 92125987b5e653b8381abdc6a1dab49347402e188382cdce269d08250576d499, 196,576 bytes. Each arm saw 3,135 + 3,705 + 893 = 7,733 aligned packets per block. Three arms across nine blocks yield the independent reference comparison count.

The third physical restoration completed with the same playable SHA and a successful native painter status query. See various/ray/third-restoration.json.

I repeated the fresh build for this third image too. Its 196,576 bytes had 70 differences, confined to application description and firmware/ELF integrity data; its executable payload matched. I also loaded all 81 opening class rows into the researcher's isolated REPL session and joined them to the evidence team's independent masks. Scripts/ray/08-repl-ray.py reproduces the per-block census check. This work follows the physical study commit 1f9f4ef.
