# Answers to "Check your understanding"

## 1.

A world cannot run a long loop to the end because every world has a turn budget, the longest time one uninterrupted piece of a turn may run; for Editor on the device that budget is 200 ms. A turn is only the handling of one event (a key press, a timer, a message, or the completion of earlier work), so the budget is attached to that one event, not to the whole job. If a world overruns its budget or its memory limit, the nucleus stops it and reports it while the other worlds keep running. Instead of looping, the handler must save its progress, ask for a timer, and resume when the timer event arrives.

Confidence: 5

## 2.

The three engines are QuickJS (JavaScript, compiled at load time to bytecode and then interpreted), WAMR (WebAssembly, interpreted), and Native (RV32 machine code loaded from an ELF file). With QuickJS the interpreter confines the program, so a fault in one world cannot damage another; the article calls this the slowest engine. With WAMR each world gets its own linear memory and the interpreter checks every access, so again a fault stays inside that world; it is 2–6 times slower than native in the measurements here. Native code has no isolation at all: it runs with firmware privileges, there is no memory management unit, and the code can read or write the whole address space, so a faulty native world can damage the others.

Confidence: 5

## 3.

The compiler of the typed version already knows from the annotation that `text` is a `string` and `unit` is an `i32`, so `text.length` is a plain 32-bit load and the comparison is an integer comparison. CJI, given `function countUnit(text, unit)`, must first establish that `text` is a string at *every* call site in the whole program; that fact lives in the callers, not in this function. Second, it must know what `unit` can be, which again depends on every caller, because otherwise `text.charCodeAt(at) === unit` needs a general and slow comparison. (A third fact the article also names is that `at` never leaves the range of exactly representable integers, needed for the `at < text.length` comparison.)

Confidence: 5

## 4.

Working: 240,452 ÷ 88,255 ≈ 2.72, so the native image is about 2.7 times the WebAssembly image, which matches the article's "nearly three times larger". Note first that the article gives the sizes but never states the cause, so the reason below is inferred from its own numbers rather than read off a sentence. The clearest inference is the one in §1.4: 77 bytes of WebAssembly became 103 RV32 instructions in the lowering, and RV32 instructions are wide fixed-size words while WebAssembly is a denser bytecode, so the same program takes many more bytes as machine code. The native version must also carry everything the interpreter would otherwise supply, and its larger code counts against the same 768 KiB limit, leaving only 58 KiB free against 528 KiB used in the WAMR case.

Confidence: 3

## 5.

The application does not draw. It builds a JSON document describing its screen and sends it as a message, and the nucleus delivers that message to the compositor world, which owns the screen. The compositor lays out and draws the description, then passes the result on to the display driver world. The display driver is the last world in the chain before the LCD. So the path is: application → (JSON screen description, via the nucleus) → compositor → display driver → LCD; the five-box diagram in §1.2 draws exactly this chain.

Confidence: 4

## 6.

QuickJS does not produce machine code; it compiles the 16,326-byte Agenda source to bytecode for an interpreter it already has, and the interpreter then pays for generality at run time. CJI produces native RV32 machine code from unannotated source, which first requires whole-program type and range inference, then specialization of library calls with inference repeated, as the flowchart shows. The expensive part is therefore not translating text but collecting the facts about the whole program that make machine code legal: for Files, 262 s originally and 206 s after optimization, and for Agenda 1,475 s and then 523 s, against 37 ms for the bytecode step. In other words, compiling for an interpreter was never slow, and producing machine code from untyped source is what costs seconds versus minutes.

Confidence: 5
