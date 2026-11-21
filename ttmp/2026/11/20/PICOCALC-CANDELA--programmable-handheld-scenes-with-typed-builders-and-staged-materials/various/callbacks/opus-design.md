---
Title: Opus staged pattern design consultation
Ticket: PICOCALC-CANDELA
DocType: reference
Topics: [compiler]
Status: complete
---

# Staged Pattern Callbacks for Typed JavaScript: An Implementable Design

## 0. Core idea

`pattern(p => expr)` is **not a closure**. It is a lexically delimited, inline-expanded construction block that runs exactly once, at the point where the `pattern(...)` call is evaluated.

- **Captures** are ordinary reads of the enclosing function's locals. They are read immediately, so they are snapshots by construction. No environment object exists.
- **The parameter `p`** is a compile-time constant binding of type `Surface`. Its only value is the construction sentinel. It needs no storage.
- **Expression handles** (`ScalarExpr`, `Vec2Expr`, `BoolExpr`) are distinct i32 indices into the node table of a caller-owned scene buffer.
- **Operators on handles** lower to builder calls that append nodes.
- **Uniform parameters** are nodes that reference a uniform slot. Editing the slot changes render output without touching the node table, and without re-entering any callback. Re-entry is impossible because no callable callback exists after compilation.

Both backends need only what they already have: constants, local load/store, direct calls, and a small runtime library. The frontend gets one new scope kind, one lookahead classifier, an operator dispatch table, and a handful of diagnostics.

---

## 1. Language surface

### 1.1 Types

| Type | Runtime repr | Meaning |
|---|---|---|
| `i32`, `bool` | i32 | Construction-time values |
| `SceneBuf` | i32 pointer to caller-owned buffer | Node table, uniform table, pattern roots |
| `ScalarExpr` | i32 node index | Per-pixel scalar (Q16.16 at render time) |
| `Vec2Expr` | i32 node index | Per-pixel 2-vector |
| `BoolExpr` | i32 node index | Per-pixel predicate |
| `Surface` | i32, exactly one value `SURFACE_BUILD` | Stage capability token |
| `Pattern` | i32 root index | Finished pattern |

All handle types are distinct. There are no implicit conversions between them, none to or from `i32` except the `i32 → ScalarExpr` lift (§3.5), and no truthiness. Node index 0 is reserved as invalid.

### 1.2 Accepted forms

```ts
pattern(p => expr)              // bare: scene resolved lexically (§3.3)
pattern((p) => expr)
pattern((p: Surface) => expr)
scene.pattern(p => expr)        // receiver form: explicit scene
pattern(shade)                  // named function with signature (Surface) => ScalarExpr
```

The body is a single AssignmentExpression-precedence expression. It may not contain block bodies, assignments, `++`/`--`, or indexed stores. `scene.param(slot, init)` returns a uniform `ScalarExpr`. It is legal anywhere a `SceneBuf` is available.

### 1.3 Example

```ts
function octaves(p: Surface, n: i32): ScalarExpr {      // staged helper
  if (n == 0) return lit(0);                              // construction-time branch: OK
  return p.uv.len() / n + octaves(p, n - 1);              // unrolls n times
}

function ring(p: Surface, r: ScalarExpr, w: i32): ScalarExpr {
  const d = p.uv.len();
  return select(abs(d - r) < w, 1, 0);                    // per-pixel choice
}

function build(scene: SceneBuf, rings: i32): Pattern {
  const radius = scene.param(0, 20);                      // uniform slot 0
  const w = 3;                                            // captured snapshot
  return pattern(p => ring(p, radius + p.time, w) + octaves(p, rings));
}
```

---

## 2. Runtime model (shared by both backends)

### 2.1 Scene buffer layout

The buffer is caller-owned and lives in linear memory or the numeric VM heap.

```
header:   node_count, node_cap, uniform_cap, pattern_count, pattern_cap, error_flag
nodes[]:  { kind:i32, op:i32, a:i32, b:i32, c:i32, span:i32 }   // index 0 = invalid
uniforms[]: i32 (Q16.16)
patterns[]: root node index
```

