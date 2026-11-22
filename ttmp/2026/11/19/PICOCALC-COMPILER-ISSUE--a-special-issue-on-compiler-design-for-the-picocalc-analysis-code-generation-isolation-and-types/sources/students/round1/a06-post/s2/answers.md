# Answers

## 1. Compiler changed, application unchanged — reuse the cached module?

No. Section 6.3 lists five inputs to the typed compiler's output, and "the compiler's own source" is one of them, with the stated reason that "a changed compiler emits different code for the same source". A content key is a hash of every one of those inputs, so changing the compiler changes the key even though the application text is byte-identical. The lookup therefore misses, the device recompiles, and the new module is stored under the new key. Reusing the old entry would risk pairing code emitted by the old compiler with a reactor and function table it was not built for.

Confidence: 5

## 2. Why is the record written last, and what is found after a power loss between the writes?

The module and the source are written first and the small record last, so that a completed write is never believed before it is actually on storage. The record is the claim ("these bytes, this source, this firmware"), and it is published only once the bytes it describes are durable. After a power loss between the two writes the device finds the *old* record, which points at the old module; if those bytes are still intact the boot simply uses them, and if they are not, the hash check on read fails and the module is rebuilt (the article reports 7,047 ms, with no user action). That safety net of re-hashing on read is what makes the ordering a repair mechanism rather than only a preference. One thing the article leaves implicit: it describes two slots but never says explicitly that the new write goes to the *other* slot, which is what keeps the old module intact.

Confidence: 3

## 3. Break-even turns for native Editor, and the effect of caching

Extra compile cost of native over WebAssembly: 3.14 s − 1.99 s = 1.15 s = 1150 ms. Saving per turn: 8.8 ms − 1.6 ms = 7.2 ms. Break-even: 1150 ms ÷ 7.2 ms = 159.7, so about 160 turns, matching the article's figure. With the compile paid at every boot, any session shorter than roughly 160 key presses is a net loss, so native is only worth it for long sessions. With a cache the 1150 ms is paid once per change of source rather than once per boot, so the debt is cleared in the first minutes of use and every later boot starts already ahead. Caching therefore changes the *question*: not "should this application be native" but "how often does this application change".

Confidence: 4

## 4. Franz and Kistler's reason, and the slim binary's counterpart here

They considered it worthwhile because the compact encoding was so much smaller than native code that the time saved in reading it from storage "can almost compensate for the extra time" of generating code, and because one file then ran on several processor families — portability, not speed, was the point. On their fastest machine about two seconds for a suite of applications, nearly twice native loading, was judged competitive. On the handheld, WebAssembly plays that role: it is target-independent, compact (88 kB for Editor against 240 kB native), and validatable in a single forward pass, and native code is generated from it by lowering and linking at load. The distribution form stays portable; only the boot cost is paid again.

Confidence: 4

## 5. Which limit makes native code size a concern, and the two figures

The binding limit is each world's memory limit, not flash: Editor's world has 768 KiB, and the native Editor occupies 710 KiB of it while the WebAssembly Editor occupies 528 KiB. The native build is therefore within about 58 KiB of a hard ceiling, so any growth in code size either fails to fit or squeezes the application's own data. This is what makes the 4.76 : 1 size ratio (RV32 bytes per WebAssembly function body byte) a design constraint rather than a statistic, and it is why mixed mode is raised at all.

Confidence: 5

## 6. One function body edited, none of 120 signatures changed

Only that one function is recompiled: its key is the hash of its text plus the hashes of the signatures and record layouts it mentions, and all of those are unchanged, so all other 119 entries hit. Compile cost is the average figure of under 20 ms (120 functions in about two seconds). A link step is still required, because functions call one another by index and the indices must be assigned consistently; in WebAssembly that means renumbering call operands, the same kind of patching the reactor linker already does. So the edit-and-run cycle costs one function's compile plus a link, not one function's compile alone.

Confidence: 5
