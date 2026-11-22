# Answers — Article 2, "Measuring Before Optimizing"

## 1

The interval ends when the nucleus accepts the application's first screen description — that is the row "First response after boot" in the section 2.1 table, whose start event is the begin of the boot compile. "1.8 seconds after the boot compile begins" is therefore not a time to pixels. After that moment the user is still waiting for the compositor to lay out and draw the screen description, for the drawing to be transferred to the LCD, and for the panel to actually change: the table's "does not include" column names compositor layout and drawing and transfer to the LCD, and section 2.1 says no recorded interval ends at the LCD. So key-press-to-changed-pixels is still unmeasured.

Confidence: 5

## 2

The two numbers are 35.6 ms from the compositor receiving a key to the application handler being called (no application code inside), and 1.6 ms of CPU inside the turn (52.9 ms over 33 turns). The measured path is 35.6 + 1.6 = 37.2 ms, so the application share is p = 1.6 / 37.2 = 0.0430, about 4.3 percent. The bound from Amdahl's law is 1 / (1 − p) = 1 / 0.957 = 1.045, so perfectly fast application code buys at most a factor of 1.045, i.e. about 4.5 percent. It is an upper limit because the compositor's drawing time after the handler returns is missing from the denominator; adding it can only increase the total, which lowers the share and therefore lowers the achievable speedup.

Confidence: 5

## 3

Agenda was waiting for its turn: the file had already been returned by the storage system, the nucleus attributed the following 559 ms to other worlds, and Agenda itself needed only about 2 ms once it finally ran. The compositor used the largest share, 293 ms of 559 ms (about 52 percent), spread over 30 segments, ahead of the keyboard driver (81 ms), the display driver (32 ms) and all other worlds together (123 ms). As a result the project changed the scheduler so that an application's first turn runs ahead of other startup work; in a matched comparison of three boots each, the time to first response fell from 2.04 s to 1.70 s (WebAssembly build) and from 2.13 s to 1.79 s (native build), roughly 340 ms in both cases.

Confidence: 4

## 4

The first number is that garbage collection was 85.9 s of the 1,480 s run, only 5.8 percent of the compile time, sharing a table with a frontend at 99.9 percent. The second is that enlarging the heap saved just 1.2 percent, which is what one would expect if collection were a minor cost and not the dominant one. The replacement explanation the article offers is a workstation profile in which 88 percent of executed instructions fall in the numeric range analysis, and the further fact that link, assemble and hash take about 1.2 s (0.08 percent).

Confidence: 4

## 5

The check is that the counting script first applies the current backend's rules to the same WebAssembly and compares its predicted instruction count, function by function, with the number the real backend emitted; the two agree for all 161 functions (120 in Editor, 34 in Agenda, 7 in Files). That establishes the script reads the WebAssembly and models the existing rules faithfully. It does not establish that a register-keeping backend could actually be written to emit those counts, nor that fewer instructions mean proportionally less time — the article calls it "a model, not an implementation" and defers its assumptions to Article 5. So the 2.66× and 3.32× figures are predictions about instruction counts, not measured speedups.

Confidence: 4

## 6

The first cost is for the whole WebAssembly compile: 1,988 ms on the device divided by 16,792 tokens gives 118 microseconds per token, which at 360 MHz is about 42,000 processor cycles — this covers every phase, tokenizing through linking into the reactor. The second is for tokenizing alone: the workstation tokenize time of 8.0 ms scaled by the device-to-workstation factor of 66 gives about half a second per boot, that is 31 microseconds and 11,000 cycles per token (my check: 8.0 ms / 16,792 = 0.48 µs per token, times 66 = 31 µs, times 360 MHz ≈ 11,000 cycles). The article uses the gap between the two to argue that the compiler's own speed is set by the interpreter running it, so the cheapest win is not to run the compiler when the source has not changed.

Confidence: 3
