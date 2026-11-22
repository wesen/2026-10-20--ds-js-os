# Answers to "Check your understanding" (Article 1)

## 1. Why a world cannot run a long loop to completion

A turn is the handling of one event, and every world has a turn budget — Editor's is 200 ms on the device. A world that overruns its budget is stopped and reported, while the other worlds continue, so a single long loop would simply be cut off before it finished. The program must therefore save its progress, ask for a timer, and resume when the timer event arrives as a later turn. The work is split by the program itself, not by the scheduler.

Confidence: 5

## 2. The three engines and damage from a fault

QuickJS interprets JavaScript bytecode, and the interpreter confines the program, so a fault stays inside that world. WAMR interprets WebAssembly, where each world has its own linear memory and every access is checked, so again a fault is contained. The native engine runs RV32 machine code from an ELF file with no isolation at all: since there is no memory management unit, that code "can read and write the whole address space unless the software prevents it", so a bad write could reach other worlds or the kernel.

Confidence: 4

## 3. Two facts CJI needs from elsewhere

First, that `text` is always a string at every call in the program; without that, `at < text.length` cannot be compiled as an integer comparison. Second, what `unit` can be, which depends on every caller; without it, `text.charCodeAt(at) === unit` cannot become one machine comparison rather than a call to a routine that inspects value kinds at run time. A third fact the article also mentions is that `at` never leaves the range of exactly representable integers, which is a range-inference result over the whole program.

Confidence: 4

## 4. Why the native version is larger

Because RV32 machine code is bulky next to WebAssembly: the running example takes 77 bytes of WebAssembly but 103 RV32 instructions at 4 bytes each, which is 412 bytes — more than five times as large. Scaling that up over a whole application explains most of the growth. The article adds a caution: the two engines account for memory differently, so not all of the 182 KiB difference (710 − 528) is code.

Confidence: 4

## 5. Path from an application to the LCD

The application world does not touch pixels. It sends the compositor world a description of its screen as a JSON document, and, like all messages between worlds, that passes through the nucleus. The compositor, itself a world, lays the description out and draws it. The drawn pixels then go through the nucleus to the display driver world, a separate world, which transfers them to the LCD.

Confidence: 5

## 6. What "hybrids" means and why the rows are not comparable

It means that Files and Agenda have only had some of their functions rewritten in the typed language, while the rest of their code remains C inside their reactors — so the typed-compiler times of 0.20 s and 0.52 s cover only the typed functions. Editor, by contrast, is entirely typed, and its 1.99 s / 3.14 s cover the whole application. In addition, each application was rewritten in the typed language, so the two columns are not even the same text. The ratios across rows therefore measure different amounts of work, which is why the article says the table only fixes the scale and Article 3 holds the controlled experiments.

Confidence: 5
