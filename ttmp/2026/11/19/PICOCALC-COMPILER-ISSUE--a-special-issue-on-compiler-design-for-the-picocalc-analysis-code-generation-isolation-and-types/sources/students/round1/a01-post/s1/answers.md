# Answers to "Check your understanding"

1. Every world has a *turn budget*, the longest time one uninterrupted piece of a turn may run (Editor's is 200 ms on the device), and a world that overruns it is stopped and reported. So a long loop cannot run to completion in one go: the handler must save its progress, ask for a timer, and continue the work when the timer event arrives as a new turn. The other worlds keep running in the meantime, which is why the rule exists. The article states the rule but does not say what a timer request costs or how progress must be saved.

Confidence: 5

2. The three engines are QuickJS (JavaScript compiled to bytecode and interpreted), WAMR (WebAssembly interpreted), and Native (RV32 machine code loaded from an ELF file). Under QuickJS the interpreter confines the program, so a fault cannot reach other worlds. Under WAMR each world has its own linear memory and the interpreter checks every access, so again the fault is contained. Under Native there is no isolation at all: the code runs with firmware privileges and can read and write the whole address space, so a faulting or hostile program can damage everything.

Confidence: 5

3. (a) That `text` is a string at *every* call site in the program — the article says CJI "must establish that `text` is always a string at every call in the program". (b) What values `unit` can take, which "depends on every caller", so that `text.charCodeAt(at) === unit` can be compiled without a general, slow comparison. A third fact the text also names is that `at` never leaves the range of exactly representable integers, which is needed to compile `at < text.length` as an integer comparison.

Confidence: 4

4. The article's own worked example is the only reason it offers: for the body of `countUnit` the typed compiler emits 77 bytes of WebAssembly, and the optional lowering step turns those into 103 RV32 instructions. Machine code for the same program is several RV32 instructions per WebAssembly operation, so the loaded native image is larger — here 240,452 bytes against 88,255, i.e. 2.7 times, or 182 KiB more of the limit. The article states the size difference and the expansion but never says this is the cause of the Editor's total size, so the answer is inferred, not given. It does not discuss data sections or runtime glue.

Confidence: 3

5. The application world does not touch the screen. It sends the nucleus a description of its screen as a JSON document, in a message. The nucleus delivers that to the compositor world, which owns the screen, lays the description out and draws it. The compositor passes the drawing on to the display driver world, and the display driver world drives the LCD. Each of these steps is a message between worlds, handled as a turn.

Confidence: 5

6. What differs is the *output*, not the input: QuickJS produces bytecode for an interpreter, while CJI produces RV32 machine code from untyped source. The article puts it directly: "Compiling for an interpreter was never slow. What is expensive is producing *machine code from untyped source*." Producing machine code is expensive because CJI must first run whole-program type and range inference and repeat it after specializing library calls. The 37 ms figure is therefore not a fair speed comparison of the same job.

Confidence: 5
