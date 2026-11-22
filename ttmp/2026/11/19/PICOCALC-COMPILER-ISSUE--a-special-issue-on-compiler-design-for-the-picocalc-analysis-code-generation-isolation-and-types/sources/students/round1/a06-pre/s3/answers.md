# Answers — "6. When to Compile: Caches, Load-Time Generation and Tiers"

## 1. Compiler source changed, application source unchanged — reuse the cache?

No. A cache keyed honestly has to include the identity of the typed compiler itself (its version or,
better, a hash of the generated artifact of the compiler) as one of the inputs, alongside the module's
own source hash, the interfaces/signatures of everything it imports, and the target architecture and
code-generation flags. If any single input changes the cached result is no longer the result of that
pipeline, so the compiler change alone invalidates every entry even though the application source
bytes are identical. The important subtlety is that the invalidation is all-or-nothing at the level of
"compiler identity", and the cheap safe move is to treat a compiler rebuild as a cache epoch bump.
Confidence: 4

## 2. Why is the record written after the module, and what remains after a power loss between writes?

The module payload and its cache record form a two-phase commit: the record is the claim "the bytes
this record points at are complete and were produced from these inputs", so it must never exist before
the thing it certifies. Writing the record last means a power loss between the two writes leaves an
orphan module body with no record; on the next boot the lookup finds no record, calls it a miss, and
recompiles, and the stale body is garbage collected or overwritten. The design also needs the record
(or the body) to carry a length and a checksum so that a torn final write of the body cannot be
mistaken for a good one even if the record somehow landed. The failure mode is therefore "lost work,
never wrong code". Confidence: 4

## 3. Turns needed to repay native compilation, and the effect of caching

I cannot know this without the article: I have no access to the figures in section 6.5, so any number I
give is invented. The arithmetic the answer must have the shape of is: repayment turns = (cost of
producing native code for the hot function − cost of producing/loading the interpreted or bytecode
form) divided by (per-turn cost when interpreting − per-turn cost when running native), and if the
article's figures give, say, a compile time measured in milliseconds and a per-turn saving measured in
microseconds, the quotient is in the thousands of turns. Caching changes the conclusion because the
compile cost is then paid once per (source, compiler, target) triple rather than once per run, so it
amortizes over the whole lifetime of the cached artifact — across sessions, not just within one — and
the break-even turn count effectively becomes a break-even *total* turn count over many launches.
Confidence: 2

## 4. Franz and Kistler's slim binaries: why worthwhile, and the handheld analogue

Their argument was that the thing being optimized was not load latency but representation size and
portability: slim binaries were compact enough to ship and store cheaply, and architecture-neutral
enough to be turned into code for whatever machine they landed on, so a roughly 2× slower load was an
acceptable price for a much smaller footprint and freedom from per-architecture distribution. The form
playing the slim binary's role on the handheld is the compact, machine-independent intermediate
representation the typed compiler produces — the bytecode or serialized typed IR that the cache stores
and that load-time generation turns into native code. That is exactly what makes the same cache entry
usable as a portable artifact while still allowing per-machine code generation. Confidence: 3

## 5. Which resource limit makes native code size a worry for Editor?

I cannot know the exact two figures without the article, but the binding limit is almost certainly
RAM/SRAM, not flash: the running program must hold the bytecode or IR, the generated native code, the
compiler's own working state and the application's data *simultaneously* in a few hundred kilobytes,
so a native expansion factor of several times the bytecode makes the tiering decision a memory
decision and not just a speed one. The two figures the answer needs are therefore (a) the native code
size for Editor as a multiple of its bytecode/IR size, and (b) that multiple expressed as a fraction
of available memory (or as bytes against the RAM budget), so the reader can see that a large enough
expansion factor simply does not fit. Flash would be the second, softer limit, since it constrains the
cache's total footprint and hence how many modules can be cached at once. Confidence: 2

## 6. One function body out of 120 changed, no signature change, per-function cache

Only the changed function is recompiled; the other 119 functions are still valid because their source
and the signatures they depend on are unchanged, and critically because the edit did not change any
signature no dependent module needs re-type-checking or recompiling either. What remains is the
non-obvious part: the module's code image has to be *reassembled*, since the changed function may have
a different size, which shifts every later function's address and invalidates relocations, cross-
function references, call targets and any per-function lookup table or checksum in the module record.
So the extra step is relinking/patching the module and committing a new module record (and bumping
whatever generation counter the record carries), which is why per-function caching is only a win when
that relink is much cheaper than recompiling the whole module — or when the code layout is made
address-stable so the patch is in-place. Confidence: 3
