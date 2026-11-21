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