Surface accessors (`uv`, `time`, …) may be preallocated at fixed node indices during scene init. This is optional, but it makes repeated `p.uv` free, which in turn makes node counts easy to predict in tests.

### 2.2 Stage state

There is one pair of runtime globals per backend. In Wasm, these are named `$%tj.stage_scene` and `$%tj.stage_depth`. In the numeric VM, they are two registers.

```
stage_enter(scene) -> saved:
    saved = g.scene; g.scene = scene; g.depth += 1; return saved
stage_exit(root: ScalarExpr, saved, span) -> Pattern:
    check kind(root) == Scalar
    h = append_pattern(g.scene, root, span)
    g.scene = saved; g.depth -= 1; return h
every builder intrinsic x_*(..., span):
    if g.depth == 0: trap STAGE_INACTIVE          // defence in depth; statically unreachable
    validate operand indices < node_count and kinds match
    if any operand == 0 or buffer full: set error_flag, return 0   // sticky, no trap
    append node {kind, op, operands, span}; return index
surf_uv(s: Surface, span): check s == SURFACE_BUILD and depth > 0; return UV_NODE
scene_param(scene, slot, init): uniforms[slot] = init (if first time); return/append UNIFORM node
```

Host API: `scene_set_param(scene, slot, v)`, `scene_node_count(scene)`, `scene_error(scene)`, `render(scene, pat, outBuf)`.

The buffer is caller-owned, so overflow uses a sticky error flag rather than a trap. Construction always finishes, invalid handle 0 propagates, and the host sees exactly one clear error.

### 2.3 Intrinsic signature convention

Every builder intrinsic takes its operands in source order, followed by a trailing `span:i32`. This trailing-span ABI is what lets a single-pass emitter push the span id after the operands are already on the stack, with no reordering.

Mixed-type arithmetic gets dedicated variants: `x_add_ss`, `x_add_si`, `x_add_is` (and likewise for `sub`, `mul`, `div`, `lt`, …). The `_is` variant lifts its first operand internally, so an i32 left operand that is already on the stack never needs a swap.

---

## 3. Frontend: parsing and scoping

### 3.1 Data structures

```
Type      = I32 | Bool | SceneBuf | ScalarExpr | Vec2Expr | BoolExpr | Surface | Pattern | Buffer<T> | Error
Binding   = { name, kind: Local|Param|ConstSurface|Function, type, slot?, declSpan, stageOwner?: StageId }
Scope     = { kind: Function|Block|Callback, bindings: Map<name,Binding>, stage?: StageFrame }
StageFrame= { id, paramName, paramSpan, arrowSpan, depthInFn, captures: OrderedSet<Binding> }
ExprInfo  = { type, span, stagedCause?: Span, place?: Place }   // stagedCause: why this became an Expr
FnCtx     = { scopes: Scope[], stages: StageFrame[], hasSurfaceParam: bool,
              temps: Map<string,LocalSlot>, discard: bool }
```

`Error` unifies with every type, which suppresses cascading diagnostics. When the first error occurs in a function, `discard = true`. From that point the emitter drops ops for the function, so Wasm validation never sees an unbalanced stack, but parsing and type-checking continue so further diagnostics are still reported.

### 3.2 Lookahead classifier

The classifier runs only at the argument position of a staged builder. It must decide before anything is emitted, because emit-as-you-parse would otherwise treat `p` as an identifier load.

```
classifyCallback():                       // peeks, consumes nothing; ≤ 6 tokens on success path
  t = peek(0..5)
  if t0 IDENT  && t1 '=>'                                   -> Arrow(name=t0, paramTokens=1)
  if t0 '('    && t1 IDENT && t2 ')' && t3 '=>'             -> Arrow(name=t1, paramTokens=3)
  if t0 '('    && t1 IDENT && t2 ':' && t3 IDENT && t4 ')' && t5 '=>':
       if t3.text != "Surface": diag TJ0402 at t3 "callback parameter must be Surface"
       -> Arrow(name=t1, paramTokens=5)
  if t0 IDENT  && t1 in {')', ','} && resolvesToFunction(t0) -> NamedFn(t0)
  // error path only: balanced scan to the matching ')' looking for '=>'
  if scanFindsArrow(): diag TJ0402 "callback takes exactly one parameter `p` (no defaults/destructuring)"
  else:                diag TJ0402 "pattern expects a callback `p => expr` or a function name"
  -> Invalid
```

