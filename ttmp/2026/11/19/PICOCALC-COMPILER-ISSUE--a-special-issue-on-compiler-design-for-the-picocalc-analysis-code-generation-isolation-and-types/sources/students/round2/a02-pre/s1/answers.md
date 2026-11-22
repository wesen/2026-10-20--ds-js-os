# Answers — "2. Measuring Before Optimizing"

**1.** I cannot know this without the article: the table in section 2.1 is not given to me, so I cannot say exactly which checkpoint ends the 1.8 s interval. By construction, the interval that starts at "boot compile begins" and lasts 1.8 s must end at the next named checkpoint in that table — most plausibly the moment the application's first response is actually produced, i.e. the end of the first compile plus whatever hand-off follows it. Plausibly the user still waits for rendering, a first frame/paint, or the first interpreted/uncached execution after the compile; the table would name one of these.

Confidence: 1

**2.** I cannot know this without the article, since section 2.2's two measurements are unknown to me. The arithmetic, however, is fixed: if the two measurements are total key-press path time `T` and application-code time `A`, the share is `A/T`, and the largest possible speedup from making application code infinitely fast is `T/(T−A)`; equivalently, cutting `A` in half gives only a `T/(T−A/2)` improvement. The share is an upper limit because it attributes all of the measured application-side time to code the project could change, while some of it is unavoidable work, dispatch overhead, or noise that no rewrite removes — so the realizable gain is at most, never more than, that bound.

Confidence: 2

**3.** I cannot know this without the article: the boot profile of section 2.3, the "worlds" taxonomy, and the 559 ms figure are all specific to a report I have not read. What I can reason is that the answer will have three parts matching the question: the concrete activity Agenda was performing during the 559 ms, the single "world" (likely a phase or subsystem such as filesystem, parser, type system, GC, or native modules) that dominated, and the change the project then made. Because the question says the change came "as a result", the profile most likely revealed a dominant, addressable cost — e.g. eager work that could be deferred or cached.

Confidence: 1

**4.** I cannot know this without the article, so I cannot quote the two numbers from section 2.4. The reasoning that would refute a GC hypothesis is predictable, though: GC is refuted when (a) total GC time is a small fraction of the total measured time, leaving the bulk unexplained, and (b) allocation counts or heap totals are shown to be modest, so the pauses cannot be attributed to collection pressure. Any pair of numbers that sum to far less than the observed slow time, while the problem persists, shifts blame away from GC.

Confidence: 2

**5.** I cannot know this without the article, so I cannot name the exact check used for Experiment 2's script. The natural check is a cross-validation: the script's extracted numbers are compared against an independently obtained value — a hand count on a small sample, a second implementation, or a value the compiler itself reports — and they agree. What such a check does not establish is that the script measures the *right* thing, or that its output generalizes: agreement on a sample proves consistency of parsing, not correctness of the experiment's premise, its instrumentation boundaries, or its behavior on other inputs.

Confidence: 2

**6.** I cannot know this without the article, so the two per-token costs on the device must come from section 2.4. Structurally, when a compiler is reported with two per-token costs, the usual pair is a *wall-clock* cost (elapsed time per token including I/O, scheduling, and pauses) and a *CPU-only* or *self* cost (time actually spent executing compiler work, excluding waiting). The first measures what the user experiences per token; the second measures how much compute the work itself demands, and the gap between them is where overhead lives.

Confidence: 2
