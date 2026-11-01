---
Title: Diary
Ticket: PICOCALC-SCI
Status: active
Topics:
    - picocalc
    - calculator
    - ui
DocType: log
Intent: long-term
Owners: []
RelatedFiles:
    - Path: picocalc-os/js/apps/calc.js
      Note: the calculator, all four steps
    - Path: picocalc-os/tests/calc.test.mjs
      Note: 27 tests, including the help reference checks
    - Path: picocalc-os/js/system.json
      Note: calc mem_kb 1024 (C1), budget_ms 200 (C4)
    - Path: picocalc-os/js/system/compositor.js
      Note: ui.lines with visible, fixed in C3
ExternalSources: []
Summary: "Implementation diary of PICOCALC-SCI: the engine, graphing, help and modes, and the measurements on the ESP32-P4 that changed the work limits and two hot paths."
LastUpdated: 2026-11-01T08:00:00-04:00
WhatFor: "Following how the graphing scientific calculator was built and measured, and why its limits are what they are."
WhenToUse: "Before changing js/apps/calc.js, its limits, or its budget."
---

# Diary

## Goal

Make the PicoCalc's calculator a graphing scientific calculator with help pages: more functions and constants,
calculus and a solver, functions of several variables, angle and display modes, four curves including polar and
parametric ones, curve analysis, a table, a window page, and help for every key and built-in name, on the device.

## Step 1: Research and the guide

I read `js/apps/calc.js` as PICOCALC-CALC left it (608 lines: tokens, a Pratt parser, a compiler to closures, the
history, a sliced plotter) and wrote the guide: what changes, the engine (bound names as cells, special forms, a
work limit), graphing, help, keys, state, and a plan in four steps, C1 to C4.

### Prompt Context

**User prompt (verbatim):** "Update the calculator to be a graphing scientific calculator with help pages and all"

**Assistant interpretation:** Extend the existing calculator app into a TI/Casio-style graphing scientific
calculator on the 320 × 320 screen, with on-device help; follow the usual process: ticket, guide uploaded to the
reMarkable, implementation in commits, a detailed diary, a report in the vault.

**Inferred user intent:** A calculator worth using on the PicoCalc, whose functions can be looked up on the
device itself.

**Commit (docs):** the guide was uploaded before implementation as "PICOCALC-SCI Scientific Calculator Guide" to
`/ai/2026/11/01/PICOCALC-SCI`.

### What I did

- Created the ticket with `docmgr`, the guide `design-doc/01-scientific-calculator-analysis-design-and-implementation-guide.md`
  and tasks C1–C4.
- Chose what to leave out: complex numbers, units and matrices, which would change every function's domain.

### Why

- Cells (`{ v }`) instead of a single parameter `x` passed down: `f(x, y)`, `integ(t^2, t, 0, x)` inside a plot of
  x and recursion all need several names bound at once.
- A fuel counter, because a line runs inside one turn of the world and the kernel stops a world that overruns.

### What worked

- The existing structure (parse once, compile to closures, sample in slices) carried all of it.

### What didn't work

- Nothing at this stage. The guide's limits (80 ms turn, fuel "calibrated on the P4" to about 50 ms, 30
  integration intervals) were assumptions; Step 5 replaced all three.

### What I learned

- The plotter already ran as a detached `sleep().then` chain; anything slow had to stay out of key handlers.

### What was tricky to build

- Nothing yet.

### What warrants a second pair of eyes

- Guide section 3.3, the work limits: it was written before any measurement.

### What should be done in the future

- N/A.

### Code review instructions

- Guide sections 3 and 4.

### Technical details

- The guide lists the plan in section 8 and the files in section 9.

## Step 2: The engine (C1)

The engine became a scientific one: cells for bound names, user functions of up to four parameters, the special
forms `deriv`, `integ`, `solve`, `sigma`, `prod`, comparisons and a lazy `if`, fuel, 52 functions, 16
constants, three angle modes, five display formats and four integer bases. The stored record went to version 2
with a migration from version 1. The world ran out of memory in the shots, so its limit went from 512 KB to 1 MB.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Implement guide section 3.

