# Answers — "2. Measuring Before Optimizing"

I was not given the article, only the quiz. Every numeric or naming claim below that depends on the
article's tables is flagged as such; what I can supply is the shape the answer must have and the
reasoning that constrains it.

## 1. Where the 1.8 s interval ends, and what the user still waits for

I cannot know this without the article. Two things are stated by the question itself: the interval
starts at "boot compile begins" and ends at "Agenda's first response", so the end point is not
power-on and not the end of the boot; it is the moment the application first produces something
observable (almost certainly the first frame or first printed output, not full readiness). Because
the question asks what the user *still* waits for afterwards, the section 2.1 table must contain at
least one later row — plausibly the first complete, correct screen, or the first accepted key press.
The teaching point is that "first response" is an optimistic boundary; anything measured from
boot-start to first-pixel understates the wait the user actually feels.

Confidence: 2

## 2. Share of the key-press path in application code, and the Amdahl ceiling

I cannot know this without the article, since the two measurements are its numbers. The arithmetic
is fixed by them, though: if the whole path is `T_total` and the application-code portion is
`T_app`, the share is `T_app / T_total` and the largest possible speedup from making application
code infinitely fast is `T_total / (T_total - T_app) = 1 / (1 - share)`. So a 20 % share caps the
win at 1.25×, a 50 % share at 2× — the answer will be in that form no matter what the numbers are.
The share is an upper limit because the application-code figure is inclusive: it is whatever the
instrument attributed to application code, which includes work the application cannot remove
(interpretation overhead it merely triggers, allocation, calls into the runtime), and it is bounded
by the timer's resolution and by measurement overhead. Once you delete all of it, the remaining
path — input handling, the runtime, the display update — is untouched and becomes the floor.

Confidence: 2

## 3. The 559 ms boot profile, the dominant "world", and the resulting change

I cannot know this without the article. The structure of the question tells me the 559 ms was spent
compiling or loading startup material and that the profile could be split by "world" (whatever unit
of content the application loads at boot), with one world taking the largest share. The natural
follow-up change, and the one I would expect a measurement-first article to report, is to stop
paying for all of it up front: build or load only the worlds the session needs and defer the rest
until first use, so the cost moves off the boot path rather than being optimized in place. An
alternative the article could have chosen is to make compilation cheaper (cache the artifact), but
that keeps the same work at boot.

Confidence: 1

## 4. Two numbers that refute the garbage-collection hypothesis

I cannot know this without the article, but the refutation must be of the form "GC had nothing to
do with it", so the two numbers are almost certainly (a) how much of the measured time was actually
attributed to collection and (b) how often collection ran — or, equivalently, peak heap versus
available heap, showing that pressure never arose. For the refutation to be convincing, (a) must be
a small fraction of the total in the same profile that produced the complaint, and (b) must show
collections that are rare or absent. A single number could always be explained away ("GC pause plus
marking"), so two independent ones are needed — one about cost, one about frequency or pressure.

Confidence: 2

## 5. The check on Experiment 2's script, and what it does not prove

I cannot know this without the article. The check that would give confidence the script reads the
code correctly is a cross-validation against an independent source of truth: re-counting a file by
hand or with a different tool and getting the same token/line totals, or confirming that the
instrumented run produces byte-for-byte the same compiler output as the uninstrumented one. What
such a check cannot establish is that the number means what the article wants it to mean: agreement
on counts proves the reader is faithful, not that the per-token figure reflects the dominant cost,
nor that it generalizes beyond the programs chosen, nor that it is causally responsible for the
end-to-end latency. Faithfulness and validity are separate questions.

Confidence: 2

## 6. The two per-token costs for the typed compiler on the device

I cannot know this without the article. The two numbers are presumably two different per-token
figures for the same compiler, which means they must be distinguished by what is divided by what: a
marginal cost (the slope of compile time against program size, i.e. the cost of *one more* token in
an already-running compile) and an average cost (total compile time divided by total tokens, which
includes fixed startup, symbol-table setup and I/O). Those two differ whenever there is a fixed
overhead, and reporting both is the honest way to say "here is what growth costs, and here is what
the token actually bought you in this measurement". A reader should use the marginal figure to
predict larger programs and the average figure only to describe the programs actually measured.

Confidence: 1
