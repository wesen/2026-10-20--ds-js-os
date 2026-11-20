---
Title: Director investigation and reading diary
Ticket: PICOCALC-PSIX-STAGING
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T12:07:12.924036228-05:00
WhatFor: ""
WhenToUse: ""
---

# Director investigation and reading diary

## Step 1: Specify the binding times and controls

I commissioned independent studies before running hardware. We will generate an encoder from a data structure's declaration, compare this with learning structure from observations, and ask whether both can reproduce the existing wire bytes. The device comparison also includes an ordinary C interpreter of precomputed layout tables. This control can win without requiring a compiler on the device.

### Prompt Context

**User prompt (verbatim):**

> here's a crazy idea to send off to research:
>
> - since we can load the compiler, can we reuse parts of it to create an optimized native PSIX encoder _per_ datastructure, by kind of creating an AST based on the data structure (at runtime, or at compile time as a kind of macro step maybe?) so that we don't need to do tree parsing and handle generic strutures, but can really just blit straight out.
>
> Use the same structure, research things, Like you can maybe even look at ~/Downloads/Macros Without Parentheses.md for some ideas too.

**Assistant interpretation:** Test specialization of the producer. The existing lab workflow includes independent design, runnable experiments, diaries, intern guides, primary-source reading, published technical reports and reMarkable delivery.

**Inferred user intent:** Determine whether the actual existing handheld compiler can spend some setup time to remove the cost of generic encoding and under what workloads that expense pays.

### What I did

I opened the local macro tutorial, the preceding PSIX wire guide, the native encoder, the typed stream frontend and the RV32 slot linker. I dispatched two Sol implementation researchers and an independent Astra reviewer. I also dispatched a tool-free Opus High commission with only the abstract protocol in scripts/01-opus-design-brief.txt. The private reading stayed local. The physical port was visible as /dev/ttyACM0 on the host.

### Why

Seeing one object at runtime does not tell an encoder which fields are guaranteed to stay fixed on the next call. The previously measured PSIX encoder traverses a resident object and builds an index. Binding the schema once and directly consuming the Chess state tests a larger change than improving the tree walk. The C layout control asks whether generating machine code earns an additional benefit.

### What worked

The original wire validator and semantic Chess recordings remain available. The independently generated typed emitter compiled to an import-free RV32 image and a Wasm module. Our actual board runner can use the production typed compiler and ELF loader. The physical test reads only bundled source and requires an exact golden module comparison before calling it.

### What didn't work

The sandboxed board build through scripts/09-build-board.sh stopped at “ERROR: Cannot establish a connection to the component registry” for elf_loader.json. The authorized ESP-IDF build resolved the dependency. Checking device nodes inside the sandbox also initially hid the board; the same read on the host confirmed the USB serial identity.

### What I learned

The typed project represents buffer lengths in 16-bit cells; the native wire uses 8-bit bytes. I asked the compiler researcher to pack two bytes per cell and retain the original last byte of an odd output word. The input array and destination must be nonoverlapping. In the local macro tutorial, expansion sees syntax while the serializer later sees values. A source transform placed after binding can generate numeric local identities and preserve single evaluation of dynamic inputs. Compiler macros over arbitrary infix grammar have additional costs that this experiment can avoid.

### What was tricky to build

Exact wire comparison depends on every key ID as well as every string and number. A numeric value can cross the immediate-integer threshold. A changing string can reorder otherwise constant keys. The independent reviewer built a well-formed packet that decodes to a different object if the old indices are copied. Fixture strings and data participate only in verification; the specialization gets the declaration and allowed value domains.

### What warrants a second pair of eyes

The generic native comparison starts with an already-built cJSON tree. The direct and interpreted writers start from the same 90-cell semantic Chess input. Document this difference and charge code acquisition, generation and firmware costs separately. Physical generator-plus-compiler measurements require the production loader to call the newly compiled image, beyond byte equivalence on a host.

### What should be done in the future

Run the board comparison, the held-out observed-shape replay, and the independent canonical counterexamples. Synthesize after receiving the independent controls.

### Code review instructions

Read the previous generic encoder and wire guide, then scripts/static/01-specialize.js, scripts/board/fixtures.mjs and scripts/board/descriptor.h. The board runner restores and verifies the playable image after each physical window.

### Technical details

