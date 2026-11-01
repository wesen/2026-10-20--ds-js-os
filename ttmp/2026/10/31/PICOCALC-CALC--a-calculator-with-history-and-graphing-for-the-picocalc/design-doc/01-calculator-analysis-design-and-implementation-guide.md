---
Title: 'Calculator: analysis, design and implementation guide'
Ticket: PICOCALC-CALC
Status: active
Topics:
    - picocalc
    - calculator
    - ui
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/js/apps/calc.js
      Note: the calculator and plotter
    - Path: repo://picocalc-os/js/apps/launcher.js
      Note: Calc entry, four columns
ExternalSources: []
Summary: 'A calculator app for picocalc-os: an expression language with variables and one-argument functions, compiled to closures; a history the user can recall; and a function plotter that computes its samples in slices small enough for the kernel''s turn budgets, on the host model and on the ESP32-P4.'
LastUpdated: 2026-10-31T23:59:00-04:00
WhatFor: Onboarding to the calculator and the plan PICOCALC-CALC follows.
WhenToUse: Before changing js/apps/calc.js, the compositor's canvas poly operation, or the home screen's grid.
---

# Calculator: analysis, design and implementation guide

## 1. What this ticket delivers

A calculator app, `calc`, for the PicoCalc: a device whose name promises one, and which so far has only the
agent's `calculate` tool. The app has three parts.

- **An expression language.** Arithmetic with the usual precedence, implicit multiplication (`2pi`, `3(x+1)`),
  about thirty functions, constants, the previous result as `ans`, user variables (`r = 2.5`) and user functions
  of one argument (`f(x) = x^2 - 2`). Radians or degrees.
- **A history.** Every evaluation is kept with its result; the user can walk back through it and recall an
  expression for editing. History, variables and functions survive a reboot.
- **A plotter.** Up to three functions of `x` drawn on a 308×230 canvas with axes, grid and labels; pan, zoom, fit
  and a trace cursor that reads off `(x, y)`.

The reader should finish this guide knowing how a world draws, how its work is limited per turn on the host and
on the ESP32-P4, how a Pratt parser turns `2sin(x)^2` into a tree, why that tree is compiled into closures, and
how a plot is computed in slices so that no single turn runs too long.

## 2. Where a calculator lives in picocalc-os

### 2.1 Worlds, turns and budgets

Every program on picocalc-os is a *world*: a separate JavaScript VM with its own heap limit, started from one file
listed in `js/system.json`. A world runs only in *turns*: the kernel delivers one message (a key, a timer tick, a
reply) and the world's handler runs to completion. Each turn has a *budget*: 50 ms by default, set per world with
`budget_ms`. A turn that runs past it is stopped and the world is restarted by its supervisor. On the host the
budget is counted in virtual time, by counting QuickJS interrupt steps and multiplying by a cost per step measured
on the ESP32-P4; on the device it is wall-clock time.

Two numbers from earlier tickets matter for a calculator that plots:

| Measurement | Value | Source |
|---|---|---|
| A 100,000-iteration JS loop on the P4 | 133 ms (about 1.3 µs per iteration) | the host cost model's calibration, `nucleus/vm.c` |
| The same kind of loop with Wi-Fi up | about 14× slower (1,601 ms against 114 ms) | PICOCALC-AGENT device runs |

The host model does not know about the Wi-Fi slowdown. A computation that fits a budget comfortably on the host
can overrun on the device. The plotter (section 7) is designed for the device's worst case and measures itself
there.

### 2.2 How an app draws

An app never touches pixels. After every segment of the world on screen, the kernel calls the world's `screen`
function, serializes the returned tree to JSON, and, if it differs from the last frame, publishes it to the
compositor (`nucleus/kernel.c`, the render step after `vm_dispatch`). The compositor lays out the tree and draws it.
Rendering is part of the world's segment and counts against its budget, so `screen` must be cheap: build the plot's
drawing operations when the samples change, not on every render.