### 3.3 Staged builder parse

```
parseStagedBuilder(builderTok, receiver: ExprInfo | null) -> ExprInfo
  expect('(')
  if receiver == null:                                  // bare `pattern(...)`
     sbs = visibleBindingsOfType(SceneBuf)              // walks all scopes, captures allowed
     if sbs.size != 1: diag TJ0408 at builderTok
                       (0: "no SceneBuf in scope"; >1: list candidates, help "use scene.pattern(...)")
     emitLoad(sbs[0])
  // else: receiver already on the stack (receiver lowering, §3.6)
  emitRt("stage_enter")                                 // [scene] -> [saved]
  d   = fn.stages.size + 1
  tmp = fn.tempForDepth(d)                              // "%stage{d}.saved", lazily allocated, reused per depth
  emitStoreLocal(tmp)

  form = classifyCallback()
  case form of
    NamedFn(f):
      fnB = resolveFunction(f)
      if fnB.sig != (Surface) -> ScalarExpr: diag TJ0416 (primary f, secondary fnB.declSpan)
      advance()
      emitConst(SURFACE_BUILD); emitCall(fnB)
      root = { type: ScalarExpr, span: f.span }
    Arrow(name, n):
      paramSpan = consume(n tokens)
      arrow = expect('=>')
      if peek() == '{':
         diag TJ0403 at '{' "callback body must be an expression"; recoverToMatching(')'); return ERROR
      frame = { id: newStageId(), paramName: name, paramSpan, depthInFn: d, captures: {} }
      fn.stages.push(frame)
      fn.scopes.push(Scope{ kind: Callback, stage: frame })
      declare(name, Binding{ kind: ConstSurface, type: Surface, stageOwner: frame.id, declSpan: paramSpan })
      body  = parseExpr(PREC_ASSIGNMENT)                // stops at ',' and ')'
      root  = coerceCallbackResult(body)
      frame.arrowSpan = join(paramSpan, body.span)
      fn.scopes.pop(); fn.stages.pop()
      debugInfo.recordCallback(frame)
    Invalid:
      recoverToMatching(')'); return ERROR
  if peek() == ',': diag "pattern takes exactly one callback"
  closeTok = expect(')')
  emitLoadLocal(tmp)
  emitConst(spanId(join(builderTok.span, closeTok.span)))
  emitRt("stage_exit")                                  // [root, saved, span] -> [Pattern]
  return { type: Pattern, span: join(builderTok.span, closeTok.span) }

coerceCallbackResult(r):
  I32        -> emitConst(spanId(r.span)); emitRt("x_lit"); return ScalarExpr
  ScalarExpr -> r
  Vec2Expr   -> TJ0407 "pattern needs ScalarExpr, got Vec2Expr"; help "use .x, .y or .len()"
  BoolExpr   -> TJ0407 ...; help "select(cond, 1, 0)"
  Bool       -> TJ0407 "construction-time bool"; help "flag ? 1 : 0"
```

The word `pattern` is reserved. Declaring a function or local named `pattern` is TJ0415, so `parsePrimary` never has to perform a shadowing check.

### 3.4 Identifier resolution across callback boundaries

```
resolve(tok) -> Binding
  crossed = false
  for s in fn.scopes, innermost first:
    if b = s.bindings[tok.text]:
       if crossed && b.type == Surface:
          diag TJ0405 primary tok.span "surface `{b.name}` belongs to an enclosing stage"
                      secondary b.declSpan; help "use `{fn.stages.top.paramName}`"
       if crossed: fn.stages.top.captures.add(b)        // debug info only; codegen is a plain local.get
       return b
    if s.kind == Callback: crossed = true
  return globals[tok.text] ?? diag "unknown identifier"
```

The rule that **Surface bindings never cross a callback boundary** is what makes a single sentinel safe. At runtime, an outer `p` and an inner `q` are the same i32, so the frontend is the only thing that can keep them apart. The rule applies to an enclosing callback's `p` and also to a helper's own `p: Surface` parameter referenced from a callback written inside that helper.

