---
Title: Scientific calculator analysis design and implementation guide
Ticket: PICOCALC-SCI
Status: active
Topics:
    - picocalc
    - calculator
    - ui
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: picocalc-os/js/apps/calc.js
      Note: |-
        the calculator this ticket extends
        the calculator: engine, graphing, help, modes, limits
    - Path: picocalc-os/tests/calc.test.mjs
      Note: |-
        its tests, kept passing
        27 tests, including every help entry and the guides' claims
    - Path: repo://picocalc-os/js/apps/launcher.js
      Note: the calculator's description
    - Path: repo://picocalc-os/js/system.json
      Note: calc mem_kb 1024, budget_ms 200
    - Path: repo://picocalc-os/js/system/compositor.js
      Note: ui.lines with visible draws all its rows
    - Path: repo://picocalc-os/scripts/calc.txt
      Note: captures 60-73, 75-79
ExternalSources: []
Summary: 'How to turn the PicoCalc''s calculator into a graphing scientific calculator: angle and display modes, a larger function library, calculus and a solver, functions of several variables, polar and parametric curves, a table, curve analysis, a window page, and built-in help with a function reference.'
LastUpdated: 2026-11-01T02:00:00-04:00
WhatFor: The intern implementing PICOCALC-SCI.
WhenToUse: Before changing js/apps/calc.js.
---

# A graphing scientific calculator: analysis, design and implementation guide

The calculator from PICOCALC-CALC evaluates expressions with variables and one-argument functions, keeps a
history, and plots up to three functions of x with pan, zoom and trace. This ticket makes it a graphing scientific
calculator in the sense of a TI or Casio graphing model, within what a 320 × 320 screen and a 50–80 ms turn allow,
and adds help pages so that every function and key can be looked up on the device.

## 1. What the calculator is today

`js/apps/calc.js` (608 lines) is one world with four parts:

- **Tokens and a Pratt parser** (`calcTokens`, `calcParse`): numbers (also `0x…`, `0b…`, `1e5`), names, the
  operators `+ - * / % ^ !`, parentheses and commas; implicit multiplication (`2pi r`, `3(x+1)`); statements
  `name = expr` and `f(x) = expr`.
- **A compiler to closures** (`calcCompile`): each tree node becomes a JavaScript closure `(x) => …`, so a plot
  evaluates the same expression 306 times without parsing again. The one parameter `x` is passed down as an
  argument.
- **The history and its keys** (`calcRun`, `calcKey`): Enter evaluates, ↑↓ walk the history, Tab inserts a
  result, F2 plots, F3 shows variables and functions, F4 switches degrees and radians, F5 clears.
- **The plotter** (`plotReset`, `plotSample`, `plotBuild`): samples columns a slice at a time in a detached
  `sleep(30).then(…)` chain, adapts the slice to the time it takes, draws polylines on a canvas, and traces.

State is saved with `store.set("calc", …)` three seconds after a change and when the app loses focus.

## 2. What "scientific" and "graphing" add

| Area | Today | After |
|---|---|---|
| Angles | RAD, DEG | RAD, DEG, GRAD |
| Display | 12 significant digits | Normal, Fix n, Sci n, Eng n, Fraction; integers in DEC, HEX, BIN or OCT |
| Functions | 35 | about 70: inverse hyperbolics, sec/csc/cot, log with a base, nth root, gamma, rounding to digits, statistics over arguments, random numbers |
| Constants | pi, e, tau | and 13 physical constants (CODATA 2018 exact or recommended values) |
| User functions | one parameter | up to four parameters: `f(x, y) = …` |
| Calculus | none | `deriv`, `integ`, `solve`, `sigma`, `prod` with a bound variable |
| Curves | 3 functions of x | 4 curves: functions of x, `polar(r)` and `param(x, y)` in t |
| Graph tools | trace | trace with root, minimum, maximum, intersection, dy/dx, area; a table of values; a window page; a curve list |
| Help | one hint line | topic pages, a function reference with examples, an index with type-to-filter, help for the name at the cursor, insert from help |

Complex numbers, units and matrices stay out: each would change every function's domain, and the screen is small.

## 3. The engine

### 3.1 Bound names as cells

Today a compiled closure takes the one parameter as its argument. Several features need more names bound at
once: `f(x, y)`, `integ(t^2, t, 0, x)` inside a plot of x, `sigma(k^2, k, 1, n)` inside a function of n. The
compiler therefore resolves every bound name, at compile time, to a **cell**, an object `{ v }`; a reference
compiles to `() => cell.v`, and whoever binds the name sets `cell.v` before calling the body.

