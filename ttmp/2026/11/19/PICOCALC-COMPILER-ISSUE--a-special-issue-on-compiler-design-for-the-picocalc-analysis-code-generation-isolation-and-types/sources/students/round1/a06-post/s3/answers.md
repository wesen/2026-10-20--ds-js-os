# Answers to "Check your understanding" (section 6.10)

## 1. Compiler source changed, application source unchanged: reuse the cached module?

No. Section 6.3 says the compiled output is a function of five inputs, and listed second among them is "the compiler's own source", because "a changed compiler emits different code for the same source". Since the key is a hash over all five inputs, changing the compiler changes the key even though the application's text is untouched, so the lookup misses and the compiler must run again. The CJI installer already behaves this way in a cruder form: its stored record holds "the identity of the firmware build", and a changed firmware identity discards the cached module. So the cached module must be treated as stale and rebuilt, not reused.

Confidence: 5

## 2. Why write the record after the module, and what is found after a power loss?

The record is the pointer that says "the module stored here is the output for this key", so it must never describe bytes that are not yet on storage. Writing the module (and source) first and the record last means that a power loss halfway through leaves the previous record still in place, and by the article's account it "leaves the old record pointing at the old, intact module". On the next boot the device therefore finds a record whose hashes match an intact module and simply loads it; the half-finished write is wasted, not trusted. The complementary safeguard is verification on read: the stored module's hash is recomputed, and a damaged module is detected and rebuilt (which took 7,047 ms in the project's test).

Confidence: 3

## 3. Turns needed to repay native compilation for Editor

The extra compile cost is 3.14 s − 1.99 s = 1.15 s = 1,150 ms. The saving per turn is 8.8 ms − 1.6 ms = 7.2 ms. Break-even is therefore 1,150 / 7.2 ≈ 159.7, i.e. about 160 turns (key presses), which matches the article's figure. Because this compile is paid at every boot, any session shorter than ~160 turns ends up slower with native code than with WebAssembly. Caching removes the per-boot payment: the 1.15 s is then paid once per change of the source, so it is recovered after ~160 turns of that version and everything after is free — which is exactly why the article says caching changes the answer to "should this application be native".

Confidence: 5

## 4. Franz and Kistler: why still worthwhile, and what plays the slim-binary role here?

Their motivation was portability: one compact file of encoded syntax tree ran on several processor families, with the loader generating native code for whatever processor it was on. The speed cost was bounded because the encoding was much smaller than native code, so the time saved reading it from disk "can almost compensate for the extra time" of generating code; on their fastest machine a suite of applications loaded in about two seconds against roughly one second for native binaries, which they judged competitive. On the handheld, WebAssembly plays the slim binary's role: target-independent, compact (88 kB for Editor versus 240 kB of native module) and validatable in a single forward pass. The article's middle row of the 6.4 table is that design, lower-and-link at about 1.2 s instead of 3.1 s.

Confidence: 4

## 5. Which resource limit makes native code size a concern?

Not flash but the per-world memory limit: "Each world has a memory limit, 768 KiB for Editor". The two figures are that the native Editor uses 710 KiB of that 768 KiB, while the WebAssembly Editor uses 528 KiB, so going native consumes 182 KiB more and leaves only about 58 KiB of headroom. That is why native code size, at 4.76 bytes of RV32 per byte of WebAssembly function body, becomes an argument for mixed mode. The article also states flash is not scarce (8 MiB firmware partition, about 4.4 MB used) and that Article 5 predicts a better backend taking native size down to 1.4–1.8× WebAssembly.

Confidence: 4

## 6. Per-function cache after editing one function body of 120

Only the edited function is recompiled: its key is the hash of its text together with the hashes of the signatures and record layouts it mentions, and since no signature changed, every other function's key is untouched, so the other 119 entries hit. With Editor's ~2 s compile over 120 functions, the compile part of the cycle is then under 20 ms on average for the changed function. The additional step still required is the link step, because functions call each other by index and those indices must be assigned consistently; in WebAssembly that means renumbering call operands, the same kind of patching the reactor linker already does.

Confidence: 4
