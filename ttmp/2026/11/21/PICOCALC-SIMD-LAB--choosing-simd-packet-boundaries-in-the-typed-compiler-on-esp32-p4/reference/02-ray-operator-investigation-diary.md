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