### 3.5 Primary, unary, binary and logical parsing

```
parsePrimary():
  tok = advance()
  case IDENT:
    if peek() == '=>': diag TJ0401 "arrow functions are only allowed as the argument of pattern(...)";
                       skipArrowBody(); return ERROR
    if tok.text == "pattern": return parseStagedBuilder(tok, null)
    b = resolve(tok)
    case b.kind:
      ConstSurface: emitConst(SURFACE_BUILD)
      Function:     return parseDirectCall(b, tok)
      default:      emitLoad(b)
    return { type: b.type, span: tok.span, stagedCause: isExpr(b.type) ? tok.span : null, place: Var(b) }
  case '(':
    if lookaheadIsParenArrow(): diag TJ0401; skipArrowBody(); return ERROR
    ... existing parenthesized expression
  ...

parseExpr(minPrec):
  start = peek().span.start
  left  = parseUnary()                        // '!' on BoolExpr -> b_not; '-' on ScalarExpr -> x_neg
  loop:
    op = peek()
    if !isBinary(op) || prec(op) < minPrec: break
    if isAssign(op):   left = parseAssign(left, op);         continue
    if op in {&&,||}:  left = parseLogical(left, op, start); continue
    if op == '?':      left = parseTernary(left, start);     continue
    advance()
    right = parseExpr(prec(op) + 1)
    left  = emitBinary(op, left, right, Span(start, right.span.end))
  return left
```

**Operator dispatch** happens after both operands have been emitted, when both types are known:

```
emitBinary(op, L, R, span):
  row = OPTABLE[op][kind(L.type)][kind(R.type)]   // kinds: I, B, S, V, Bx, other
  if row == none:
     if op in {==, !=} && (isExpr(L) || isExpr(R) || is Surface):
        diag TJ0409 "== compares handle identity, not values"; help "eq(a, b)"
     else diag type mismatch (both spans)
     return ERROR
  if row.native: emitNative(row.op); return { type: row.result, span }
  if !hasStage(): diag TJ0406 at op "staged operation outside a construction stage";
                  note "add a `p: Surface` parameter or move into pattern(p => ...)"
  emitConst(spanId(span)); emitRt(row.intrinsic)      // e.g. x_add_is, b_lt_si, v_scale_vs
  return { type: row.result, span, stagedCause: L.stagedCause ?? R.stagedCause }

hasStage() = fn.stages.nonEmpty || fn.hasSurfaceParam
```

Representative table rows:

| Operands | `+` | `<` |
|---|---|---|
| I, I | native | native → Bool |
| S, S | `x_add_ss` | `b_lt_ss` → BoolExpr |
| S, I | `x_add_si` | `b_lt_si` → BoolExpr |
| I, S | `x_add_is` | `b_lt_is` → BoolExpr |
| V, V | `v_add` | none |

`*` also has `v_scale_vs` and `v_scale_sv`.

**Logical operators** decide from the left operand's type, which is known before the right operand is parsed:

```
parseLogical(left, op, start):
  advance()
  if left.type == Bool:                   // construction-time, real short circuit
     emitShortCircuitBegin(op)
     right = parseExpr(prec(op)+1)
     if right.type == BoolExpr: diag TJ0410 (primary right, secondary left "construction-time bool")
                                help "decide during construction: left ? right : ..."
     emitShortCircuitEnd()
  else if left.type == BoolExpr:          // graph AND/OR: both sides built, no short circuit
     right = parseExpr(prec(op)+1)
     if right.type != BoolExpr: diag TJ0410
     require hasStage(); emitConst(spanId(...)); emitRt(op == && ? "b_and" : "b_or")
  ...
```

**Ternaries.** `cond ? a : b` with a `BoolExpr` condition is TJ0413, with help `select(cond, a, b)`. Lowering it to `select` silently would evaluate both branches eagerly, which breaks the JS mental model, so it is rejected instead. With a `bool` condition, the ternary is construction-time specialization and is encouraged. All handles are i32 at runtime, so the Wasm blocktype is always `i32`. If the then-branch is `ScalarExpr` and the else-branch is `i32`, the else-branch is lifted at its end. The reverse case is a type error with help `lit(n)`, because the then-branch has already been closed.