```text
compile(node, scope)            scope: name -> cell, innermost first, then the user's variables
  number        -> () => n
  bound name    -> () => cell.v
  variable      -> () => s.vars[name]  (checked when it runs, so later assignments count)
  call builtin  -> (…) => f(args…)
  call user fn  -> callUser(name, args)       sets the function's cells, saving the old values (recursion)
  special form  -> integ(body, t, a, b) etc.  compiles body with a new cell for t; sets t.v per sample
```

The plotter keeps calling `f(x)`: `plotCompile` wraps the body as `(x) => { cell.v = x; return body(); }`.

Saving and restoring a cell around each binding makes recursion and nesting correct. Recursion needs a way to
stop, so the language also gains comparisons (`< <= > >= == !=`, giving 1 or 0, below `+` and `-` in precedence)
and `if(c, a, b)`, which evaluates only the branch it takes: `f(n) = if(n < 2, 1, n f(n - 1))`. The same makes
piecewise curves possible: `if(x < 0, -x, x^2)`. The depth limit (32 calls) still applies.

### 3.2 Special forms

A special form looks like a call whose second argument is a bare name that the form binds:

| Form | Meaning | Method | Limits |
|---|---|---|---|
| `deriv(expr, t, a)` | d/dt of expr at t = a | central differences with two step sizes and Richardson extrapolation | 4 evaluations |
| `integ(expr, t, a, b)` | ∫ from a to b dt | adaptive Gauss–Kronrod 7/15, tolerance 1e-10 relative | 30 intervals, 450 evaluations |
| `solve(expr, t, a)` / `solve(expr, t, a, b)` | a t where expr = 0 | from a guess: secant, then a search outward for a sign change; with a bracket: Brent | 200 evaluations |
| `sigma(expr, k, a, b)` | Σ for integer k from a to b | a loop | 10 000 terms |
| `prod(expr, k, a, b)` | Π for integer k from a to b | a loop | 10 000 terms |

The parser recognises them by name; their bound name may shadow a variable inside the form only.

### 3.3 Work limits

A turn on the device may run 80 ms (`budget_ms` of calc) before the kernel stops the world. `sigma(…, 1, 10000)`
inside `integ` inside a plot multiplies. Every evaluation of a special form's body costs its node count from a
**fuel** counter that each top-level evaluation (a line, a table cell, a plot column) starts full; running out
throws "too much work for one step". The amount is calibrated on the P4 (step 4): the goal is that one line never
takes more than about 50 ms there. The plotter additionally ends a slice early once 25 ms have passed, column by
column, rather than only adjusting the next slice.

### 3.4 New functions

| Group | Functions |
|---|---|
| trigonometry | `sin cos tan sec csc cot asin acos atan acot atan2(y, x)`, all in the angle mode |
| hyperbolic | `sinh cosh tanh asinh acosh atanh` |
| powers, logs | `sqrt cbrt root(x, n) exp ln log(x) log(x, b) log2 pow` |
| rounding | `abs sign floor ceil round(x) round(x, d) trunc frac` |
| integers | `fact gamma nCr nPr gcd lcm mod isprime` |
| statistics | `sum mean median sd var min max` over any number of arguments |
| random | `rand() randint(a, b)` |
| angles | `deg rad` |

Constants: `pi e tau` and `c0` (speed of light), `g0` (standard gravity), `Gc` (gravitational constant), `hP`
(Planck), `hbar`, `kB` (Boltzmann), `NA` (Avogadro), `R0` (gas constant), `qe` (elementary charge), `me` and `mp`
(electron and proton mass), `eps0`, `mu0`. Names that people use for their own variables (`c`, `g`, `h`, `k`, `R`)
stay free.

### 3.5 Display

The history keeps each result's value as well as its text, and draws the value in the current format, so changing
the format changes the whole history:

| Format | 1234.5678 | 0.000123 |
|---|---|---|
| Normal (12 digits) | 1234.5678 | 0.000123 |
| Fix 2 | 1234.57 | 0.00 |
| Sci 4 | 1.235e3 | 1.230e-4 |
| Eng 4 | 1.235e3 | 123.0e-6 |
| Fraction | 1234.5678 (no small fraction) | 123/1000000 |

Fraction uses continued fractions with denominators up to 10 000 and shows a fraction only when it equals the
value to 1e-12 relative. Integers can also be shown in HEX, BIN or OCT (`0x4D2`), up to 2^53.