```text
key "2" -> calc turn: handler edits s.line -> screen(s) -> JSON -> "frames" -> compositor: layout, draw -> display
```

The nodes the calculator uses already exist, with one addition:

| Node | Use |
|---|---|
| `ui.list(items, sel, opts)` | the history: expression on the left, result on the right |
| `ui.input(value, {cursor, prompt})` | the line being typed |
| `ui.text` | the status line (errors, mode) |
| `ui.canvas(w, h, ops, {bg, border})` | the plot; ops are `["fill"|"rect"|"line"|"text", ...]` |
| new canvas op `["poly", points, color]` | a polyline from a flat array `[x0, y0, x1, y1, ...]` |

`fb.line` clips only to the screen, not to the canvas, so the plotter clips every segment to the canvas itself.

### 2.3 Keys

The keyboard driver publishes `{key, ch, state}`; the compositor forwards keys to the app in front, and apps accept
them only from the compositor (`msg.from === "compositor"`). Key names: `enter`, `backspace`, `del`, `esc`, `tab`,
`left`, `right`, `up`, `down`, `home`, `end`, `pgup`, `pgdn`, `f1`–`f10` (F1 is taken by the compositor for the home
screen). `ch` holds the printable character, if any. `state` is `down`, `hold` (auto-repeat) or `up`.

### 2.4 The store

`store.get(key, fallback)` and `store.set(key, value)` keep a world's private JSON record, at most `store_kb`
(16 KB by default). A `set` is a deferred effect: it is written after the segment ends cleanly. On the P4 it is an
NVS blob in the `agentstore` partition, committed by the kernel task; every commit rewrites the record. The
calculator therefore saves at most every few seconds, and when it leaves the screen, not on every Enter.

### 2.5 Why the calculator has its own evaluator

The agent's `calculate` (`js/system/agent.js`) is a 35-line Pratt parser that evaluates while it parses. It cannot
be shared: a world loads exactly one file, there is no module system, and putting code into `js/prelude.js` costs
memory in every world (about 4 KB per world on the host for the file methods alone). It is also the wrong shape:
plotting evaluates one expression three hundred times with different `x`, which wants the expression parsed once
and compiled. The calculator gets its own evaluator; the agent's stays as it is.

## 3. The expression language

### 3.1 Tokens

```text
number    0x1F | 0b101 | 12 | 1.5 | .5 | 2e-3        (hex and binary are integers)
name      [A-Za-z_][A-Za-z0-9_]*                     (sin, x, r2, ans)
operator  + - * / % ^ ! ( ) , =
```

Whitespace separates tokens and is otherwise ignored. `2e3` is a number; `2e` is `2` times the constant `e`,
because an exponent needs digits.

### 3.2 Grammar and precedence

```text
statement := name "=" expr                    define a variable
           | name "(" name ")" "=" expr       define a function of one argument
           | expr
expr      := term (("+" | "-") term)*
term      := unary (("*" | "/" | "%") unary | <implicit> unary)*
unary     := ("-" | "+") unary | power
power     := postfix ("^" unary)?             right-associative: 2^3^2 = 2^9
postfix   := primary "!"*
primary   := number | name | name "(" args ")" | "(" expr ")"
```

| Level | Operators | Associativity | Example |
|---|---|---|---|
| 1 | `+` `-` | left | `1 - 2 - 3 = -4` |
| 2 | `*` `/` `%`, implicit | left | `1/2x = (1/2)·x` |
| 3 | unary `-` `+` | prefix | `-2^2 = -4` |
| 4 | `^` | right | `2^-1 = 0.5` |
| 5 | `!` | postfix | `3!^2 = 36` |

**Implicit multiplication** applies when a term is followed directly by something that starts a primary: a number,
a name or `(`. So `2pi`, `3(x+1)`, `(a+b)(a-b)`, `2x^2` (= `2·(x^2)`) and `x sin(x)` all multiply. It has the same
precedence as `*`, which makes `1/2x` mean `(1/2)·x`. Calculators disagree on that case; this one picks the rule
that needs no exception and says so in its help line.

