# 6. When to Compile: Caches, Load-Time Generation and Tiers

A compiler's output can be produced at four different moments, and the choice determines who waits and for how long. This article sets out those moments, states what the project does today, and works through the designs that would remove the compile from the path of an ordinary boot. By the end you should be able to list what a cache key for compiled code must contain and why, explain what is gained and lost by shipping a checked intermediate form instead of machine code, compute the break-even point for native compilation from the project's measurements, and say when mixing interpreted and native code in one application is worth its complexity.

The article uses the terms *reactor*, *engine* and *turn* from Article 1 and the measurements of Article 2.

## 6.1 Four moments

| Moment | Where | How often | Who waits |
| --- | --- | --- | --- |
| Build time | Workstation, when the firmware is built | Once per release | Nobody on the device |
| Install time | Device, when a source file changes | Once per edit | The person who edited |
| Load time | Device, when a world starts | Every boot | Every user, every boot |
| Run time | Device, while the program runs | When code proves to be hot | The running program, briefly |

The two compilers of this project currently sit in different rows. CJI compiles at **install time**: the result is stored on the device's file system and reused on later boots. The typed compiler compiles at **load time**: Files, Agenda and Editor are compiled from source on every boot. For Editor that is 1.99 seconds for WebAssembly or 3.14 seconds for native code, paid each time the device starts, to produce output identical to the previous boot's.

The reason is historical. Compiling from source on the device was the property the project set out to demonstrate, and compiling at boot demonstrates it on every run. Now that it has been demonstrated, the cost can be moved.

## 6.2 What on-device compilation buys and costs

Before optimizing the moment of compilation, it is worth stating why the device compiles at all. A user could, in principle, be given only precompiled modules.

Three things are gained. A program edited on the handheld can be run on the handheld, with no workstation. One source text serves two engines, since the same typed source produces a WebAssembly module or an RV32 module. A new firmware release with a changed reactor does not strand previously installed applications, because they can be recompiled against it.

Three things are paid. The compiler occupies flash: 43 kB of JavaScript source for the typed compiler, against about 660 kB for the CJI tool. It occupies memory while it runs: a peak of 1.5 MB for Editor's WebAssembly build and 2.5 MB for its native build. It must be trusted: an error in a compiler that runs on the device is an error in every program it produces, a point Article 7 develops.

## 6.3 A cache keyed by content

The direct remedy for compiling at every boot is to keep the result. A **cache** maps a key to a stored output. The entire difficulty lies in choosing the key so that a stored output is returned only when a fresh compile would have produced exactly the same bytes.

The output of the typed compiler is a function of five inputs, and the key must cover all of them.

| Input | Why it affects the output |
| --- | --- |
| The application's source text | It is what is compiled |
| The compiler's own source | A changed compiler emits different code for the same source |
| The reactor | The compiled code is copied into it and calls into it at fixed positions |
| The target engine | WebAssembly and RV32 outputs differ |
| The table of functions the reactor offers | Calls are bound by position in that table |

The standard construction is to compute a cryptographic hash of each input and use the combination as the key. Two builds with the same key had the same inputs and therefore the same output. If any input changes, the key changes, the lookup misses, and the compiler runs. No input needs a version number maintained by hand.

This design has a precise description in the literature on build systems. Mokhov, Mitchell and Peyton Jones separate a build system into a *scheduler*, which decides the order of work, and a *rebuilder*, which decides whether a piece of work must be redone [Mokhov et al. 2018]. A record of input hashes together with the output's hash is what they call a verifying trace; storing the output itself under that record makes it a constructive trace, from which the output can be restored without rebuilding. The cache proposed here is a constructive trace with one entry per application and engine.

The project has already built this once. The CJI installer stores the compiled module and the source in one of two slots on the file system and writes a small record to non-volatile storage. The record holds the hash of the source, the hash of the compiled module, and the identity of the firmware build. At boot the bytes are checked against the record, and a changed firmware identity discards the cached module. The measured effect is the one to expect for the typed compiler: a cold recompile of a small test program took 7,028 ms, and reuse of the stored module took about 1,450 ms at boot.