The developer edition of the macro notes was read locally from Downloads/Macros Without Parentheses.md. I focused on sections 1.1, 2.1–2.3, 7.1–7.4 and 8.4. Jones, Gomard and Sestoft supply the binding-time vocabulary. The independent researchers document the papers and their scope in their own reports.

## Step 2: Execute the schema compiler and three competing writers on the physical machine

The PicoCalc expanded the declaration into typed source, loaded its normal compiler and linked the resulting RV32 into a test ELF. The board verified every byte against the independent host module, obtained the relocated function pointer and called it on all 47 Chess inputs. The smaller C layout-table interpreter won the timing comparison.

### Prompt Context

See Step 1. The question was whether the machine could generate and use a writer for its own data structures and when it should.

### What I did

I implemented a separate table interpreter, the fixed ELF entry and slot, an independent fixture generator and a single-owner serial runner. I matched all 47 packets, 47 short destinations and six numeric-width boundaries on the host, then ran seven balanced physical blocks. Each block reinstalled the writer and ran three variants over the same 47 screens, four encodes per state. The same board window replayed two additional QuickJS corpora with four observed-shape policies. Separate protocol calls compared every byte on that device. esptool verified the original image and partition after restoration.

### Why

A generated native function could beat a generic encoder just because its schema is known. A table interpreter tests whether native program generation adds value beyond knowing the schema. The table and generated arms start with the same 90 cells and fill clean output storage. The generic arm starts from the matching resident tree. Reinitialization, wire comparison and deallocation of the generic output are outside the encode clock for all the reported producer comparisons.

### What worked

All 3,948 timed native encodes matched the expected packets. Seven cold installs produced the same ELF. The 42 observed-shape receipts include independent byte comparison and five rotated timing blocks. The firmware returned to its original digest and all five measured worlds were healthy. The initial compiler researcher and independent reviewer separately compiled the same typed code, and their host tests exercised 121 input cases.

### What didn't work

Compiling a writer at runtime did not beat the C layout-table control. The first physical matrix measured medians of 101.28 µs generic, 78.24 µs generated native and 24.71 µs for the table. Paying the 603.79 ms upfront cost out of a roughly 23 µs per-call saving takes more than 26,000 calls. An online observed-shape learner also lost on both short P4 suffixes. The results motivated a literal copy-and-patch follow-up before recommending any production change.

### What I learned

There are distinct costs for schema generation, compiling typed code and encoding a new packet. Most setup time was spent in the compiler. Native machine code emitted by our backend and ordinary C compiled for this board differ in code placement, optimizer and available bulk memory operations. The results test practical alternatives and do not isolate the intrinsic cost of interpreter dispatch.

### What was tricky to build

The native linker needs the firmware's exact ilp32f flags and one valid executable entry. The wrapper exports the address of the verified generated function once. A one-byte-short destination can end in the middle of a 16-bit cell. We filled the buffer with a sentinel, verified the full packet against independent bytes and checked that the first unused byte stayed untouched.

### What warrants a second pair of eyes

The corpus is semantic Chess, before canvas expansion, and all observed trace inputs produced 313-byte packets. Separate threshold tests exercise variable indirect numbers. A field-reference layout can be correct for the captured values while failing a legal new value. The generic input representation, destination ownership and differing code toolchains matter when interpreting the speed ratios.

### What should be done in the future

Test a bounded runtime template copied and patched after validating the ranks and widths that keep its directory valid. Compare it to the same native table and preserve class misses and output tails in the control.

### Code review instructions

Run scripts/board/prepare.py in an unused directory, inspect scripts/board/staging_trial.c and the read-back checks in scripts/board/run.py. See various/physical.json for block orders, counts, image identities, health and completeness. Code contributions include the compiler study in 4d48e84 and the independent derivation in 11552fa.

### Technical details

The installed ELF is 33,964 bytes including its experimental reserved slot, and the generated RV32 instructions occupy 16,116 bytes. Medians over seven blocks total 603.790 ms, including separate compilation near 537.75 ms. The setup benchmark starts before releasing a previous test installation when one exists, reads and verifies a bundled independent reference, then obtains a callable function. The compiler API's peak JS allocation is separate from the whole-device high water mark.

## Step 3: Distinguish native code placement, ahead-of-time installation, and guarded byte copying