A name followed by `(` is a function call if the name is a function, and a multiplication if it is a variable:
`r(2)` with `r = 3` is 6. Two letters without a space are one name: `xy` is the name `xy`, not `x·y`.

### 3.3 Names

| Kind | Names |
|---|---|
| Constants | `pi`, `e`, `tau`, `ans` (the last result) |
| One argument | `sqrt cbrt abs sign floor ceil round trunc sin cos tan asin acos atan sinh cosh tanh ln log log2 exp fact deg rad` |
| Two arguments | `atan2(y, x)`, `pow(a, b)`, `mod(a, b)` (result has the sign of `b`), `nCr(n, k)`, `nPr(n, k)`, `gcd`, `lcm` |
| Any number | `min`, `max`, `hypot` |
| User variables | anything not above, defined with `name = expr` |
| User functions | `f(x) = expr`, called as `f(3)`; at most 16 |

`log` is base 10 and `ln` is natural; `fact(n)` and `n!` take integers up to 170. In degree mode (F4) `sin`, `cos`,
`tan` take degrees and `asin`, `acos`, `atan`, `atan2` return degrees.

User functions see the variables as they are when called, so `g(x) = a·x` follows `a`. A user function may call
another; evaluation depth is limited to 32 calls, which stops `f(x) = f(x)` with an error instead of a crash. A
definition may not use a builtin's or constant's name.

### 3.4 Results and errors

A statement's value is a number. Results that are not finite are reported, not shown as numbers: `1/0` gives
"infinite", `sqrt(-1)` "not a real number" (NaN). Errors name the problem and, where it helps, the position:

```text
2 + * 3        ->  "* needs a number before it"
sin 30         ->  "sin needs parentheses: sin(...)"
q + 1          ->  "unknown name q"
(1 + 2         ->  "missing )"
pi = 3         ->  "pi is built in"
```

## 4. From text to numbers

### 4.1 Tokenizer

One regular expression splits the line; each token records its kind and its starting column, which error messages
use. The tokenizer rejects lines over 256 characters or 128 tokens.

### 4.2 Pratt parsing into a tree

A Pratt parser handles precedence by giving each infix operator a binding power and parsing "everything that binds
tighter than p" recursively. The calculator's parser produces a tree of plain objects:

```text
input:  2sin(x)^2 + 1
tokens: 2  sin  (  x  )  ^  2  +  1
tree:   {op:"+", a: {op:"*", a: {num:2}, b: {op:"^", a: {call:"sin", args:[{name:"x"}]}, b: {num:2}}},
                b: {num:1}}
```

Pseudocode, with binding powers 1 (`+ -`), 2 (`* / %` and implicit), 4 (`^`):

```text
parseExpr(min):
  left = parseUnary()
  loop:
    t = peek()
    if t is + - * / %:          p = power(t); if p < min: break; next(); right = parseExpr(p + 1)
    else if startsPrimary(t):    p = 2;        if p < min: break;          right = parseExpr(3)   # implicit *
    else break
    left = {op, a: left, b: right}
  return left
parseUnary():   if - or +: next(); return {op:"neg", a: parseUnary()}; else return parsePower()
parsePower():   base = parsePostfix(); if ^: next(); return {op:"^", a: base, b: parseUnary()}; return base
```

`parseUnary` below `^` is what makes `-2^2 = -4` and `2^-1 = 0.5` both work.

### 4.3 Compiling the tree to closures

Each node becomes a JavaScript function of an environment; children are compiled once, so evaluating the result
does no parsing and no dispatch on node kinds:

