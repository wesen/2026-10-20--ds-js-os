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
RelatedFiles: []
ExternalSources: []
Summary: "Chronological record of building the section translator, bytecode v1, the C verifier and interpreter, and the host agreement and cost measurements"
LastUpdated: 2026-11-22T01:10:00-05:00
WhatFor: "Resume or review PICOCALC-CANDELA-SECTIONS; each step records commands, evidence, failures and decisions"
WhenToUse: "Read the latest step before continuing; earlier steps hold the evidence behind the format and the measurements"
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
