# Answers to "Check your understanding" (section 6.10)

## 1. Which field covers the compiler and the reactor, and why is that sufficient?

The field is the **firmware identity** stored in the installer's record in non-volatile settings. It is sufficient because the compiler, the reactor and the reactor's function table are all part of the firmware image, so a change to any one of them necessarily changes the identity of the firmware build. The article's mapping table shows this: source is covered by the source hash, engine by the engine field, and compiler, reactor and function table all collapse onto the single firmware identity. So no separate per-input field is needed, and the check "does the firmware identity still match?" discards the cached module when any of the three changes.

Confidence: 4

## 2. Order of writes in a two-slot installer, and what a power loss leaves behind

First a new module and its source text are written to the slot that is *not* currently active; no part of the active slot is touched. Only when both writes are complete is the small record changed, as the very last step, to name the new slot as active. If power is lost just before that last write, the record still names the old slot, and the old slot's module was never modified, so the device boots on the complete previous module. After the record write the new slot is authoritative, and the module's hash is re-checked on read so a half-written or damaged module is detected and rebuilt.

Confidence: 5

## 3. Break-even turns for native Editor, and the effect of caching

Extra compile cost for native: 3.14 s − 1.99 s = 1.15 s = 1,150 ms. Saving per turn: 8.8 ms (WebAssembly engine) − 1.6 ms (native) = 7.2 ms. Break-even = 1,150 ms / 7.2 ms ≈ 160 turns. If the compile happens at every boot, a session must reach about 160 turns before the native version has paid for itself, so shorter sessions lose. If the compile happens once per change of the source and is cached, the 1.15 s is repaid once (inside the first ~160 turns of that edit) and every later boot starts with no compile at all, so being native becomes free.

Confidence: 4

## 4. Why slim binaries were still judged worthwhile, and the corresponding form here

The compact encoding made the stored program smaller, so reading it from storage was faster, and that saving offset part of the cost of generating code at load. On their fastest machine, loading a suite from slim binaries took about two seconds, nearly twice the native load time, but they considered that an acceptable price for one file that runs on every processor family — the gain was portability rather than load speed. On the handheld, **WebAssembly** plays the slim binary's role: it is target-independent, compact (88 kB against 240 kB of native module for Editor), and checkable in one forward pass before RV32 code is generated from it.

Confidence: 4

## 5. Which resource limit makes native code size a concern, and the two figures

The binding resource is the **world's memory limit**, which is 768 KiB for Editor. The two figures are 710 KiB for the native Editor and 528 KiB for the WebAssembly Editor: native code pushes the world close to its ceiling (about 92 percent used against about 69 percent), while the interpreter version leaves more headroom. That small margin is why running the whole application as native code is a problem and why mixed mode is discussed as a way to get most of the speed at a fraction of the size.

Confidence: 5

## 6. What 4.76 and 2.7 each compare, and why they differ

4.76 compares *like with like*: bytes of generated RV32 machine code per byte of WebAssembly function body, so it measures how much the code itself grows when it is lowered. 2.7 compares the complete modules, 240 kB of native module against 88 kB of WebAssembly module (240 / 88 = 2.73), and those modules each also contain their reactor — the same C code in both builds. The shared, roughly constant reactor is a large part of both files, so it dilutes the growth ratio of the parts that actually differ; the honest size measure for the backend is the 4.76 figure.

Confidence: 5