```js
function compile(n, ctx) {
  if ("num" in n) { const v = n.num; return () => v; }
  if (n.name === ctx.param) return (x) => x;
  if (n.name) return () => ctx.lookup(n.name);          // variables resolved at call time
  const a = compile(n.a, ctx), b = n.b && compile(n.b, ctx);
  switch (n.op) {
    case "+": return (x) => a(x) + b(x);
    case "^": return (x) => Math.pow(a(x), b(x));
    ...
  }
}
const f = compile(parse("2sin(x)^2 + 1"), { param: "x", lookup });
f(0.5)   // 1.4596...
```

The same compiler serves the calculator (no parameter) and the plotter (`param: "x"`). A compiled function also
reports its size (the number of nodes), which the plotter uses to choose a slice size.

### 4.4 Formatting numbers

```text
integers below 1e15          exactly            12, -40320, 1099511627776
otherwise                    12 significant digits, trailing zeros removed
                                                0.1 + 0.2 -> 0.3      2/3 -> 0.666666666667
below 1e-9 or from 1e15 up   exponent form      6.02214076e23     1.6e-19
-0                           0
```

Twelve digits hide the binary rounding of doubles without hiding real precision a user can see.

## 5. The calculator screen

```text
┌ Calc ───────────────────────── 82% 09:41 ┐
│ sin(pi/6)                          = 0.5 │  history: a list; the newest at the bottom
│ r = 2.5                            r = 2.5│
│ pi r^2                 = 19.6349540849 │
│ f(x) = x^2 - 2                 f defined │
│ f(3)                                 = 7 │
│ ...                                      │
│ ▸ 2ans|                                  │  input
│ RAD · ans = 7                            │  status: mode, last result or error
└ F1 home  F2 graph F3 names F4 deg F5 clr ┘
```

- **Enter** evaluates the line. The entry goes into the history with its result or error; the line clears.
- **Up/Down** select a history entry (the list highlights it). **Enter** on a selected entry copies its expression
  into the line; **Tab** copies its result. **Esc** returns to the line, or clears it.
- **Starting with an operator**: if the line is empty and the user types `+ * / ^ %`, the line becomes `ans` and
  the operator, as on hand-held calculators. `-` is excluded, since a line often starts with a negative number.
- **F2** opens the plot (section 7). **F3** shows the defined names; **Del** there removes one. **F4** toggles
  degrees and radians. **F5** clears the history after a second F5.

The history keeps the last 100 entries. Each entry is `{e: expression, r: shown result, ok}`.

## 6. Names and persistence

```text
store "calc" = {
  v: 1,
  hist:  [{e, r, ok}, ...]            at most 100
  vars:  {r: 2.5, ...}                 numbers only
  funcs: {f: {p: "x", src: "x^2 - 2"}, ...}
  graph: ["f(x)", "sin(x)"]            at most 3
  view:  {x0, x1, y0, y1}
  deg:   false,
  ans:   7
}
```

Functions are stored as source and compiled at start; a stored function that no longer compiles is dropped with a
note in the status line. The record is written when something changed and at least 3 seconds have passed since the
last write (a timer), and on `blur`, when the user leaves the app. 100 entries of about 60 bytes stay well under the
16 KB quota.

## 7. The plotter

### 7.1 The view

```text
canvas 308 × 230 pixels; view {x0, x1, y0, y1} in function units
pixel (px, py) <-> x = x0 + px·(x1 - x0)/(W - 1),  y = y1 - py·(y1 - y0)/(H - 1)
default view: x in [-10, 10], y in [-7.5, 7.5] (square pixels)
```

Keys: arrows pan by a quarter of the view; `+` and `-` zoom by 2 around the centre; `0` restores the default view;
`a` fits `y` to the first curve over the current `x` range; **Enter** turns the trace cursor on and off; with
tracing on, left/right move the cursor one pixel (PgUp/PgDn ten), up/down switch curves; **Esc** returns to the
calculator.

### 7.2 Sampling in slices

A curve is sampled once per pixel column: 308 evaluations. For three curves of moderate size on the device with
Wi-Fi up, that can approach the whole turn budget, and the render after it adds more. So the plotter never computes a
whole plot in one turn:

