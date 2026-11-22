---
Title: Investigation diary
Ticket: PICOCALC-CANDELA-SECTIONS
Status: active
Topics:
    - picocalc
    - esp32-p4
    - rendering
    - compiler
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-SECTIONS--candela-s-generated-wgsl-sections-as-bytecode-interpreted-by-the-p4-kernel/scripts/04-qjs-translate.mjs
      Note: Translator under QuickJS and Node (Step 7)
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-SECTIONS--candela-s-generated-wgsl-sections-as-bytecode-interpreted-by-the-p4-kernel/scripts/07-rv32-count.py
      Note: RV32 counts in the prototype harness (Steps 7, 10)
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-SECTIONS--candela-s-generated-wgsl-sections-as-bytecode-interpreted-by-the-p4-kernel/scripts/ck/driver.c
      Note: Kernel driver with per-pixel digests (Step 9)
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-SECTIONS--candela-s-generated-wgsl-sections-as-bytecode-interpreted-by-the-p4-kernel/scripts/vm/test-verify.c
      Note: Verifier rejection and mutation test (Step 6)
ExternalSources: []
Summary: Chronological record of building the section translator, bytecode v1, the C verifier and interpreter, and the host agreement and cost measurements
LastUpdated: 2026-11-22T02:30:00-05:00
WhatFor: Resume or review PICOCALC-CANDELA-SECTIONS; each step records commands, evidence, failures and decisions
WhenToUse: Read the latest step before continuing; earlier steps hold the evidence behind the format and the measurements
---

# Investigation diary

## Step 1: Fix the inputs and the working tree

The launching agent asked for the translator from Candela's generated WGSL sections to a register bytecode, the bytecode format, a C verifier and interpreter callable from CPU-KERNEL's dispatch table, a host agreement test over all 105 presets, and RV32 instruction counts, followed by a vault report. Before writing anything I read the ticket stub, the parent ticket PICOCALC-CANDELA-P4, and the sibling CPU-KERNEL's design and section census, and fixed the Candela copy.

My worktree branch started 288 commits behind `main` and did not contain the 2026-11-21 tickets at all. It had no commits of its own, so I fast-forwarded it.

### Prompt Context

**User prompt (verbatim, the launching agent's brief):** "You are implementing the ticket PICOCALC-CANDELA-SECTIONS in /home/manuel/code/wesen/2026-10-20--ds-js-os, working in your own git worktree of it. Read AGENTS.md first. ## Goal Candela is the user's physically based path tracer: a JavaScript scene API whose compiler emits WGSL. The project goal is that Candela scene programs run on the PicoCalc's ESP32-P4. Every scene has generated code (Candela's `matCode`, `sdfCode`, `hfCode`, `densCode`, `customKernel`). That code must run inside the firmware's C path-tracing kernel as a register bytecode. The bytecode is produced on the device, by a JavaScript translator, from the WGSL text that Candela's unchanged compiler emits. Your job is the translator, the bytecode format, a C verifier and interpreter, and the host agreement test that proves they compute what the compiled WGSL computes. [...] ## What to deliver 1. **The translator**, in JavaScript that runs in QuickJS (no Node-only APIs in the translator itself). It handles the WGSL subset the generators emit: function headers, `var`/`let`, assignments to `Lobe` fields, `if`/`else` selection on `u`, calls, vector constructors, swizzles, arithmetic; constant folding; the super-instructions `CHOOSE` and `LOBE`. An unsupported construct gets a clear diagnostic naming the construct. 2. **A versioned bytecode format**, and **a C verifier** that checks register bounds, call targets and jump targets, so a malformed program is rejected before it runs. 3. **The C interpreter.** Heavy operations (`fresnelDielectric`, `noise3`, `fbm3`, checker, stripes, voronoi and the other fixed functions sections call) are built-ins that call compiled C, not interpreted node by node. 4. **A host agreement test over all 105 presets:** translate every generated section and list failures by construct; interpret the sections and compare per evaluation with the compiled C++ translation of the same WGSL, on recorded hit records, to 1e-5 relative; check whole-frame mean luminance within 1% at 64 spp for B-01, R-01, F-01 and W-02. 5. **Interpreter cost.** Measure RV32 instructions per sample for B-01, F-01, W-02 and one SDF preset, interpreted against compiled, with rv32emu or the counting interpreter (rv32imfc, ilp32f, the ESP-IDF GCC at `/home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20260121/riscv32-esp-elf/bin/riscv32-esp-elf-gcc`). Report SDF presets separately, because sphere tracing calls `sdUser` up to 220 times per ray. Device timing is optional for this ticket. [...]" (The full brief also gives the device rules, the process rules, the files not to modify, and the vault-report and report-back requirements; the omitted parts are marked [...].)

**Assistant interpretation:** build and measure the whole section path on the host: translator (QuickJS-compatible), bytecode v1, verifier, interpreter with compiled built-ins, a three-way harness against the prototype C++ translation, RV32 counts; define the C interface CPU-KERNEL's dispatch table will call; write the design first.

**Inferred user intent:** every Candela scene's generated code runs on the PicoCalc without native code generation on the device, with evidence that nothing is lost in translation and a measured cost that says where native code will eventually be needed.

### What I did

- Read `AGENTS.md`, the ticket stub, P4's design (Sections 3, 6, 7, 9), its analysis, its diary, `various/10-entry-calls.txt`, `various/05-numeric-bench.jsonl`, `various/02-tiers.json`, and its scripts `03-export-scene.mjs`, `04-wgsl2cpp.mjs`, `05-harness.cpp`, `06-rv32imfc-count.c`, `07-run-kernel.sh`, `13-count-entry-calls.sh`.
- Read CPU-KERNEL's design (`design-doc/01-design-stub.md`), `scripts/cpu/cdl_api.h`, `scripts/lib/candela.mjs` (`splitProgram`), `scripts/generated/cdl_kernel.h` (`struct Sections`, `namespace api`), a generated scene section file, and `scripts/various/01-section-api.json`, all read-only from its worktree and with `git show`.
- `git merge --ff-only main` in my worktree (288 commits; my branch had none of its own).
- Hashed the archives: `candela-workspace(1).zip` is `873b2dd4...df5d` (the pinned version); extracted it into a new empty directory `scratchpad/sections/archive/`; checked `src/kernel.js` `253d242d...`, `src/compile.js` `6f5926cc...`, `src/render.js` `a71df1b9...` against CPU-KERNEL's pin; copied `src/`, `content/` and `package.json` (with `"type": "module"`) to `scratchpad/sections/run/` as P4 did.
- `docmgr doc add --ticket PICOCALC-CANDELA-SECTIONS --doc-type reference --title "Investigation diary"`.
- Copied CPU-KERNEL's region-counting interpreter (`05-rv32imfc-count.c` at `63e6997`) to `scripts/harness/rv32imfc-count.c` with a provenance header, so the measurements here do not depend on an unmerged branch.

