# Answers: "2. Measuring Before Optimizing"

## 1
I cannot know this without the article, but the point of defining the interval in section 2.1 is almost certainly that "responds 1.8 seconds after power-on" ends at the earliest point the program can act — not at the point the user is served. So the interval would end when the application is entered / its event loop starts and it can accept a keypress, or when the first frame is handed to the display. After that the user still waits for the application's own data load and full render, so the screen the user is looking at is painted well after the measured interval. The claim is therefore a lower bound on what the user experiences, not a statement about it.

Confidence: 2

## 2
A 20 percent share means 0.8 of the total time is untouched, so even an infinite speedup of that part leaves 0.8 of the original time: speedup = 1 / ((1 - 0.2) + 0.2 / ∞) = 1 / 0.8 = 1.25. The largest possible speedup of the whole is 1.25 times, an 80 percent reduction of the total time at absolute best. Even a 4x improvement of the part only gives 1 / (0.8 + 0.05) = 1.18, so the whole-system payoff collapses fast. This is Amdahl's law and no amount of cleverness in that part can beat 1.25.

Confidence: 5

## 3
It says such optimization is nearly worthless for boot: 2 ms out of 559 ms is about 0.36 percent of the interval, so making the application's boot code instantaneously fast would save about 2 ms, i.e. turn 559 ms into roughly 557 ms. A user cannot perceive that, and the measurement is far below the noise you get from a single reboot. The correct conclusion is to spend nothing on application code for boot and go measure the other ~557 ms. That is the whole argument of the article: the profile names where the time is before anyone optimizes.

Confidence: 4

## 4
I cannot know these two numbers without the article, but they would have to be (a) the measured garbage-collection time during boot, which must come out small — single-digit milliseconds against a 559 ms interval — and (b) the amount of allocation or the number of collections, which must come out far below whatever threshold would make collection frequent. Either number alone is weak; together they say collection ran rarely and cost almost nothing, so it cannot explain hundreds of milliseconds. Notice the asymmetry: the hypothesis is refuted by magnitudes, not by a single measurement, which is the point of measuring before optimizing.

Confidence: 2

## 5
I cannot know the specific check without the article, but the only credible one is an independent cross-check of the same walk: run the model and compare its counts (of call sites, nodes, or invocations) against something obtained a different way — an instrumented run of the real interpreter, an independent count over the source, or hand-counted known inputs. Agreement on small cases that can be verified by hand gives confidence the walk visits what it claims to visit. What that does not establish is that the real system behaves like the model: a model produces predicted costs, not wall-clock time, so it cannot show that a speedup is achievable, that the optimizer will not lose the benefit to something else, or that the gain survives on the actual hardware.

Confidence: 2

## 6
Ten runs give you a distribution rather than a single number, so you can see spread, drop the first run if it is a warm-up artifact, and report a median instead of a lucky best case. Alternating order (A, B, A, B, ...) protects against drift: battery voltage falling, the device warming up, caches and filesystem state settling, all shift timings monotonically, and if you ran all of A then all of B that drift would be charged to B. Interleaving makes any slow change hit both configurations roughly equally, so a difference you see is attributable to the change rather than to the order. With ten alternating pairs you can also tell a real gap from run-to-run noise.

Confidence: 4
