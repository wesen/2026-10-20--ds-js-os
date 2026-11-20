---
Title: Independent review investigation diary
Ticket: PICOCALC-TYPED-PIE
DocType: reference
Status: active
Topics: [compiler, picocalc, testing]
---

# Independent review investigation diary

## Step 1. Establish the language and machine contracts

The director delegated an independent falsification study. Before seeing candidate code I read the real Typed load/store paths and the installed SDK's task context assembly. This produced two concrete constraints for the implementation owner. Whole-loop preflight must preserve the sequence of writes before a bounds exception. The shipped task context code omits q3.

### Prompt context

The original user request is retained in the [director diary](03-director-diary.md). This worker received the following delegated instruction verbatim, not a separate user message.

> Independent academic supervisor for the team's automatic ESP32-P4 PIE SIMD compiler study and subsequent 3D delivered Chess painter. No external paid model use. Sol Medium researcher /root/pie_lowering owns compiler candidate. Your job independently design a falsification protocol, inspect source/ISA/compiler and candidate, write executable independent host cases (ideally differential) checking actual Typed buffer signedness, bounds semantics, overflow, independence, alias, tails, alignment, actual instruction selection/ABI and scalar fallback. Where appropriate study costs and make a recommendation backed by evidence. Communicate with Sol and director. Same new docmgr ticket ttmp/2026/11/20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions; own design-doc/02-independent-review.md, reference/02-independent-review-diary.md, scripts/review, analysis/02-independent-review.md. Detailed diary per /home/manuel/.codex/skills/diary/SKILL.md, textbook-authoring no analogies for vault-ready report. Use physical measurements only via board operator/director. No unrequested changes to production. Commit own scope at intervals. Director publishes all to go-go-parc + reMarkable. First independent review of approach promptly, later review actual candidate (stay through completion).

I interpreted this as a request to test observable effects and actual instruction selection independently of implementation-authored tests. The expected outcome is a qualified or explicitly bounded experimental claim.

### What I did and why

I inspected FunctionEmitter.codeUnitAddress, bufferWrite, charCodeAt and the RV32 memory instructions at project revision c242441. I looked up the P4 vendor instruction example and matched its saturating signed addition to a proof obligation for every arithmetic intermediate. I inspected the FreeRTOS context macros where preemption can invalidate a vector register contract. I sent the buffer and register findings directly to the director and implementer.

### What worked and what failed

The playable build's build.ninja identifies /home/manuel/esp/esp-idf-5.4.2/components/freertos/FreeRTOS-Kernel/portable/riscv/portasm.S. Its config/sdkconfig.h has CONFIG_IDF_TARGET_ESP32P4 and CONFIG_SOC_CPU_HAS_PIE. The SDK checkout reports f5c3654a1c2d2a01f7f67def7a0dc48e691f63c0. The installed toolchain also contains an ESP32-P4-aware objdump. No failed build or run occurred in this step.

### What I learned and what was tricky

A raw pointer aligned to 16 bytes moves off alignment after a four-byte Typed capacity header. The signed saturating instruction can still be correct even when the language reads unsigned elements, provided the low-byte reduction runs first and every intermediate fits. These findings drove the positive and negative input choices.

### What warrants review and what comes next

The independent executor should consume the candidate compiler's actual bytes, compare return and trap side effects, and require observed packed stores. Exact vendor decoding and divergent alias cases deserve a second inspection before interpreting host results. Board-only observations come from the board operator.

### Code review instructions and technical details

Review design-doc/02-independent-review.md, then follow the buffer and RV32 paths in picocalc-os/compiler/typed-wasm.js and typed-rv32.js. The native backend uses lhu/sh for UTF-16 elements. The numeric frontend's check is i32.ge_u followed by unreachable. The enabled compiler case is still pending at this checkpoint.

## Step 2. Qualify the independent fixture before enabling packed code

I wrote a Typed projection function, a caller that keeps 19 live across its call, an ordinary JavaScript scalar reference, and a shared memory corpus. The fixture uses the first implementation proposal's three modulo reductions and three projection expressions. Scalar qualification found 97 successful returns and 48 traps. The JavaScript model, Node's WebAssembly implementation and a host instruction interpreter running the compiler's actual scalar bytes agreed on all 896 bytes of each case.

