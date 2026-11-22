# Answers — Check your understanding (Article 6)

## 1. The CJI installer's record has no field for the compiler or the reactor. Which field covers them, and why is that sufficient?

The field is the record's **identity of the firmware build** (called "firmware identity" in the table in section 6.3). It is sufficient because the compiler, the reactor and the reactor's function table are all part of the firmware image, so any change to one of them changes the firmware identity, which changes the key and forces a recompile. That single field therefore covers three of the five inputs to the compile at once. The record's other fields cover the remaining two: the source hash covers the application source, and the engine field names the target.

Confidence: 5

## 2. The installer has two slots. Describe the order of writes when a new module is installed, and what the device finds after a power loss just before the last write.

The new module and its source are written into the slot that is **not** currently active. Only once both are complete is the record in non-volatile settings changed, in one last write, to name that slot as the active one. If power is lost immediately before that final record write, the record still names the old slot, and the old slot's module was never touched during the install, so the device finds the previously installed module intact. Because the module's hash is also recomputed at boot, a module damaged in the active slot would be detected and rebuilt instead of run.

Confidence: 5

## 3. Compute how many turns repay the extra cost of native compilation for Editor, and how caching changes the conclusion.

Extra compile cost: 3.14 s − 1.99 s = **1.15 s**. Saving per turn: 8.8 ms − 1.6 ms = **7.2 ms**. Repayment: 1.15 s ÷ 0.0072 s = 159.7, i.e. **about 160 turns** (1.15 ÷ 7.2 ms ≈ 160). If the compile happens at every boot, native code is a net loss in any session shorter than 160 key presses. If the compile happens once per change of the source and the result is cached, the 1.15 s is paid once, so it is repaid within the first few minutes of use and is free afterwards; caching therefore turns "should this be native?" from a question about session length into a question that is almost always answered yes.

Confidence: 5

## 4. Why did Franz and Kistler still consider slim binaries worthwhile, and what plays that role on the handheld?

The gain they bought with the nearly doubled load time was **portability**: one file ran on every processor family, because the file held a compact encoding of the syntax tree and the loader generated native code for the machine it found itself on. They also noted that the compact encoding saved reading time, which offset part of the cost of generating code, and they judged the total price acceptable for a single file that runs anywhere. On the handheld, **WebAssembly** plays the slim binary's role: it is target-independent, compact (88 kB against 240 kB of native module for Editor), and can be checked in a single forward pass, and native code is generated from it by translating to RV32 at load time.

Confidence: 5

## 5. Which resource limit makes native code size a concern for Editor, and what are the two memory figures?

The binding resource is the **world's memory limit**, which is 768 KiB for Editor. The two figures are the native Editor using **710 KiB** of that limit and the WebAssembly Editor using **528 KiB**. The native version at 710 of 768 KiB is at roughly 92 percent of the limit, which is why the 4.76-fold code-size ratio matters rather than being a curiosity, and why mixed mode is discussed at all.

Confidence: 5

## 6. The two ratios 4.76 and 2.7: what does each compare, and why do they differ?

The 4.76 ratio compares **code with code**: bytes of RV32 code per byte of WebAssembly *function body* for Editor. The 2.7 ratio compares **whole modules**: 240 kB of native module against 88 kB of WebAssembly module, and 240 ÷ 88 ≈ 2.7. They differ because each complete module also contains its reactor, which is the same C code in both builds, so that shared, unchanged part is counted in the module sizes but not in the function bodies, pulling the whole-module ratio down toward 1. In other words 4.76 is the ratio that matters for the code a compiler actually produces, and 2.7 is what shows up as difference in flash.

Confidence: 4
