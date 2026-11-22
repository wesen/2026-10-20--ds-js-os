# Answers — "2. Measuring Before Optimizing"

1. I cannot know this without the article, since section 2.1 defines the endpoints of the measurement and I have not been given it. Reasoning about what the answer would have to look like: the 1.8 s almost certainly ends at the moment the application is *usable* — i.e., it has taken over the screen and will accept the first keypress — rather than at the moment the machine finishes all start-up work. The thing the user still waits for after that point would be the first substantive result: the first screen painted with real data, the database/index open, or the first response to an actual keystroke.
Confidence: 2

2. Amdahl's law: if a fraction p = 0.20 is improved by a factor s, the total speedup is S = 1 / ((1 - p) + p/s). Taking the limit s → ∞ gives the best case S = 1 / (1 - p) = 1 / 0.80 = 1.25. So the largest possible whole-system speedup from optimizing only that part is 1.25×, i.e. roughly a 20% reduction in total time (559 ms would become about 447 ms). No amount of work inside that part can beat this bound.
Confidence: 5

3. 2 ms out of 559 ms is about 0.36% of the interval. Even an infinitely fast application — zero time at all — could only shorten boot by those 2 ms, so optimizing the application's own code during boot is worth at most a fraction of a percent. The conclusion the article is driving at is that the remaining ~557 ms lives outside the application, in the OS, drivers, device initialization, or firmware, and that is where measurement and effort must go. Hand-tuning application code at this stage would be effort spent on the wrong 99.6%.
Confidence: 4

4. I cannot know the two specific numbers without the article. Reasoning about what would refute a garbage-collection hypothesis: the numbers have to be a comparison between time attributable to GC and the size of the delay being explained. A plausible pair is total GC pause time (something like 10–20 ms) against the observed stall (on the order of a second), plus the number of collections. If GC accounts for a percent or less of the delay, the hypothesis is dead regardless of how plausible it sounded.
Confidence: 2

5. I cannot know the exact check without the article. A model that walks the code can be validated by counting: compare the model's predicted sequence or event counts (number of calls, order of module initialization, bytes read) against an instrumented run of the real system, and show they agree. What that check does *not* establish is cost — a structurally correct walk says nothing about whether the per-step times assigned in the model match real hardware, so the model can predict *where* time goes without proving *how much* time goes there.
Confidence: 2

6. Alternating the configurations (A, B, A, B, …) rather than running all of A then all of B means any drift in the machine over the session — warming caches, thermal throttling, clock scaling, growing or shrinking free memory, background tasks — lands on both configurations instead of being attributed to one of them. Repeating at least ten times gives a spread rather than a single number, so a difference in medians can be separated from run-to-run noise and an outlier run can be recognized as an outlier. The point is not precision for its own sake: a one-run-each comparison on a device this variable can manufacture a speedup that does not exist.
Confidence: 4
