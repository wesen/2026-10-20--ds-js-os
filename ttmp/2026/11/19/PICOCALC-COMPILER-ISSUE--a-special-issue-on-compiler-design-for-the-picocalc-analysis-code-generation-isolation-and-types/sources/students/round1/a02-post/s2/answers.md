# Answers to section 2.9 (Check your understanding)

## 1. Where does "Agenda responds 1.8 seconds after power-on" end?

Section 2.1 says every interval is defined by its two end events, and that no interval in the project ends at the LCD. The only "after power-on" interval the table offers is *first response after boot*, which starts when the boot compile begins and ends when the nucleus accepts the application's first screen description. So the 1.8 s ends at the moment the nucleus accepts Agenda's first screen description, not when anything appears on screen. The user still waits afterwards for the compositor to lay out and draw the screen description and for the pixels to be transferred to the LCD. The article is explicit that this last stretch, key press or boot to changed pixels, has never been measured.

Confidence: 3

## 2. Largest speedup when a part is 20 percent of the total

With *p* = 0.20 and *s* growing without bound, the limit is 1 / (1 − *p*) = 1 / (1 − 0.20) = 1 / 0.80 = 1.25. So the whole can be made at most 1.25 times faster, that is 25 percent faster, and the total time can never fall below 80 percent of the original. For comparison, a tenfold improvement of that part gives 1 / (0.8 + 0.02) = 1.22, so almost all of the available gain arrives early. This is the article's "10 percent gives at most 1.11" example with the fraction doubled.

Confidence: 5

## 3. What the 2 ms of application work in the 559 ms boot interval shows

The application's own work is 2 / 559 ≈ 0.36 percent of the interval, so making it infinitely fast would shorten boot from 559 ms to about 557 ms, a speedup of 559 / 557 ≈ 1.004. Speeding up Agenda's code is therefore worthless for this interval: the 559 ms is almost all waiting for the application's turn, and more than half of it is the compositor (293 ms). The measurements say the same thing concretely, because the gain that was actually obtained, about 340 ms, came from a scheduler change (running the first turn ahead of other startup work), which no compiler improvement could have found. The lesson is to fix the queue before the code that runs after the queue.

Confidence: 5

## 4. The two numbers that refute the garbage-collection hypothesis

The first is the 5.8 percent figure: 85.9 s of garbage collection inside a 1,479.1 s frontend, which is itself 99.9 percent of the compile. The second is the result of enlarging the heap, which saved only 1.2 percent. Together they show that even eliminating collection entirely would barely move compile time, and that the cost sits elsewhere. The article's supporting number is the workstation profile that attributes 88 percent of all executed instructions to a single analysis, the numeric range analysis.

Confidence: 5

## 5. What the check in Experiment 2 establishes, and what it does not

The counting script first reproduces the *current* backend's instruction count, and that count matches the real emitted output for all 161 functions. If the walk misread the WebAssembly, skipped instructions or miscounted stack access, it could not land on the existing total function by function, so the walk over the input is trustworthy. What this does not establish is the prediction: that a backend keeping temporaries (and then locals) in registers can actually reach 16,544 or 13,255 instructions. It says nothing about register pressure, spills, calling conventions, or extra instructions a real allocator would need, it is not an implementation, and no time was measured on the device. The article itself says the assumptions are deferred to Article 5.

Confidence: 4

## 6. Why ten runs in alternating order

Most device figures are a single run or three runs, and a single run cannot separate a small improvement from noise (Georges et al. 2007). Measurement bias from incidental factors such as link order or environment size can be larger than the effect being studied (Mytkowicz et al. 2009), so the configuration that happens to run second, or in a particular layout, can look better for reasons that have nothing to do with the change. Ten runs give a median and a range instead of one number, so the reader can see the spread. Alternating the order stops slow drift (warm-up, temperature, ordering) from being credited to whichever configuration ran later, which is the same defence the compiler experiments already use with interleaved control runs.

Confidence: 4