I ran a second board window with the full recorded game in its original order. The follow-up also uses a real Chess position whose legal selections force three packet layouts. It supplies a reproducible case where copying helps and a second case where caching costs more than reconstructing from the descriptor.

### Prompt Context

See the request quoted in Step 1. “Blit straight out” suggested testing reusable wire bytes as well as generating a function. The independent reviewers asked whether the fast C implementation merely benefited from firmware code placement.

### What I did

I packaged the C descriptor writer into a separate GCC ELF and loaded it using the stock ESP loader. I added commands for obtaining a callable pointer from a prebuilt copy of the generated typed ELF and from the smaller C ELF. The static researcher provided a two-entry guarded cache, adversarial width tests and a captured legal rook selection sequence. I incorporated those inputs and rotated five candidates through ten blocks with a fresh cache per stream. I compared every output to the reference bytes and checked the byte immediately after every caller-owned result.

### Why

The first trial repeated each screen four times and the compact table ran as firmware. Application use changes the input from frame to frame. A matched chronological comparison and identical descriptor source in a callable external module narrow two uncertainties. A legal three-layout cycle separates a low-cost hit from the cost of repeated failed specialization.

### What worked

All 3,230 timed outputs in this second window passed byte comparison. On the 47-state replay the two-entry writer took 29.79 µs per call with 40 hits. The directly linked table took 35.67 µs, the relocated table took 33.67 µs, generated RV32 took 86.84 µs and generic native took 103.98 µs. The full typed ELF loaded in 3.480 ms and the small table ELF loaded in 0.870 ms. After the run, the ROM tool verified the playable application and partition table. The compositor, System, Editor, Snake and Chess all answered with clear error fields.

### What didn't work

The first attempt at the separate ELF failed to link. ESP GCC attempted to import an integer-to-double conversion from its non-PIC libgcc archive. The linker reported `relocation R_RISCV_HI20 against __clz_tab can not be used when making a shared object`. I emitted the exact two binary64 words for a wide signed i32 with integer operations in both builds of the table writer. The test exercises only the indirect numeric branch for that helper. The regular trace contained inline values. I reran the standalone C boundary witnesses, and readelf showed only the three expected C library functions as unresolved imports in the final 3,340-byte module.

### What I learned

An 85% hit rate improved the cache median over the firmware table by 16.5% on the 47-frame trace. In two of the ten paired blocks the table won. A 0% hit rate made the cache 42.7% slower and lost every block. Code placement alone cannot explain a 2.58-fold ratio between the generated and relocated table arm. A guard proven for fixed-width disjoint strings still has to account for lexical order, not simply lengths.

### What was tricky to build

The tiny ELF must use the same buffer ABI and descriptor as the firmware arm. The cached writer uses two persistent slots and constructs a miss in bounded scratch. During a replacement it cannot retain an earlier game state's string or score in supposedly immutable template bytes. The host harness exercised overlapping input and output for the cache and compared untouched buffers on refusal. Inspection of the flash/readback receipts is logically separate from validating encoded frames.

### What warrants a second pair of eyes

The two physical experiments have different ordering and firmware. Percentages compare arms inside the same experiment. Upload results distinguish source-to-callable compilation from merely loading an existing ELF. The cache figure is its struct size. The current control leaves the creation of the source array or tree and all compositor work outside the timer.

### What should be done in the future

Prototype the same descriptor over an application writer at an ordinary publication entry point, and lower a coarser packed store operation through the typed backend. Reuse the table-from-ELF control and the churn counterexample. Qualify latency to the first frame, input gathering, and real rendering separately.

### Code review instructions

Review scripts/board/descriptor.h, patch.h, staging_trial.c and run.py alongside scripts/04-results.py. Use the four independent writers and the flat-record derivation before reviewing a timing percentage. scripts/board/patch-fixtures.mjs labels both the actual chronological events and the sampled cyclic control.

### Technical details

`python3 scripts/board/prepare.py /tmp/pico-psix-staging/board` generated the fixtures and signed-off host ELF reference in the isolated source tree. I invoked the shared ESP-IDF 5.4.2 builder, then `python3 scripts/board/run.py /tmp/pico-psix-staging/board/build /tmp/pico-psix-staging/physical-02 --followup`. The archived various/physical-followup.json has 120 trial rows, before/during/after world health and verified restoration. scripts/04-results.py checks both receipts and each expected cache tally, aggregates paired and unpaired statistics and produces the chart.