## 4. Graphing

### 4.1 Curves

Up to four curves, each `{ src, on }`, in the colours accent, blue, green and amber:

- a function of x: `sin(x)`, `f(x)`, or a defined function's name;
- `polar(r)`: r as a function of t, drawn at angle t (in the angle mode);
- `param(x, y)`: both in t.

The t range defaults to one full turn in the angle mode (0..2π, 0..360, 0..400) until the window page sets it.
Every curve is sampled at 306 steps: columns for functions, values of t for the others. Parametric segments are
clipped to the canvas with Liang–Barsky; a step to a non-finite value breaks the line.

### 4.2 Trace and analysis

Enter starts tracing; ←→ move along the curve (by column, or by t step), ↑↓ change curve. While tracing, on a
function curve:

| Key | Result |
|---|---|
| r | the root nearest the cursor: a sign change among the samples, then Brent on that interval |
| n / x | the nearest local minimum / maximum: a sample extremum, then a golden-section search |
| i | where this curve meets the next function curve (a root of their difference) |
| d | dy/dx at the cursor |
| m, then s | mark an x, then the area from the mark to the cursor (shaded), with `integ` |

The cursor moves to the result and the status line shows it to 10 digits.

### 4.3 Pages

- **Curves (F8)**: the list of curves; space switches one on or off, Del removes it, Enter moves it to the input
  line for editing.
- **Window (F9)**: x min, x max, y min, y max, t min, t max, table start, table step; each field takes an
  expression (`-2pi`); Enter applies it if the range stays valid.
- **Table (F7)**: x from the table start in table steps, with the function curves' values; ↑↓ scroll a row,
  PgUp/PgDn a page.
- **Modes (F4)**: angle, format, digits, integer base, with ←→ or Enter to change.

## 5. Help

### 5.1 What there is

- **Topics**: Start here, Keys, Numbers and operators, Variables and functions, Calculus and solving, Graphing,
  Modes and formats, and one page per function group with its entries.
- **A reference entry** per function and constant: its form, one sentence, an example with its result, e.g.
  `integ(expr, t, a, b)` — "the integral of expr over t from a to b" — `integ(x^2, x, 0, 3)` = 9.
- **An index**: every entry alphabetically; typing letters filters it.
- **Help for the name at the cursor**: F6 with the cursor on or just after `atan2` opens its entry.
- **Insert**: Tab on an entry puts its template (`atan2(`) into the input line and returns to it.

### 5.2 Keeping help true

The examples in the reference are evaluated by a test: each entry's example runs through `calcRun` and must give
the result written next to it. A function without a help entry fails the same test.

## 6. Keys

| Where | Keys |
|---|---|
| calculator | ⏎ evaluate · ↑↓ history · Tab insert result · Esc clear · F2 graph · F3 variables · F4 modes · F5 clear history (twice) · F6 help · F7 table · F8 curves · F9 window |
| graph | arrows pan · + − zoom · 0 reset · a fit · ⏎ trace · Del remove curve · F7 table · F8 curves · F9 window · Esc back |
| trace | ←→ move · PgUp/PgDn ×10 · ↑↓ curve · r root · n min · x max · i intersect · d dy/dx · m mark · s area · ⏎/Esc stop |
| help | ↑↓ choose · ⏎ open · Tab insert · letters filter the index · Esc back |

F1 stays the compositor's home key.

## 7. State

Record version 2: `hist` (entries with the value), `vars`, `funcs` (with a parameter list), `graphs`
(`{ src, on }`), `view`, `tview`, `table`, `angle`, `fmt` (`{ mode, digits, base }`), `ans`. A version 1 record is
migrated: `graph` becomes curves that are on, `deg` becomes the angle, one-parameter functions keep working.

## 8. Plan

| Step | What | Check |
|---|---|---|
| C1 | cells; several parameters; special forms; fuel; new functions and constants; angle and display modes; record v2 | `calc.test.mjs` extended; old tests pass |
| C2 | four curves, polar, param, curve list, window, table, analysis keys, shading | tests; `scripts/calc.txt` captures |
| C3 | help: topics, reference, index, cursor help, insert; the modes page; help examples tested | tests; captures |
| C4 | the P4: fuel calibration, plot and analysis timings, help on the device | measurements, captures, diary |

## 9. Files

