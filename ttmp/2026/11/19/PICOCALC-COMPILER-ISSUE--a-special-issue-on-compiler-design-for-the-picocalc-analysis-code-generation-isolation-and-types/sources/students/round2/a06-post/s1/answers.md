# Answers

1. No separate compiler field is needed because the **firmware identity** field covers them. Section 6.3 says the firmware identity stands for three of the five inputs at once: the compiler, the reactor and the reactor's function table. The reason it is sufficient is that all three are part of the firmware image, so none of them can change without the firmware identity changing too. A change in any of them therefore changes the key and discards the cached module.

Confidence: 5

2. The order is: first write the new module and its source into the slot that is **not** currently active; only after both are complete, update the small record in non-volatile settings so that it names the new slot. The record is therefore the single commit point of the installation. If power is lost just before that last write, the record still names the old slot, and the old slot's contents were never touched, so the device boots the previous module as if nothing had happened. The half-written new module is simply ignored.

Confidence: 5

3. Working from section 6.5: extra compile cost of native instead of WebAssembly = 3.14 s − 1.99 s = 1.15 s. Saving per turn = 8.8 ms − 1.6 ms = 7.2 ms = 0.0072 s. Break-even = 1.15 / 0.0072 ≈ 160 turns. So if the compile happens at every boot, native Editor loses in any session shorter than about 160 key presses. Caching changes the conclusion because the compile is paid once per change of source rather than once per boot: after the first session the native module is already stored, so its 1.15 s is repaid "within the first few minutes of use and is free afterwards". In other words, caching turns "should this application ever be native?" into a question about a single edit cycle.

Confidence: 5

4. They still considered it worthwhile for **portability**: one file ran on several processor families, so a single distributed artifact served every machine. Their speed report was careful, not triumphant: the compact encoding saved reading time, and that saving offset part of the cost of generating code, so the roughly twofold load time on their fastest machine was judged an acceptable price for a single file that runs everywhere. On the handheld the form playing the slim binary's role is **WebAssembly**: it is target-independent, compact (88 kB for Editor against 240 kB of native module), and checkable in one forward pass, and native RV32 code is generated from it at load time.

Confidence: 4

5. The binding resource is the **world's memory limit**, not flash (the article explicitly says flash is not scarce: about 4.2 MiB of an 8 MiB partition is used). Editor's memory limit is 768 KiB. The two figures that show the pressure are the measured footprints of the two builds: the native Editor uses 710 KiB, while the WebAssembly Editor uses 528 KiB. The native version is therefore close to the 768 KiB ceiling, which is why mixed mode (native only for hot functions) comes up at all.

Confidence: 4

6. The 4.76 figure compares **RV32 code bytes per byte of WebAssembly function body** — that is, function body against function body, with the reactor excluded from both sides. The 2.7 figure is 240 kB / 88 kB and compares the **complete modules**, including everything else they carry. They differ because each complete module also contains its reactor, and the reactor is the same C code in both builds: a fixed non-code-sized component in both numerator and denominator pulls the ratio toward 1 (2.7 instead of 4.76). So 4.76 is the honest measure of what native code generation does to code size, and 2.7 is what a user actually sees in flash.

Confidence: 5