**Inferred user intent:** The scientific half of the request.

**Commit (code):** 0150e14 — "picocalc-os: a scientific engine for the calculator: calculus, a solver, several
variables, modes (PICOCALC-SCI C1)"

### What I did

- `calcCompile` resolves bound names to cells through a scope `Map`; `calcForm` compiles a special form's body
  over a new cell and calls `CALC_CALCULUS[form](at, args)`, where `at(t)` burns fuel, sets the cell, evaluates
  and restores it.
- `calcDeriv` (Richardson extrapolation of central differences), `calcGK`/`calcInteg` (adaptive Gauss–Kronrod
  7/15), `calcSolve` (secant from a guess, then an outward search for a sign change and `calcBisect`, which
  refuses a sign change that is a pole), `calcLoop` for sums and products (at most 10000 terms).
- `CALC_FN` entries became `[fewest, most, make(ctx)]`; `calcArity` writes "max takes at least one argument".
- `calcShow` draws stored values in the current format, so changing the format redraws the whole history.
- `calcLoad` migrates version 1 (`deg`, `graph` as strings, one-parameter functions `p`).

### Why

- Values are stored in the history as numbers as well as text so that the format can change afterwards.
- `hbar` is computed from `hP` rather than typed, so the two cannot disagree.

### What worked

- The 13 old tests passed after changes for the angle cycle and the record; six new "sci:" tests.

### What didn't work

- `node tests/calc.test.mjs`: `AssertionError [ERR_ASSERTION]: max()` with `actual: 'max takes at least 1
  arguments'`, `expected: /at least one/`. Fixed with `calcArgs`/`calcArity`, which write words for one.
- Two of my own expectations were wrong and corrected after checking by hand: the sample standard deviation of
  2, 4, 4, 4, 5, 5, 7, 9 is 2.1380899353 (n − 1), and `integ(x^2, pi, 0, 1)` must fail with "pi cannot be the
  name integ varies".
- `make shots`: `calc crashed: ran out of memory (its limit is 512 KB)` at the third plot. Raised `mem_kb` to 1024
  in `js/system.json`; the shots then used 472 KB after three plots.

### What I learned

- The engine roughly doubled the world's heap; the help text (Step 4) would add more.

### What was tricky to build