```text
state: plot = { view, curves: [{src, f, size, ys: []}], col: 0, slice: S }
every 30 ms while the plot is on screen and col < 308:
  t0 = now()
  for c in col .. min(308, col + slice) - 1:
    x = x0 + c·dx
    for each curve: ys[c] = finite(f(x)) ? f(x) : null
  col += slice
  rebuild the drawing operations for the columns done so far
  adapt: elapsed = now() - t0
         if elapsed > 20 ms: slice = max(8, slice / 2)
         if elapsed < 6 ms:  slice = min(maxSlice, slice · 1.5)
maxSlice = clamp(3000 / (total node count of all curves), 8, 308)
```

On the device, `now()` is wall-clock time and advances during a turn, so the slice adapts to the real speed (with
or without Wi-Fi). On the host, `now()` is the virtual clock and does not move within a segment; the slice stays at
the node-based maximum, which the host's cost model has to accept. Either way a plot appears from left to right
within a few hundred milliseconds, and the keys stay responsive while it is drawn.

When the view changes, the samples are discarded and sampling restarts at column 0; when only the trace cursor
moves, nothing is recomputed.

### 7.3 Discontinuities and clipping

```text
for consecutive columns c-1, c with samples ya, yb (function units):
  if ya or yb is null: break the line
  else if ya and yb are outside the view on opposite sides (one above y1, one below y0): break    # tan at pi/2
  else: segment (c-1, py(ya)) -> (c, py(yb)), clipped to 0 <= py <= H-1
```

Clipping one segment between adjacent columns needs only its vertical extent: compute where it crosses `py = 0`
and `py = H-1` and keep the inside part. Pixel coordinates are computed in floating point and rounded at the end.

### 7.4 Axes, grid and labels

The tick step is the "nice" number 1, 2 or 5 × 10^k closest to a fifth of the view's width (and height). Grid lines
are drawn in the soft colour, the axes (where `x = 0` and `y = 0` fall inside the view) in the muted colour, and
labels in the small font along the axes, or along the edges when an axis is off screen. Curves use the accent, blue
and green colours.

### 7.5 Drawing: the `poly` operation

A curve of 308 points as separate `["line", ...]` operations is 308 small arrays in the frame JSON. One
`["poly", [x0, y0, x1, y1, ...], color]` per unbroken run is about a third of that. The compositor draws it with one
`fb.line` call per segment, offset to the canvas. If measurement on the device shows the compositor's turn growing
too much with three curves, a native `gfx.poly` that draws a whole array in one call is the next step.

## 8. The home screen

With the calculator, the launcher has ten apps. Three columns would need four rows and push the description off
the screen; four columns of cells about 73 pixels wide keep it to three rows, with room for the two apps the
system ticket adds. `COLS` in `js/apps/launcher.js` drives both the grid and up/down navigation.

## 9. Implementation plan

| Step | Work | Check |
|---|---|---|
| C1 | `js/apps/calc.js`: tokenizer, parser, compiler, formatter, statements (variables, functions), errors | `tests/calc.test.mjs` (Node, the app in a `vm` context) |
| C2 | The calculator screen: history, recall, auto-`ans`, names view, modes, persistence | unit tests + host script `scripts/calc.txt` |
| C3 | The plotter: view, sliced sampling, discontinuities, clipping, axes, trace, pan/zoom/fit; compositor `poly` op | unit tests of sampling and clipping; captures |
| C4 | Manifest (`calc`, `budget_ms` 80, `mem_kb` 512), launcher entry and icon, four columns | `make shots` |
| C5 | Device: evaluate, plot three curves, pan and trace with Wi-Fi up; slice sizes and compositor turn time measured | P4 captures and log |
| C6 | Diary, report, upload | — |

## 10. Tests

