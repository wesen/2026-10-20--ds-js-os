# Answers to "Check your understanding" (Article 2)

## 1

The interval named in section 2.1 is "First response after boot": it starts when the compile that runs during boot begins and it ends when the nucleus accepts the application's first screen description. So 1.8 s is measured from the start of the boot compile up to that acceptance, and it does not reach the screen. After it ends, the user still waits for the compositor to lay the description out and draw it, and for the finished pixels to be transferred to the LCD (the table's "Does not include" column lists both). The article stresses that no recorded interval in the project ends at the LCD, so nothing in the 1.8 s figure tells us when the user actually sees anything.

Confidence: 5

## 2

Working from section 2.2: 35.6 ms elapses before the application's handler is called, and 1.6 ms is spent inside the application (52.9 ms of CPU divided by 33 turns). The measured path is therefore 35.6 + 1.6 = 37.2 ms, and the application's share is 1.6 / 37.2 = 0.0430, that is 4.3 percent. Applying the limit 1 / (1 − p) with p = 0.043 gives 1 / 0.957 = 1.045, so even infinitely fast application code could speed up this path by at most a factor of 1.045 (about 4.5 percent). The share is an upper limit because the drawing time after the handler returns has never been measured and can only be added to the denominator, which pushes the true share down; the numerator cannot grow the same way, since the 1.6 ms is already a full measurement of the application's own turn.

Confidence: 4

## 3

The file was already available: the storage system had returned it, and Agenda itself needed only about 2 ms of work once it finally ran. The remaining 559 ms was Agenda waiting for its turn to be scheduled — the article puts it as "the application waited 559 ms for its turn". The compositor used the largest share, 293 ms of the 559 ms, which is a little over half (0.52), spread over 30 segments. As a result the project changed the scheduler so that the application's first turn runs ahead of other startup work; in a matched comparison of three boots per configuration this cut time to first response by about 340 ms in both builds (2.04 s to 1.70 s for WebAssembly, 2.13 s to 1.79 s for native).

Confidence: 5

## 4

The two numbers are the garbage-collection share and the size of the gain from removing it. In the 1,480 s on-device run of CJI compiling Agenda, garbage collection accounted for 85.9 s, which the table gives as 5.8 percent of the total, while the frontend as a whole took 1,479.1 s (99.9 percent). Separately, when the heap was enlarged the improvement was only 1.2 percent. A cost that is 5.8 percent of the run, and whose removal returns 1.2 percent, cannot be what makes the compile slow; the profile instead points at the frontend, and the workstation profile puts 88 percent of executed instructions in the numeric range analysis.

Confidence: 4

## 5

The check is that the model script first applies the current backend's rules and counts the instructions those rules would produce, then compares that count function by function with what the real backend actually emitted. The two agree for all 161 functions in the three applications (120 in Editor, 34 in Agenda, 7 in Files), which is evidence that the script parses and walks the WebAssembly the way the real backend does. What it does not establish is that the better backend is achievable: the predicted drop to 16,544 instructions for Editor (keeping temporaries in registers) or 13,255 (also keeping locals in registers) is a model, not an implementation. The article says plainly that Article 5 states its assumptions, so register pressure, spills and calling conventions could still eat part of the predicted gain. Agreement also says nothing about whether those instructions would run faster, only that they would not be emitted.

Confidence: 3

## 6

The first is 118 microseconds per token, at about 42,000 processor cycles on the device's 360 MHz clock, obtained as 1,988 ms ÷ 16,792 tokens; it measures the *whole* WebAssembly compile of Editor on the device, from source text all the way through, since 1,988 ms is the device time for the path that takes 29.9 ms on a workstation. The second is about 31 microseconds per token, or roughly 11,000 cycles, obtained by taking the workstation tokenizer figure of 8.0 ms, scaling it by the measured factor of 66 to about half a second per boot, and dividing by the same 16,792 tokens. That one measures only the tokenizer phase — the compiler's regular expression — and not parsing, type checking, emission or lowering. In both cases the article's conclusion is that these costs come from the interpreter running the compiler, not from the compiler's algorithms, which is why caching unchanged sources is the cheapest fix.

Confidence: 4
