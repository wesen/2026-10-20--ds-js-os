# Answers to "Check your understanding" (Article 1)

## 1. Why a world cannot run a long loop to completion, and what it must do instead

Every world has a turn budget: the longest time one uninterrupted piece of a turn may run, and Editor's budget on the device is 200 ms. A turn is the handling of one event, so a loop that runs longer than the budget would overrun the turn, and a world that overruns is stopped and reported while the other worlds continue. Instead, the handler must notice where it has got to, save its progress, ask for a timer, and carry on when the timer event arrives as a new turn. The article states this rule and its punishment clearly, but it does not say what would go wrong for the other worlds if the rule did not exist (see feedback, "Questions that the article did not let me answer").
Confidence: 4

## 2. The three engines and whether a fault can damage other worlds

The three engines are QuickJS, which interprets JavaScript compiled to bytecode at load time; WAMR, which interprets WebAssembly; and the native engine, which runs RV32 machine code loaded from an ELF file. Under QuickJS the interpreter confines the program, so a fault is contained in that world. Under WAMR each world has its own linear memory and the interpreter checks every access, so a fault is again contained. Under the native engine there is no isolation at all: the code runs with the firmware's own privileges, so a faulty program can read and write the whole address space and could damage other worlds.
Confidence: 4

## 3. Two facts CJI would have to find elsewhere

The typed compiler only needs the two declared parameter types, `text: string` and `unit: i32`, to compile the body as integer and string loads. Without annotations, CJI must first establish, from every call of `countUnit` in the program, that `text` is always a string, so that `text.length` can be compiled as a load of the 32-bit count and not as a call that inspects the value at run time. Second, it must know what `unit` can be, because that decides whether `text.charCodeAt(at) === unit` can be one machine comparison or must become a routine that inspects the kinds of its arguments. Both facts live in the callers, not in the body, which is why the article says "the facts needed to compile three lines are spread over the whole program".
Confidence: 4

## 4. One reason the native Editor is larger

The same code costs far more bytes as RV32 instructions than as WebAssembly, because the lowering expands each WebAssembly operation into several fixed 4-byte instructions. The article's own example shows the ratio: the `countUnit` body is 77 bytes of WebAssembly but 103 RV32 instructions, and 103 × 4 = 412 bytes, roughly 5.3 times as much. Applied to the whole application, that is why the native compiled size is 240,452 bytes against 88,255 bytes for WebAssembly (240,452 ÷ 88,255 ≈ 2.7, "nearly three times larger"). The article adds a second, separate reason, that the two engines account for memory differently, so not all of the 182 KiB difference in memory used (710 − 528 = 182) is code.
Confidence: 4

## 5. The path from an application to the LCD

The application does not touch pixels. It sends the compositor a description of its screen as a JSON document, and that message travels through the nucleus like every message between worlds. The compositor, which is itself a world written in JavaScript, lays the description out and draws it into pixels. It then hands the drawn pixels to the display-driver world, again through the nucleus. The display driver, a separate world, performs the final transfer of those pixels to the LCD.
Confidence: 5

## 6. What "hybrid" means and why the rows are not comparable

A hybrid is an application of which only some functions have been rewritten in the typed language, while the rest of the application is still C code inside its reactor. Files and Agenda are hybrids, so their 0.20/0.25 s and 0.52/0.72 s figures cover only the typed functions, whereas Editor is entirely typed and its 1.99/3.14 s covers the whole application. On top of that the CJI column was measured on the original JavaScript, not on the rewritten text, so the two columns of a row are not even the same program. The article says as much: "The rows are therefore not a controlled comparison", and the isolating experiments are in Article 3.
Confidence: 5
