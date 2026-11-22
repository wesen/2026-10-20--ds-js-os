# Answers

*(Written without the article. Where a question depends on a specific figure or list that I have not been shown, I say so and then reason about what the answer would have to look like.)*

## 1

I cannot know this without the article: I have not seen the list of cache inputs in section 6.3, so I cannot say which of them the firmware update touches. But the principle the question is testing is that a cache key must cover every input that can change the output, and the compiler itself is such an input — its version, code generator, ABI, and default flags all affect the emitted code. If the firmware update ships a changed typed compiler, then the cached module was produced by a different producer than the one now asking for it, so it must not be reused even though the application source is byte-identical. The correct behaviour is to treat the compiler identity as part of the key and miss the cache, recompiling the unchanged source.
Confidence: 4

## 2

The order is a deliberate write-ahead ordering: the module bytes (the bulk, content-addressed payload) are written and flushed first, and only then is the small index record that says "module X lives at offset Y" committed. This means the record can never point at data that is not yet durable. After a power loss between the two writes, the device finds an orphaned module blob with no record referencing it: wasted space, but a consistent cache — no dangling pointer, no half-valid entry, and no risk of executing or loading bytes that were never fully written. The leftover blob is reclaimable by a later scan or garbage collection of unreferenced objects.
Confidence: 4

## 3

I cannot know this without the article: the repayment calculation depends on the specific figures in section 6.5, which I have not been shown. The computation the question is asking for is the standard break-even: if native compilation costs an extra `E` beyond the baseline (interpreted or bytecode) path, and running native saves `S` per turn compared with that baseline, the number of turns to repay is `E / S`, rounded up. Caching changes the conclusion by turning the extra cost from a per-launch cost into a one-off cost over the module's cached lifetime, so the repayment point stays at the same number of turns but is now amortised across every subsequent launch that hits the cache.
Confidence: 2

## 4

I cannot know this without the article: I do not have their exact rationale as stated in section 6.5's discussion. My best reasoning from what is generally known about Franz and Kistler's slim binaries is that the load-time decompression cost was accepted because the slim binary is machine-independent: one distributed artifact runs on every target, which removes the need to ship and maintain a separate native binary per architecture, and the compact encoding also cuts distribution and I/O cost, which dominates on the storage of that era. On the handheld, the form playing the slim binary's role would be whatever compact, machine-independent intermediate representation the device stores and turns into native code at load time — a bytecode, typed IR, or symbol-table-bearing portable object — rather than a native binary. So the analogue is "the portable representation the device expands into native code at load time", whatever the article names it.
Confidence: 2

## 5

I cannot know this without the article: I have not seen the two memory figures, and I do not know which limit the article singles out for Editor (plausibly total RAM, or the executable/flash budget, or the fixed-size heap the code generator allocates from). What the answer must look like is a specific binding constraint — for example "Editor has only N KB of RAM, and its native image is M KB, of which the incremental part alone exceeds the free space" — where the native code size competes directly with the data the editor needs for its own buffers. The point of the question is that on a small machine code size is not an abstract elegance issue but a hard ceiling, so a tiering or caching strategy that inflates the code image is disqualified regardless of speed.
Confidence: 2

## 6

With a per-function cache, an edit to one function body out of 120 with no signature change invalidates only that function's cached entry, so exactly one function is recompiled and the other 119 are reused verbatim. What is still required even though the signature is unchanged is a module-level step outside the function: the module must be reassembled and relinked, because the new body may have a different size, which shifts the addresses of everything after it, so relocations and call sites inside the module have to be patched and the module's own cache record/hash updated. In other words the per-function cache saves the code-generation work but not the linking and layout work, which is why finer-grained caching pays off most in the compile phase and least in the link phase.
Confidence: 3
