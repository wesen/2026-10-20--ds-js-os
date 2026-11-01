---
Title: Diary
Ticket: PICOCALC-CALC
Status: active
Topics:
    - picocalc
    - calculator
    - ui
DocType: log
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/js/apps/calc.js
      Note: the calculator and plotter
    - Path: repo://picocalc-os/js/system/compositor.js
      Note: canvas poly operation
    - Path: repo://picocalc-os/scripts/calc.txt
      Note: host script
    - Path: repo://picocalc-os/tests/calc.test.mjs
      Note: calculator tests
ExternalSources: []
Summary: 'Chronological record of PICOCALC-CALC: an expression language compiled to closures, a calculator with history, and a plotter that samples in slices sized for the turn budget; host and ESP32-P4.'
LastUpdated: 2026-11-01T01:10:00-04:00
WhatFor: Following how the calculator came to picocalc-os and why each decision was made.
WhenToUse: When resuming the ticket or reviewing one of its commits.
---

# Diary

## Goal

Give the PicoCalc a calculator: expressions with variables and functions, a history to recall from, and a plotter
for functions of x that stays within the kernel's turn budgets on the device, where JavaScript runs about fourteen
times slower while Wi-Fi is up.

## Step 1: Research and the guide

I read what the calculator would rest on: the agent's `calculate` (a Pratt parser that evaluates while parsing),
the compositor's node types (a `canvas` node already takes fill, rect, line and text operations), the render step
in `nucleus/kernel.c` (the screen tree is rendered and published after every segment of the world on screen, and
that cost counts against the segment), the turn budgets (50 ms by default, virtual on the host), the store (an NVS
blob on the P4, committed by the kernel task after a segment), the key names, and the fonts.

Three findings shaped the design. A world loads one file and there is no module system, so the agent's parser
cannot be shared, and its shape (evaluate while parsing) is wrong for plotting anyway. `fb.line` clips only to the
screen, so the plotter must clip to its canvas. The fonts have no π, √, × or ∞, and the font generator needs
`xfonts-terminus` and `pcf2bdf`, which are not installed; the calculator writes `pi`, `sqrt`, `*`.

### Prompt Context

**User prompt (verbatim):** the ticket series prompt is recorded verbatim in the PICOCALC-FS diary, Step 1
("Alright do all --- [pasted list: ... Calculator with history and graphing. The agent already has an arithmetic
tool; a real one fits a device called PicoCalc. ...] ..."). PICOCALC-CALC is the third ticket of that series.

**Assistant interpretation:** A calculator app with history and graphing; guide first and uploaded, then code,
diary and report.

**Inferred user intent:** A calculator worth using on a device called PicoCalc.

**Commit (docs):** the guide was uploaded before implementation (reMarkable, `/ai/2026/10/31/PICOCALC-CALC`,
"PICOCALC-CALC intern guide") and committed with the code in `d51cf0c`.

### What I did

- Created the ticket and wrote the guide: worlds, turns and budgets; how an app draws; keys; the store; why a
  separate evaluator; the language (tokens, grammar, precedence table, names); Pratt parsing and compiling to
  closures; formatting; the screen; persistence; the plotter (view, sliced sampling, discontinuities, clipping,
  axes, the `poly` operation); the home screen; plan C1–C6; tests; API and file references.
- Added tasks C1–C6 and the `calculator` topic.

### Why

- Compiling to closures makes a plot of three curves 918 calls of small functions instead of 918 parses.
- Slicing the plot is needed on the device only, but designing for it from the start keeps the host and the
  device on one code path.

### What worked

- The existing canvas node needed only one new operation.

### What didn't work

- The font tool's inputs are missing (`/usr/share/fonts/X11/misc/ter-u12n_unicode.pcf.gz: No such file`,
  `pcf2bdf not found`); installing them needs root, so symbols are deferred.

### What I learned

- The kernel renders a world after every one of its segments while it is on screen, so `screen` must not do work
  that can be done when the data changes.

### What was tricky to build

- Nothing at this step.

### What warrants a second pair of eyes

- The precedence choice for implicit multiplication (`1/2x = (1/2)·x`). Calculators differ; the guide states the
  rule.

### What should be done in the future

- Install `xfonts-terminus` and `pcf2bdf` and add π √ × ÷ ∞ ² ≈ to the font.

### Code review instructions

- Read the guide's sections 3, 4 and 7 before `calc.js`.

### Technical details

- Guide: `ttmp/2026/10/31/PICOCALC-CALC--.../design-doc/01-calculator-analysis-design-and-implementation-guide.md`.

## Step 2: The language, the calculator, the plotter (C1–C4)

`js/apps/calc.js` holds the tokenizer, the Pratt parser, the compiler to closures, the formatter, statements
(variables and one-argument functions), the calculator screen with history, a names view, persistence, and the
plotter. The compositor gained the canvas `poly` operation; the launcher gained Calc (key `x`) and went to four
columns. Thirteen Node tests pass; the host script `scripts/calc.txt` writes captures 60–66.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Implement C1–C4.