Two engineering details from that implementation carry over.

- **Write order.** The module and the source are written to storage first, and the record is updated last. A power loss in between leaves the old record pointing at the old, intact module.
- **Verification on read.** The stored module's hash is recomputed at boot. A damaged module is detected and rebuilt; in the project's test this took 7,047 ms and required no user action.

### A finer grain: one entry per function

Article 4 established that the typed compiler compiles each function from its own text and the declarations of what it calls. That property permits a cache with one entry per *function*. The key for a function is the hash of its text together with the hashes of the signatures and record layouts it mentions. After an edit to one function, only that function misses.

Editor has 120 functions and compiles in about two seconds, so the average function costs under 20 ms on the device. An edit-and-run cycle would then cost one function's compile plus a link step. The link step exists because functions call each other by index and the indices must be assigned consistently; in WebAssembly this is a renumbering of call operands, and it is the same kind of patching the reactor linker already performs. This design was listed in the project's device-language document and not built. It follows from local checking with no further analysis.

## 6.4 Shipping a checked intermediate form

A second design stores neither source nor machine code. It stores an intermediate form that has already been parsed and checked, and generates machine code from it when the program is loaded.

The reference work is **slim binaries**. Franz and Kistler distributed programs for the Oberon system as a compact encoding of the program's syntax tree, and the loader generated native code for whatever processor it ran on [Franz & Kistler 1997]. The motivation was portability: one file ran on several processor families. Their report on speed is careful and worth repeating exactly. Because the encoding was much smaller than native code, the time saved reading it from disk "can almost compensate for the extra time" of generating code; on the fastest machine they measured, loading a suite of applications from slim binaries took about two seconds, almost twice the time of loading native binaries, which they judged competitive. Franz's dissertation, on a different processor, reported that loading with code generation required "little more time than the input of equivalent native code" [Franz 1994].

On this device WebAssembly plays the role of the slim binary. It is target-independent, it is compact (88 kB for Editor against 240 kB of native module), and it can be checked for well-formedness in one forward pass. The designers of WebAssembly state that its structured control flow allows code "to be validated in a single pass, compiled in a single pass, or even transformed to an SSA-form intermediate form in a single pass" [Haas et al. 2017].

Three storage choices follow, and the measurements of Article 2 let us compare them for the native Editor.

| What is stored | Work at each boot | Approximate boot cost on the device | Flash used |
| --- | --- | ---: | ---: |
| Source only (today) | Tokenize, parse, check, emit, lower, link | 3.1 s | 71 kB |
| Checked WebAssembly | Lower and link only | about 1.2 s | 88 kB |
| Native module | Verify the hash and load | about 0.01 s to load, plus hashing | 240 kB |

The middle row is the slim-binary design: it removes the frontend, which Experiment 3 found to be about 58 percent of the native compile path, and keeps the stored form portable across engines. The third row is the cache of section 6.3. Flash is not the scarce resource here, since the firmware partition is 8 MiB and holds about 4.4 MB, so the third row is the better choice for boot time. The second remains useful as the form in which an application is *distributed*, because a module in that form can be given to either engine.

What is lost by storing a compiled form of any kind is exactly one thing: the stored form can become stale. That is the problem the content key of section 6.3 solves.

### Native modules and virtual machines on small devices

The comparison between loading native code and interpreting compact code has been measured before on machines much smaller than this one. Dunkels and colleagues built a loader for standard ELF object files in the Contiki operating system for sensor nodes and compared it with an application-specific virtual machine and a Java virtual machine [Dunkels et al. 2006]. Native code was cheaper to execute and more expensive to transmit and link, so each program had a break-even point. For their object-tracking program, interpretation became more expensive than native loading only after about 40,000 to 80,000 iterations. Their conclusion was that the right choice depends on how often code is replaced relative to how much it runs, and that a system can reasonably offer both.

