# Answers to "1.8 Check your understanding"

**1.** A *turn* is the handling of one event by one world, and each world has a turn budget — Editor's is 200 ms on the device. A world that overruns its budget, or exceeds its memory limit, is stopped and reported while the other worlds continue, so a long loop would be killed part-way through. The program must therefore return from the handler inside the budget, having saved its progress, ask for a timer, and continue the work when the timer event arrives as a new turn.

Confidence: 5

**2.** QuickJS executes JavaScript, compiled at load time to bytecode and then interpreted, and the interpreter confines the program; a fault therefore stays inside that world. WAMR executes WebAssembly in an interpreter that gives each world its own linear memory and checks every access, so a bad access there also stays inside the world. Native executes RV32 machine code loaded from an ELF file with no isolation at all — it runs with firmware privileges, and the chip has no memory management unit, so a bad address can read or write anything in the address space, including other worlds' memory and the firmware's own state. This is why only the first two engines are marked as able to run untrusted source.

Confidence: 4

**3.** First, that `text` is a string at *every* call of `countUnit` in the program, so that `text.length` and `text.charCodeAt(at)` can be compiled as a field load and a bounds-checked load instead of a general property lookup on an unknown kind of value. Second, that `at` never leaves the range of exactly representable integers, so that `at < text.length` compiles as one integer comparison. The text also mentions a third: what `unit` can be at run time, which depends on every caller, because `text.charCodeAt(at) === unit` can only become a single machine comparison if `unit`'s possible types are known.

Confidence: 5

**4.** Because the same function takes several times more bytes as RV32 instructions than as WebAssembly. For `countUnit` the article gives 77 bytes of WebAssembly and 103 RV32 instructions; at 4 bytes each that is 103 × 4 = 412 bytes, about 5.3 times the WebAssembly. Scaled to the whole application the same effect explains most of the gap: 240,452 − 88,255 = 152,197 bytes ≈ 148.6 KiB of code, and the total gap is 710 − 528 = 182 KiB = 186,368 bytes, leaving about 33 KiB (34,171 bytes) unaccounted for. The article adds that the two engines account for memory differently, so not all of the 182 KiB is code, but it does not say how much is.

Confidence: 4

**5.** The application never touches the screen or the LCD; it sends the compositor world a JSON document describing its screen, and that message passes through the nucleus like every other message between worlds. The compositor lays the description out and draws it into pixels, and the drawn pixels are then transferred to the display driver world — again through the nucleus — which is the world that actually drives the LCD. So the path is: application → message via nucleus → compositor → pixels via nucleus → display driver world → LCD.

Confidence: 4

**6.** A hybrid is an application that has only been partly rewritten in the typed language: some of its functions are typed and compiled by the typed compiler, and the rest of the application remains hand-written C inside the application's reactor. So the typed-compiler figures for Files (0.20 s / 0.25 s) and Agenda (0.52 s / 0.72 s) measure only the typed functions, whereas their CJI figures (206 s, 523 s) measure the whole application, and the ratio mixes two different amounts of work. Editor is entirely typed, so its row (425 s against 1.99 s / 3.14 s) is the only one where both columns cover the whole application.

Confidence: 5
