# Answers to section 2.9 (Check your understanding)

## 1. Where does "Agenda responds 1.8 seconds after power-on" end?

Section 2.1 says no recorded interval in the project ends at the LCD. So the clock stops at the earlier event that the project actually records, which is either the end of the boot compile or the moment the nucleus accepts the application's first screen description — the article's "first response after boot" row. After that point the user is still waiting while the compositor lays out and draws the screen description and while the pixels are transferred to the LCD. That drawing and transfer time is explicitly listed in the "does not include" column, so it is not inside the 1.8 s. In short, the 1.8 s is a measure of a response the user cannot yet see.

Confidence: 3

## 2. Part is 20 percent of the total: largest possible speedup?

Take *p* = 0.2 and let *s* grow without bound, so the limit is 1 / (1 − *p*). That gives 1 / (1 − 0.2) = 1 / 0.8 = 1.25. So improving only that part can never make the whole more than 1.25 times faster, no matter how fast the part becomes. Concretely, if the total were 100 s and the part 20 s, making the part take 0 s would leave 80 s, a factor of 1.25.

Confidence: 5

## 3. Application took 2 ms of a 559 ms boot interval

The application's own work is about 2 / 559, or roughly 0.36 percent, of that interval. By the same limiting argument as question 2, making the application's code infinitely fast during boot could save at most about 0.36 percent of the wait, roughly 2 ms out of 559. The article's point is that the wait was mostly a scheduling and compositor problem: the file was ready, and the application was simply not given a turn. That is why changing the scheduler, not the code generator, removed about 340 ms from boot.

Confidence: 5

## 4. Which two numbers refute the garbage-collection hypothesis?

The two numbers are 85.9 s of garbage collection out of a 1,479.1 s frontend, i.e. 5.8 percent of compile time, and the 1.2 percent saving obtained by enlarging the heap. Both come from the CJI profile in section 2.4. A cost of 5.8 percent leaves almost nothing for GC tuning to win, and the measured 1.2 percent confirms that. The same section offers the replacement explanation: 88 percent of executed instructions on a workstation went to the numeric range analysis, so the time was in the analysis, not in memory management.

Confidence: 5

## 5. What gives confidence in Experiment 2's model, and what it does not establish

The check is that the script's walk, before being used to predict anything, first reproduces the current backend's instruction count, and that reproduced count matches the real emitted output for all 161 functions. That validates the walk over the WebAssembly against the backend that actually exists, function by function. It does not establish that a register-keeping backend can actually be built with the available registers, nor that its real output would match the model's 16,544 or 13,255 instructions. It also says nothing about run time on the device, since instruction count is not time. The article is explicit that this is a model, not an implementation, and defers the assumptions to Article 5.

Confidence: 4

## 6. Why ten runs in alternating order?

Two reasons are given in section 2.6. First, most device figures are a single run or three runs, and single runs cannot distinguish a small improvement from noise [Georges et al. 2007]. Second, incidental factors such as link order or environment size can bias a measurement by more than the effect being studied [Mytkowicz et al. 2009]. Alternating the order of the configurations cancels any systematic drift or ordering bias that would otherwise favour whichever configuration always runs first, and reporting the median and the range shows the spread rather than hiding it behind one average.

Confidence: 4
