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
