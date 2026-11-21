---
Title: Dependency reuse investigation diary
Ticket: PICOCALC-NATIVE-WAVE
DocType: reference
Status: active
Topics: [picocalc, compiler]
---

# Dependency reuse investigation diary

## Step 1. Commission an independent design

The director delegated this experiment in the six-study native compiler wave. The authored request belongs in [the director diary](01-director-investigation-diary.md). Measure stock, the earlier global-descriptor cache, and an exact-body cache with observed semantic dependencies. Test the current released Editor and Chess across body, signature and record-layout edits. Preserve symbolic call information and replay graph edges after a hit. Compare complete ELF bytes and clean diagnostics. Freeze policy before the director supplies an independent holdout.

I started a separate Anthropic Claude CLI with `-p --model opus --effort high --tools '' --setting-sources '' --output-format json`. Each lead received its own scoped code and question. Neither was given hardware credentials, serial logs or the independent holdout. The working tree for implementation is confined to this ticket. The release compiler remains the ordinary reference through the real application entry point.

The first source inspection identified the emitted-program functions and the ELF slot linker in `picocalc-os/compiler/typed-rv32.js`. The current frontend may lower async Editor tasks before streaming ordinary and generated bodies through different lexers. The release application inputs are the exact CMake products used in the preceding release study. I will preserve a hash for each and rerun fresh control measurements.

## Step 2. Freeze read-set validation and qualify the training set

The commissioned lead proposed observing the compiler's semantic lookups and replacing index-based cached relocations. I implemented the recording at the shared emitter interface used by both original and async-generated bodies. A missing call, record, enum or distinct name is a dependency when its absence chooses a typing path. An enum used for an exhaustive match records the complete member table. A field records its exact type and byte position. Distinct integer literals use an internal JavaScript Symbol, which cannot be the name of a declaration. The checker preserves nominal membership for every ordinary identifier spelling.

I replaced global ordinals with symbol names for callee relocations and graph edges. A reference also records whether a name denotes an import or an internal function, since only the latter contributes an edge. A per-realm identity refuses reuse with a foreign compiler instance. The release backend has no independent literal pool; a different backend requires a fresh root. Malformed input leaves the existing root intact.

I staged exact shipped inputs with `python3 04-stage.py /tmp/native-wave-deps /tmp/mobile-painter-chess3d/build/esp-idf/main`, then ran `node 05-host.mjs /tmp/native-wave-deps ../../various/04-deps/host.json`. Seven rotated host comparisons per valid edit agreed in complete image and async metadata. In Editor the signature edit rebuilt four functions and the layout edit ten; in Chess the corresponding counts were ten and six. The old global cache rebuilt all 119 or 82. Nine independent development changes exercised field deletion/insertion/order, call signature, definition order, an invalid parameter name and a cycle. The director was sent policy and candidate hashes before release of their sealed fixture.

The design proposes 30 timing samples and bootstrap confidence gates. The physical window is shared between studies. Its bounded trial will explicitly identify the sample count and omit preregistered confidence claims if it does not reach that target. No selective pointer persistence or file format is implemented.

## Step 3. Open the independent holdout and audit clean fragment shape

The director supplied the sealed ten-function telemetry source after the implementation freeze in c07464e. The first attempt, `node 06-holdout.mjs /tmp/native-wave-deps /tmp/native-wave-heldout ../../various/04-deps/held-out.json`, passed unchanged. Four independent valid edits rebuilt one function each. A changed signature without repaired callers produced the exact stock diagnostic after seven earlier hits. Replaying the untouched baseline after rejection hit all ten functions. The source lengthening a literal increased the local instruction sequence. The release frontend's `bufferLiteral` loop emits an immediate narrowed to UTF-16 and a store per code unit; no data pool or inter-function literal references exist in this backend. This resolves a mistaken inference from image growth alone in the lead's received critique.

The independent clean comparison now captures every prepatch word plus symbolic local, function and import relocation before stock layout. For all six primary app/edit cells, the precise candidate retained exactly the compiler-determined unchanged set. This was a retrospective oracle, computed after implementation lock. The complete public-program metadata and static relocation table also matched clean builds through a reverse edit, both release apps, all accepted heldout edits and the invalid states. The `15-full-program` script reconstructs the entire output each time. Six separately disabled subsystems in private in-memory copies each caused the clean oracle to detect a difference. Additional controls verified unchanged imports after symbol permutation, import→function promotion, awaitability, distinct type→enum, shadows, newly nonexhaustive match, and an extra async suspension. A first handwritten development source used `case T.A` instead of Typed's `A:` and produced “unknown case case in T”. A second over-specified the return type of typedSdkYield and the clean compiler reported “expected i32, got bool”. Both fixture spellings were corrected and no candidate logic was changed.

The substantive Opus High critique ran in the original design session. Its snapshot included only one representative host row per cell. Its concerns led me to supply complete seven-block evidence, the independent fragment-shape oracle, the six sensitivity controls and direct compiler source showing immediate literal lowering. Some proposed gates, including a data-pool case, changing the base type of `distinct i32`, an embedding layout whose size shifts outer fields, and an independent jump-overflow study, are inapplicable to this frontend or unmeasured. The final editorial record distinguishes them.

## Step 4. Build and preflight the physical treatment

The benchmark uses three separate bundled code trees, ordinary JS roots retained in RAM, release QuickJS plus its native token index and a PSRAM allocator. It performs five interleaved measurements per arm, and checks each complete linked board image bytewise against a fresh stock board image and by CRC against host gold. The isolated image does not mount or modify flash storage. Fresh paired first builds measure clean and precise; warmed measurements also include the complete earlier global comparator. The default release entry supplies the artifact and does not execute the edited program.

The physical shell is reused from the last study. The first host-only preflight, pointing at the source-stage directory for the recovery image, correctly raised `AssertionError` on the known ordinary application hash before touching serial. With `/tmp/chess-camera-release/build` for the release image and partition, the preflight passed for candidate b3ad52ac6eae03f82a6e20e575d00818d37fcb1e7990e396b73d6d775cc3714f. I independently located all four exact input byte strings inside the canonical firmware; their offsets/digests live in `various/04-deps/release-inputs.json`. I also corrected the analogous recovery example in the earlier report in commit 3f1c42a and informed its publisher. Current shell remained off serial awaiting the designated operator's explicit handoff.

## Step 5. Resolve the lead’s timing and literal critiques before the board window

I measured an additional 30 rotated host blocks per treatment and split RV32 compile and ELF-link clocks without changing the frozen candidate. A seeded 10,000-resample paired bootstrap of the within-run median precise-minus-global time placed all four signature and layout difference intervals below zero. The median paired ratio on Chess local edits was 1.143, beyond the lead’s 1.10 allowance. The winning structural cells do not erase that adverse local result. This interval describes this single host run; the separate physical experiment has five blocks, and its confidence gate is deliberately unfilled.

The host executed the exact C-embedded device JavaScript payloads after staging. All 90 planned results passed their clean byte/CRC oracle on the host. Another control moved a literal in a non-final function ahead of retained helpers, verifying that final relative calls are rebound. Nested records were tested as one-word handles: appending a field to an inner record preserved an outer field’s offset. These observations distinguish the shipped word-layout rules from hypothetical inlined records or pooled constants. The optional data-pool compiler in the earlier release study is a different backend with no shared cache identity.