- Restoring a cell's old value in a `finally` makes nested forms and recursion correct: `sigma(sigma(k j, k, 1,
  3), j, 1, 3)` uses two cells, and `fib(n - 1)` inside `fib` saves `n` across the inner call.

### What warrants a second pair of eyes

- `calcSolve`'s outward search and the pole test in `calcBisect` (a sign change where |f| stays large).

### What should be done in the future

- N/A.

### Code review instructions

- `calcCompile`, `calcForm`, `CALC_CALCULUS`, `calcShow`, `calcLoad`; `node tests/calc.test.mjs`.

### Technical details

- Constants: CODATA 2018 exact or recommended values; `c`, `g`, `h`, `k`, `R` stay free for the user.

## Step 3: Graphing (C2)

Up to four curves, each a function of x, `polar(r)` or `param(x, y)`, in four colours with a legend; trace
analysis (root, minimum, maximum, intersection, slope, mark and shaded area); a table (F7), a window page (F9) and
a curve list (F8).

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Implement guide section 4.

**Inferred user intent:** The graphing half of the request.

**Commit (code):** edbe092 — "picocalc-os: graphing for the calculator: four curves, polar and parametric,
analysis, table, window, curve list (PICOCALC-SCI C2)"

### What I did

- `plotCompile` returns `{ kind, f, size }`; polar and param curves are sampled at 306 values of t over the t
  range (one full turn in the angle mode until the window sets it) and clipped with Liang–Barsky (`plotClipRect`).
- `plotAnalyze`: sign changes among the samples then bisection (`plotZero`), a sample extremum then a golden-section
  search (`calcGolden`), the difference of two curves for intersections, `calcDeriv` for the slope, `calcInteg`
  for the area, which `plotShadeOps` shades.
- Pages: `tableBuild`/`tableKey`, `WIN_FIELDS`/`winApply` (each field takes an expression; ranges must stay
  valid), `curvesKey`; `calcPage`/`calcBack` remember whether a page was opened from the calculator or the graph.
- Captures 67–73 in `scripts/calc.txt`.

### Why

- Pages return where they came from, so F7 from the graph and Esc lands back on the graph.

### What worked

- 22 tests passed; captures of the shaded area ("area -1.623 .. 0.016393 = 1.10004423") and a maximum
  ("maximum  x = -1.6329931  y = 1.088662108", against −√(8/3) = −1.632993162) were right.

### What didn't work

- All failures were in my tests: `run()` was called while the plot had the keys; `plotted()` typed while the plot
  had the keys (it now sets `mode = "calc"` and `trace = null` first); the intersection of x² − 2 and x + 2 is at
  x = 2.561552813, not what I first wrote; the area bounds snap to columns, so the regex accepts
  `0.0328 .. 3.1148`.
- Two hint lines were cut off on the screen ("F2 gra…", and the window page's status line); both shortened.

### What I learned

- Every analysis result moves the cursor to a column, so bounds and x values shown are column positions.

### What was tricky to build

- Liang–Barsky for parametric segments, so that a curve leaving the window and coming back is drawn as two
  polylines without lines across the frame.

### What warrants a second pair of eyes

- `plotZero` on curves with poles: it relies on `calcBisect`'s pole test.

### What should be done in the future

- N/A.

### Code review instructions

- `plotReset`, `plotSample`, `plotAnalyze`, `tableBuild`, `winApply`; `make test-apps`, `make shots`.

### Technical details

- Curves `{ src, on }` are stored in the record; `tview` holds the t range when set.

## Step 4: Help and the modes page (C3)

F6 opens help: seven guides, nine groups of reference entries and an index that letters filter. Every built-in
name has an entry with a form, a sentence and an example that is worked out live in the current modes. F6 on a
name in the line opens that name; on a partial name it opens the index filtered by it, and Enter completes the
name. F4 became a modes page. A test caught a false claim in my own guide text, which led to a change in `integ`.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Implement guide section 5 and the modes page from section 4.3.

**Inferred user intent:** "help pages and all".

**Commit (code):** 0501a03 — "picocalc-os: help pages and a modes page for the calculator (PICOCALC-SCI C3)"

### What I did

- `HELP_REF`: 77 entries `[name, form, sentence, example, result]` (52 functions, 16 constants, 8 forms, `ans`).
  `HELP_TOPICS`: guides as paragraphs (`# ` heading, `| ` example, `- key<TAB>text`, prose) and groups that name
  entries. `helpRows` wraps a guide to 49 columns in the app, so the app knows how far it scrolls.
- `helpF6`: by mode (graph and pages open "Graphing", the modes page "Modes and formats", the names page
  "Variables and functions"), else `calcWordAt`: the name around the cursor, digits stripped (`2pi` → `pi`), or
  the function whose brackets the cursor is in. Your own names show their value or definition in the status line.
- `helpInsert` replaces the word F6 was pressed on with the template (`atan2(`), keeping one bracket if the line
  already has one, and leaves the form (`atan2(y, x)`) in the status line.
- `MODE_FIELDS` with per-field names, a preview of five values in the current modes; F4 from the calculator and
  the graph; the F4 angle cycle is gone.
- Tests: every built-in has exactly one entry in exactly one group, every example gives its stated result in the
  default modes, every entry fits under the list; every guide's examples run in order (the graphing ones through
  F2), and the guides' prose claims are checked; F6, completion, insertion, search; the modes page.
- Captures 75–79; the launcher's description.

### Why

