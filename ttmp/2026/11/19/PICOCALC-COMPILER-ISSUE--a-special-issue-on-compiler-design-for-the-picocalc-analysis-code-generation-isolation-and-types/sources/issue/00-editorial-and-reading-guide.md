# Editorial and Reading Guide

*Compiling on a Handheld* is a set of ten articles about one question: what should be built next so that a small handheld computer can compile its own applications well? The handheld is a PicoCalc driven by an ESP32-P4 microcontroller. In the space of two days in November 2026 it acquired two compilers. The first accepts ordinary JavaScript, analyzes the whole program, and needs between eight seconds and twenty-five minutes per application. The second accepts a small typed language, compiles one function at a time, and needs between a fifth of a second and three seconds. Both produce correct code. Neither is yet the compiler one would want.

The issue is written for a reader who can program and has not studied compilers. It explains each idea from its foundations, grounds each in code and measurements from the project's repository, and cites the literature in which the idea was first worked out. A reader who finishes it should be able to take part in the design decisions that follow, and to check the reasoning behind them.

> [!summary]
> - **Measure first.** No timing in the project reaches the screen, and a rough model puts native application code at about four percent of the measured part of a key press.
> - **The cost of the first compiler is whole-program inference.** It can be made cheaper, and the durable remedy is to declare types at function boundaries so that checking is local.
> - **The second compiler's native code is three times larger than it needs to be.** More than half of its instructions move temporary values through memory; a known one-pass technique removes them.
> - **The typed language is close to being safe to run as native code without trust.** It has no recursion, so stack use is a compile-time number; loops can be bounded by a counter; and the emitted code is simple enough to verify.
> - **The language needs `await`, enumerations and a few cheap type features before more applications are ported.** The typed ports are five to six times longer than the JavaScript they replace.

## How the issue is organized

The order of the articles was chosen by test readers. An early, compressed version of the argument was given to three student readers, who were asked what they could not follow and in what order they would want it taught. All three asked for the same sequence: the machine and its vocabulary, then how to read the measurements, then each topic introduced by a worked example before any names from the literature. The appendix on the reader study gives the details.

| # | Article | What it establishes |
| ---: | --- | --- |
| 1 | {{link:01}} | The device's limits, the operating system's terms, and the two compilers |
| 2 | {{link:02}} | What has been measured, what has not, and four experiments run for this issue |
| 3 | {{link:03}} | What the first compiler computes for 25 minutes, and the evidence that inference is the cost |
| 4 | {{link:04}} | Five ways to make inference cheaper, and the alternative of declared boundaries |
| 5 | {{link:05}} | How stack-machine code becomes register-machine code, today and with a compile-time operand stack |
| 6 | {{link:06}} | Caches, load-time code generation, break-even arithmetic and tiers |
| 7 | {{link:07}} | Memory, control and time safety for native code: bounded stack, fuel, a verifier, hardware protection |
| 8 | {{link:08}} | Hand-written continuations, and `await` compiled to state machines with static frames |
| 9 | {{link:09}} | Seven type-system features, each motivated by code in the repository |
| 10 | {{link:10}} | An inventory, four structural changes, an ordered plan, and predictions that would refute it |

Back matter: {{link:11}}, {{link:12}}, {{link:13}}, {{link:14}} and {{link:15}}.

## Three ways to read it

**The short path** is Articles 1, 2, 5 and 10. It gives the situation, the evidence, the one piece of compiler engineering with a measured prediction, and the plan.

**The analysis path** is Articles 3, 4 and 9, which treat inference, its remedies and type-system design as one subject.

**The systems path** is Articles 6, 7 and 8, which treat when code is compiled, how it is confined and how it waits.

Every article begins by saying what the reader should be able to do afterwards and which earlier terms it relies on. Every article ends with key points and six questions; worked answers are in the back matter. Terms set in bold at first use are in the glossary.

## What the issue rests on

**The repository.** All descriptions of the system refer to revision `60a38f0` of the PicoCalc OS repository. The companion report *Two Compilers on the PicoCalc* narrates how the system reached that state and gives the conditions of every device measurement quoted here.

**Four experiments.** Article 2 reports experiments made for this issue with the repository's own compiler: a classification of every RV32 instruction it emits for three applications, a counting model of an improved backend that reproduces today's output exactly before predicting a different one, a timing of the compiler's phases inside the interpreter that runs it on the device, and a full disassembly of one small function. The scripts are kept with the issue.

**The literature.** The issue cites 111 sources, from a 1965 paper on peephole optimization to documentation published in 2025. Each citation's bibliographic details and each finding attributed to it were checked against publisher records, the paper's own text or official documentation. The check produced four corrections and a number of sharper statements than memory had supplied, and its notes are reproduced in the appendix. The textbook used throughout is Cooper and Torczon's *Engineering a Compiler*, third edition, cited by section.

**A reader study.** Each article was read by three student readers, whose quiz results and written feedback drove a revision; the revised articles were read again by fresh readers, which produced a second, smaller set of corrections. The study, its results and its limits are described in the appendix.

## Conventions

- "The device" always means the ESP32-P4 handheld. "The workstation" means the development computer.
- Times are for the device unless a sentence says otherwise.
- A citation such as [Ertl 1995] refers to the reference list at the end of the article and to the consolidated list in the back matter.
- A statement about what a paper found uses that paper's own figures. Where this issue makes a prediction of its own, it says so and names the measurement that would test it.

## What the issue does not claim

Three limits apply to the whole and are repeated where they matter.

1. **Most device measurements are single runs or sets of three.** They establish orders of magnitude. They do not rank alternatives that differ by a few percent.
2. **The predicted gains are models.** The backend prediction in Article 5 is a count validated against today's output. It has not been implemented.
3. **The student readers are language models.** They are useful for finding undefined terms, unsupported claims and questions that cannot be answered from the text. They are not evidence about how people learn.
