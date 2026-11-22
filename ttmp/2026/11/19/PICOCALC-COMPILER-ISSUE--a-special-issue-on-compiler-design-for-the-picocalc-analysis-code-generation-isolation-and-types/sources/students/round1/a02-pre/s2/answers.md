# Answers

1. I cannot know this without the article, but from the phrasing the interval most likely ends at the moment the
   application's first screen becomes visible and accepts input, not when it becomes usable. A "power-on to
   responsive" figure is almost always measured from the reset/power rail event to the first frame or first
   handled key event. Whatever that stopping point is, the user still waits afterwards for the content that makes
   the screen useful — loading a file, mounting storage, parsing a saved document, or filling in the list. The
   point of section 2.1 is presumably that the headline number stops at the technical boundary the measurement
   chose, while the user's wait continues past it.
   Confidence: 2

2. By Amdahl's law the best case is making that part take zero time, so the whole runs in the remaining 80
   percent: speedup = 1 / (1 - 0.2) = 1 / 0.8 = 1.25. Equivalently, the total drops from 100 to 80 units, which is
   20/100 = 20 percent less time, i.e. a 1.25x speedup and a ceiling no optimization of that part can pass. This
   is why a part that is only a fifth of the total is a weak optimization target no matter how clever the fix is.
   Confidence: 5

3. About 2 ms out of 559 ms is roughly 0.36 percent of the boot interval, so even making the application's own
   work infinitely fast would save at most 2 ms, under half a percent. The practical value of optimizing
   application code during boot is therefore close to nothing: the work the application does is not where the
   time goes. The profile is implicitly saying the cost lives in things the application merely triggers or waits
   for — kernel and driver initialization, storage reads, interpreter or runtime startup, display setup. The
   correct response is to attack those, or to move work out of the critical path, rather than to micro-optimize
   the 2 ms.
   Confidence: 4

4. I cannot know this without the article, but two numbers would be enough to dismiss garbage collection: the
   total time attributed to GC, and the amount of memory allocated (or the heap size) over the interval. If GC
   accounts for only a small percentage of the 559 ms, or if the bytes allocated during boot are a tiny fraction
   of the heap, then the collection story cannot explain the delay. A refutation of this shape would read like
   "GC paused for 12 ms out of 559 ms, and peak heap use was 3 MB of an available 30 MB", which rules out both
   the time and the pressure that would force repeated collections.
   Confidence: 2

5. I cannot know this without the article, but the usual and cheapest check for a static walk over code is
   agreement with an independent count: run the model on a case where the true answer is known or where a real
   instrumented run can be compared, and confirm the totals match (for example node or operation counts on a
   small file, or the ratio between two input sizes). Agreement on totals is what gives confidence the walk
   visits the right structure and does not double-count or skip branches. That check does not establish that the
   model's per-visit cost resembles real hardware cost, nor that the code walked is the code that actually runs —
   so it supports relative comparisons, not predicted milliseconds.
   Confidence: 2

6. Repeated runs are needed because single measurements on real devices are dominated by noise and drift:
   caches and page cache state, thermal throttling, battery or clock state, background services, and first-run
   effects all shift between runs. Alternating the order (A, B, A, B, ...) instead of running all A and then all B
   ensures that any drift over the session is shared by both configurations rather than silently credited to
   whichever ran later. Ten or more repetitions then give a distribution, so the comparison can rest on a median
   and spread and a difference can be judged against the run-to-run variation instead of against one lucky sample.
   Confidence: 4