- `tests/calc.test.mjs` runs `calc.js` in a Node `vm` context with a fake app builder, as `tests/editor.test.mjs`
  does. It checks precedence and associativity, implicit multiplication, unary minus against `^`, every builtin,
  degree mode, variables and user functions (including recursion depth), error messages, number formatting,
  history recall and auto-`ans`, persistence through a fake store, sampling (breaks at `tan`'s asymptotes, `null`
  for `sqrt` of negatives), clipping, tick steps, and slice adaptation with a fake clock.
- `scripts/calc.txt` drives the app on the host and captures the calculator, the names view, and plots.
- On the device: a three-curve plot with Wi-Fi up, with `stats` before and after, and the slice size logged.

## 11. API reference

```js
// calc.js, internal
calcTokens(line)                     -> [{t: "num"|"name"|"op", v, at}]
calcParse(line)                      -> {kind: "expr"|"var"|"func", name?, param?, tree}
calcCompile(tree, {param, lookup})   -> f(x) with f.size = node count
calcFormat(v)                        -> string
calcRun(s, line)                     -> {ok, shown} and updates s.vars, s.funcs, s.ans, s.hist
plotSample(s, maxMs)                 -> computes the next slice of columns
plotOps(s)                           -> canvas operations for axes, grid, labels, curves, trace

// compositor, new canvas operation
["poly", [x0, y0, x1, y1, ...], color]   // a polyline; coordinates relative to the canvas
```

## 12. File reference

| File | Role |
|---|---|
| `picocalc-os/js/apps/calc.js` | new: the calculator and plotter |
| `picocalc-os/js/system/compositor.js` | the canvas `poly` operation |
| `picocalc-os/js/apps/launcher.js` | the Calc entry and icon; four columns |
| `picocalc-os/js/system.json` | the `calc` world |
| `picocalc-os/tests/calc.test.mjs` | new: unit tests |
| `picocalc-os/scripts/calc.txt` | new: host script and captures |
| `picocalc-os/js/system/agent.js` | `calculate`, the agent's own evaluator (unchanged; section 2.5) |
| `picocalc-os/nucleus/vm.c` | budgets and the host cost model (`vm_begin_segment`, `on_interrupt`) |
| `picocalc-os/nucleus/kernel.c` | the render step after a segment |

## 13. As built and measured

The plan was followed; this section records where the code differs and what the device measured. Commits:
`d51cf0c` (C1–C4), `a5c66ab` (C5).

### Differences from the plan

| Topic | Planned | Built |
|---|---|---|
| Implicit multiplication | before a number, a name or `(` | before a name or `(` only: `2 3` is an error ("unexpected 3"), `(1+2)3` too |
| Timers | `every 30 ms` while plotting, a save timer | no timers: sampling is a detached chain (`await sleep(30); plotSample`) started when a plot needs it, saving a `sleep(3000).then(save)` started on the first change of a burst. A chain is never returned from a handler, since a returned promise holds the turn open and blocks keys |
| Canvas size | 308×230 | 306×230, so the border fits inside the body |
| Plot labels | along the axes | along the axes; labels that would run past the canvas are left out; the legend has a white backing |
| Plot timing | — | a log line per completed plot: curves, nodes, total ms, slices, slowest slice, final slice |
| Tests | `tests/calc.test.mjs` | 13 tests; `make test-apps` runs the editor's and the calculator's |

### Measurements on the device (ESP32-P4, Wi-Fi up)

| What | Result |
|---|---|
| One curve, `sin(x)` | 298 ms in 5 slices, slowest slice 3.8 ms |
| Two curves | 480 ms in 6 slices, slowest 6.3 ms, slice settled at 72 columns |
| Three curves (`tan`, `f`, `sin`) | 563–580 ms in 6 slices, slowest 8.8 ms |
| Calculator turns during the run | 47 turns, 1,213 ms (about 26 ms each: drawing operations and render dominate) |
| Calculator heap with three curves | 394 KB of 512 KB |
| Crashes | 0 |
| After a reboot | history and `f(x)` restored |

On the host the same three-curve plot takes 160 ms of virtual time in 5 slices: the host's `now()` advances within
a segment by the cost model, so the adaptation runs there too.