### Why

- The sibling's `struct Sections` and its 15-function section API are the contract the interpreter has to serve; reading them first kept the C interface compatible.

### What worked

- The pins match CPU-KERNEL's, so the WGSL here is byte-identical to what the firmware kernel is generated from.

### What didn't work

- `ls ttmp/2026/11/21/` failed in the worktree: `No such file or directory`. Cause: the branch was at `ad48b80`, before the tickets were created. Fast-forwarding fixed it.
- A broad `find / -name qjs` timed out after 120 s and was stopped; QuickJS is built from `picocalc-os/third_party/quickjs` instead (Step 6).

### What I learned

- CPU-KERNEL's census: generated sections call 15 of the 107 fixed functions, and the kernel already reaches the sections through a five-pointer table. `checker` and `stripes` are not kernel functions in this Candela version: `fx.js` defines them as macros (`fmodp(floor(uv * n).x + floor(uv * n).y, 2)` and `step(duty, fract(x * n))`).

### What was tricky to build

- Nothing yet.

### What warrants a second pair of eyes

- The brief's quotation is the launching agent's text; I have no direct user prompt for this ticket.

### What should be done in the future

- N/A.

### Code review instructions

- `git log --oneline -1` after the fast-forward shows `1fc0f1e`.

### Technical details

- Scratch layout: `scratchpad/sections/{archive,run,export,agree,qjs}`; scripts live only in the ticket's `scripts/`.

## Step 2: Export every preset's sections and look at what the generators emit

I wanted the actual corpus before designing the bytecode. `scripts/01-export-sections.mjs` builds all 105 presets with Candela's front end in Node, splits each program at `compile.js`'s boundaries and writes the field section, the material section, the whole program and the packed buffers.

All 105 build and split in 42 s. The subset is smaller than the stub assumed: no loops, no `switch`, 2,109 `f32` lets against 393 `vec3f`, and the material bodies are all the same `genSurface` shape.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** measure the subset rather than guess it.
**Inferred user intent:** a translator sized to Candela's real output.

### What I did

- `scripts/translator/split.js`: the boundary checks of CPU-KERNEL's `splitProgram`, rewritten without Node APIs so it runs in QuickJS. It does not recompute the GGX table (the device memoises it): it checks the `var<private> ETAB: array<f32, 256> = ` prefix and the constant `ggxE` text instead.
- `scripts/lib/candela-host.mjs` (host-only loader: pin check, preset loader, `exportScene` as in P4 and CPU-KERNEL).
- `node scripts/01-export-sections.mjs scratchpad/sections/run scratchpad/sections/export 64 64` → `105/105 presets exported`.
- A throwaway census (`scratchpad/sections/census.py`) over the 210 section files: calls by number of presets, field reads, declaration types, swizzles, operators, keywords.

### Why

- Translating the WGSL text keeps Candela unchanged; the parser only has to accept what the generators emit, so the corpus defines the parser.

### What worked

- Census (calls, number of presets using each): `lobeNone` 105, `fresnelDielectric` 104, `U` 42, `pow` 30, `metalAt` 24, `fbm3` 18, `tangentWorld` 9, `cross` 9, `safeNorm` 7, `select` 6, `lum` 6, `fmodp` 4, `voronoi3` 3, `sellmeier` 3, `noise3` 2, `fmodp3`, `traceScene`, `hitAlbedo`, `occluded` 1 each. Keywords: `let` 2,536, `var` 1,785, `return` 1,771, `if` 1,003, `else` 390, nothing else. Operators: `<=`, `>=`, `&&` and `!` once each.
- The largest single function is X-04's Menger sponge SDF: 67 lets, evaluated up to 220 times per ray.

### What didn't work

- My first census glob `*/*.wgsl` also matched `kernel.wgsl` (the whole program) and reported fixed-kernel constructs; rerun on `mat.wgsl` and `field.wgsl` only.

### What I learned

- `genSurface` repeats some expressions textually (`clamp(dot(wo, h.N), 0.0, 1.0)` in every layer, the shading normal `safeNorm(m5)` once per use), so common-subexpression elimination pays even though `fx.js` hash-conses its own nodes.
- `L.flags = 1; ...; L.flags = L.flags | 8;` occurs in every conductor, and `L.med = -1` and `L.ior = 1.5` repeat `lobeNone()`'s defaults.

### What was tricky to build

- The GGX table check: comparing the table text would need `ggxTableWGSL()`, which costs minutes on the device.

### What warrants a second pair of eyes

- `split.js` duplicates CPU-KERNEL's constant texts (`metalAt`, `hitAlbedo`, `hitEmission`); both tickets pin the same `compile.js`.

### What should be done in the future

- N/A.

### Code review instructions

- `node scripts/01-export-sections.mjs <candela-run> <out> 64 64` then `cat <out>/F-01/mat.wgsl`.

### Technical details

- `<out>/index.json` lists every preset with its section sizes; `meta.json` per preset records `spectral`, `nU` and the engine.

## Step 3: The design

With the corpus in hand I rewrote the stub as the design (`design-doc/01-design-stub.md`): seam and call frequencies, the subset with counts, the translator pipeline, bytecode v1's layout and instruction families, the verifier's rules and what they guarantee, the interpreter and its C interface, the agreement and cost tests, where the code lives, risks, and what FIRST-LIGHT needs.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** "Expand it into a real design document before implementing."
**Inferred user intent:** a reviewable plan, and a document FIRST-LIGHT can integrate from.

### What I did

- Decisions recorded in the design: inline every generated function (WGSL has no recursion, so no bytecode call stack is needed); swizzles and struct fields as operand offsets; constants and uniform rows in a read-only register region written at bind time; one disjoint frame per entry (re-entrancy of `customKernel` → `hitAlbedo` → `evalMaterial` and of rays → `sdUser`); forward-only jumps, so termination is a verifier property; kernel calls through a C function-pointer table whose entries may be NULL; `cdl_hit`/`cdl_lobe` layout-compatible with the kernel's C++ structs so records are read in place.

### Why

