# Answers: "6. When to Compile: Caches, Load-Time Generation and Tiers"

1. I cannot know this without the article which concrete field name it uses. My best reasoning: the compiler and the reactor are both properties of the *toolchain that produced the module*, not of the module itself, so a single field such as a toolchain/build id, a format version, or a "producer identity" stamp must cover them. That is sufficient because the compiler and reactor are versioned as one unit: any change to either changes that one identifier, so the installer can invalidate or regenerate every affected module from a single comparison instead of tracking each component separately.

Confidence: 3

2. I cannot know this without the article the exact write order it prescribes. The standard and almost certainly the intended scheme: first write the *inactive* slot completely and verify it, and only then write the small commit record (pointer or sequence number) that names the new slot as live. A power loss just before that last write therefore leaves both the old slot and the old commit record intact, so the device boots the previous module version; the half-written slot is simply still "not live" and gets reused or erased on the next install.

Confidence: 3

3. I cannot know this without the article, because the repayment calculation needs the numbers in section 6.5 (native compilation cost and the per-turn speedup). The computation the section must be asking for is the break-even point: turns = (one-time native compile cost in turns) / (turns saved per turn of execution), i.e. the number of executions at which the saved time equals the compilation cost. Caching changes the conclusion by making the compile cost a *once per module per device* cost rather than a per-load cost, so any module executed more than that break-even count becomes a net win, and modules below it should stay interpreted.

Confidence: 2

4. I cannot know this without the article the reasoning it reports verbatim, but the classic argument in Franz and Kistler's slim-binary work is that the comparison is not "slim binary vs. native binary on this machine" but "one compact, machine-independent representation vs. per-architecture native code that must be built, stored and shipped for every target." The slower load is a one-time, per-machine cost that a disk cache amortizes, whereas the size and portability win is paid every time code is distributed; and crucially the alternative on other machines would not have been native code at all. On the handheld the form playing the slim binary's role should be the WebAssembly module: a compact, portable bytecode that is translated to native code at load time and cached.

Confidence: 3

5. I cannot know this without the article the two specific figures. The limit at issue is RAM rather than flash: native machine code has to be resident to run, and on a small RP2040-class machine the SRAM budget is the binding constraint, so native code competes with the heap, the stack and the framebuffer. The two figures would then be the total SRAM available and the size of Editor's native code (or the fraction of RAM it would occupy), showing that the native image does not fit alongside everything else.

Confidence: 2

6. I cannot know this without the article which two variants produce 4.76 and 2.7. The most plausible distinction is that one ratio compares *whole artifacts* — the native image against the full WebAssembly module as shipped — while the other compares only the *code payload*, after stripping or excluding metadata custom sections such as names, relocation/debug info and the module's data segments, or after compression/at-equal-optimization settings. They differ because the WebAssembly file carries a large amount of non-code baggage: the larger ratio includes it, the smaller one does not, so 4.76 is the honest end-to-end size comparison and 2.7 is the like-for-like code-size comparison.

Confidence: 2