**Lifting.** Only `i32 → ScalarExpr` is ever implicit. It happens in three places: at a call argument whose expected type is `ScalarExpr`, at the callback result, and inside the `_is`/`_si` intrinsics. `bool` never lifts to `BoolExpr`. Passing a `bool` to `select`'s condition is TJ0411, with help "use `flag ? a : b`".

**Assignments.**

```
parseAssign(left, op) / parsePrefixPostfixIncDec:
  if fn.stages.nonEmpty:
     what = left.place is Var(b) && b.kind == ConstSurface ? "the callback parameter"
          : left.place is Index ? "a buffer element"
          : "captured variable `{name}`"
     diag TJ0404 primary op span "cannot assign to {what} inside a pattern callback"
     note "callbacks run once during construction and are read-only"
```

The body is expression-only and has no bindings of its own, so every assignment in it necessarily targets a capture, the parameter, or a buffer. This makes the check trivial and the message exact.

### 3.6 Receiver lowering

```
parsePostfix(left):
  loop:
    if peek() == '.':
      advance(); m = expect(IDENT)
      entry = RECEIVERS[left.type][m.text]
              ?? diag TJ0414 "no member `m` on {left.type}"; list members
      if entry.needsStage && !hasStage(): diag TJ0406 at m
      // the receiver is already on the stack: it is the first argument
      if entry.isMethod: expect('('); parseArgs(entry.params[1..]); expect(')')
      if entry.special == StagedBuilder: left = parseStagedBuilderAfterReceiver(m, left); continue
      emitConst(spanId(Span(left.span.start, prev.end))); emitRt(entry.intrinsic)
      left = { type: entry.result, span: ..., stagedCause: ... }
    ...
```

The receiver tables are fixed in v1:

- `Surface`: `.uv`, `.time`, `.px`
- `Vec2Expr`: `.x`, `.y`, `.len()`, `.dot(v)`
- `ScalarExpr`: `.abs()`, `.min(s)`, `.max(s)`, `.clamp(a, b)`
- `SceneBuf`: `.param(slot, init)` (no stage needed), `.lit(n)`, `.pattern(cb)`

The receiver is evaluated first, which is exactly the stack position of the first argument, so no temporaries are needed. `scene.pattern(cb)` works because `stage_enter` consumes the scene from the stack.

User-defined functions do **not** participate in receiver lowering in v1, so `s.ring(r)` is TJ0414. Keeping receiver names to a closed table means member lookup never has to search user function scopes, and adding a user function can never silently change the meaning of a dotted call. UFCS is noted as an extension in §7.

### 3.7 Conditions in statements

```
checkCondition(c: ExprInfo, kw):
  Bool:     ok
  BoolExpr: diag TJ0412 (below)
  ScalarExpr | Vec2Expr | Surface | Pattern | SceneBuf:
            diag TJ0417 "{type} is a handle and has no truthiness"
  I32:      existing "i32 is not bool; write `x != 0`"
```

`checkCondition` is called from `if`, `while`, `do…while` and `for`. Exact diagnostic text for TJ0412:

```
error[TJ0412]: `if` condition is a staged BoolExpr, not a bool
  --> shapes.tjs:14:7
   |
12 |   const d = p.uv.len();
   |         - `d` is ScalarExpr
14 |   if (d < r) return lit(1);
   |       ^^^^^ BoolExpr: a graph node evaluated per pixel at render time
   |
   = note: `if` runs once while the graph is constructed; it cannot see per-pixel values
   = help: choose per pixel with `select(d < r, 1, 0)`
```

The primary span is the whole condition. The secondary span comes from `stagedCause`, which points at the leftmost operand that was already an Expr, plus that operand's declaration when it is a variable. This diagnostic matters because, without distinct handles, `if (h)` would silently test `node_index != 0`, which is always true.

---

## 4. Interactions

### 4.1 Named direct functions