- Forward-only jumps cost nothing (the sections have no loops; `fbm3`'s loop is inside a kernel function) and give the verifier a termination proof for free.
- Disjoint frames cost registers but remove the only way a nested evaluation could corrupt its caller.

### What worked

- N/A (design only).

### What didn't work

- N/A.

### What I learned

- The material entry has three inputs the bytecode can address in different ways: `wo` and `u` by value (arguments in the frame), `h` by pointer (loads). Treating the hit as a pointer avoids copying 92 bytes per evaluation.

### What was tricky to build

- Choosing the comparison metric: a component of a unit normal near zero cannot be compared relatively to itself; the design compares vector fields relative to the vector's max-norm.

### What warrants a second pair of eyes

- Design Section 6's claim that a verified program cannot re-enter an active frame rests on the per-entry list of allowed kernel functions.

### What should be done in the future

- Update the design where implementation changes it.

### Code review instructions

- Read the design's Sections 5-7.

### Technical details

- N/A.

## Step 4: The translator, and what B-01's listing taught it

I wrote the translator as six QuickJS-compatible modules (`isa.js`, `parse.js`, `lower.js`, `emit.js`, `index.js`, `disasm.js`) and a Node driver (`02-translate-all.mjs`). The first B-01 listing worked but showed four avoidable costs, each of which became an exact optimisation. After them B-01's sphere material is eight instructions per evaluation, the shape the parent design sketched.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** deliverable 1 (the translator), with the super-instructions `CHOOSE` and `LOBE`.
**Inferred user intent:** a translator whose output is small enough that interpretation is cheap.

### What I did

- `isa.js`: one table of 143 opcodes with operand specs, the 16 kernel functions with their signatures, the `Hit` and `Lobe` word layouts and the `lobeNone()` template. `vm/gen-isa.mjs` generates `vm/cdl_vm_isa.h` from it.
- `parse.js`: lexer and recursive-descent parser for the subset; anything else throws a `SectionError` with a construct key.
- `lower.js`: lowering per entry with inlining, typing (abstract integers resolved by context), f32 constant folding (`Math.fround` after every operation), `CHOOSE`/`CHOOSE0` from `genSurface`'s pattern, `SWITCH` from dispatch chains, `LOBE` from runs of field assignments, `HLD` loads of the input hit, `U(row)` imports.
- `emit.js`: alias resolution, dead-code removal, fusions (`FRESDOT`, `STRIPES`, `CHECKER`, `MAD`, `MAD3S`), jump threading, first-fit linear-scan allocation, constant pool packing, encoding.
- Iterations on B-01, each checked by its listing (`prog.lst`):
  1. `u` was copied out of the argument block (`MOV1 r28, r27`): the parameter alias required offset 0; now any offset of an argument word works, and the word is marked mutable.
  2. `L.w = L.w * wgt` survived as a self-move inside a `LOBE`: `wgt` is a `var` (assigned by tinted layers), so it was not a constant. Variables now carry a tracked constant (merged at joins), `x * 1` folds, and a field written with its own register is skipped.
  3. `L.med = -1` and `L.ior = 1.5` repeat `lobeNone()`: each `Lobe` variable now tracks which fields still hold known constants since `LNONE` (merged at joins), and a write of the same constant is dropped.
  4. Vector constructors copied every component (`MOV1` x 3): a fresh single-use component is now aliased into its slot of the constructor result, which is written once per word.
  5. `safeNorm(bumpN(...))` was computed three times (R-04): scoped common-subexpression elimination in `emit()`, keyed on opcode and operands, for pure instructions whose operands are immutable.

### Why

- Each of these is exact (it removes a move, a recomputation or an identity), so it cannot change a result; the agreement test (Step 5) checks that.

### What worked

- `105/105 presets translated` (`02-translate-all.mjs`), before and after every iteration.
- B-01's sphere material after the iterations:

  ```text
  HLD.1   r27, #17            ; h.mat
  SWITCH  r27, #2, @9, @40, @71
  LNONE   r27:26
  HLD.3   r53:3, #5           ; h.N
  FRESDOT r56, r23:3, r53:3, r1
  CHOOSE0 r26, r56, @33
  LOBE    r27:26, #219, r2, r3:3, r6, r6, r7, r53:3
  RET
  ```

### What didn't work

- First run: `B-01: FAILED E-SECT-UNSUPPORTED call:u<>: templated constructor 'u<...>' is not in the section subset (mat.wgsl:8:7)`. The parser treated `u < f0_1` as a templated constructor. Now only `vec2`-`vec4`, `mat*`, `array`, `ptr`, `atomic` and `texture*` followed by `<` are templates.
- Node warned `MODULE_TYPELESS_PACKAGE_JSON`; `scripts/package.json` now declares `"type": "module"`.
- `TypeError: ins.a is not iterable` in `index.js`: labels had no operand list. `place()` now emits `{ op: 'LABEL', H: 0, a: [] }`.
- `gen-isa.mjs` emitted `{.f = 1f}`, which is not C; integers now get `.0f`.

### What I learned

- The `if (cond)` compare-and-branch fusion must only fire for a comparison written in the condition: a named boolean (`let b = x < y; if (b) ...; select(..., b)`) may be read again later. The first version checked only uses seen so far; it now requires `s.cond` itself to be the comparison.

### What was tricky to build

- `LOBE` ordering. Field reads inside a run are resolved to the values assigned earlier in the run, so the moves have no order among themselves; but a pending move can still read a field's *old* register (`L.ay = L.ax` with `L.ax` not assigned in the run) that a later direct write (a retargeted instruction) would overwrite before the `LOBE` executes. Rule: before writing a field, flush pending moves whose source overlaps it.
- CSE and retargeting: `retarget()` moves an instruction's destination into a `Lobe` field or variable, which are mutable; a cached CSE entry pointing at that instruction would then alias a mutable location. The cache stores the original destination register and is ignored when the instruction's destination has changed.

### What warrants a second pair of eyes

- `lower.js` `lowerVar`'s parameter alias: it is safe only because `mentionsAfterDecl` proves the parameter is not read again; argument words written by an aliased variable are excluded from CSE.

### What should be done in the future

- N/A.

### Code review instructions

- `node scripts/02-translate-all.mjs <export> out.json B-01` and read `<export>/B-01/prog.lst`; `R-04` shows bump mapping, `E-02` the custom integrator.

### Technical details

- Construct keys: `statement:<kw>`, `keyword:<kw>`, `call:<name>`, `type:<T>`, `operator:<op>`, `assign:<form>`, `field:<struct>.<f>`, `name:<id>`, `literal:<form>`, `limit:<what>`.

## Step 5: The C verifier and interpreter, and B-01 bit for bit

The interpreter (`vm/cdl_vm.c`) and its interface (`vm/cdl_vm.h`) followed the design. The harness (`harness/harness.cpp`, derived from P4's `05-harness.cpp`) wraps the prototype translation's five dispatch functions, renamed by `harness/rewrite-kernel.py`, and builds in three modes. In compare mode B-01's 64 x 64 frame produced 3,333 material evaluations, all bit-identical to the compiled C++.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** deliverables 2 and 3, and the start of 4.
**Inferred user intent:** proof that interpretation does not change the image.

### What I did

- `cdl_vm.c`: `cdl_vm_load` (header, entries, frames, imports, per-instruction operand checks from the generated specs, forward targets on instruction boundaries via two bitmaps, terminators, kernel table and per-entry kernel-function rules, `fbm3` immediates), `cdl_vm_bind`, `cdl_vm_rebind_uniforms`, the `switch` interpreter, the five entry points.
- `harness.cpp` adapter: 16 C functions over the prototype's `cdl::` kernel functions, `static_assert`s on `Hit`/`Lobe` layout; compare mode saves and restores `rngS` around the interpreted call and compares per field.
- `03-agree.py`: per preset, prototype translation, rewrite, compare build, run; JSON lines.
- `python3 -I scripts/03-agree.py <export> <work> out.jsonl B-01` → `B-01 evalMaterial: 3333 evaluations, 3333 bit-exact, 0 over 1e-5, max rel 0`.
- Commit `4065078`.

### Why

- Comparing inside the render, on the compiled path, uses exactly the hit records the renderer produces and keeps the frame identical to the reference.

### What worked

- B-01 agreement: 3,333 / 3,333 evaluations bit-identical.

### What didn't work

- `harness.cpp:68:25: error: 'CDL_VM_MAX_REGS' was not declared in this scope`: the limit lived only in the generated ISA header. `cdl_vm.h` now exports `CDL_VM_REG_LIMIT`, checked against the generated value with `_Static_assert`.
- `-Wmisleading-indentation` warnings in three one-line loops of `cdl_vm.c`; reformatted.

### What I learned

- On x86-64 neither build contracts `a * b + c`, and the translator's evaluation order is WGSL's, which the prototype C++ preserves; bit-identical results are the expected outcome on the host, not a lucky one.

### What was tricky to build

- `HBOOL`: a C++ `bool` member is one byte padded to a word, so a register-held `Hit`'s `ok` is the low byte of word 0 on a little-endian target; the verifier only allows the two bool offsets.

### What warrants a second pair of eyes

- The verifier's boundary bitmaps are static, so `cdl_vm_load` is not reentrant (documented in the source).

### What should be done in the future

- Run all presets (Step 6).

### Code review instructions

- `scripts/03-agree.py`, `scripts/harness/harness.cpp` (`MODE == 2` paths), `scripts/vm/cdl_vm.c` `verify_entry`.

### Technical details

- Build: `g++ -std=c++17 -O2 -fno-math-errno -DMODE=2 -DSPP=1 -DKERNEL=... -I vm harness.cpp cdl_vm.o`.

## Step 6: Every preset, and the one bug the K presets found

The first run over all 105 presets at 1 spp agreed bit for bit in every entry except `evalMaterial` of the eight T3 mesh presets K-01 and K-03 to K-09: 2,753 of 504,351 material evaluations differed beyond 1e-5, all in conductor lobes with tangents. The field was `T`, the result of `tangentWorld`, and in K-04 it pointed in a different direction altogether. The cause was a translator bug, not arithmetic. After the fix, a 4 spp run over all presets agreed everywhere, and the verifier passed its rejection and mutation tests.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** deliverable 4 (per-evaluation agreement over all presets) and deliverable 2's guarantee (malformed programs rejected).
**Inferred user intent:** evidence that holds for every preset, not one.

### What I did

- `harness.cpp` compare mode now prints the worst field's name and both values. `python3 -I 03-agree.py $S/export $S/agree $S/agree-k.jsonl K-04 K-08` printed `mat 6 ... rel 0.882 in T: (0.578303635 0.803594947 0.140713051) / (-4.06378022e-05 -0.0757327601 0.997128189)`.
- K-04's listing showed the cause: `CALL tangentWorld r80:3, h, r83:3, r0, r86:3`, whose last operand (`N`, from `h.N`) was `r86`, the register of `m8 = h.lp - vec3f(0.01175, 0, 0)`. The `HLD` of `h.N` had been cached in the scope's load cache, then **retargeted** into a `Lobe` field register by a later `L.N = h.N`. The load cache still named the original virtual register, which no instruction wrote any more, so the allocator gave its slot to another value.
- Fix in `lower.js`: a value bound to a name (`let`) or held in the load cache is marked `shared`, and `retarget` refuses shared values.
- Full run at 4 spp: `python3 -I 03-agree.py $S/export $S/agree $S/agree-s4.jsonl --spp 4 --jobs 5` (kept as `various/03-agreement-s4.jsonl`).
- `vm/test-verify.c`, built with `-fsanitize=address,undefined -DCDL_VM_COUNT`: 17 targeted malformations of B-01's blob, then 2,000 random mutants of each of the 105 blobs (1 to 4 halfwords of header, descriptors or code); an accepted mutant is bound and all five entries run on six inputs, and the step counter must stay within the entry's length.
- The lexer now walks character codes instead of slicing and matching a regular expression per token. DCE became one backward pass, and the fusion pass no longer restarts after each fusion. Output is byte-identical; QuickJS time for B-01 fell from 16.5 ms to 6.3 ms and for K-03 to 77 ms (32-bit host build).
- Commit `1e1d89f`.

### Why

- A field-level report with both values made the bug visible as a wrong direction, not a rounding problem.

### What worked

- 4 spp, all 105 presets: `evalMaterial` 2,016,847 evaluations, 2,016,845 bit-identical, 0 over 1e-5, maximum relative difference 2.49e-7, no integer-field or random-stream mismatch. `sdUser` 1,541,521 (6 presets), `heightAt` 6,851,269 (3), `densityOf` 6,547,730 (4) and `customKernel` 16,384 (1) evaluations, all bit-identical.
- Verifier: 17 of 17 targeted malformations rejected, each with its own message; 184,981 of 210,000 mutants rejected; the 25,019 accepted ones ran 753,720 evaluations with no sanitizer report and no step-bound violation.

### What didn't work

- The first full run reported `rel 0.000388 in T` for K-08 and `rel 0.882 in T` for K-04, as above.
- `test-verify` first ended in a LeakSanitizer report for its own two buffers (`main` and `slurp`), fixed by freeing them.

### What I learned

- Retargeting (computing a value directly into its final register) is only safe for a value nothing will read again under its old name. In straight-line code that is easy to forget, because the uses that break are reads through a cache.

### What was tricky to build

- The targeted malformations need the exact offset of each field. `test-verify.c` computes the code start from the header (`20 + 12 x 5 + 4 nconst + 4 nimport`) and finds the material `SWITCH` by scanning for opcode 7.

### What warrants a second pair of eyes

- The two `evalMaterial` evaluations that differ in the last bit (relative 2.5e-7): neither the integer fields nor the random stream differ, and no frame changes (Steps 7 and 9).

### What should be done in the future

- Nothing for agreement; QuickJS and the frame check follow.

### Code review instructions

- `scripts/translator/lower.js`: `retarget`, `bind`, `hitField` (`shared`).
- `scripts/vm/test-verify.c`; `various/05-verifier-test.txt`.

### Technical details

- Per-evaluation metric: integer fields equal; each float field `max_i |a_i - b_i| <= 1e-5 * max(max_i |a_i|, max_i |b_i|)` with a floor of 1e-30.

## Step 7: QuickJS, the frames, and the first RV32 counts

The translator gives the same bytes in Node and in the firmware's QuickJS build. At 64 spp the interpreted frames of B-01, R-01, F-01 and W-02 are identical to the compiled ones pixel for pixel. The first RV32 counts put the interpreter's cost at 2-10% per sample for path-traced presets and up to 3.2 times the compiled cost for the Menger-sponge SDF.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** deliverables 1 (QuickJS), 4 (luminance) and 5 (instruction counts).
**Inferred user intent:** the cost of running sections in bytecode, and confidence that the device's JavaScript produces the same program.

### What I did

- `04-qjs-translate.mjs`: one driver that runs under `candela-qjs` (P4's `quickjs/build.sh`, 32- and 64-bit host builds) or Node, and writes each blob as hex plus CPU time and QuickJS steps. All 105 blobs are identical across Node, 64-bit and 32-bit QuickJS, and equal to `02-translate-all.mjs`'s files.
- `06-luminance.py $S/run $S/lum $S/lum.jsonl --size 160 --spp 64 B-01 R-01 F-01 W-02`.
- `07-rv32-count.py`: ESP-IDF GCC 14.2 (`esp-14.2.0_20260121`), `-march=rv32imafc_zicsr_zifencei -mabi=ilp32f -O2 -fno-math-errno`, scene and bytecode linked with `.incbin`, counted between per-row region marks by `harness/rv32imfc-count.c`, with a per-function profile.

### Why

- Equal bytes across engines means the device's translation needs no device-side check beyond the verifier.

### What worked

- Luminance at 64 spp, 160 x 160: all four presets have 25,600 / 25,600 pixels bit-identical, so the mean-luminance ratio is exactly 1 (B-01 8461.34, R-01 62.1498, F-01 8176.34, W-02 15.3828).
- Baseline interpreter, instructions per sample (compiled to interpreted): B-01 8,164 to 8,743 at 160 x 160 (1.071), R-01 9,532 to 10,440 (1.095), F-01 8,929 to 9,739 (1.091), W-02 78,550 to 79,781 (1.016), E-02 3,634 to 5,285 at 64 x 64 (1.454), and for the user-SDF presets G-02 13,157 to 23,330 (1.773), S-02 15,280 to 26,739 (1.750), X-04 17,335 to 55,264 (3.188), R-05 13,561 to 16,683 (1.230), R-08 617,388 to 713,444 (1.156).

### What didn't work

- `RuntimeError: R-05 mode 0: counter exit 70: rv32imfc-count: bad access 0 at pc 0x2079e after 36866`. The compiled build failed too. `addr2line` put the fault in newlib's `with_errnof` (`math_errf.c:39`), which stores `errno` through a reentrancy pointer that nothing initialises on the bare machine. `harness.cpp` now defines `__errno()` for RV32.
- The first parallel count failed with `FileNotFoundError ... kernel-rw.cpp.tmp`: both modes of one preset raced to create the rewritten kernel. Kernels are now prepared sequentially before the parallel builds.

### What I learned

- B-01's profile: `memcpy` costs 256 instructions per sample in the interpreted build and nothing in the compiled one. GCC turned the 104-byte `lobeNone()` template copy, the result copy and the generic vector result loops into library calls. RV32IMAFC also has no count-trailing-zeros instruction, so `__builtin_ctz` in `LOBE` was a call to `__ctzsi2`.

### What was tricky to build

- One driver for two engines: QuickJS's `host` object provides `readFile`, `listDir`, `cpu` and `steps`; under Node the script builds the same object from `node:fs` with a dynamic import, so the translator modules are imported identically.

### What warrants a second pair of eyes

- Host timings in this step were measured while other workloads shared the machine; QuickJS steps are the load-independent figure.

### What should be done in the future

- Remove the library calls from the interpreter loop (Step 10).

### Code review instructions

- `scripts/04-qjs-translate.mjs`, `scripts/06-luminance.py`, `scripts/07-rv32-count.py`; `harness.cpp` `__errno`.

### Technical details

- Luminance: `0.2126 R + 0.7152 G + 0.0722 B` over the mean RGB of frames 0..63.

## Step 8: CPU-KERNEL's two constraints: the section API and argument order

The coordinator relayed two results from the finished CPU-KERNEL ticket (now on `main`, `817e6b4..719a493`). Section code calls the 15 functions of `scripts/generated/manifest.json`'s `sectionAPI`, and 13 kernel functions change module state (`kernel.sideEffects`). C++ leaves argument order unspecified, which made `sampleLobe(L, woL, rnd2(), rnd())` differ between x86-64 and RV32. The coordinator asked that the VM and translator evaluate arguments left to right, respect `sideEffects`, and be checked against the kernel's host build per pixel.

### Prompt Context

**User prompt (verbatim, the coordinator's message):** "The CPU-KERNEL ticket finished, and two of its results constrain your section bytecode. [...] 1. Call targets: section code calls the 15 API functions listed in scripts/generated/manifest.json. The same manifest's `sideEffects` list names the 13 functions that change module state. 2. Argument order: WGSL evaluates call arguments left to right, but C++ leaves the order unspecified. `sampleLobe(L, woL, rnd2(), rnd())` came out different on x86-64 and RV32; means agreed while only 42–59% of pixels did. The fix is translation rule 5 in lib/wgsl2c.mjs: side-effecting calls are hoisted and called in WGSL order, and statement shapes it can't handle fail the build. Your VM and compiler must also evaluate arguments left to right and respect `sideEffects`. Please add a per-pixel digest comparison against the kernel's host build, not only mean luminance. [...]"
**Assistant interpretation:** make the ordering and side-effect guarantees explicit and tested in the translator, restrict kernel calls to the manifest's API, and test the interpreter inside the real kernel.
**Inferred user intent:** no silent image divergence from evaluation order once bytecode and the C kernel meet on the device.

### What I did

- Read CPU-KERNEL from `main` as a read-only archive extracted to `$S/ck`: `manifest.json`, `cdl_api.h`, `cdl_kernel.h` (`struct Sections`, `namespace api`), `cdl_math.h`, `cdl_switches.h`, `04-build.py`, `06-driver.c`, `09-host-tests.py`, `03-gen-scene.mjs`, rule 5 (`sequence()`) in `lib/wgsl2c.mjs`.
- `isa.js`: `SECTION_API` and `KERNEL_SIDE_EFFECTS` copied from the manifest, with an `api` and an `effects` flag per kernel function, and a load-time check that the flags agree with the lists. `traceScene`, `occluded`, `rnd`, `rnd2` and `cosHemiN` (which draws `rnd2`) have effects.
- `emit.js`: dead-code removal keeps every call with effects (before, an unused `traceScene` or `occluded` would have been removed). `lower.js`: such calls are never merged by CSE (asserted at load). `&&`/`||` with a side effect in the right operand is refused (`E-SECT-UNSUPPORTED short-circuit:side-effect`), because WGSL short-circuits and the bytecode evaluates both operands. `Program.hasEffects` follows generated functions transitively.
- `opts.kernelApi` (default: the manifest's 15): a call to a kernel function outside it is `E-SECT-CALL call:<name>-not-in-kernel-api`. The 105 presets call only nine kernel functions (`fresnelDielectric`, `fbm3`, `tangentWorld`, `noise3`, `voronoi3`, `sellmeier`, `traceScene`, `occluded`, `hitAlbedo`); the other six API functions are translated into bytecode. The seven custom-integrator helpers beyond the API (`hitEmission`, `hash13`, `voronoiVec3`, `envSun`, `rnd`, `rnd2`, `cosHemiN`) keep their opcode numbers but are refused unless a kernel exports them.
- `09-order-test.mjs` with `vm/test-order.c`: a stub kernel in which every side effect changes one counter (`rnd` adds 1 and returns it, `rnd2` adds 1, `occluded` 10, `traceScene` 100). Twelve customKernel bodies run with hand-derived expected results: constructor arguments, binary operands, built-in arguments and `select`, `rnd2` then `rnd`, an unused `occluded` and an unused `traceScene`, two equal traces not merged, `occluded` between equal traces, nested calls, an untaken branch, a generated function with effects called twice, and `&&` with the effect on the left. Three more bodies must fail with a named construct.
- `10-effects-census.mjs` over the 105 exports.

### Why

- Ordering by construction is only a claim until a test with observable side effects checks it. The counter makes every reordering, merge or removal visible in the result.

### What worked

- `all 15 cases pass` (`various/09-order-test.txt`).
- Census (`various/10-effects-census.json`): 13,205 section statements; 2 contain a call with side effects (E-02's `traceScene` and `occluded`), none contains two, and no `&&`/`||` has one on its right. Evaluation order cannot change any current preset's image; the rules protect the next generator version.
- All 105 presets still translate, to identical bytes.

### What didn't work

- The first order-test run failed 7 of 12 cases with `'let a' without a type is not in the section subset (Candela always writes the type)`. The cases were mine; they now declare types as Candela does.

### What I learned

- Their rule 5 and the translator reach the same order by different means: C++ needs explicit temporaries, and the bytecode gets the order from lowering arguments in source order into separate instructions.

### What was tricky to build

- The test's expected values need WGSL's semantics worked out by hand. Example: `select(rnd(), rnd(), true)` evaluates both arguments, so it consumes two draws and returns the second.

### What warrants a second pair of eyes

- `hasEffects` treats any call of a name in `KERNEL_SIDE_EFFECTS` as an effect, even one sections cannot reach (`traceAll`); this is conservative.

### What should be done in the future

- If a generator version emits `a && f()` with an effect in `f`, lower it as a branch instead of refusing it.

### Code review instructions

- `scripts/translator/isa.js` (`KFUNCS`, `SECTION_API`, `KERNEL_SIDE_EFFECTS`), `emit.js` `IMPURE_K`, `lower.js` `binary` and `kcall`, `index.js` `hasEffects`; `scripts/09-order-test.mjs`.

### Technical details

- `node scripts/09-order-test.mjs $S/order`; `node scripts/10-effects-census.mjs $S/export various/10-effects-census.json`.

## Step 9: Inside CPU-KERNEL's kernel, per pixel

The bytecode now runs as a CPU-KERNEL `Sections` table. On the host, the kernel's own compiled sections and the interpreted bytecode render the same pixels: 20 presets, two arms, four frames each, every pixel's 48-byte output equal. The six cpu-arm frame digests are the ones the kernel ticket published.

### Prompt Context

**User prompt (verbatim):** see Step 8 ("Please add a per-pixel digest comparison against the kernel's host build").
**Assistant interpretation:** build the kernel instance with both section tables and compare complete per-pixel outputs. Cover the kernel ticket's scenes and presets it did not generate (SDF, heightfield, volume, mesh tangents, spectral).
**Inferred user intent:** the FIRST-LIGHT integration, tested on the host before it reaches the device.

### What I did

- `ck/cdl_vm_sections.cpp`: compiled inside the instance's namespace. It checks `Hit`/`cdl_hit` and `Lobe`/`cdl_lobe` with `static_assert` on size and every field's offset, fills `cdl_vm_kernel` from the nine `api::` functions (the rest `NULL`, with `gTime` and `gLam`), and exports `<ns>_sections_vm`, `<ns>_vm_load` (verify, check RGB/spectral against `CDL_SPECTRAL`, bind to the instance's uniform rows) and `<ns>_vm_rebind_uniforms`. It also exports `cdl_vm_k_floorf/sinf/cosf/expf`, the instance's own `floor`, `sin`, `cos` and `exp`.
- `ck/cdl_vm_ck_math.h`: `cdl_vm.c` compiled with `-include` points `CDL_VM_FLOORF`, `CDL_VM_SINF`, `CDL_VM_COSF` and `CDL_VM_EXPF` at those functions. The cpu arm's `CDL_FAST_FLOOR`, `CDL_FAST_TRIG` and `CDL_FAST_EXP` therefore apply to interpreted sections exactly as to compiled ones.
- `ck/driver.c` (from `06-driver.c`): both tables linked; with a bytecode argument it binds `<ns>_sections_vm`. It writes the same frame-0 digest and, per pixel, an FNV-1a digest of that pixel's `cdl_pixout` over all frames.
- `08-kernel-digest.py --ck <CPU-KERNEL scripts>`: presets the kernel ticket did not generate go through its own `03-gen-scene.mjs` into `WORK/gen` (80 x 80). Each instance uses that ticket's flags; spectral scenes get a `CDL_SPECTRAL=1` instance.

### Why

- The kernel's compiled sections are the reference FIRST-LIGHT will replace. Comparing complete pixel records tests the kernel functions, the layouts, the math hooks and the uniform binding together.

### What worked

- 40 of 40 comparisons pixel-identical over 4 frames: arms `lazy` and `cpu`, presets B-01, R-01, L-03, G-01, E-02 (160 x 160) and W-02, F-01, K-04, K-08, G-02, X-04, S-02 (spectral), X-03, R-04, R-05 (spectral), R-08, G-03, V-02, V-03, V-04 (80 x 80).
- Frame-0 digests in the cpu arm with bytecode: B-01 `df6d3f85`, R-01 `e8421c97`, L-03 `585a3f2f`, G-01 `211878db`, E-02 `de9e22b5`, W-02 `794c1a46`. These are the six in CPU-KERNEL's `various/05-host-frames-64spp.jsonl`.

### What didn't work

- The eager `wgsl` arm crashed both builds with SIGFPE in `cdl_wgsl::hdriTexel` (`gdb`: `#0 cdl_wgsl::hdriTexel(int, int)`). The kernel ticket's own `06-driver.c` crashed the same way. Evaluating `select` eagerly calls `hdriL` in a scene without an HDRI, and `x0 % W` with `W = 0` traps on x86-64. The kernel ticket's host frames use the `lazy`, `hash` and `cpu` arms. The test uses `lazy` (only `CDL_LAZY_SELECT`) for Candela's arithmetic.
- `static assertion failed: preset S-02 needs a kernel instance with CDL_SPECTRAL=1`: fixed by building a spectral instance per arm when a preset needs one.

### What I learned

- The kernel ticket's API wrappers (`api::fresnelDielectric` and so on) are plain functions, so the adapter needs no access to the kernel's internals.

### What was tricky to build

- The math hooks: four C functions with fixed names, defined once per binary. A firmware image with an RGB and a spectral instance under the same switches defines them in one instance and sets `CDL_VM_NO_MATH_EXPORTS` in the other.

### What warrants a second pair of eyes

- The adapter casts `const Hit &` to `const cdl_hit *`. The layouts are asserted equal, and the two are compiled in separate translation units, so no optimiser sees both types at once.

### What should be done in the future

- The RV32 counts inside this kernel (Step 10) and a board run for FIRST-LIGHT.

### Code review instructions

- `scripts/ck/cdl_vm_sections.cpp`, `scripts/ck/cdl_vm_ck_math.h`, `scripts/ck/driver.c`, `scripts/08-kernel-digest.py`.

### Technical details

- `python3 -I scripts/08-kernel-digest.py --ck $S/ck/.../scripts --spp 4 --jobs 6 $S/run $S/export $S/kd $S/kd-host.jsonl B-01 R-01 L-03 G-01 E-02 W-02 F-01 K-04 K-08 G-02 X-04 S-02 X-03 R-04 R-05 R-08 G-03 V-02 V-03 V-04`.
- Commit `b6d771a` (Steps 8 and 9 and the dispatch work of Step 10).

## Step 10: A faster dispatch loop, and the cost inside the firmware kernel

The interpreter now dispatches through a table of label addresses, and its dispatch loop contains no library call. The final counts cover two settings. In the prototype harness, interpretation adds 0.9-5.7% to path-traced presets and 17-130% to SDF presets. In CPU-KERNEL's kernel with its RV32 flags, the interpreter is 4.3-10.8 times slower than compiled code on section code alone. There, path-traced presets need 2.9-7.8% more instructions per sample and SDF presets 1.55-2.81 times as many. With contraction off, every RV32 frame digest of compiled and interpreted sections is equal.

### Prompt Context

**User prompt (verbatim):** see Step 1 (deliverable 5) and Step 8 (the coordinator's budget figures: "section code is 0.8–1.2% of instructions in B-01, R-01 and G-01. At a 7–20× interpreter slowdown that makes those scenes about 5–23% slower; SDF scenes are unmeasured").
**Assistant interpretation:** remove the interpreter's avoidable costs, then measure in the kernel FIRST-LIGHT will use, with SDF presets separately.
**Inferred user intent:** a cost FIRST-LIGHT can plan with, including the scenes where interpretation may not be acceptable.

### What I did

- `cdl_vm.c`:
  - Under GCC and Clang, handlers are labels (`OPC(name)`), each ending in its own `goto *dispatch_table[ip[0] & 255]`, with no bounds check. `-DCDL_VM_SWITCH` keeps the `switch`. `gen-isa.mjs` emits `CDL_VM_OPLIST(X)` for the table.
  - `H` is a macro that decodes the high byte only where a handler uses it.
  - `copy2/3/4`, `copy_lobe` (26 words) and `copy_hit` (23 words) are written out. `move_words` copies in the direction that keeps `memmove`'s meaning. `STOREF`/`STOREW` store 1-4 words without a loop. `LOBE` walks its mask with a shift loop instead of `__builtin_ctz`.
  - The vec3 macros are written per component; every source word is read before the first store.
- `lower.js`: the identity `x - (+0) = x`. 21 presets' blobs became 8-172 bytes smaller. Re-run agreement on those 21 presets at 1 spp: all bit-exact.
- `07-rv32-count.py --vm DIR` counts an earlier interpreter (a copy of the first version kept outside the repository) for the before-and-after comparison. `harness/rv32imfc-count.c` takes `-DCOUNT_MEM_MB`, and `08-kernel-digest.py --rv32 --rv32-nofma` builds the counter with 64 MB, because K-04's packed buffers are 18 MB.
- `11-cost-table.py` and `12-cost-figure.py` produce `various/11-cost-*.json/.txt` and `various/12-*.png`.
- Commands: `python3 -I scripts/07-rv32-count.py $S/lum/export160 $S/rv32-160-v1 ... B-01 R-01 F-01 W-02`; the same at 64 x 64 for B-01 F-01 W-02 E-02 G-02 R-05 R-08 S-02 X-04 and at 24 x 24 for V-02 V-03 V-04 X-03; `python3 -I scripts/08-kernel-digest.py --ck ... --arms cpu --spp 1 --jobs 3 --rv32 --rv32-nofma $S/run $S/export $S/kd2 $S/kd-rv32.jsonl B-01 R-01 L-03 G-01 E-02 W-02 F-01 K-04 G-02 X-04 S-02 R-04 V-04`; the host digest test again with the final code (`various/08-kernel-digests-host.jsonl`: 40 of 40 identical).

### Why

- B-01's first profile showed `memcpy` at 256 instructions per sample and `__ctzsi2` in the interpreted build only; the dispatch itself was 9 instructions plus the jump back.
- The prototype harness inlines compiled sections where GCC chooses, while the firmware kernel calls them through its table. Only the firmware kernel separates section cost from kernel cost cleanly, and only it is what FIRST-LIGHT will run.

### What worked

- Prototype harness, first to final interpreter (extra instructions per sample): B-01 7.1% to 4.3%, R-01 9.5% to 5.7%, F-01 9.1% to 5.3%, W-02 1.6% to 0.9%, E-02 45.4% to 29.7%, R-05 23.0% to 17.0%, R-08 15.6% to 11.4%, S-02 75.0% to 58.6%, G-02 77.3% to 56.9%, X-04 218.8% to 130.2%.
- Firmware kernel, cpu arm, default flags, compiled to interpreted (ratio; sections compiled to interpreted per sample): B-01 4,419.5 to 4,696.8 (1.063; 54.9 to 359.7), R-01 1.047, L-03 1.057, G-01 1.038, F-01 1.078, W-02 1.043, K-04 1.029, E-02 1.296, R-04 1.113, V-04 1.133, S-02 1.554, G-02 1.807, X-04 2.809 (3,938.3 to 32,042.3). Slowdown on section code 4.3 (G-02) to 10.8 (S-02). Section share of the compiled work: 0.57-1.97% for path-traced presets, 7.68% for E-02, 24.55% and 28.77% for G-02 and X-04.
- RV32 digests: equal for B-01, R-01, L-03, G-01, K-04 with the default flags; with `-ffp-contract=off`, equal for all 13 presets.
- A scalar `SUB` handler is 19 RV32 instructions (from the disassembly, through the dispatch table).

### What didn't work

- The first copy rewrite used `__attribute__((optimize("no-tree-loop-distribute-patterns")))` on a copy loop. GCC then refused to inline the function (12 calls to `copy_words` in `run`), because functions with different optimisation attributes are not inlined into each other. The copies are now written out.
- The generic vector result loops still became `memcpy` (34 call sites in `run`) until `STOREF`/`STOREW` replaced them.
- `copy_words` from the first rewrite was also too narrow for `HLD`, whose width the verifier allows up to 23; `HLD` keeps a general path for widths above 3.
- `cpu K-04 compiled: counter exit 2: segment outside memory`: the counter has 16 MB of guest memory and K-04's scene is 18,171,320 bytes.
- Counting the heightfield and volume presets in the prototype harness at 64 x 64 took over 30 minutes per run on a machine shared with other work (load average up to 48). I stopped those runs with a checked script (`stop_counts.py` in the scratch directory, which matches drivers and counters by command line). The volume presets were counted at 24 x 24; the heightfield presets have their numbers from the firmware kernel (R-04) and R-08.

### What I learned

- GCC's loop-distribution pass turns any copy loop into `memcpy`, and newlib's `memcpy` on this target costs more than the copies it replaces. Straight-line stores are the reliable form.
- The prototype kernel's volume presets cost 4.7 million instructions per sample (V-04) against 83,170 in the firmware kernel. Ratios measured in the prototype understate the interpreter's share there.

### What was tricky to build

- `goto *` with a table built from `CDL_VM_OPLIST` through designated initialisers, so the table is indexed by opcode number whatever the list order.

### What warrants a second pair of eyes

- `move_words` is still a loop and becomes one `memcpy` call in `run`; it serves only `MOVN` and wide `HLD`, which no hot path uses.

### What should be done in the future

- The prepared code form (pre-scaled byte offsets, handler addresses) if SDF scenes matter: it removes three of a scalar operation's 19 instructions and the opcode decode.

### Code review instructions

- `scripts/vm/cdl_vm.c` (`OPC`, `DISPATCH`, `copy_lobe`, `STOREF`, the vec3 macros, `LOBE`); `scripts/08-kernel-digest.py` (`rv_one`, `group`); `various/11-cost-kernel.txt`.

### Technical details

- RV32 flags in the kernel: `-march=rv32imafc_zicsr_zifencei -mabi=ilp32f -O2 -fno-math-errno -fwrapv -msmall-data-limit=0 -mno-relax -std=gnu++17 -ffunction-sections -fdata-sections`, linked with `--gc-sections`; `cdl_vm.c` as C99 with `-include ck/cdl_vm_ck_math.h`.

## Step 11: The vault report

The deep-dive report is in the vault as `Projects/2026/11/22/PROJECT REPORT - PicoCalc Candela - Scene Code as Verified Bytecode in the Fixed Kernel - A Technical Deep Dive.md`, with two figures in `_assets/` (`picocalc-candela-sections-kernel-cost.png`, `picocalc-candela-sections-interpreter-versions.png`).

### Prompt Context

**User prompt (verbatim):** see Step 1 (the vault-report requirement).
**Assistant interpretation:** a textbook-style technical report of the whole project, committed alone in the vault and pushed.
**Inferred user intent:** a durable account that a reader can use without the ticket.

### What I did

- Wrote the report following the sibling CPU-KERNEL report's structure (frontmatter, summary callout, why, status, shape, implementation details, docs, open questions, next steps, working rule, related notes).
- Generated the figures with `scripts/12-cost-figure.py` from `various/11-cost-*.json`. The two colours are the reference palette's first two categorical slots; `validate_palette.js` reported all checks passing for them.

### What worked

- Vault commit `861fda5` (the report and the two figures only), pushed to go-go-golems/go-go-parc `main` (`acdfcaf..861fda5`) on the first attempt; no rebase was needed.

### What didn't work

- Nothing recorded.

### What I learned

- Nothing new.

### What was tricky to build

- Keeping the report's numbers identical to the evidence files; every table was copied from `various/11-cost-kernel.txt` and `various/03-agreement-s4.jsonl` summaries.

### What warrants a second pair of eyes

- The device translation time (0.2-3.4 s) is an estimate from host QuickJS time and P4's measured QuickJS ratio, not a device measurement.

### What should be done in the future

- FIRST-LIGHT's board run.

### Code review instructions

- The report in the vault; `scripts/12-cost-figure.py`.

### Technical details

- Figures: `various/12-kernel-cost.png`, `various/12-interpreter-versions.png` (copied to the vault's `_assets/`).
