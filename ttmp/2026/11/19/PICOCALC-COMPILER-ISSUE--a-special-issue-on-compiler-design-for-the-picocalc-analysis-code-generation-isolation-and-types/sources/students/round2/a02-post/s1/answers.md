# Answers to 2.9 Check your understanding

1. The interval starts when the compile that runs during boot begins and ends when the nucleus accepts the application's first screen description, so 1.8 s covers the boot compile plus the application's wait for its first turn, and stops at acceptance of a description rather than at changed pixels. After that end point the user still waits for the compositor to lay the screen description out and draw it, and then for the finished image to be transferred to the LCD; section 2.1 notes that no recorded interval in the project ends at the LCD.
   Confidence: 5

2. Working: the model has 35.6 ms before the application runs and 1.6 ms of application CPU (52.9 ms / 33 turns = 1.6 ms), so the measured path is 35.6 + 1.6 = 37.2 ms and the application share is 1.6 / 37.2 = 0.043, that is 4.3 percent. With p = 0.043 the Amdahl limit is 1 / (1 − 0.043) = 1.045, so faster application code could speed the path up by at most about 4.5 percent. The share is an upper limit because the drawing time after the handler returns is not measured, and that time can only make the denominator larger, which can only make the share smaller.
   Confidence: 5

3. Agenda was waiting for its turn: once it ran it needed only about 2 ms of the interval, so nearly all 559 ms passed while other worlds ran. The compositor used the largest share, 293 ms in 30 segments, which is more than half of the total. As a result the project changed the scheduler so that the application's first turn runs ahead of other startup work; in a matched comparison of three boots per configuration the time to first response fell from 2.04 s to 1.70 s for the WebAssembly build and from 2.13 s to 1.79 s for the native build, about 340 ms in each case.
   Confidence: 5

4. The two numbers are 85.9 s of garbage collection, which is only 5.8 percent of the 1,479.1 s frontend inside a 1,480 s build, and the 1.2 percent saved by enlarging the heap. If garbage collection were the cause, removing it entirely could not explain a 1,480 s compile, and the heap experiment showed almost no effect. Instead, 99.9 percent of the time sits in the frontend as a whole, and on a workstation 88 percent of executed instructions belong to a single analysis, the numeric range analysis.
   Confidence: 4

5. The model script first applies the current backend's own rules and compares, function by function, the number of instructions it counts with the number the real backend emitted; the two agree for all 161 functions of the three applications (120 in Editor, 34 in Agenda, 7 in Files). That shows the script reads the same WebAssembly the real backend compiles and understands its rules, so the counts it produces under changed rules are credible. It does not establish that a real backend keeping temporaries in registers can actually reach the predicted 16,544 or 13,255 instructions, because it is a model with assumptions stated only in Article 5, and it says nothing about speed, only about instruction counts.
   Confidence: 4

6. The first cost is 118 microseconds per token: 1,988 ms divided by 16,792 tokens, which at 360 MHz is about 42,000 cycles, and it measures the whole WebAssembly compile of Editor per token on the device. The second is 31 microseconds per token, about 11,000 cycles, which measures the tokenizer's regular expression alone; working: the workstation tokenizer needs 8.0 ms, times the factor of 66 gives about 528 ms, roughly half a second per boot, and 528 ms / 16,792 = 31 µs. Note that the second figure is an extrapolation from the workstation measurement using the whole-path speed ratio, not a direct device measurement.
   Confidence: 4
