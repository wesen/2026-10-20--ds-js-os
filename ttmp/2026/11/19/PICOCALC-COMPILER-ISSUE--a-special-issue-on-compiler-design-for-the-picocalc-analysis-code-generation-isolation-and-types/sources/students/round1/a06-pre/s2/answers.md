# Answers — "6. When to Compile: Caches, Load-Time Generation and Tiers"

1. A cached module should not be reused, because the compiler is one of the inputs that determines the
   output bytes, not just the application source. I cannot know the exact wording of the list in section
   6.3, but for the answer to be coherent that list must contain at least the application source, the
   compiler identity (version, or a hash of its own source), the target/ABI settings, and the flags used
   for the build. If the typed compiler's own source changed in a firmware update, the compiler-identity
   input differs, the cache key or validation test fails, and the entry must be treated as a miss; the
   application source being unchanged is irrelevant because the *pair* (source, compiler) is what was
   cached.
   Confidence: 3

2. The record, which is the small summary that says "this module exists, has this size, this hash and
   this ABI", is written last so it acts as the commit point: a module file without a record is
   ignorable garbage, while a record without a complete module would be a lie the loader might trust. If
   power is lost between the two writes, the device finds a complete-looking module blob on storage but
   no record for it (or a stale record for the previous build), so the loader must conclude the cache is
   cold for that module and regenerate it on the next load rather than execute a torn image.
   Confidence: 4

3. I cannot know this without the article, since the repayment count depends entirely on the figures in
   section 6.5. The computation the question wants is the obvious ratio: let `C_native` be the higher
   compile cost of native code and `C_slim` the cheaper load-time path, and let `s` be the per-turn
   saving that native execution buys; then the number of turns to break even is
   `(C_native - C_slim) / s`, rounded up. Caching changes the conclusion qualitatively: the extra
   compile cost is paid once and amortised over every later load, so break-even is measured over
   sessions rather than over turns within a single session, and the tier becomes worthwhile almost
   immediately provided the cached artefact survives.
   Confidence: 2

4. I cannot know their exact argument as the article reports it, but Franz and Kistler's known point is
   that slim binaries traded decode time for space: the encoded form was roughly half the size of native
   code, so it eased the resource that was actually scarce (memory, and the cost of shipping/storing
   code) while load time grew but stayed in a tolerable absolute range. Loading "almost twice as long"
   therefore still meant a small absolute delay for a large reduction in footprint, and the delay was
   paid on the slow path only, not on every execution. On the handheld the form playing the slim binary's
   role would be the typed compiler's portable intermediate representation, generated once and decoded
   or compiled to machine code at load time — I cannot confirm the article's name for it.
   Confidence: 2

5. I cannot know the two figures without the article; they are quoted measurements from section 6.5 and
   inventing them would be worse than admitting the gap. The resource limit the question points at must
   however be a scarce-memory limit that native code competes for, most plausibly the RAM budget of the
   device (code has to be resident, or copied out of flash into RAM, if it is generated at load time),
   possibly with flash as the secondary constraint. The two figures that show it will be of the shape
   "native code for Editor needs about X KB" against "about Y KB is actually available after the
   interpreter, buffers and stack", with X uncomfortably close to Y or exceeding it.
   Confidence: 1

6. With a per-function cache and no signature change, exactly one function body is recompiled — the
   edited one — and the other 119 bodies plus all call sites and type information are reused unchanged,
   because nothing they depend on moved. A further step is still required, though: the newly compiled
   body must be placed and stitched back into the module, which means relocating or patching the code
   that referenced the old body (entry address, any relative branches or literal pools into it),
   re-laying-out whatever followed it if sizes changed, and rewriting the module-level record with the
   new size and hash so the cache entry is valid again. Without that linking and record-update step the
   cache would be internally inconsistent even though only one function changed.
   Confidence: 3
