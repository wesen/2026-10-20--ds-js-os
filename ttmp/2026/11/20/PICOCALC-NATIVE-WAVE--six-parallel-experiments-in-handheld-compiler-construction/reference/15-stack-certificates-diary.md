---
Title: Stack certificates investigation diary
Ticket: PICOCALC-NATIVE-WAVE
DocType: reference
Status: complete
Topics: [picocalc, compiler]
---

# Stack certificates investigation diary

## Step 1. Commission an independent design

The director delegated this experiment in the six-study native compiler wave. The authored request belongs in [the director diary](01-director-investigation-diary.md). Emit per-function frame claims and call targets while compiling. Check them independently from RV32 bytes after final linking, compare checked call depth to the per-function claims, and explicitly account for SDK and interrupt boundaries. Use ordinary test fixtures and altered metadata to qualify the checker. Freeze policy before the independent holdout.

I started a separate Anthropic Claude CLI with `-p --model opus --effort high --tools '' --setting-sources '' --output-format json`. Each lead received its own scoped code and question. Neither was given hardware credentials, serial logs or the independent holdout. The working tree for implementation is confined to this ticket. The release compiler remains the ordinary reference through the real application entry point.

The first source inspection identified the emitted-program functions and the ELF slot linker in `picocalc-os/compiler/typed-rv32.js`. The current frontend may lower async Editor tasks before streaming ordinary and generated bodies through different lexers. The release application inputs are the exact CMake products used in the preceding release study. I will preserve a hash for each and rerun fresh control measurements.

### Prompt context

**User prompt (verbatim).** “do it, as before.
  Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
  Chose opus high for researchers
  Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
  analogies, see skill).
   Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.”

**Assistant interpretation.** Design a falsifiable certificate experiment.

**Inferred user intent.** Measure how much of a real native call stack the compiler-produced evidence and an independent decoder can justify.

**Code checkpoint.** `c07464e`.

### What I did

Commissioned a separate restricted Opus High session with the release RV32 FunctionCode lowerer and the actual slot linker.

### Why

Frame arithmetic is available during compilation, but that is insufficient without comparing it to emitted instruction bytes and real call targets.

### What worked

The design separately specifies frame checks, CFG invariants, external SDK conditions and a strict allowlist and cost gate.

### What didn’t work

No commissioning failure. The design targeted 60 independent sources and 200 independent mutants, beyond the available director fixture.

### What I learned

A result for the typed part of a call chain is distinct from a complete task stack including C SDK, interrupts and callbacks.

### What was tricky to build

The input structure for closed raw code is not the same as the final SDK-linked ELF; both require precise address origins.

### What warrants a second pair of eyes

Review the proof’s ABI, external and memory non-aliasing assumptions before interpreting an abstract byte count as capacity.

### What should be done in the future

An actual task-space claim would require SDK prefix budgets and OS stack accounting.

### Code review instructions

Start with design-doc/05-stack-use-certificates.md and scripts/05-stack/01-design-prompt.txt.

### Technical details

The actual model was claude-opus-5-5, high effort, with an empty tool list. The design was archived before code was written.

## Step 2. Independently decode the linked RV32 image

The lead's preregistration describes a per-function frame, a saved return-address slot and direct call records. I instrumented the emitter's computed local frame and symbolic call records before relocation. The second module reads final emitted or linked bytes using an independent decoder. It verifies the partition against the trusted symbol table, positive aligned local frames, exact save/restore, all direct jumps and calls, local stack slots and the arithmetic instruction subset. It prohibits entering the middle of the epilogue and confines conditional arcs to the active-frame body or the beginning of its epilogue. For this single-frame grammar every live path at each body instruction has the same stack displacement. No abstract-interpretation fixed point is necessary.

The final ELF checker verifies the public entry stubs, import trampolines and executable extent. It separately carries, for each SDK import, the maximum prefix already occupied by typed frames at the call. It does not claim a measured C stack bound, asynchronous callback bound or ISR bound. The standalone structural path also checks the final internally relocated instruction buffer with no SDK.