The Maté virtual machine took the opposite extreme deliberately. It fitted in 1 kB of RAM and 16 kB of program memory, and its programs were capsules of at most 24 one-byte instructions, small enough to fit in one radio packet [Levis & Culler 2002]. Its authors argued that for programs replaced often, the energy saved by shipping tiny programs outweighs the energy spent interpreting them. The same reasoning applies on the handheld to code that changes with every keystroke of an edit session, and it is why QuickJS and WebAssembly remain the right engines for code under development.

## 6.5 Break-even arithmetic

The textbook states the constraint on any compiler that runs at the user's expense: "the system must recoup compile time through improved running time" [Cooper & Torczon 2023, §1.4]. The project's numbers allow the calculation.

For Editor, producing native code instead of WebAssembly costs 3.14 − 1.99 = 1.15 seconds more at compile time. It saves 8.8 − 1.6 = 7.2 ms of processor time per turn. The extra compile is repaid after 1.15 s / 7.2 ms ≈ 160 turns. If the compile happens at every boot, native code is a loss in any session shorter than 160 key presses. If the compile happens once per change of the source, it is repaid within the first few minutes of use and is free afterwards. Caching changes the answer to the question "should this application be native".

For CJI the same calculation was made in the project's device-language study. Compiling Files with CJI took 140.6 seconds in the best case, against 0.082 seconds to register the JavaScript version with QuickJS. If native code saved one millisecond on every call into the application, the compile would be repaid after about 140,000 calls.

## 6.6 Tiers and mixed mode

A **tiered** system runs code in a cheap form first and produces a better form only for the parts that are executed often. Article 3 described Self's two compilers. The Smalltalk-80 system of Deutsch and Schiffman is the earlier instance: it translated a method from compact virtual-machine code to native code the first time the method ran, cached the native code, and discarded it when memory was short, regenerating it on demand. Their native code took about five times the space of the virtual-machine code [Deutsch & Schiffman 1984]. The textbook calls the discard policy throw-away code generation and gives the general range as a factor of two to five [Cooper & Torczon 2023, chapter 14].

This project's measured ratio is inside that range: 4.76 bytes of RV32 per byte of WebAssembly function body for Editor. The size has a concrete consequence, which is the reason mixed mode comes up at all. Each world has a memory limit, 768 KiB for Editor, and the native Editor uses 710 KiB of it where the WebAssembly Editor uses 528 KiB. The binding resource is the world's memory limit, and the native version is close to it.

**Mixed mode** would compile only the hot functions of an application to native code and leave the rest as WebAssembly. It would buy most of the speed for a fraction of the size. It costs three things: a way to find the hot functions, which means counters and a trigger [Cooper & Torczon 2023, §14.2]; a calling path between the interpreter and native code in both directions; and the acceptance of unconfined native code inside an otherwise confined world.

The recommendation of this issue is not to build mixed mode now. Article 5 predicts that a better backend brings native code to between 1.4 and 1.8 times the size of the WebAssembly, at which point the whole application fits comfortably as native code and the selection machinery is unnecessary. Mixed mode remains the fallback if that prediction fails.

## 6.7 Doing the work before the device boots

The cheapest compile is the one done on the workstation. Two systems for microcontrollers show how far this can be taken.

The Moddable SDK's **preload** feature executes the top-level code of JavaScript modules during the build, on the build machine, and stores the resulting objects in flash, so that the device starts with those modules already initialized and their data out of RAM. MicroPython can likewise store precompiled bytecode, and since 2019 precompiled native code, in files produced on a workstation.

The project has one instance of this idea already, applied at boot instead of at build: the JavaScript prelude, which every QuickJS world used to compile from source, is now compiled once per boot and the result shared, which reduced that work from 627 ms to 198 ms.