- `picocalc-os/js/apps/calc.js` — everything above, one world
- `picocalc-os/tests/calc.test.mjs`, `picocalc-os/scripts/calc.txt`
- `picocalc-os/js/apps/launcher.js` — the calculator's description

## 10. As built and measured

The design held for the language, the graphing and the help. The work limits in section 3.3 did not survive the
device, and two hot paths had to change. Commits: `0150e14` (C1 engine), `edbe092` (C2 graphing), `0501a03` (C3
help and modes), `267ed70` (C4 measured on the P4).

### 10.1 Differences from the design

- **`integ` splits up to 100 times**, not 30 (`CALC_PARTS`): an end where the integrand is infinite but the area
  finite, like 1/√x at 0, needs about 50 halvings. `integ(1/x, x, 0, 1)` is still refused.
- **`solve` with two values** uses bisection after the sign change (`calcBisect`), not Brent; a sign change where
  |f| stays large is refused as a pole.
- **A step is limited by the clock as well as by fuel.** `calcBurn` reads `now()` every 1000 units and stops a
  step after `CALC_MS = 120` ms. Fuel (`CALC_FUEL = 30000`, a plot cell 5000) remains the deterministic limit for
  the Node tests and fast hosts; on the host the clock is the virtual one, so the shots behave like the device.
- **The calculator's turn budget is 200 ms** (`js/system.json`), not 80. At 80 ms a line could do about 40 ms of
  work, and `fib(15)` or `integ(1/sqrt(x), x, 0, 1)` did not fit. Only entering a line or pressing an analysis key
  can take long; typing, help and plotting turns take a few to 20 ms.
- **`isprime` goes up to 2^32**, not 10^10; its loop burns fuel. Near 10^10 it took 131 ms.
- **Plots build polylines incrementally.** `plotBuild` adds the columns sampled since the last call to each curve's
  `ops`; `plotCompose` assembles grid, shading, curves, mark and legend; the analysis keys only recompose.
- **F4 is the modes page**; the angle cycle is gone. **Help** is as in section 5, plus: F6 from the graph and the
  pages opens their guide; F6 on a partial name opens the index filtered by it, and Enter completes the name; F6
  on one of your own names shows its value or definition in the status line.
- `ui.lines` with `visible` drew one row too few; the compositor now adds the 4 pixels `drawLines` keeps.

### 10.2 On the ESP32-P4

The P4's FPU is single-precision; JavaScript doubles are done in software. A closure node costs about 5 µs, a
pass of `isprime`'s loop about 8 µs.

| Line | ms in the turn | fuel | result |
|---|---|---|---|
| `1 + 1` | 2.1 | 0 | 2 |
| `integ(1/sqrt(x), x, 0, 1)` | 56.3 | 8611 | 1.99999999988 |
| `integ(sqrt(1 - x^2), x, -1, 1)` | 35.7 | 6198 | 1.5707963268 |
| `fib(13)`, `fib(14)`, `fib(15)` | 47.0, 74.6, 118.9 | 10542, 17066, 27622 | 233, 377, 610 |
| `sigma(k^2, k, 1, 5000)` | 75.3 | 15000 | 41679167500 |
| `sigma(k^2, k, 1, 10000)` | 132.0 | 27054 | too much work for one step |
| `integ(integ(1/sqrt(x y), x, 0, 1), y, 0, 1)` | 133.4 | 28148 | too much work for one step |
| `isprime(4294967291)` | 78.2 | 16200 | 1 |

| What | Measured |
|---|---|
| Start of the world | 275.6 ms of its 600 ms start budget; 572.8 KB |
| Four curves (function, polar, param, function) | 1193 ms in 10 slices, slowest slice 16.4 ms |
| Analysis keys r x n d i m s, four curves | 3.1–14.9 ms each (115–128 ms before the incremental build) |
| A trace step | about 15 ms of CPU, drawing included |
| Help: topics, list step, guide, filtered index | 4.4, 4, 7.5, 9.8 ms of CPU |
| Heap with four curves, help and a full history | 744–780 KB of 1024 |
| User-function calls | 8.7 µs per unit before caching by name, 4.3 after: `fib(15)` about 240 → 119 ms |

### 10.3 Tests

| Suite | Count | What |
|---|---|---|
| `tests/calc.test.mjs` | 27 (13 from before) | the engine (C1), graphing (C2), every built-in's help entry and example, the guides' examples and claims, F6 and completion, the modes page (C3), `isprime` at the cap |
| `make shots` | — | `scripts/calc.txt` → 60–73, 75–79 |