The first attempt to locate the compiler was one parent directory too high. `realpath ../../../../../../../../picocalc-os/compiler` returned “No such file or directory”. I corrected the path and ran `node 05-trial.mjs /tmp/native-wave-deps ../../various/05-stack/host.json`. Both applications returned the identical stock ELF; all 119 Editor functions and 82 Chess functions were covered. Fourteen deliberately wrong metadata or unsupported instruction cases were rejected. Independent arithmetic/branch/call emulation using the prior RV32 interpreter checked 24 execution depths across twelve branchy chains. Deepest observed was 192 bytes, and branches that skipped calls used only 16. The design specified a considerably larger independently authored held-out population. The separate director fixture will be reported at its observed size with that limitation.

I sent the director separate pre-holdout hashes of the policy, emitter and checker. No comparison of submitted source against its own generated metadata was used as a substitute for reading the final bytes.

### Prompt context

**User prompt (verbatim).** See Step 1 for the verbatim user request.

**Assistant interpretation.** Independently derive frames and call edges from actual bytes.

**Inferred user intent.** Confirm which parts of the certificate are checked and which remain ABI assumptions.

**Code checkpoint.** `c07464e`.

### What I did

Staged capture of codegen frame/call claims and wrote a distinct RV32 parser with a restricted fixed-frame grammar and call-DAG recurrence.

### Why

Checking final relocated jal words catches stale targets and supplied metadata errors which a comparison against frontend IR would miss.

### What worked

All 201 release application functions were accepted and stock image bytes matched. Fourteen planted metadata or unsupported-word controls failed as expected.

### What didn’t work

The first relative compiler path resolved outside the repository. realpath returned “No such file or directory”; the corrected parent count loaded the source successfully.

### What I learned

In this backend no interior instruction needs to change SP. Syntactic invariance establishes equal body stack displacement across branch joins.

### What was tricky to build

Import call sites target SDK trampolines, while typed internal calls target the symbol table and local jumps target offsets within the same frame.

### What warrants a second pair of eyes

The trusted symbol/import names and nonstack aliasing precondition are not independent consequences of instruction decoding.

### What should be done in the future

Check a future register allocator or tail-call lowering under a new specification; both can invalidate the fixed-frame grammar.

### Code review instructions

Run 05-trial.mjs and 06-depth.mjs, then inspect 03-emit.mjs and 04-check.mjs independently.

### Technical details

The actual six serialized claim fields are name, start, size, frame, raSlot and calls. Frame sizes are multiples of 16, at most 2,032 bytes.

## Step 3. Score the director fixture and test the lead's objections

The committed implementation c07464e was unchanged when the director released their ten-function program. The first attempt passed all 1,603 return/memory/trap oracle cases and retained the director's exact ordered digest. I added a single independent observer at the existing interpreter's loop header, after the preceding instruction had updated the simulated SP. Across 158,570 executed instructions and 101 expected traps, the five invoked entry points had maximum observed depths 16, 32, 32, 48 and 64 bytes. Each was equal to its certificate, and the interpreter covers both branches and trapped exits. This is a full comparison on the supplied inputs, not a general proof of tightness. Five helper functions were not separately called as roots.

The second Opus High call resumed the design writer's session for a substantive critique. It highlighted a formal discrepancy between the preregistered opcode names and the implementation's somewhat broader whitelist. I substituted a well-defined logical shift and signed comparison branch into an ordinary synthetic arithmetic function. The frozen checker accepted both; the design explicitly required Unsupported. No recorded depth underflow occurred, but this is a true failure under the policy as written, recorded in `various/05-stack/policy-audit.json`. The side table exposes only the claim fields it actually emits. Other proposed fields were not emitted, so the article neither claims nor evaluates locals or trap-list verification. I checked all twelve dynamic relocation targets for each actual release ELF and found each outside the reserved typed slot; runtime permissions and OS context still remain external assumptions.

The other material negative result was cost. Editor used 33,050 JSON bytes for 119 functions and 430 direct call sites against an allowance of 11,056 bytes. Chess used 21,267 for 82 functions and 284 sites against 7,520. Shared-host timing was variable, so I preserved the first 7-block wall timing run and repeated the same measurement pinned to CPU 6. The verifier still reads every decoded instruction, and both actual linked images were stock-identical in both runs. The aggregate claims are reported as two observations with separate clocks and workloads. Neither proves hardware checker time. The use of the smaller held-out set and the implementation-order distinction from the preregistration are recorded in the design coverage note.