For the typed applications bundled with the firmware, the same compiler can run under Node during the firmware build and place its output in the image. The compiler is deterministic, and the harness built for Experiment 3 already produces a module of exactly the size the device produces. A bundled application would then start from a prebuilt module whose key is checked at boot, and the on-device compiler would run only for source that was edited on the device.

## 6.8 A combined design

```mermaid
flowchart TD
    B["World starts"] --> K["Compute key: source, compiler, reactor, engine, import table"]
    K --> H{"Stored module with this key?"}
    H -->|"yes"| V["Verify module hash"] --> L["Load"]
    H -->|"no"| C["Compile on the device"] --> S["Store module, then record"] --> L
    F["Firmware build on workstation"] -.->|"prebuilt modules and keys for bundled apps"| H
```

With this design an unedited application costs a hash check and a load at boot. An edited application costs one compile, once. The on-device compiler remains fully exercised, because every edit runs it.

## 6.9 Key points

- The typed compiler runs at every boot and produces the same output each time. Editor pays 2.0 to 3.1 seconds for this.
- A cache key must cover every input that affects the output: source, compiler, reactor, engine and the reactor's function table. Hashing the inputs makes this automatic.
- Store the output first and the record last, and verify the output's hash when reading.
- WebAssembly can serve as a checked, portable distribution form from which native code is generated at load, as slim binaries did. Storing the native module is faster at boot when flash is available, as it is here.
- With compilation at every boot, native Editor repays its extra compile time after about 160 turns. With caching it is repaid once.
- Mixed mode is a response to native code size. A better backend makes it unnecessary.

## 6.10 Check your understanding

1. The typed compiler's source file is changed in a firmware update, and the application's source is unchanged. Should a cached module be reused? Explain using the list of inputs in section 6.3.
2. Why is the record written after the module, and what does the device find after a power loss between the two writes?
3. Using the figures in section 6.5, compute how many turns are needed to repay the extra cost of native compilation for Editor, and state how caching changes the conclusion.
4. Franz and Kistler reported that loading from slim binaries took almost twice as long as loading native binaries on their fastest machine. Give the reason they still considered the design worthwhile, and name the form that plays the slim binary's role on the handheld.
5. Which resource limit makes native code size a concern for Editor, and what are the two memory figures that show it?
6. An edit changes the body of one function out of 120 and no signature. With a per-function cache, what is recompiled and what additional step is still required?

## References

- [Cooper & Torczon 2023] K. D. Cooper, L. Torczon. *Engineering a Compiler*, 3rd edition. Morgan Kaufmann, 2023. §1.4, chapter 14.
- [Deutsch & Schiffman 1984] L. P. Deutsch, A. M. Schiffman. "Efficient implementation of the Smalltalk-80 system." *POPL*, 1984.
- [Dunkels et al. 2006] A. Dunkels, N. Finne, J. Eriksson, T. Voigt. "Run-time dynamic linking for reprogramming wireless sensor networks." *SenSys*, 2006.
- [Franz 1994] M. Franz. "Code-generation on-the-fly: a key to portable software." Doctoral dissertation, ETH Zürich, 1994.
- [Franz & Kistler 1997] M. Franz, T. Kistler. "Slim binaries." *Communications of the ACM* 40(12), 1997. Quotations are from the technical-report version, UC Irvine ICS TR 96-24, 1996.
- [Haas et al. 2017] A. Haas, A. Rossberg, D. L. Schuff, B. L. Titzer, M. Holman, D. Gohman, L. Wagner, A. Zakai, J. F. Bastien. "Bringing the web up to speed with WebAssembly." *PLDI*, 2017.
- [Levis & Culler 2002] P. Levis, D. Culler. "Maté: a tiny virtual machine for sensor networks." *ASPLOS*, 2002.
- [Mokhov et al. 2018] A. Mokhov, N. Mitchell, S. Peyton Jones. "Build systems à la carte." *ICFP*, 2018.
- Moddable SDK documentation, "Using XS Preload to Optimize Applications".
- MicroPython documentation, "Maximising MicroPython speed".
