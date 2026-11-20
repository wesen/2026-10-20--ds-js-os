---
Title: Reduce token and body allocation in the frontend-only benchmark
Ticket: PICOCALC-PARSER-DISPATCH
Status: active
Topics:
    - picocalc
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T01:07:37.111329095-05:00
WhatFor: ""
WhenToUse: ""
---

# Reduce token and body allocation in the frontend-only benchmark

## Executive Summary

<!-- Provide a high-level overview of the design proposal -->

## Problem Statement

<!-- Describe the problem this design addresses -->

## Proposed Solution

<!-- Describe the proposed solution in detail -->

## Design Decisions

<!-- Document key design decisions and rationale -->

## Alternatives Considered

<!-- List alternative approaches that were considered and why they were rejected -->

## Implementation Plan

<!-- Outline the steps to implement this design -->

## Open Questions

<!-- List any unresolved questions or concerns -->

## References

<!-- Link to related documents, RFCs, or external resources -->

The professor's E5 host criterion is a 31.4 ms median for parsing, checking and emitting Wasm function bodies. The earlier predictive prefix test removed repeated unsuccessful spelling checks. This experiment applies the same principle to statement selection, operator lookup and required token consumption. It also asks whether the unchanged grammar can produce a token with fewer allocations.

## Keep the stopwatch and source fixed

The qualification uses the unmodified 04-compile-phase-timing C program and JS driver, with the original 289281c Editor source assembled from its source list. The driver warms the frontend, calls compileFunctions 15 times, and reports the elapsed CLOCK_MONOTONIC median. A separately compiled copy with CLOCK_PROCESS_CPUTIME_ID varies only the clock. It identifies time spent executing the process. It cannot substitute for the wall-time gate.

Each paired block uses the same pinned CPU, reactor, QuickJS object files and source bytes. The reference uses stock 289281c and the E5 checkpoint c5e2839, alongside the unmodified current compiler base 2e4fee1. Timings keep all observations and note host load. Parser changes versus the 2e4fee1 reference measure a candidate with the current type system still active.

## Consume the matched token once

A parser production begins with a known token. Required punctuation can compare the current spelling and advance directly. It does not need to call the optional consumer before advancing. Statement selection and prefix selection can each use a single lookahead spelling. Infix selection can read a fixed dictionary keyed by spelling and use the indexed fields of the matched rule. Every production retains its existing type checks, consumption order, and emitted opcodes.

The general lexer already returns an identifier, integer, string or operator. Instead of asking the regex engine for four named captures and a named result object, one ordinary capture can hold the token. The scanner then classifies its first UTF-16 code unit. An initial ASCII letter or underscore denotes an identifier. A digit denotes an integer and a double quote denotes a string. The remaining matched alternatives are operators. The regular expression still checks the complete grammar, including JSON string escapes and trivia.

A compiler-internal lexer can borrow one current token object as long as a consumer reads its values before advancing. The ordinary emitter uses this contract. The public Lexer constructor and async range materializer continue to return distinct objects. An optional ASCII cursor control can exercise the same parser dispatch straight from source characters, with the regex fallback for unsupported ranges. The native-index lane independently tests these parser changes with the existing index and borrowed-token overlays.

## Frame the emitted Wasm bytes once

The frontend-only benchmark includes the Wasm function body writer. The writer currently copies its local header and instructions into a body array and then copies the same body into the length-prefixed output. The final length is known from the header and instruction counts. A single array concatenation constructs the same output and leaves the unframed operation array available to the compiler's existing consumers.

## Evidence gates

Compare the actual raw RV32, linked Wasm and native artifacts, including both native emitter modes and async source metadata. Compare the historical E and G execution fixtures and the malformed-source oracle. Keep separate stages for parser-only changes, parser plus compact regex, and parser with the native index. Only the median printed by the unmodified wall timer is compared with 31.4 ms. Report whether it clears in repeated matched runs and preserve the process CPU observation with its own label.

The final staged comparison includes the complete indexed source-span and prepass arm. Its direct advancing method handles sequential reads on a whole-source internal borrowed cursor. A seek or a tail uses the original indexed method. The portable variant leaves that path in place and compacts the regular-expression fallback. It therefore runs the same parser and emitter with or without the host native registration. The experiment's patch changes only the staged JavaScript compiler file.