**Inferred user intent:** A calculator that behaves like a good hand-held one.

**Commit (code):** `d51cf0c` — "picocalc-os: a calculator with history and graphing (PICOCALC-CALC C1-C4)"

### What I did

- Tokenizer: one sticky regular expression (`/y`) for numbers (decimal, exponent, `0x`, `0b`), names and single
  operator characters; at most 256 characters and 128 tokens.
- Parser: statements `name = expr`, `name(p) = expr`, `expr`; binding powers 1 (`+ -`), 2 (`* / %` and implicit),
  unary below `^`, postfix `!`. Implicit multiplication applies before a name or `(`, never before a number: `2 3`
  is "unexpected 3", not 6.
- Compiler: each node becomes a closure of `x`; variables, `ans` and the angle mode are read when the closure
  runs, so plots and functions follow later assignments; user function bodies are compiled once and cached by
  parameter and source; calls are limited to 32 deep.
- Formatter: integers below 1e15 exactly, otherwise 12 significant digits with trailing zeros removed, exponent
  form below 1e-9 and from 1e15.
- Calculator: history of 100 (`{e, r, ok, v}`), Enter on a selected entry recalls it, Tab inserts its result, an
  operator other than `-` typed on an empty line continues from `ans`, two F5 clear, F3 names view with Del, F4
  degrees. A failed line stays in the input with the error in the status line.
- Persistence: one store record `calc` written 3 s after a change and on `blur`; stored functions that no longer
  compile are dropped with a note.
- Plotter: `plotReset` compiles the curves and computes the grid; `plotSample` computes a slice of columns and
  adapts the slice to the measured time (halve above 20 ms, grow by half below 6 ms, between 8 and
  `3000 / nodes`); `plotPolys` breaks at missing values and at jumps across the whole view; `plotClip` clips each
  segment to the canvas; a legend, a trace cursor, pan, zoom (around the trace cursor when tracing), reset, fit,
  and Del to remove a curve.
- Sampling and saving run as detached chains: `plotRun` loops `await sleep(30); plotSample(s)` while the plot is
  incomplete and on screen; `calcChanged` starts `sleep(3000).then(save)` once per burst of changes.

### Why

- No `every` timer: a 30 ms ticker would run a turn 33 times a second for the life of the world, plotting or not.
  A chain started when needed costs nothing otherwise.
- The chains are never returned from a handler: the prelude treats a returned promise as an asynchronous turn
  (`k("turn.async")`) and the world takes no new messages until it settles, so a plot started that way would block
  every key until it finished.

### What worked

- `make test-apps`: editor 10, calculator 13. `make test-agent`, `make test-fs`, `make shots`: pass, with the same
  crash counts as before (the faults script's 9 and the REPL's deliberate infinite loop).
- On the host, `now()` does advance within a segment (by the cost model), so the slice adapts there too: a
  three-curve plot logged "160 ms in 5 slices (slowest 4.0 ms)".

### What didn't work

- My first draft had four defects, found by reading it back before the tests ran:
  - `plotClip` computed the second intersection from coordinates the first clip had already changed;
  - the operator loop consumed a token before checking its binding power and put it back with `i--` in a way that
    was wrong for implicit multiplication;
  - `toPrecision(12)` returns exponent form for values like 1e-7 (`"1.00000000000e-7"`), which the trailing-zero
    trim did not handle; `calcTidy` now trims the mantissa;
  - two `every` timers (30 ms and 1 s), replaced by the detached chains above.
- The test harness failed at first with `Cannot read properties of undefined (reading 'prototype')`: I tried to
  give the state object the VM's `Object.prototype` via `context.Object`, which a `vm` context does not expose as a
  property. The state needs no particular prototype; the line was removed.
- The first captures showed tick labels cut at the canvas edges ("-10" against the border, a lone "1" at the
  right) and the legend drawn over the curves. Labels that do not fit are now left out, and the legend has a
  white backing.

### What I learned

- In this kernel a world's background work is best expressed as a promise chain it starts and does not return;
  a periodic timer is for work that really is periodic.

### What was tricky to build

- The precedence of unary minus. `-2^2` must be −4 and `2^-1` must be 0.5: unary minus sits below `^`, and the
  right operand of `^` is parsed as a unary expression, so both hold.
- Discontinuities. `tan` has no `NaN` at its asymptotes; adjacent columns just land far above and far below the
  view. The rule "break when two samples are outside the view on opposite sides" separates `tan`'s pieces without
  breaking a steep but continuous curve that stays inside.

### What warrants a second pair of eyes

- A user function's body is not counted in the node total that bounds the slice size (`f(x)` counts 2 nodes
  whatever `f` is). The time-based adaptation covers it, but the first slice for a costly function can be larger
  than intended.
- History entries store the result value `v` so Tab can insert it; old entries loaded from the store without `v`
  simply cannot be inserted.

### What should be done in the future

- Count user function bodies in the slice bound.
- A "table" view (x, f(x)) would reuse the samples.

### Code review instructions