- Examples are evaluated live so the help is true in degrees too (`atan2(1, -1) = 135`); the stored result keeps
  the source honest through the test.
- Esc from an entry opened by F6 goes straight back to the line: help used as a lookup should not need two keys
  to leave.

### What worked

- 27 tests pass; captures 75–79 show the topics, a guide, the trigonometry group on `atan2`, the index for "lo"
  and the modes page.

### What didn't work

- `AssertionError: calculus: integ(1/sqrt(x), x, 0, 1) -> the integral does not converge here`. My guide said an
  infinite end was fine; it was not, because the integrator stopped at 30 intervals and a 1/√x end needs about 50
  halvings. Measured on the host:

  | cap | `integ(1/sqrt(x), x, 0, 1)` | fuel |
  |---|---|---|
  | 30 | does not converge | — |
  | 100 | 1.99999999988 | 6900 |
  | 200 | 1.99999999988 | 6900 |

  `integ(1/x, x, 0, 1)` is still refused at 100. Set `CALC_PARTS = 100`; the guide now also says that 1/x does
  not converge, and a test checks it.
- `TypeError: Cannot read properties of undefined (reading 'text')` in `helpKey` on the topics page, which is not
  a topic: guarded with `t && t.text`.
- The modes page showed "octal" for 8 digits: one name table served digits and bases. Each field now has its own.
- A cross-realm `deepEqual` ("Values have same structure but are not reference-equal") and two wrong expectations
  of mine (F6 inside `cos(` opens cos, not the topics; 4294967297 is above isprime's later cap).
- `ui.lines` with `visible: n` showed n − 1 rows: `measure` gave it `n * rowH` while `drawLines` keeps 2 pixels
  above and below. The guides' last row and the modes preview's last value were never drawn. Fixed in
  `js/system/compositor.js` for `lines` only; the one other user of `visible`, a list in `faults.js`, has no
  padding.

### What I learned

- Testing the help's claims, not just its examples, finds engine limits: the first false claim was mine.

### What was tricky to build

- Completion: F6 must remember where the word was (`s.help.word`) across any browsing, and inserting `atan2(`
  before an existing `(` must not double the bracket.

### What warrants a second pair of eyes

- `calcWordAt` on odd input (`0x1F` gives `x1F`, which then finds nothing in the index).
- The compositor change, although only `calc.js` uses `visible` on `lines`.

### What should be done in the future

- N/A.

### Code review instructions

- `HELP_REF`, `HELP_TOPICS`, `helpF6`, `helpInsert`, `helpKey`, `helpScreen`, `modesKey`, `modesScreen`;
  `node tests/calc.test.mjs`; captures 75–79.

### Technical details

- Index filter: names starting with the letters, then names containing them, then (three letters or more) entries
  whose sentence contains them.

## Step 5: On the ESP32-P4 (C4)

The device disagreed with every work limit in the guide. A fuel unit costs about 5 µs on the P4, whose FPU is
single-precision, so doubles are done in software. `CALC_FUEL = 200000` would have been about a second.
`isprime(9999999967)` crashed the world, and rebuilding four curves' polylines took over 100 ms after every
trace key. The fixes:

- a clock limit next to fuel;
- a 200 ms budget for the calculator;
- recalibrated fuel;
- cheaper user-function calls;
- `isprime` capped and metered;
- incremental polyline building.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Guide step C4: calibrate the work limits on the device, time plots, analysis and
help, capture, then document.

**Inferred user intent:** A calculator that works on the device, not only in the host shots.

**Commit (code):** 267ed70 — "picocalc-os: the calculator measured on the P4: a clock limit, calibrated fuel,
cheaper calls and plots (PICOCALC-SCI C4)"

### What I did

- Held the keyboard bus (`tools/p4cap.py --no-reset -s 1 -c "0.2 hold"`) before every flash; built and flashed
  `build-agent` (`idf.py -B build-agent -D PICOCALC_AGENT_WIFI=ON -D SDKCONFIG=sdkconfig.agent -D
  'SDKCONFIG_DEFAULTS=sdkconfig.defaults;sdkconfig.agent-wifi' -p /dev/ttyACM0 build flash`) six times;
  `/dev/ttyACM0` stayed present each time.
- Timed lines inside the turn with a temporary `log("TIMING …")` around `calcRun` in `calcEnter` and around
  `plotAnalyze` (`now()` is the real clock on the P4); removed before the commit (`grep -c TIMING` → 0).
- `calcBurn` reads the clock every 1000 units and stops a step after `CALC_MS = 120` ms; `calcFresh` resets it,
  the first reading is taken lazily. `calcInteg` burns `parts.length` per refinement.
- `js/system.json`: calc `budget_ms` 80 → 200. `CALC_FUEL` 200000 → 30000, `CALC_CELL_FUEL` 20000 → 5000.
- `calcUserFn` caches by name while the definition object is the same (`calcByName`); `calcCallUser` uses loops
  instead of `map`/`forEach` closures.
- `calcIsPrime`: n up to 2^32, √n computed once, 300 units burnt per 200 passes; the help says "n up to 2^32".
- `plotBuild` appends polylines for new columns only (`p.built`, `cv.ops`); `plotCompose` assembles grid,
  shading, curves, mark and legend; `plotAnalyze` calls only `plotCompose`.

### Why

- Fuel counts closure nodes. It sees neither the garbage collector nor the integrator's own bookkeeping, and its
  cost per unit varies between about 4 µs (a sum) and 8.7 µs (user calls before the change). The clock is the
  limit that matters on the device; fuel stays as the deterministic limit for the Node tests and for fast hosts.
- At 80 ms a turn, a line could do about 40 ms of work: the guide's own examples `fib(15)` and
  `integ(1/sqrt(x), x, 0, 1)` did not fit. A 200 ms budget is spent only when a line is entered or an analysis
  key pressed, which the user is waiting for anyway; typing and plotting turns stay short.
- Rebuilding polylines for the whole curve after every sampling slice and every analysis key made the work grow
  with the square of the columns.

### What worked

Measured inside the turn, after the changes:

| Line | ms | fuel | result |
|---|---|---|---|
| `1 + 1` | 2.1 | 0 | 2 |
| `integ(1/sqrt(x), x, 0, 1)` | 56.3 | 8611 | 1.99999999988 |
| `integ(sqrt(1 - x^2), x, -1, 1)` | 35.7 | 6198 | 1.5707963268 |
| `fib(13)` / `fib(14)` / `fib(15)` | 47.0 / 74.6 / 118.9 | 10542 / 17066 / 27622 | 233 / 377 / 610 |
| `sigma(k^2, k, 1, 5000)` | 75.3 | 15000 | 41679167500 |
| `sigma(k^2, k, 1, 10000)` | 132.0 | 27054 | too much work for one step |
| `integ(integ(1/sqrt(x y), x, 0, 1), y, 0, 1)` | 133.4 | 28148 | too much work for one step |
| `integ(sin(1/x), x, 0, 1)` | 139.0 | 16116 | too much work for one step |
| `isprime(4294967291)` / `isprime(4292870399)` | 78.2 / 78.0 | 16200 | 1 / 0 |

- No crash and no restart in any run after the changes.
- Plotting four curves: 1193 ms over 10 slices, the slowest 16.4 ms of sampling.
- The analysis keys `r x n d i m s`: 3.1–14.9 ms each (115–128 ms before).
- A move of the trace cursor: about 15 ms of CPU.
- Help, CPU per turn including drawing: opening the topics 4.4 ms, a step through the list 4 ms, a guide 7.5 ms,
  the filtered index 9.8 ms.
- The calculator starts in 275.6 ms (start budget 600 ms) at 572.8 KB; 744–780 KB with four curves, help and a
  full history, of 1024.
- Host captures stayed pixel-identical after the incremental build.

### What didn't work

- Reading CPU deltas from `stats` around key presses: typing was still arriving (12 turns in one window), so the
  first numbers (`integ` "62.02 ms", `fib(15)` "9.40 ms") were wrong. The console types about 11 characters a
  second; when the Enter came early, a failed line stayed on the input and the next line was appended to it ("a
  line holds at most 128 tokens", "missing )"). Later runs spaced each line by its length × 0.11 s + 0.8 s and
  pressed Esc between lines.
- With the first clock limit of 40 ms, three of the help's own examples stopped with "too much work for one
  step": `integ(1/sqrt(x), x, 0, 1)` (52.5 ms, 8080 units), `fib(15)` (61.4 ms, 7056 units), and
  `sigma(k^2, k, 1, 10000)` (51.4 ms).
- `isprime(9999999967)` crashed the world:
  `calc crashed handling key: ran past its turn budget of 80 ms`, at `calcIsPrime (apps/calc.js:71:49)`. Its loop
  burnt no fuel. With fuel and a 120 ms clock it then finished in 131.5 ms, between two clock readings, which is
  why the domain is now 2^32.
- With four curves on the graph, each analysis key took 115–128 ms:
  `TIMING analyze m | Marked x = 2.91803. … | 115.15 ms`. Marking does nothing but redraw: `plotBuild`.

### What I learned

- On the P4 a closure node costs about 5 µs, a loop pass of `isprime` about 8 µs, a user-function call about
  4.3 µs per unit after the change (8.7 before). Before the change, `fib(15)` would have taken about 240 ms.
- The host's virtual clock (`PROFILE.ns_per_step`) makes the clock limit deterministic in the shots as well.
- A world's turn budget is the manifest's choice; the kernel enforces it but sets no ceiling.

### What was tricky to build

- The clock check must not call `now()` on every node (it is a kernel call), nor in `calcFresh` (the plot test
  advances a fake clock on every `now()`): it reads the clock every 1000 units, and the first reading starts the
  count.
- Incremental polylines must continue across slices: each call starts at column `built − 1`, so the new polyline
  shares its first point with the last one.

### What warrants a second pair of eyes

- The 200 ms budget: while a heavy line runs, no other world runs. The keyboard has a FIFO and nothing else is
  time-critical, but it is a change to the system's responsiveness for this one app.
- Between two clock readings a step can overrun `CALC_MS` by up to about 20 ms (139 ms seen); with drawing that
  stayed under 160 ms.

### What should be done in the future

- Compiling expressions to JavaScript source instead of closure trees would cut the cost per node, if the engine
  allows `Function`.
- The heap at boot (573 KB) is mostly the 94 KB source and its compiled form; help text could be moved out.

### Code review instructions

- `calcBurn`, `calcFresh`, `CALC_MS`, `calcUserFn`, `calcCallUser`, `calcIsPrime`, `plotBuild`, `plotCompose`;
  `js/system.json`. `node tests/calc.test.mjs`, `make test-apps`, `make shots`; on the device, the commands under
  "What I did".

### Technical details

- Device captures (clean firmware): the history with the heavy lines, four curves with a shaded area, the
  trigonometry group on `atan2`, the index for "at", the modes page.

## Step 6: Documentation, delivery and the report

The guide gained "As built and measured"; the guide and this diary were uploaded as a new bundle; the report went
into the vault; the ticket was closed.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Finish the ticket per the standing process.

**Inferred user intent:** A durable record.

**Commit (docs):** see the ticket's changelog.

### What I did

- Guide section 10; `docmgr` relations, tasks, changelog; upload; vault report with device captures.

### Why

- The guide's limits were wrong; a reader must find the measured ones next to the design.

### What worked

- See the changelog for the upload and report results.

### What didn't work

- N/A.

### What I learned

- N/A.

### What was tricky to build

- N/A.

### What warrants a second pair of eyes

- N/A.

### What should be done in the future

- N/A.

### Code review instructions

- Guide section 10.

### Technical details

- N/A.