**Staged helpers.** A function with a `Surface` parameter is a staged helper. It is called directly like any other function. Its body is a normal statement body: `if` and loops on `i32`/`bool`, local `const`s of Expr type, and recursion are all allowed. All of it runs at construction time, and recursion unrolls into the graph. Holding the `Surface` parameter is the static proof of capability (§3.5). The runtime depth check backs it up.

**Non-staged functions.** These can be called from callback bodies to compute `i32` values. They are allowed to have side effects on buffers they receive. That is a deliberate tradeoff (§7), and it is also what makes "constructed once" directly observable in tests.

**Function as callback.** `pattern(shade)` is sugar that lowers to `const SURFACE_BUILD; call shade`. No function values exist, so `NamedFn` classification is unambiguous.

**Nested stages from helpers.** A helper containing bare `pattern(...)` resolves its own `SceneBuf` lexically. If it is called from inside another callback, the stages nest dynamically through `stage_enter`/`stage_exit`.

**Return types.** Helpers can return Expr handles. They cannot launder them into `i32` buffers, because the types are distinct.

### 4.2 Nested callbacks

Nesting is allowed. Each lexical nesting depth `d` in a function owns the temp `%stage{d}.saved`. Lifetimes nest strictly, so one temp per depth suffices.

The inner body may capture outer locals and outer Expr handles. The node table is a shared DAG per scene, so sharing nodes between patterns is legal. The inner body may not reference the outer `p` (TJ0405).

`stage_exit` restores the outer scene, so building continues correctly after an inner `pattern` returns.

### 4.3 Temporary identifiers

Compiler-introduced names begin with `%`. That character cannot start a TJS identifier, but it is legal in Wasm text identifiers, so `$%stage1.saved` is valid.

The full set is small: `%stage{d}.saved` locals, the `%tj.stage_scene` and `%tj.stage_depth` runtime globals, and an optional fallback swap temp `%t{n}`. The swap temp is used only if a backend lacks the mixed `_is` intrinsics.

Numbering is deterministic per function, which keeps golden tests stable. Temps are excluded from `resolve`, marked artificial in debug info, and never printed in diagnostics. A diagnostic always names the source construct instead.

### 4.4 Debug source spans

**Span table.** `spanId(span)` interns `(file, line0, col0, line1, col1)` into a dense module-level id, numbered in first-emission order. The numeric backend keeps it as a side table. Wasm stores it in a custom section `tjs.spans`.

**Span shapes.** Every node records the span id of the expression that created it:

- binary nodes: from the start of the left operand to the end of the right operand (`start` is captured before `parseUnary`);
- member nodes: from the receiver start to the end of the member;
- lifted constants: the span of the i32 operand;
- pattern roots: the whole `pattern(...)` call.

Render-time faults, such as fixed-point division by zero (which saturates and is reported), map from node to span to source.

**Callback records.** For each stage, debug info records `{arrowSpan, paramName, paramSpan, captures: [(name, declSpan, type)]}`. The parameter `p` is emitted as a constant variable with value `SURFACE_BUILD`, displayed as `<surface:build>`. The callback body's op range is a lexical block. Optionally, the numeric backend emits `DBG_SCOPE_PUSH`/`POP`, which are no-ops at runtime, so a stepping debugger shows `p` and the captures.

**Limitation.** A node built inside a helper records the helper's span, not the call site. §7 discusses the tradeoff.

### 4.5 Emitted code (both backends, same op stream)

Source: `pattern(p => p.uv.x + k)`

```
local.get $scene               ; bare form: unique SceneBuf in scope
call $tj.stage_enter
local.set $%stage1.saved
i32.const -1                   ; p = SURFACE_BUILD
i32.const 17                   ; span "p.uv"
call $tj.surf_uv
i32.const 18                   ; span "p.uv.x"
call $tj.v_x
local.get $k                   ; capture: read now, snapshot
i32.const 19                   ; span "p.uv.x + k"
call $tj.x_add_si
local.get $%stage1.saved
i32.const 20                   ; span of pattern(...)
call $tj.stage_exit            ; -> Pattern
```

