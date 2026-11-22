# Answers — "6. When to Compile: Caches, Load-Time Generation and Tiers"

*(Answered before reading the article; every article-specific number is flagged as such.)*

## 1. The CJI installer's record and the compiler/reactor

I cannot know this without the article which field it is, but the design must be one that indirection already covers both: almost certainly a *producer/ABI version* or *artifact-key* field, i.e. a single value that stands for "whatever toolchain and reactor emitted this image". A compiler name, its version, and the reactor's identity are all build-time constants of the producing system, so they belong in a fingerprint rather than in a separate per-tool field. That is sufficient because the loader never needs to know *which* compiler ran, only whether the image it is looking at was produced by something compatible with the runtime it has. Storing the fingerprint means any change to compiler or reactor invalidates the record automatically, with no second field to keep in sync.

Confidence: 3

## 2. Two slots, write order, and power loss

Two slots imply the classic A/B (ping-pong) commit: the new module image is written into the *inactive* slot, the write is flushed to stable storage, and only then is the record's small "active slot" indicator flipped to point at it. The final write is therefore a tiny, single, ideally atomic update — that ordering is the whole point of the two-slot layout. If power is lost just before that last write, the device boots with the record still naming the old slot: the previous, complete module is fully intact and runs, and the freshly written but uncommitted image in the other slot is simply ignored (and later overwritten). So the failure mode is "the install did not happen", never "half a module".

Confidence: 3

## 3. Repaying native compilation cost for Editor (section 6.5)

I cannot know this without the article's figures, so I cannot give the number. The shape of the computation is fixed, though: break-even turns = (extra cost of native compilation for Editor) ÷ (per-turn savings of native over the interpreted/generated tier), rounded up. Caching changes the conclusion qualitatively: without a cache the compile cost is paid on every load, so break-even must be reached within a single session's turn budget; with a cache it is paid once and amortised over all later loads, so the required turn count per session collapses toward one and nearly any real workload repays it.

Confidence: 2

## 4. Franz and Kistler, slim binaries, and the handheld's analogue

I cannot know their exact argument without the article, but the reported fact — slim-binary loading costing roughly twice the load time of native binaries on the fastest machine — only makes sense as a trade against *size and portability*: slim binaries are a compact, machine-independent encoding that is far smaller than native code, so they win on slow disks, small memory, and cross-machine distribution even while losing on pure decode time on a fast machine. The reason they still considered it worthwhile is that load time on the fastest machine is not the binding constraint for the systems they targeted; cost of storage/transport and the ability to ship one binary to many architectures are. On the handheld, the form playing the slim binary's role is WebAssembly: a compact, portable, verifiable intermediate representation that is generated into native code at load time.

Confidence: 3

## 5. The resource limit and the two figures

I cannot know the two memory figures without the article, but the limit that makes native code size a concern on a handheld is non-volatile storage (flash) rather than RAM alone — the installed image must fit permanently, and flash is the scarcest, least upgradable budget on such a device, with RAM as the second pressure because the loader needs room to place the code. The two figures the section would have to give are an absolute native size for Editor and the corresponding installed/flash capacity available to it (or, if RAM is the constraint, native resident size versus the RAM budget). The argument only works if the native size is a substantial fraction of that budget, leaving too little headroom for the OS, the reactor, and other modules.

Confidence: 2

## 6. The two ratios, 4.76 and 2.7

I cannot know exactly what each ratio measures without the article, but two ratios for the "same" pair of artifacts normally differ in their denominator. One — plausibly the larger, 4.76 — compares the total shipped containers: native image including headers, relocation/debug metadata and padding, against a raw or full WebAssembly module including its own sections and custom metadata. The other, 2.7, compares the figures that actually matter for shipping or for resident code: for example compressed/normalised WebAssembly against the native text segment alone, or the numbers after stripping metadata from both sides. They differ because the extra material in a native image (symbols, relocation information, alignment padding) is discarded or compressed away at ship time, so a total-file comparison overstates the native penalty relative to the payload-only comparison.

Confidence: 2