### Prompt context

**User prompt (verbatim).** See Step 1 for the verbatim user request.

**Assistant interpretation.** Challenge the locked candidate with the blind source and the lead’s critique.

**Inferred user intent.** Distinguish a bounded observed path from a sound instruction policy and from complete task-stack admission.

**Code checkpoint.** `153bae9`.

### What I did

Ran the director’s 1,603 audited cases, checked dynamic relocation destinations for both release reactors and tested two formally out-of-list opcodes.

### Why

Ordinary functions exercise positive evidence. Rejection of semantics outside the written allowlist is separately required by the preregistered hard gate.

### What worked

Observed maxima equal certified depths for all five invoked roots. All twelve dynamic relocations in each target ELF are outside the reserved slot.

### What didn’t work

Two benign RV32 operations absent from the original allowlist were accepted. JSON encodings were approximately 3× the prescribed budgets. The hard gate failed.

### What I learned

A whitelist can preserve SP invariance while still being broader than the written acceptance policy. Those are distinct outcomes.

### What was tricky to build

The interpreter observes minimum SP during nested calls per invoked root. Five helpers executed as callees or were uncalled; neither case supplies a separate root timing.

### What warrants a second pair of eyes

Review the extended branch/shift set, unchecked OS stack use and the limited number of independent held-out programs.

### What should be done in the future

A newly preregistered implementation could tighten the instruction set and try a smaller encoding, with a fresh independent evaluation population.

### Code review instructions

Run 07-holdout.mjs, 09-loader-audit.py and 10-policy-audit.mjs. Compare the stored source hashes and ordered behavioral digest.

### Technical details

The closed blind program has ten functions, 101 expected traps and 158,570 modeled RV32 steps. No device execution time was measured for certificate checking.

## Step 4. Publish the lead’s conditional proof and measured rejection

The original Opus High session authored the final article after receiving the locked checker, its own critique, the loader relocation audit, the timed and pinned host runs, the policy-control results and independent oracle totals. The operator reviewed every numerical table against the raw receipts. I corrected three teaching details: RV32 can support compressed instructions outside this backend, a caller can spill still-live register values around a call, and readBurst contains several 16-byte-helper call sites rather than one. I also distinguished the independent Wasm and RV32 compilations and replaced an unsupported claim about all loaders with the observed ELF relocation extent.

The final release article has a worked 48+16-byte chain, a conditional proof over fixed frames and an explicit table of hard-gate outcomes. It records all unexecuted items, the authorship receipt and both exact image identities. No physical timing of certificate generation or validation was collected. The original draft, critique and local checks are preserved in the study directory. The file is ready for the director’s publication workflow.

### Prompt context

**User prompt (verbatim).** See Step 1 for the verbatim user request.

**Assistant interpretation.** Publish the substantive result under its original evidence gates.

**Inferred user intent.** Provide the full conditional proof, make negative results legible to newcomers and preserve actual lead authorship.

**Code checkpoint.** `e8bef37`.

### What I did

Resumed the lead’s original Claude session for the final article, archived its permitted public output, and checked every table and local link.

### Why

The proof needs to declare the memory/isolation model before using it, and the article must not silently equate a byte count with an entire task budget.

### What worked

The final article includes the worked 48+16-byte example, recurrence, two host timing cohorts, measured verdicts and the original stop disposition.

### What didn’t work

The lead draft called all RV32 instructions four bytes and described one readBurst call site. The operator corrected both from the frozen source and machine model.

### What I learned

The complete proof and the failed policy gate can both be true: the two accepted extra opcodes preserve SP, but their acceptance violates the preregistered contract.

### What was tricky to build

Numerical end-to-end runtimes differ between host sessions; the receiver must know both used seven observed pairs after one warm-up and a shared host.

### What warrants a second pair of eyes

The compulsory performance cost for a production P4 verifier and the source of whole-task frames remain outside this study.

### What should be done in the future

Revisit any deployment after independently covering an amended policy and obtaining non-typed call-stack bounds.

### Code review instructions

Review analysis/05-stack-use-certificates.md with the raw draft, pinned/shared timing JSON and gate audit. The final commit is e8bef37.

### Technical details

The lead used the same external model session for design, critique and report; its three permitted public outputs and individual provenance records are preserved.
