# Answers to "Check your understanding" (Article 1)

## 1. Why a world cannot run a long loop to completion, and what it must do instead

A world is only ever given one event ("turn") at a time, and the longest uninterrupted run it may take is its **turn budget** — 200 ms for the Editor on the device. If it runs longer than that budget (or goes over its memory limit), the nucleus stops the world and reports it, and the other worlds keep running. So a handler that cannot finish inside one budget must save its progress, ask the nucleus for a timer, and resume when the timer event arrives. The reason is that all worlds share two cores and one scheduler; a world that never yields would starve the compositor, the drivers and everything else.

Confidence: 5

## 2. The three engines and whether a fault can damage other worlds

The three engines are **QuickJS** (JavaScript, precompiled to bytecode at load time and interpreted), **WAMR** (WebAssembly, interpreted, one linear memory per world, every access checked), and **native** (RV32 machine code loaded from an ELF file). In QuickJS the interpreter itself confines the program, and in WAMR the interpreter checks every memory access, so a fault is caught inside that world and is reported against that world only. The native engine has no isolation at all: the code runs with the same privileges as the firmware, and there is no MMU, so nothing stops it from writing over another world's memory or the kernel. Only the first two engines confine the program.

Confidence: 4

(The article states the isolation column directly but never says in so many words "the other worlds continue" for an interpreter fault; that is my inference from the turn-budget paragraph.)

## 3. Two facts CJI would have to find elsewhere in the program

First, that `text` is always a string at every call site in the whole program — without that, `text.length` cannot be compiled as a 32-bit load and `text.charCodeAt` cannot be compiled as a bounds check plus a 16-bit load. Second, what `unit` can be, which depends on every caller, because that decides whether `text.charCodeAt(at) === unit` can be a plain integer compare instead of a general and slow comparison. A third fact CJI also needs from elsewhere is that `at` never leaves the range of exactly representable integers. All of these live outside the function, which is why the same three lines take minutes rather than a single pass.

Confidence: 5

## 4. One reason the native Editor is larger than the WebAssembly one

Working from the table: 240,452 ÷ 88,255 ≈ 2.72, so the compiled native image is about 2.7 times the WebAssembly, and for the in-memory figure 710 ÷ 528 ≈ 1.34, so the native session uses about a third more reserved RAM. The one explanation the article actually gives is size expansion during lowering: the 77 bytes of WebAssembly emitted for `countUnit` become 103 RV32 instructions, so the same program becomes more and wider instructions when it stops being stack-machine bytecode. A plausible second cause is that WAMR is an interpreter that carries the checking machinery, whereas the lowered code has to spell its object layout and its checks out in bytes — but the article never says so, so I am guessing at that part.

Confidence: 2

## 5. The path from an application to the LCD

The application world does not draw pixels. It sends a JSON document describing its screen to the nucleus, which checks the send against the world's claims and delivers it as a turn — one event — to the compositor world. The compositor owns the screen: it lays out and draws the description, and hands the result to the display driver world through the nucleus, and that driver world talks to the LCD. So the chain is application → nucleus → compositor → nucleus → display driver → LCD, with each hop being a message and a turn in the receiving world.

Confidence: 4

## 6. What is different about what QuickJS and CJI produce

QuickJS produces **bytecode** for an interpreter: it translates 16,326 bytes of Agenda source in 37 ms, and the interpreter then does the type work and the dispatch at run time, slowly and safely. CJI produces **RV32 machine code** with no interpreter behind it, and to do that it must first infer types and ranges over the whole program and specialize library calls, repeating the inference until the facts settle. The expensive part is not "compiling" in general but turning *untyped* source into *machine* code, because every type fact has to be proven globally instead of being checked one instruction at a time at run time by the interpreter.

Confidence: 4