The numeric VM receives the same sequence as `PUSH_LOCAL`, `CALL_RT`, `STORE_LOCAL`, `PUSH_CONST` ops. The frontend uses only `emitConst`, `emitLoad`/`emitStoreLocal`, `emitCall`, `emitRt` and `allocTemp`. **Neither backend gains a new capability.** The only additions are runtime library functions.

---

## 5. Diagnostics catalog

| Code | Trigger | Primary span | Secondary / help |
|---|---|---|---|
| TJ0401 | Arrow outside staged builder | Arrow param | "only as argument of pattern(...)" |
| TJ0402 | Bad callback param form / annotation | Offending token | Expected `p => expr` |
| TJ0403 | Block body | `{` | "callback must be an expression" |
| TJ0404 | Assignment in callback | Operator | Names capture / param / buffer |
| TJ0405 | Surface crosses callback boundary | Use | Decl of outer surface; use inner name |
| TJ0406 | Staged op without capability | Operator or member | "add `p: Surface`" |
| TJ0407 | Callback result kind | Body | `.len()` / `select(...)` / `?:` |
| TJ0408 | Bare `pattern` with 0 or >1 `SceneBuf` | `pattern` | Candidates; `scene.pattern(...)` |
| TJ0409 | `==`/`!=` on handles | Operator | `eq(a, b)` |
| TJ0410 | Mixed `bool`/`BoolExpr` in `&&`/`\|\|` | Right operand | Left operand role |
| TJ0411 | `bool` where `BoolExpr` is needed | Argument | `flag ? a : b` |
| TJ0412 | `if`/`while`/`for` on `BoolExpr` | Condition | `stagedCause`; `select(...)` |
| TJ0413 | `?:` on `BoolExpr` | Condition | `select(c, a, b)` |
| TJ0414 | Unknown member on handle | Member | Member list |
| TJ0415 | `pattern` redeclared | Declaration | none |
| TJ0416 | Named callback signature mismatch | Name | Function declaration |
| TJ0417 | Handle used as condition | Condition | "handles have no truthiness" |

---

## 6. Minimal observable tests

Every runtime test runs on both backends and asserts identical outputs (differential parity). Diagnostic tests assert the code and the exact primary `line:col` range.

1. **Constructed once.** The callback calls a non-staged `bump(counterBuf)`. Render 3 frames of 4×4 pixels. Expect `counterBuf[0] == 1` and the node count unchanged after rendering.
2. **Snapshot capture.** `let k = 3; const pat = pattern(p => p.uv.x + k); k = 10;`. The rendered pixel matches the `k = 3` expectation.
3. **Uniform edit without reconstruction.** Build with `scene.param(0, 2)`, render, then call `scene_set_param(0, 5)` and render again. The output changes, while the node count and construction counter stay identical.
4. **Unrolling.** `octaves(p, 3)` adds a node count equal to the formula for n=3, and n=0 adds exactly one constant node.
5. **Nesting and restore.** An outer pattern contains an inner `pattern(q => q.uv.y)` followed by more outer nodes. Both roots are valid and distinct, `stage_depth == 0` afterwards, and the output is correct.
6. **Named callback equivalence.** `pattern(shade)` and `pattern(p => shade(p))` produce byte-identical op streams and identical renders.
7. **Bare and receiver equivalence.** `pattern(...)` and `scene.pattern(...)` produce identical op streams. With two `SceneBuf` locals in scope, the bare form reports TJ0408.
8. **TJ0412.** A helper containing `if (d < r)`. Assert the primary span is the full condition and the secondary span is the `d` declaration.
9. **TJ0413, TJ0410, TJ0409.** One three-line file with three expected diagnostics and no cascades.
10. **TJ0404 and TJ0405.** Cover `pattern(p => (k = 1))`, `pattern(p => p++)`, and `pattern(p => pattern(q => p.uv.x))`.
11. **TJ0401, TJ0402, TJ0403.** Cover `const f = p => p;`, `pattern((a, b) => a)`, and `pattern(p => { return 1; })`.
12. **TJ0406.** A function without a `Surface` parameter computing `scene.param(0,1) + 1`.
13. **Temps.** The Wasm text golden contains `$%stage1.saved` and `$%stage2.saved`. A user local named `stage1` coexists, and the module validates.
14. **Spans.** A pattern dividing by `p.uv.x` at x=0 produces a render fault that reports the span of the `/` expression.
15. **Overflow.** A scene with `node_cap = 4` and a large graph gives `scene_error == FULL`, the pattern handle is 0, and nothing traps.
16. **Shadowing.** `const p = 7; pattern(p => p.uv.x)` compiles, and `p` refers to the Surface.