### Prompt context and scope

See Step 1. This checkpoint qualifies the test instrument and its falsification inputs. Production compiler files are outside this worker's edit scope.

### What I did and why

The tests vary n across signed extremes and eight-element boundaries, adjust each of the six buffer alignments independently, truncate each of their capacities, and overlap buffers both exactly and by one full vector in both directions. Only the first 41 elements are initialized for ordinary buffers. Sentinels beyond the requested count expose stray writes. The no-dereference cases use invalid pointers at n ≤ 0 so even a speculative capacity load is visible. A bounded large-count case exercises address-check ordering safely.

I adapted the existing PICOCALC-RV32-BRANCH interpreter so subsequent work can check preserved registers and state at ebreak. A preliminary vendor decoding experiment established how to independently disassemble raw compiler output.

### What worked

From the checkout root, running node on scripts/review/qualify.mjs reported 145 cases, 97 successful returns, 48 traps and 772 bytes of ordinary machine code including the caller. Wrapping an unchanged binary image with assembler .incbin in an ELF advertising rv32im_xesppie made the installed objdump identify real instructions and their operand registers. For the test addition its output was “82e4065f  esp.vadd.s16  q6,q4,q0”.

### What did not work

Running riscv32-esp-elf-as -march=rv32im -mabi=ilp32 -o /tmp/p4-independent-proof.o /tmp/p4-independent-proof.s gave “Error: unrecognized opcode `esp.vld.128.ip q0,a0,16', extension `xesppie' required”. Adding the declared extension corrected assembly. objdump -D -b binary -m riscv:rv32 printed “.insn 4, 0x0201223b” for the load. An ELF wrapper supplies the missing architecture attribute while preserving the compiler bytes.

### What I learned and what was tricky

Writing all virtual buffer capacities after initializing payloads gives valid initial headers even in overlapping cases. Subsequent writes may change an aliased capacity at exactly the point mandated by scalar order. A launch with a count too large to fit in a buffer can still produce visible output before trapping. Checking only the exception would miss an incorrect early exit.

### What warrants review and what comes next

The independent positive cases must require executed packed stores. The ISA decoder should execute the operands reported by the vendor tool, including post-increment and source register lifetime. Revisit the corpus against the exact selector.

### Code review instructions and technical details

Inspect scripts/review/cases.mjs for the memory initializers and its reference function for the expected semantics. Run scripts/review/qualify.mjs with Node from any directory. The source checker is Node's actual WebAssembly engine. The ordinary RV32 runner checks the stack pointer, return address and callee-saved general registers at each return.

## Step 3. Exercise the candidate bytes and reject two initial transformations

The first candidate exposed a missing data-dependence check and a compiler acceptance regression. I sent both minimal counterexamples to the implementation author and director. After the fixes I ran four backends against 145 projection states, then ran 35 source variants through both candidate arms against Wasm. I persisted the compiler input and image hashes with the measurements. The first protocol and scalar-instrument checkpoint is af8605e. The implementation checkpoint is bd544af.

### Prompt context and decisions

See Step 1. The experiment now includes a separate ordinary-RV32 version with the packed version's prefix guards. This control attributes some speedup to cheaper scalar addressing and check hoisting. I included its actual executed instruction counts in the independent report.

### What I did and why

I reviewed Matcher.input, VectorPlan and the prologue emitter. The original matcher accepted a checked read whose destination was the induction variable. Running a minimal legal Typed function returned a positive diagnosis of one input and one output and eight lanes. The scalar reference writes element nine only. I requested scalar fallback for this shape. With 499 or 500 declarations after a one-input loop, I also reproduced the candidate-only compiler error “RV32 function frame exceeds the instruction range”. Scalar images were respectively 4236 and 4244 bytes. The author now checks that a read's result is a fresh local and reuses frontend position temporaries for scratch.

I added an instruction semantics model that consumes vendor-decoded operand names. The model performs signed saturation, halfword broadcasts and post-increment. It asserts alignment and absence of q3. The ordinary machine interpreter checks preserved integer registers and returns. A standalone driver runs a nested caller and compares success, trap and all 896 arena bytes.

