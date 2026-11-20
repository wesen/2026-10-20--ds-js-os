---
Title: Parser dispatch experiment diary
Ticket: PICOCALC-PARSER-DISPATCH
Status: active
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T00:53:05.447478209-05:00
WhatFor: ""
WhenToUse: ""
---

# Parser dispatch experiment diary

## Step 1: Count failed token tests and compare predictive dispatch

I instrumented the expression parser on the pre-E Editor corpus and observed 26,014 failed token tests in the prefix call subtree. I then removed repeated spelling tests in an isolated lookahead dispatcher, keeping the original production bodies intact. Both studies ran in the vendored QuickJS runtime.

### Prompt Context

**User prompt (verbatim).** “do E1-E7 and G1-G4.” The professor's E5 gate includes a host frontend median of at most 31.4 ms. **Assistant interpretation.** Investigate a concrete source of parser overhead while maintaining all diagnostics and generated code. **Inferred user intent.** Time improvements should be reproducible and should preserve typed program behavior. The preimplementation guide and count are committed in ea14589 and delivered to reMarkable.

### What I did

I wrapped selected emitter methods and Lexer.accept to count decisions. Then I staged a switch on the current token spelling, restored the original integer and identifier handling and ran correctness and timing in fresh, uninstrumented processes. The order alternated between pairs. Each timing process compiled the same 70,857-unit source once to warm up and fifteen times for observations. CPU affinity was 7.

### Why

An unsuccessful accept call still enters a JavaScript method and fetches the current token. One lookahead token distinguishes these prefix productions. Actual benefit depends on the QuickJS dispatch cost and the share of time spent in other parser operations.

### What worked

All nine linked reference files matched byte for byte for Files, Agenda and Editor in Wasm, streamed RV32 and buffered RV32. The lexical/diagnostic oracle passed. Dispatch improved the median in all seven paired host processes. The medians of process medians were 39.147 ms for the indexed control and 37.563 ms for dispatch, a 4.0% difference. The median of the seven within-pair percentage changes was −7.78%.

### What didn't work

The initial isolated wall-clock reading was 76.49 ms while multiple firmware builds were active. Its regular-expression baseline alone took 45.03 ms compared with 14.30 ms in the earlier unrelated batch. That single reading cannot establish a regression. The paired CPU observations improve comparability, but do not establish that the original absolute wall-clock gate passes.

### What I learned

A high count of failed predictions does not imply a proportional time saving. The same source still requires name resolution, type checks and instruction emission for every expression.

### What was tricky to build

The compiler accepts the signed integer minimum through a special unary-minus production. The rewrite leaves the body of that production untouched. Braces around each case keep local declarations scoped as before. Counting and timing use separate scripts so the counters do not dominate the measured code.

### What warrants a second pair of eyes

The benchmark compares repeated CPU-time measurements of the original pre-E corpus. Its sample distribution is affected by system load and clock frequency. It does not measure a fresh P4 compiler invocation or the chess application.

### What should be done in the future

Retain the isolated candidate. First finish qualifying the larger async frontend change. Run paired physical compiles if this smaller parser change is considered for shipping.

### Code review instructions

Read the design guide, inspect scripts/02-stage-prefix.py, and run scripts/04-run-pairs.sh with the baseline firmware checkout, reference corpus directory, CPU number and fresh output directory. The exact nine output comparisons precede all timed runs.

### Technical details

The timing measures typedWasm.compileFunctions from the QuickJS process CPU clock. The ordinary token index and borrowed-token implementation are present in both arms. The target word size and output ABI are unchanged.
