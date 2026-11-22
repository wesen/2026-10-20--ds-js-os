# Answers to "Check your understanding"

## 1. Compiler changed in a firmware update, application source unchanged

No, the cached module should not be reused. Section 6.3 lists five inputs the key must cover, and "the compiler's own source" is one of them, because a changed compiler emits different code for the same source. If the key is a hash of all five inputs, then changing the compiler source changes the key, the lookup misses, and the compiler runs again. The application's source being unchanged is irrelevant, since only the whole key has to match.

Working: old key = H(source, compiler_v1, reactor, engine, import_table); new key = H(source, compiler_v2, reactor, engine, import_table); the two keys differ because compiler_v1 ≠ compiler_v2, so the lookup misses.

Confidence: 5

## 2. Why the record is written last, and what a power loss leaves

The module and the source are written to storage first; only after they are safely there is the small record (hashes plus firmware identity) updated. The record is the thing that makes stored data "valid", so writing it last means it never points at bytes that were not yet written. After a power loss between the two writes the old record survives, and it still points at the old module, which was never overwritten and is therefore intact and still verifiable. So the device boots into the last consistent state rather than into a half-written one.

Confidence: 5

## 3. Break-even turns for native Editor, and the effect of caching

Extra compile cost: 3.14 s (native) − 1.99 s (WebAssembly) = 1.15 s = 1150 ms. Saving per turn: 8.8 ms − 1.6 ms = 7.2 ms. Turns to repay = 1150 / 7.2 = 159.7, so about 160 turns. If the compile happens at every boot, any session shorter than 160 key presses is a net loss for native code. With caching the 1.15 s is paid once per change of the source rather than once per boot, so the balance turns positive within the first few minutes of use and stays positive for every later boot.

Confidence: 5

## 4. Why slim binaries were still worthwhile, and WebAssembly's role

The slim-binary encoding was much smaller than native code, so less time was spent reading the file from disk, and that saving "can almost compensate for the extra time" spent generating code. On their fastest machine the load took about two seconds, almost twice the native load time, and they judged that competitive — the gain is portability, since one file then runs on several processor families. They also measured that on a different processor the load plus code generation took "little more time" than reading equivalent native code. On the handheld, WebAssembly plays the slim binary's role: it is the compact, target-independent, checked form from which native code is generated at load (88 kB for Editor against 240 kB of native module).

Confidence: 4

## 5. Which resource limit makes native size a concern

The binding resource is each world's memory limit, not flash. Editor's world has a limit of 768 KiB, the native Editor uses 710 KiB of it, and the WebAssembly Editor uses only 528 KiB. So native Editor sits close to the ceiling while the WebAssembly version has headroom, which is why compiling everything natively is risky and why mixed mode is discussed as a fallback. Flash is not scarce: the firmware partition is 8 MiB and holds about 4.4 MB.

Confidence: 5

## 6. One edited function body, no signature change, per-function cache

Only that one function misses the cache, so only its text is recompiled; at Editor's average of under 20 ms per function that is the whole compile cost. Nothing else is recompiled, because the other functions' keys are hashes of their own text plus the signatures and record layouts they mention, and none of those changed. A link step is still required, because functions call each other by index and the indices must be assigned consistently; in WebAssembly this is a renumbering of call operands, the same kind of patching the reactor linker already does. So the cycle is one function's compile plus a link, not a full build.

Confidence: 4