### What worked

The revised image qualified on 145 projection states, including 48 traps. Forty-seven calls took its packed path and retired 510 packed stores. Source variants confirmed range boundaries, power-of-two masks, multiple multiplication factors, renamed parameters, signed narrowing, scalar fallback for shifted indices and carried dependencies, post-loop index visibility, and the original stack-frame acceptance boundary. There were 420 variant executions. The saved receipt includes exact byte counts and complete image hashes.

### What did not work

Before the fixes, the candidate accepted the induction-changing loop; its positive diagnostic is recorded above. The candidate also rejected the scalar-legal near-limit functions. Executing the vendor assembler as a Node subprocess initially failed with “spawnSync /home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20241119/riscv32-esp-elf/bin/riscv32-esp-elf-as EPERM”. Re-running the same operation with permission succeeded. The first checkpoint's git add also failed with “fatal: Unable to create '/home/manuel/code/wesen/2026-10-20--ds-js-os/.git/index.lock': Read-only file system”; the authorized staging command succeeded.

### What I learned and what was tricky

The final implementation checks capacities for the complete vector prefix. A request for seventeen elements with a sixteen-element buffer legitimately enters the packed block before the last scalar iteration traps. I corrected the test path expectation to require packed stores in this case. The independent gold model had always expressed the correct return, trap and partial writes. The published design discusses runtime state and the report explains the two legal fallback boundaries.

### What warrants review and what comes next

Host instruction counts depend on the small fixture and include its caller. Cold compilation, true P4 cycles and physical interruption are different measurements. The board operator owns device access. Request numbers from that run before concluding about hardware economics.

### Code review instructions and technical details

Run scripts/review/qualify.mjs and compare against scripts/review/receipt.json. The independent code disassembles an architecture-tagged .incbin wrapper. On failure the driver stops at the named case and property. The packed model, unlike the candidate, determines source registers and post-increments from Espressif's objdump output.

## Step 4. Test the first complete delivered scene independently

I inspected the handoff between the separate kernel experiment and the current scalar isometric painter. A first nine-parameter helper could not reach the backend's RV32 entry using eight integer argument registers. I alerted the director. By the time of testing the renderer used a packed screen-point value and a six-argument face helper, and the entire source compiled.

### Prompt context and intent

See Step 1. The director asked me to exercise both the initial and frozen scene. The intended check is whether these actual application bytes enter the packed path and whether they emit the same commands as the Wasm reference.

### What I did and why

I compared the actual stock and PIE-enabled image for the scene. I ran the generated RV32 bytes and Wasm over identical 8960-byte arenas. Test states include a full board with two cursor positions, e4, an empty board, a sparse board and two alternate camera pitches. I independently derived both triangle vertex triples for every board square at each pitch.

### What worked

Source cb3fdca0a861ce13c5e91e5a4ac3fb015520d225955ba92b941b4efaf593e48c produced identical 5136-byte RV32 images in both modes. The selector accepted zero loops. All seven native runs agreed with Wasm, including untouched output cells and all capacity headers. The opening generated 2081 command words and the empty board 1057. Every frame had a different output digest, including the cursor-only change.

### What did not work

No defect appeared in the implemented six-argument version. The earlier nine-argument helper shape was detected by source inspection and replaced before this oracle ran.

### What I learned and what was tricky

The chosen scalar point function returns v*512+u to fit the call ABI. The scene traverses squares, sorts pieces by board diagonal, and projects vertices one at a time. None of these loops satisfy the packed, structure-of-arrays access pattern. Equality of default and PIE-enabled compiled bytes establishes this for the exact source tested.

### What warrants review and what comes next

The director is refining piece silhouettes. Rerun the independent scene driver on the frozen source and qualify the resulting image and command-buffer sizes. Physical draw and panel completion evidence remains the operator's responsibility.

### Code review instructions and technical details

Run scripts/review/scene.mjs from any directory. It reads the 3D ticket's actual isometric.typed and uses the scalar backend plus its default Wasm emitter. The independent repro stores pitches 3, 5 and 7, and tests complete native output including canaries. The scene receipt relates each rendered command stream to the native image hash.
