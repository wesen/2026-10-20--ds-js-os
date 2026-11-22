# Answers — "6. When to Compile: Caches, Load-Time Generation and Tiers"

*(Answered without access to the article, as instructed. The article was not provided in this
directory, so answers below are reconstructions from general knowledge of compiler/tiering design
plus what the question wording itself implies.)*

## 1. The CJI installer's record has no field for the compiler or the reactor. Which field covers them, and why is that sufficient?

I cannot know this without the article. The reasoning that must hold is that the installer record
carries some *derived* identifier — most plausibly an interface/ABI digest, or a `requires`/build-id
field — that is computed from the module's exported and imported signatures together with the
toolchain that produced it. If that digest folds in the compiler version and the reactor (runtime)
version, then two records with equal digests were necessarily produced by the same compiler against
the same reactor. That is sufficient because the installer never needs to *name* the toolchain, only
to refuse to load an artifact that was built against a different one; the digest makes that
comparison total without a second field that could disagree with it.

Confidence: 2

## 2. The installer has two slots. Describe the order of writes when a new module is installed, and what the device finds after a power loss just before the last write.

I cannot know the article's exact slot naming without it, but the ordering forced by two slots is:
write the new payload and its per-slot checksum into the *inactive* slot first, flush it to stable
storage, and only then do the single small write that makes it live (flipping the record's active-slot
indicator or installing the new record). That last write is the commit point and it is deliberately
the smallest possible one. If power is lost just before it, the device boots and finds the old record
intact and still pointing at the old slot, so the old module loads normally; the newly written
inactive slot is either ignored or found invalid by its checksum and may be reclaimed or retried on
the next install. Nothing is half-live, which is the whole point of the two-slot arrangement.

Confidence: 3

## 3. Using the figures in section 6.5, compute how many turns are needed to repay the extra cost of native compilation for Editor, and state how caching changes the conclusion.

I cannot know this without the article, since the numbers live in section 6.5. The computation shape
is: break-even turns = ceil((native compile cost − baseline load/generate cost) / per-turn saving
from running native code instead of the slower tier). So if native compilation costs an extra *E*
seconds and native execution saves *s* seconds per turn, the debt is repaid after *E/s* turns, rounded
up. Caching does not change *E/s*; it changes who pays *E*. With a cache, the extra cost is paid once
per artifact version rather than once per launch, so an Editor session shorter than the break-even
point still comes out ahead across many launches — which turns a "compile natively only if the
session is long" rule into "compile natively once, then always load the cached native form."

Confidence: 2

## 4. Franz and Kistler reported that loading from slim binaries took almost twice as long as loading native binaries on their fastest machine. Give the reason they still considered the design worthwhile, and name the form that plays the slim binary's role on the handheld.

The reason is that the comparison was load-time only and treated storage and transport as free; slim
binaries are dramatically smaller, so in end-to-end terms — store it, ship it, then load it — the
decompression cost is repaid by the bytes that never had to move, and the artifact also stays
portable across machines instead of being tied to one instruction set. Their design bet was that
decode cost scales with the machine getting faster while the size advantage does not go away. By
analogy with the rest of this article, the form playing the slim binary's role on the handheld is
WebAssembly: a compact, machine-independent encoding that a local backend turns into native code.

Confidence: 3

## 5. Which resource limit makes native code size a concern for Editor, and what are the two memory figures that show it?

I cannot know the exact figures without the article, but the limit is resident memory — the total
RAM available to the process on the handheld, of which a code image must coexist with heap, stack and
framebuffers, and which cannot be paged out profitably. The two figures that make the concern concrete
would be the ceiling (usable RAM, or the per-application memory budget) and the measured native image
size for Editor, with the image taking a large enough fraction of the ceiling that headroom for the
heap is what actually binds. The point of pairing them is that once the image is a big share of the
budget, every kilobyte of code is a kilobyte taken from working data.

Confidence: 2

## 6. Section 6.6 gives two ratios between native and WebAssembly size for Editor, 4.76 and 2.7. What does each one compare, and why do they differ?

I cannot know this without the article, but the pattern of two ratios for the same program usually
means two different bases. The larger figure (4.76) most plausibly compares the *sum of per-module
native images* — each carrying its own copies of runtime, startup and duplicated library code —
against the single WebAssembly module set, while 2.7 is the same comparison after removing that
duplication, or over code only with data/rodata and metadata excluded. They differ because
per-module native code does not share: the same runtime routines are linked into every image, so the
aggregate inflates with the number of modules, whereas a WebAssembly module set links against one
instance of the runtime. The honest single number for memory pressure is therefore the lower one, and
the higher one only describes what the naive per-module layout costs.

Confidence: 1
