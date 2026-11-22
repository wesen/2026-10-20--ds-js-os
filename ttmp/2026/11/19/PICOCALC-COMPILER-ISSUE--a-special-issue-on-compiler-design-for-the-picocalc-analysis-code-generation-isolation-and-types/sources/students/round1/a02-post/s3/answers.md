# Answers to section 2.9 (Check your understanding)

**1.** Section 2.1 says every recorded interval ends when the nucleus accepts the application's
screen description, or earlier — none ends at the LCD. So "responds 1.8 seconds after power-on"
should be read as the "first response after boot" interval: it ends when the nucleus accepts
Agenda's first screen description. The user still waits for the compositor to lay out and draw
that description and for the transfer to the LCD, i.e. for pixels to change. The article never
defines the phrase "responds after power-on", so I had to map it onto the table myself.
Confidence: 4

**2.** With *p* = 0.2 and the improved part made *s* times faster, speedup = 1 / ((1 − *p*) + *p*/*s*)
= 1 / (0.8 + 0.2/*s*). Letting *s* → ∞ gives the limit 1 / (1 − *p*) = 1 / 0.8 = 1.25. So the whole
system can become at best 1.25 times faster — a 25 percent gain — even if that part takes no time
at all. Improving it only 2× would give 1 / (0.8 + 0.1) = 1.11, which shows how fast the returns
fall off.
Confidence: 5

**3.** The application's own 2 ms is 2 / 559 ≈ 0.36 percent of the interval, so speeding application
code up to infinity would speed boot up by at most 1 / (1 − 0.0036) ≈ 1.004 — less than half a
percent. The time was spent waiting for a turn, and more than half of it the compositor held
(293 of 559 ms), so the payoff came from scheduler order (about 340 ms recovered) rather than from
compilation. This is the same lesson as section 2.2's Amdahl argument, applied to boot: find *p*
first.
Confidence: 4

**4.** Two numbers: garbage collection took 85.9 s of the 1,479.1 s frontend, which is 5.8 percent,
so removing all of it could buy at most 5.8 percent; and when the heap was enlarged, the saving was
only 1.2 percent — an actual experiment, not a projection. Section 2.4 contrasts this with the
workstation profile's 88 percent of executed instructions in the numeric range analysis, which is
where the hypothesis should have pointed. So GC was measurable but small, and the range analysis
was the real cost.
Confidence: 4

**5.** The check is that the model's walk over the WebAssembly first reproduces the *current*
backend's instruction count and matches the real RV32 output for all 161 functions, which shows the
walk reads the same input and models today's emission faithfully. It does not establish that a
backend which actually keeps temporaries (or locals) in registers can reach 16,544 or 13,255
instructions: register pressure, spilling, calling conventions and the cost of the extra logic could
all give different numbers, and no such backend has been written. The article also says "Article 5
states its assumptions" rather than stating them here, so from this text alone I cannot see which
assumptions are unvalidated.
Confidence: 3

**6.** Because one run cannot separate a small improvement from noise [Georges et al. 2007], and
because incidental factors such as link order or environment size can shift timings by more than
the effect being studied [Mytkowicz et al. 2009]. Ten runs give a median and a range instead of a
single number, and alternating the order (A, B, A, B, …) means slow drift in the machine — warm
caches, thermal state, background load — hits the control and the candidate equally, as the article
says the compiler experiments already do. The article names the two hazards but does not spell out
this alternating-order argument, so that part is my inference.
Confidence: 3