- `js/apps/calc.js` from `calcParse` and `calcCompile`, then `calcKey`, then `plotReset`/`plotSample`/`plotPolys`.
- `make test-apps`; `./build/picocalc-host -j js -o out -f build/fs scripts/calc.txt`.

### Technical details

```text
2sin(x)^2 + 1
  tokens  2  sin  (  x  )  ^  2  +  1
  tree    {+ {* 2 {^ {call sin x} 2}} 1}
  closure (x) => a(x) + b(x), a = (x) => 2 * Math.pow(Math.sin(rad(x)), 2), b = () => 1
```

## Step 3: On the ESP32-P4 (C5)

The calculator ran on the PicoCalc's P4 with Wi-Fi connected. Three curves (`tan(x)`, `f(x) = x^2/4 - 2`,
`sin(x)`) plotted in about 0.57 s; trace and zoom work; history and the function survived a reboot. No crashes.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** C5: evaluate, plot three curves with Wi-Fi up, measure.

**Inferred user intent:** The plotter must be usable on the device, not only on the host.

**Commit (code):** `a5c66ab` — "picocalc-os: the calculator logs each plot's timing; device captures (PICOCALC-CALC C5)"

### What I did

- Added a log line when a plot completes: curves, nodes, total time, slices, slowest slice, final slice size.
- Held the keyboard bus, flashed (ESP-IDF 5.4.2), and drove the app over the console with commands spaced for the
  90 ms-per-character `type` pacing.
- `net status` before the run: `wifi=up clock=set api=chat model=deepseek-4.1-flash`.

### Why

- The host's cost model does not include the Wi-Fi slowdown, so only the device can say whether the slices are
  small enough.

### What worked

```text
[ 18625.662] calc: plot of 1 curve(s), 2 nodes: 298 ms in 5 slices (slowest 3.8 ms), slice now 162 columns
[ 26447.863] calc: plot of 2 curve(s), 4 nodes: 480 ms in 6 slices (slowest 6.3 ms), slice now 72 columns
[ 30951.305] calc: plot of 3 curve(s), 6 nodes: 563 ms in 6 slices (slowest 8.5 ms), slice now 72 columns
[ 39050.944] calc: plot of 3 curve(s), 6 nodes: 580 ms in 6 slices (slowest 8.8 ms), slice now 72 columns
t = 42951.0 ms, lane busy 8453.4 ms (19.7%), 3514 turns, ... 0 crashes
  compositor  service  idle   321   2549.80    327.6    768    0
  calc        app      idle    47   1213.13    393.8    512    0
```

- After `reboot`, the history showed `2pi * 3`, `f(x) = x^2/4 - 2`, and `f(4)` evaluated to 2.

### What didn't work

- Nothing failed. The calculator's turns average about 26 ms (1,213 ms over 47 turns) although no slice took more
  than 8.8 ms: rebuilding the drawing operations and rendering the tree dominate, not sampling.

### What I learned

- With Wi-Fi up, sampling is cheap and drawing is what costs. The time between slices (30 ms of sleep) is most of
  the 0.57 s.

### What was tricky to build

- Nothing new.

### What warrants a second pair of eyes

- The calculator's heap reached 394 KB of its 512 KB with three curves (the samples, the operations and the
  rendered JSON). Raising `mem_kb` or storing samples more compactly would add headroom.

### What should be done in the future

- Build the operations incrementally (append the new columns) instead of rebuilding them after every slice.
- A native `gfx.poly` if the compositor's turns grow with more curves.

### Code review instructions

- Device check: hold, flash, then `tools/p4cap.py --no-reset -s 40 -c "7.5 key x" -c "8.5 type sin(x)" -c "9.4 key f2" ...`
  and read the `calc: plot of` lines.

### Technical details

- Captures: `ttmp/.../PICOCALC-CALC.../captures/p4-01-plots-and-trace.png`, `p4-02-after-reboot.png`,
  `host-60-calc.png`.

## Step 4: Documentation and delivery (C6)

### Prompt Context

**User prompt (verbatim):** see Step 1 ("write a detailed report after each ticket").

**Assistant interpretation:** Close the ticket with the guide as built, this diary, the upload and the report.

**Inferred user intent:** A record others can continue from.

**Commit (docs):** recorded in the ticket's changelog.

### What I did

- Guide section 13, "As built and measured"; this diary; changelog; related files.
- Upload: "PICOCALC-CALC guide as built and diary" to `/ai/2026/10/31/PICOCALC-CALC`.
- Vault report: `PROJ - picocalc-os - PICOCALC-CALC - A Calculator and Plotter on the PicoCalc.md`.

### Why

- The guide was written before the code; section 13 records the differences.

### What worked

- See the changelog.

### What didn't work

- Nothing.

### What I learned

- Nothing new.

### What was tricky to build

- Nothing.

### What warrants a second pair of eyes

- None.

### What should be done in the future

- Next ticket: PICOCALC-AGENDA.

### Code review instructions

- Read the report, then the guide's section 13.

### Technical details

- None.