---

## 7. Design tradeoffs

**Inline expansion vs closure objects.** Inline expansion means there are no environments, no function tables and no escapes, and captures are free. The cost is that a callback cannot be stored or called twice. That is exactly the required semantics, so the cost is zero.

**One sentinel vs per-pattern surface ids.** A single sentinel is simple and fully static, but the runtime cannot detect `p`/`q` mixing, so TJ0405 has to be airtight. Per-pattern ids would allow runtime checks, but they cost a field and an allocation per stage.

**Surface as capability vs effect annotations.** Using the existing type system, with no new syntax, makes helpers self-documenting. The cost is that every helper must thread `p`, even when it does not use it.

**Dynamic stage global vs passing the scene explicitly.** The dynamic global lets helpers build nodes without a scene parameter. The cost is hidden state, mitigated by the depth check and by the save/restore temp. Explicit scene-last arguments would require every helper to take the scene, and would complicate the bare `pattern` form.

**Operator overloading on handles vs function-only builders.** Overloading reads naturally. It requires the dispatch table, the `_is`/`_si` intrinsic variants, and banning `==`.

**Rejecting `?:` and `if` on `BoolExpr` vs auto-lowering to `select`.** Rejection preserves the JS evaluation model and teaches the two-time model. It costs a keystroke.

**Implicit `i32 → ScalarExpr` lift.** The lift is convenient, but it hides the snapshot. Test 2 and the newcomer report make the snapshot explicit. The `bool` lift stays disallowed.

**Side effects in callees.** Allowing buffer mutation in functions called from callbacks keeps the language uniform and makes "once" observable. It also makes construction impure. The stricter alternative, an effect check that rejects calls to buffer-mutating functions in callbacks, is deferred.

**Spans in node records.** One i32 per node, cheap and robust. A side table keyed by node index would save memory but would complicate overflow handling. Helper call-site stacks are deferred.

**Cross-scene handle misuse.** A handle from scene A used in scene B passes the bounds and kind checks. Tagging the high bits with a scene generation is a later hardening step.

**Fixed receiver tables.** These give predictable resolution. UFCS on user functions, where the first parameter type equals the receiver type and ambiguity is an error, can be added later without breaking existing programs.

**No hash-consing.** Node counts stay predictable for tests. Deduplication is an optimization pass for later.

---

## 8. Newcomer report outline

1. **One-paragraph summary.** Callbacks are construction blocks inlined at the call site, run once, and turned into a node graph rendered per pixel.
2. **The two times.** Construction time (`i32`, `bool`, `if`, recursion, captures) versus render time (Expr handles, `select`, uniforms). Include a diagram of the scene buffer.
3. **Glossary.** Stage, Surface or sentinel, capability, capture snapshot, uniform slot, lift, span id.
4. **Five rules.** (a) Callbacks are expressions. (b) Captures are read-only snapshots. (c) Surfaces never cross callbacks. (d) Staged ops need a `Surface` in scope. (e) Use `select` per pixel and `if`/`?:` per construction.
5. **Walkthrough.** The §1.3 example with emitted ops for both backends (§4.5) and the resulting node table.
6. **Parser tour.** The classifier, `parseStagedBuilder`, `resolve` across boundaries, the dispatch table, and `checkCondition`, each with a file:line pointer into the implementation.
7. **Runtime library.** `stage_enter`/`stage_exit`, intrinsic ABI (operands then span), validation, the sticky error flag.
8. **Diagnostics catalog.** §5, with a minimal reproducer per code.
9. **How to add a builder intrinsic.** Add a table row or receiver entry, implement in the numeric VM and in the Wasm runtime, add a parity test and a node-count test.
10. **Tests.** What each of the §6 tests proves, and how to run differential parity.
11. **Known limitations and open questions.** The §7 items, with a recommendation for each.
