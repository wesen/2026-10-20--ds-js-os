# The Typed compiler

The Typed compiler turns Typed source (JavaScript with type annotations) into RV32 machine code on the PicoCalc
itself, at boot, inside a QuickJS runtime with a few megabytes of heap. It also writes WebAssembly, which serves as an
independent oracle, from the same tape. This guide describes its parts as they are: the pipeline, the tape that connects the front end to
the backends, the passes, the backends and the checks that keep them honest. Later tickets keep it current.

The sources are in `compiler/typed/`. The loaders read classic scripts: each file is an IIFE that publishes one
object on `globalThis` (the RV32 backend's three are bundled from the ES modules in `rv32/`), evaluated in this order:

| File | Publishes | Contents |
|---|---|---|
| `tape.js` | `typedTape` | The tape's definition: opcodes, operand cells, operand and result types, effects, walkers |
| `typed-wasm.js` | `typedWasm` | The front end (lexer, signature pass, parser and type checker writing the tape) and the WebAssembly backend, built from `frontend/*.js` and `wasm/*.js` by `node compiler/typed/frontend/build.mjs` |
| `typed-async.js` | `typedAsync` | Lowers `async` functions into ordinary Typed functions over `WorldState` frames before emission (worlds that have them), built from `async/*.js` by `node compiler/typed/async/build.mjs` |
| `typed-rv32.js` | `typedRv32` | The RV32 backend's core, bundled from `rv32/` by `node compiler/typed/rv32/build.mjs` ([README](../compiler/typed/rv32/README.md)) |
| `typed-rv32-inline.js`, `typed-rv32-loops.js`, `typed-rv32-kernel.js` | (installs passes) | The three pass groups (what `balanced`, `default` and `kernel` add in turn); after `typed-rv32.js`, loaded up front or on demand through `typedRv32Load` |
| `typed-world.js` | `typedWorld`, `compileTypedWorld*` | The world ABI: two entries and the SDK imports, in trampoline order |
| `typed-pie-loops.js` | `typedPieLoops` | Optional: ESP32-P4 PIE vector words for qualifying loops (`pieLoops`) |

Every loader lists them: `bench/lib/compiler.mjs` (all bench scripts), the tests in `tests/compiler/`,
`compiler/typed/tools/typed-inspect.mjs`, `bench/board/stage.mjs` (the board app's cold compiles), the trace REPL's
module table (`tools/trace-repl/pkg/tracecompiler/compiler.go`) and the firmware, which bundles them as `typed/tape.js`, `typed/wasm.js`
and so on (`firmware/port/esp32p4/main/CMakeLists.txt`, `BUNDLE_EXTRA`) and evaluates them in `typed_p4.c`, keeping each
file's QuickJS bytecode so that later compiles skip the parse. The bytecode keeps no debug information
(`JS_STRIP_DEBUG`: no source text, no line tables), so a stack trace through the compiler on the device names functions
but not lines; the compile errors' messages carry their Typed positions themselves. The firmware evaluates a pass
group only when a compile's policy needs it: `interactive` (Agenda, Editor, Files) loads none, `balanced` (Chess) the
inline group, `default` (Candela's scene) inline and loops, `kernel` all three. After every compile the device prints
a `TYPEDCOMPILE {...}` line: each evaluated compiler source (cached or parsed, load and run time, the heap after it),
the linker call, the teardown, and the compile's calls to the PSRAM heap with the time spent in them. The compile heap
and the `TYPEDCOMPILE` record are `firmware/port/esp32p4/main/typed_compile_heap.{h,c}`. A compile's time on the P4
moves by up to about 2 percent with where its heap lands (PICOCALC-COMPILER-DEVICE-COST: the same compile with a 1 KB
block held in front of its heap), so a claim that a compiler change is faster by less than that needs several heap
placements, not one pair of images.

## The pipeline

```
Typed source
  │  typed-async.js (worlds with async functions): lowered into ordinary Typed source, which keeps its original positions
  ▼
front end       Lexer → signature pass (records, enums, distinct types, acyclic calls) → FunctionEmitter,
  │             one function at a time, no syntax tree → the function's tape
  ├─ typed-rv32.js  per function: tape → tape passes → analyses → LeafCode (frameless leaves) or
  │                 planLocations + FunctionCode → RV32 words; then layout, call patching, linkSlot
  └─ Wasm backend   per function: tape → encodeFunction (LEB128, pseudo-ops expanded) → a Wasm body;
                    then compile (a module) or linkWorld (a Wasm reactor)
```

### The front end's modules

`typed-wasm.js` is generated: `node compiler/typed/frontend/build.mjs` concatenates these modules, in this order,
into one IIFE (one scope, so they are not ES modules) with the bundler every compiler build shares
(`compiler/typed/bundle.mjs`, which also scope-hoists the RV32 backend's ES modules), and `--check`, run by `make test-generated` and by
`tests/compiler/typed-wasm-inspect.test.mjs`, fails when the bundle is stale. Edit the modules, never the bundle.

| Module | Contents |
|---|---|
| `frontend/lexer.js` | `TOKEN`, `RESERVED`, the host-provided lexical index (`withLexIndices`, `indexFor`), `Lexer` |
| `frontend/declarations.js` | records, enums, distinct types, member aliases (`parseDeclarations`), `scanSignatures`, `checkAcyclic`, `recordLayouts` |
| `frontend/expressions.js` | the tape's constants for the bundle; `ExpressionParser`: the tape writer (`emitConst`, `emitFloat`, `emitIndex`, `emitMemory`, `codeUnitAddress`, `emitLiteralStores`) and the expressions |
| `frontend/floats.js` | the f32 operators and `Math` functions, `Math.min`/`max`, `getF32`/`setF32` addresses, the tape surgery of a negated or converted literal (methods of `ExpressionParser`) |
| `frontend/values.js` | the value types (PICOCALC-TYPED-VALUES): the conditional expression, `u32(x)`, value records (methods of `ExpressionParser`) |
| `frontend/arrays.js` | local arrays: `new Int32Array(n)`, `a[i]`, `a.length` (methods of `ExpressionParser`) |
| `frontend/statements.js` | `FunctionEmitter extends ExpressionParser`: statements and one function's body (`async/body.js` subclasses it) |
| `frontend/inspect.js` | the front end's `frontend` inspection event (`target: "tape"`) |
| `frontend/compile.js` | `compileFunctions`, streaming one tape at a time to `onFunction`, with the async lowering (`emitSpanFunctions`; `originalError` maps lowered-code diagnostics to original positions) |
| `wasm/encode.js` | `encodeFunction` (tape → Wasm body), `compileWasmFunctions` (the front end driven for the Wasm backend) |
| `wasm/module.js` | `compile` (a module of Typed functions), `WasmReader`, section reading and writing |
| `wasm/inspect.js` | the Wasm backend's `frontend` and `emission` events, in Wasm operations and module byte ranges |
| `wasm/link.js` | `linkWorld`, `invoke`, and what the bundle publishes |

### The async lowering's modules

An `async` function that awaits an SDK request or another async function becomes a *step function* over a static
frame in `WorldState` (PICOCALC-CONTINUATION-G, PICOCALC-EDITOR-ASYNC). `typed-async.js` is generated from
`compiler/typed/async/` by `node compiler/typed/async/build.mjs` the same way, and its `--check` runs in
`make test-generated`. Its tests are `tests/compiler/typed-async.test.mjs`.

| Module | Contents |
|---|---|
| `async/scan.js` | the whole-program pre-pass: task operations (`start`, `cancel`, `pending`, `resume`) in every body, from the lexical index when the host provides one (`indexedBodies`); call edges and acyclicity |
| `async/body.js` | `AsyncBody`: an async body as a statement skeleton, each expression checked by `TypeChecker`, the front end's `FunctionEmitter` with its tape writers off |
| `async/liveness.js` | the bindings live after each wait (`analyze`); a live non-scalar is an error |
| `async/allocate.js` | the frames' fields in `WorldState` and `asyncLayout` |
| `async/text.js` | `GeneratedText`: copied chunks of the source and generated text, each with an original position (`originalAt`) |
| `async/lower.js` | `cut` and `emitStep`: one frame's step function dispatched by `pc` |
| `async/tasks.js` | the generated `start`, `cancel`, `pending` and `resume` functions |
| `async/rewrite.js` | `prepare`, `rewrite` and `typedAsync` |

The lowered program is text, but its unchanged bodies are read from the original source, and the lexers of the rewritten
bodies and of the generated functions report diagnostics at original positions (`originalError` in `frontend/compile.js`), so an
error never needs a second compile. Why this is text and not a pass over the tape: PICOCALC-TYPED-ASYNC-TAPE's study.

Two properties are deliberate. The compiler streams: `typedRv32.compile` asks the front end for one function at a
time (`compileFunctions(..., onFunction)`) and lowers it before the next is parsed, so peak memory is one function's
tape, not the program's. And there is no syntax tree: the front end parses, checks and emits in one pass, so its cost is
proportional to the source length.

## The tape

The *tape* is the compiler's intermediate representation: a flat array of numbers per function (`fn.code`). Each
operation is one opcode cell followed by its operand cells, one plain number per operand. The opcodes are WebAssembly's
plus three pseudo-ops for UTF-16 text buffers. `compiler/typed/tape.js` defines it once; nothing else in the compiler
spells an opcode as a number.

Each row of the table gives the opcode, a constant name, the operation's name, the format of each operand cell
(`type` for a block type, `u` for an index or memory immediate, `s` for a signed literal), the value types the operation
pops and pushes (WebAssembly's encodings: `I32 = 0x7f`), and a bit set of effects:

| Effect | Meaning | Rows |
|---|---|---|
| `STORES` | writes memory | `i32.store`, `i32.store16`, `f32.store`, `text.literal_stores` |
| `LOADS` | reads memory | `i32.load`, `i32.load16_u`, `f32.load` |
| `CALLS` | calls a function (whose own effects are the callee's) | `call` |
| `BRANCHES` | may transfer control away from the next operation | `if`, `else`, `br`, `br_if`, `return`, `unreachable` |
| `TRAPS` | may trap | `i32.div_s`, `i32.div_u`, `i32.rem_s`, `i32.rem_u`, `text.checked_address`, `unreachable` |
| `CONTROL` | opens, separates or closes a block, or leaves the function | `block`, `loop`, `if`, `else`, `end`, `br`, `return`, `unreachable` |

The table has 75 rows: `unreachable`, `block`, `loop`, `if`, `else`, `end`, `br`, `br_if`, `return`, `call`, `drop`,
`local.get`, `local.set`, `i32.load`, `i32.load16_u`, `i32.store`, `i32.store16`, `i32.const`, eleven comparisons
(`eqz`, `eq`, `ne`, `lt_s`, `lt_u`, `gt_s`, `gt_u`, `le_s`, `le_u`, `ge_s`, `ge_u`), thirteen arithmetic and bitwise
operations (`add`, `sub`, `mul`, `div_s`, `div_u`, `rem_s`, `rem_u`, `and`, `or`, `xor`, `shl`, `shr_s`, `shr_u`), the
f32 rows (`f32.load`, `f32.store`, `f32.const`, six comparisons, `abs`, `neg`, `ceil`, `floor`, `trunc`, `sqrt`, `add`,
`sub`, `mul`, `div`, `copysign`, `f32.convert_i32_s`, `f32.convert_i32_u`, `i32.reinterpret_f32`,
`f32.reinterpret_i32`) and the pseudo-ops:

| Opcode | Name | Cells | Meaning |
|---|---|---|---|
| `0xf1` | `text.checked_address receiver position` | 2 | the address of `receiver[position]` after checking `position` against the capacity; an `i32.load16_u` or `i32.store16` at offset 4 follows |
| `0xf2` | `text.literal_stores address literal` | 2 | stores the UTF-16 units of `fn.literals[literal]` from `address + 4`, after a check covering the whole range |
| `0xf3` | `text.unchecked_address receiver position j` | 3 | the address of `receiver[position + j]` without a check; written by loop versioning inside a loop whose range it proved |
| `0xf4` | `f32.to_i32` | 0 | f32 to i32 toward zero, saturating, NaN to 2^31-1 (RV32F's `fcvt.w.s rtz`; Wasm: `i32.trunc_sat_f32_s` and a NaN select) |
| `0xf5`, `0xf6` | `f32.min_num`, `f32.max_num` | 0 | the other operand when one is NaN (RV32F's `fmin.s`, `fmax.s`; Wasm: `f32.min`/`max` and two NaN selects) |
| `0xf7` | `f32.to_u32` | 0 | f32 to u32 toward zero, saturating (negative to 0), NaN to 2^32-1 (RV32F's `fcvt.wu.s rtz`; Wasm: `i32.trunc_sat_f32_u` and a NaN select) |
| `0xf8` | `array.address offset` | 1 | the address of byte `offset` of the function's local-array area (RV32: `addi rd, sp, base + offset`; Wasm: `i32.const` of a static address) |
| `0xf9` | `array.zero offset bytes` | 2 | zeroes `bytes` bytes of the area from `offset` (RV32: `sw zero` per word up to 16, else a loop; Wasm: `memory.fill`) |

A value is an `i32` or an `f32` (`F32 = 0x7d`): `bool`, enums, `buffer`, `string` and record references are `i32` at the
tape level. An `f32.const` cell holds the literal's IEEE bits as an i32 (its Wasm encoding is four little-endian bytes,
operand format `"f"`). The rows whose value is the type of a local, callee or function (`local.get`, `local.set`,
`call`, `drop`, `return`) pop or push `ANY`. A block type cell is `I32`, `F32` or `VOID`. The pseudo-ops `0xf4`-`0xf6`
exist because WebAssembly and RV32F differ there: Typed takes RV32F's rule (one instruction on the device) and the Wasm
backend expands to it, so the oracle stays exact. PICOCALC-TYPED-F32's design doc (Refinements) lists every rule.

### f32

`f32` is a type. Literals have a fraction or an exponent (`1.5`, `2e-3`, `1.0`; the lexer's kind `"float"`); an integer
literal stays `i32`, so `x * 2` is an error and `x * 2.0` is not. `f32(i)` and `i32(x)` convert (i32 to f32 rounds to
nearest even; f32 to i32 truncates and saturates, NaN to 2^31-1). On two f32: `+ - * /`, unary `-`, `< <= > >= === !==`
(false with a NaN, `!==` true); `%`, the bitwise operators and mixing with i32 are errors. `Math.sqrt`, `abs`, `floor`,
`ceil`, `trunc`, `copysign`, `min`, `max` take f32 (`min`/`max` also two i32); `Math.bitsOf(x)` and `Math.fromBits(n)`
reinterpret the bits. A record field may be `f32`; `buf.getF32(i)` and `buf.setF32(i, x)` read and write the f32 at UTF-16
units 2i and 2i+1 of a buffer (checked on unit 2i+1). Every operation rounds to nearest even and none is fused, so the
RV32 build equals the WebAssembly build bit for bit (NaN payloads aside, which Typed leaves unspecified).
`compiler/typed/lib/math.typed` is a library of the functions RV32F lacks (`sinf`, `expf`, `logf`, `atan2f`, ...), in
Typed; its README gives each function's accuracy. `tests/compiler/typed-f32.test.mjs` compares generated f32
expressions, hand-written programs and the library in WebAssembly, RV32 under every policy and a JavaScript model;
`tools/trace-repl/pkg/traceapi/f32_test.go` runs the same cases (`typed-f32-fixture.mjs`) on the Go machine.

`typedTape` publishes the constants (`typedTape.I32_ADD`, `typedTape.CHECKED_ADDRESS`, `typedTape.VOID`, the effect
bits), `cells` and `effects` (typed arrays indexed by opcode; `cells` is -1 outside the tape), `rows`, `row(code)`,
`name(code)`, `next(tape, at)` (the offset of the next operation), `close(tape, at)` (the `end` of the block at `at`)
and `decode(tape, wasm)` (operation records, for tools; with `wasm` it reads LEB128 immediates). The backend's files
destructure the constants once at load time (`rv32/encoding/tape.js`), and the passes walk raw cells with `CELLS` and
compare opcodes with the names: decoding every tape into objects cost a bare QuickJS realm about a quarter of a compile.

The Wasm backend (`encodeFunction`) serializes a tape operation by operation: the opcode is the Wasm opcode and each
operand cell becomes a LEB128 immediate (signed for `i32.const`). The pseudo-ops expand: `text.checked_address
receiver position` becomes `local.get position; local.get receiver; i32.load 2 0; i32.ge_u; if; unreachable; end;
local.get receiver; local.get position; i32.const 1; i32.shl; i32.add`, and `text.literal_stores address literal`
one `local.get address; i32.const unit; i32.store16 1 (4 + 2i)` per UTF-16 unit. `text.unchecked_address` has no Wasm
encoding: only loop versioning writes it. So the WebAssembly oracle runs exactly the tape the RV32 backend receives.

### Operators and literals

The binary operators are JavaScript's, with its precedences, from loosest: `?:`; `||`; `&&`; `|`; `^`; `&`; `===`
`!==`; `<` `<=` `>` `>=`; `<<` `>>` `>>>`; `+` `-`; `*` `/` `%`. The prefix operators `!`, `-` and `~` bind tighter than
all of them. The conditional expression `c ? a : b` is right-associative and each arm is a whole expression, as in
JavaScript; `c` is a `bool`, both arms have one type (a literal takes the other arm's integer type), and the tape is
`c; if (result T); a; else; b; end`. All are on `i32` (`&&`, `||` and `!` on `bool`); a bitwise operator on a `bool` is a type error, so
JavaScript's trap `a & 1 === 1` (which means `a & (1 === 1)`) does not compile. A shift uses the low five bits of its
count, `>>>` is logical, `~x` is written to the tape as `x ^ -1`. A `distinct` integer type keeps its type through
`|`, `^`, `&`, `+` and `-` with an operand of the same type or a literal, as before for `+` and `-`; shifts, `*`, `/`
and `%` take and give `i32` (convert with `i32(...)`). Integer literals are decimal (at most 2147483647, and
`-2147483648`) or hex: `0x` or `0X` and one to eight hex digits, the i32 of those 32 bits, so `0xffffffff` is `-1`
and `0x80000000` is `-2147483648` (an enum member's value too). Any other word after `0x` is an error. The P4's
lexical index (`firmware/port/esp32p4/main/typed_lex_index.c`) tokenizes the same way as the lexer's `TOKEN`.

`u32` is an unsigned 32-bit integer, an `i32` on the tape and in registers. `+ - * & | ^ ~ <<` are as on `i32`;
`< <= > >=`, `/` and `%` are unsigned (`lt_u`, `gt_u`, `le_u`, `ge_u`, `div_u`, `rem_u`; RV32 `sltu`, `bltu`/`bgeu`,
`divu`, `remu`, and a shift or mask for a power of two); `>>>` is logical and `>>` is an error on a `u32`; unary minus
is an error; a shift's count is any integer. `u32` and `i32` do not mix: `u32(x)` and `i32(x)` keep the bits, `f32(x)`
converts the unsigned value and `u32(x)` of an f32 truncates and saturates (NaN to 2^32-1, `f32.to_u32`). A literal
takes its context's type, so a hex literal is the same 32 bits as an `i32` or a `u32`; a decimal literal from 2^31 to
2^32-1 is a `u32`. Two literals stay a literal under `+ - * & | ^ << >>>`; `/ % >>` of literals are `i32`.

`continue` jumps to the end of its loop's body: a body that contains the word gets a block around it (`block; B; end`)
and `continue` is a branch to that block's end, so a `for` loop's update runs and the condition is tested again, also
after `rotate` has moved the condition to the bottom of the loop. The front end decides before parsing the body by
scanning its text for the word (`bodyContinues` in `frontend/statements.js`).

### Value records

`value record Vec3 { x: f32; y: f32; z: f32; }` declares a record whose variables are values, where `record` declares
a reference to memory the host lays out. A field is a scalar, a record reference or an earlier value record; its
leaves are its scalar fields with nested value records flattened in field order (`Ray { o: Vec3; d: Vec3; }` has six).
`Vec3(1.0, 2.0, 3.0)` constructs one, one argument per field. The front end replaces it by scalars as it parses: a
local is one local per leaf, `v.o.x` is one `local.get`, an expression leaves its leaves on the operand stack, and
`let b = a` copies (`v.x = e` needs a `let`). A parameter is its leaves, consecutive parameters (`fn.params`, names
`v.x`; `fn.sourceParams` keeps the signature as written); methods take the receiver's leaves. A function may return
one: its result is the leaves (`fn.results`; WebAssembly multi-value, `(result f32 f32 f32)`), `f(x).y` stores them into
fresh locals and reads one, and `c ? a : b` of two stores each arm into the same locals. `===` on them is an error. No
pass and no backend sees a value record, only scalar locals and calls with several results.

RV32 returns a record result's leaves as the arguments arrive: integers in `a0`-`a7`, `f32` in `fa0`-`fa7`, and a leaf
beyond its class's eight in the next word of the caller's stack-argument area (`resultLocations`, `calleeResults`); a
single result keeps `a0` or `fa0`. The callee writes stack leaves through the caller's sp (`returnValue`); a frameless
leaf with stack leaves is declined. The passes with an abstract operand stack push `arity.results(i)` values for a
call, and `inline` inlines such a callee by storing its leaves into result locals at each `return` and its end.

### Local arrays

`const a = new Float32Array(16)` (also `Int32Array`, `Uint32Array`, with `let` or `const`) declares an array of a
literal length from 1 to 1024 whose elements are `f32`, `i32` or `u32`. The declaration zeroes it each time it runs, as
JavaScript's `new` and WGSL's `var` do. `a[i]` reads and `a[i] = e;` writes an element; the index is an `i32` or a
`u32`, compared unsigned with the length (a negative index traps too: `local.get i; i32.const n; i32.ge_u; if;
unreachable; end`). Two indices need no check at run time: a literal, which the compiler checks, and the counter of an
enclosing counted loop `for (k = c; k < n; k = k + s)` with `n` at most the length, whose body never writes `k`
(`c` and `s` not negative for a signed `k`): the front end records such a check and removes it when the loop's body
ends without a write of `k` (`countedRange`, `proveChecks` in `frontend/arrays.js`). `a.length` is a literal.
An array is not a value: it is not assigned, passed, returned or compared, and it never aliases memory. A function's
arrays are one area (`fn.arrayBytes`): RV32 places it in the frame between the stack-argument area and the slots (in a
large frame, above `ra`, `s0` and the saved registers), and the Wasm backend at a static address below the previous
function's area from the top of the module's memory, which is correct because the call graph is acyclic (no function
is active twice); `linkWorld` refuses arrays, as the runtime owns a linked world's memory. A function with arrays has a
frame, and `inline` leaves its calls in place.

RV32 lowers `and`, `or`, `xor`, `sll`, `sra`, `srl` and, when the right operand is a literal (`select.immediates`;
the `commute` pass moves a literal to the right of `&`, `|` and `^`), `andi`, `ori`, `xori` for literals in
[-2048, 2047] and `slli`, `srai`, `srli` for any count. `analysis/ranges.js` bounds `x & y` by a non-negative operand
and `x >>> c` by `2^(32-c) - 1`, so a later division by a constant can skip its sign correction; `value-sets` folds
the operators; the other passes treat them as pure binary operations.

### An example

```js
function sumCells(work: buffer, n: i32): i32 {
    let total = 0;
    for (let i = 0; i < n; i = i + 1) {
        total = total + work.charCodeAt(16 + i);
    }
    return total;
}
```

The front end writes 52 cells:

```text
[65,0,33,2,65,0,33,3,2,64,3,64,32,3,32,1,72,69,13,1,32,2,65,16,32,3,106,33,4,241,0,4,47,1,4,106,33,2,
 32,3,65,1,106,33,3,12,0,11,11,32,2,11]
```

and `typedTape.decode` reads them as 29 operations (the number is the cell offset):

```text
  0 i32.const 0          20 local.get 2                    38 local.get 3
  2 local.set 2          22 i32.const 16                   40 i32.const 1
  4 i32.const 0          24 local.get 3                    42 i32.add
  6 local.set 3          26 i32.add                        43 local.set 3
  8 block 64             27 local.set 4                    45 br 0
 10 loop 64              29 text.checked_address 0 4       47 end
 12 local.get 3          32 i32.load16_u 1 4               48 end
 14 local.get 1          35 i32.add                        49 local.get 2
 16 i32.lt_s             36 local.set 2                    51 end
 17 i32.eqz
 18 br_if 1
```

Locals are numbered parameters first (`work` 0, `n` 1), then declared locals (`total` 2, `i` 3), then the front end's
temporaries (4 holds `16 + i`). `64` is the block type `VOID`. Every loop is `block; loop; C; eqz; br_if 1; B; br 0;
end; end`, and the function's last `end` returns the value on the stack. Under the `kernel` policy the tape grows to 57
cells at `rotate` and 118 at `version`, which adds a guarded copy of the loop whose reads are `text.unchecked_address`;
the image shrinks from 39 words (`stock`) to 32.

## The passes

A policy (`rv32/policy.js`) is a list of tape passes plus the planner's (`operandLocations`) and the emitter's
(`select`) switches. `rv32/passes/registry.js` declares the passes in the one order they run; `compile`
(`rv32/compile.js`) runs the list for each function. `options.passes` replaces a policy's list, and `enable` and
`disable` edit it by name (`{policy: "kernel", disable: ["sets"]}`); a pass whose `needs` are missing is refused.

| Pass | Group | Kind | What it does | Module | Policies |
|---|---|---|---|---|---|
| `inline` | inline | transform | `inlineCalls`: calls to small functions in loops, and to f32 functions anywhere | `passes/inline.js` | balanced, default, kernel |
| `fields` | inline | transform | `reuseFloatFields`: one load per f32 field of an unwritten record parameter, when nothing stores | `passes/fields.js` | balanced, default, kernel |
| `commute` | inline | transform | `commuteConstants`: `c OP e` → `e c OP` | `passes/commute.js` | balanced, default, kernel |
| `conjunctions` | loops | transform | `fuseConjunctions` | `passes/conjunctions.js` | kernel |
| `sets` | loops | transform | `foldValueSets` | `passes/value-sets.js` | kernel |
| `rotate` | inline | transform | `rotateLoops`: bottom-tested loops | `passes/rotate.js` | balanced, default, kernel |
| `ranges` | loops | analysis | `localRanges` | `analysis/ranges.js` | kernel |
| `version` | loops | transform | `versionLoops`; needs `rotate` | `passes/version-loops.js` | default, kernel |
| `hoist` | loops | option of `version` | loop invariants and subexpressions into the guard | `passes/hoist.js` | kernel |
| `induction` | loops | option of `version` | induction variables in the fast copy | `passes/version-loops.js` | kernel |
| `split` | loops | transform | `splitLocals`: one local per web | `passes/split-locals.js` | default, kernel |
| `facts` | loops | analysis | `divisionFacts`; needs `ranges` | `analysis/ranges.js` | kernel |

Three stages that are not tape passes run after `inline`: the guarded-return summary (`inlineGuardedReturns`), the PIE
lowering (`pieLoops`) and the `inline` checkpoint. Then `lowerLeaf`, or `planLocations` (`plan/`) and `FunctionCode`
(`emit/`). `options.observeTape(name, phase, code, nlocals)` sees a copy of the tape after each transform (and at the
checkpoint) and `options.observePlan` the plan; the trace REPL's example 21 uses both. `options.timing`, an array,
receives `{fn, pass, ms, cells}` for every stage each function runs and one `{fn: null, pass: "compile"}` row.

## The backends

- **RV32** (`typed-rv32.js`). `lowerLeaf` (`emit/leaf-code.js`) lowers small functions without a frame; everything else
  goes through `FunctionCode` (`emit/function-code.js` and its method groups), a streaming emitter that walks the tape once with an operand
  stack in `t0`–`t4`, homes from the plan, checked addresses and fused compare-and-branch. `compile` lays the functions
  out, patches calls and returns `{image, entries, relocations, signatures, ...}`; `linkSlot` copies the image into a
  reactor ELF's reserved slot.
  Registers and instructions come from `rv32/encoding/` (below).
- **PIE loops** (`typed-pie-loops.js`, `pieLoops`). Recognizes one loop shape in the decoded tape and emits ESP32-P4 PIE
  vector words for it, encoded through the instruction table; opt-in.
- **WebAssembly** (`wasm/*.js` in `typed-wasm.js`, `typedWasm.compile` and `linkWorld`). Serializes each tape as the
  front end hands it over (`compileWasmFunctions`), then writes a module or links a world into a Wasm reactor. Its
  inspection events describe Wasm operations, each with the source span of the tape operation it encodes.

### Registers and the instruction table

A register is a number: `0`-`31` are `x0`-`x31`, `32`-`63` are `f0`-`f31`, so `reg >> 5` is its class and integer code
keeps the plain numbers it always had (`rv32/encoding/registers.js`). `REGISTER_CLASSES` holds, per class, the ilp32f
tables: argument registers (`a0`-`a7`, `fa0`-`fa7`), callee-saved registers, the homes the planner may claim (`s1`-`s11`;
`fs0`-`fs11`), the operand-stack and scratch registers. `argumentRegisters(params)` assigns integer and `f32` parameters
to their classes independently, as ilp32f does beyond eight of a class too: an `f32` after `fa7` takes the next free
integer register (its bits), and a parameter with no register left takes the next stack word, written `-1 - k` for
the word at the caller's `sp + 4k` (PICOCALC-TYPED-VALUES). A caller's frame starts with a stack-argument area as large
as its largest call needs (`outgoingWords`; the slots and, in a large frame, `ra`, `s0` and the saved registers sit
above it); a callee copies its stack parameters into their homes or slots in the prologue from the caller's `sp`
(`callerStack`: `addi t5, sp, frame`, patched once the frame is known). A parameter on the stack, or an `f32` in an
integer register, never stays in its incoming register and feeds no capacity or pointer home. The planner gives each key the class of its type (`fn.params`, `fn.localTypes` for frame
locals) and plans each class with its own free list and the same rules; the emitter's `load`, `store` and `move` pick
`flw`, `fsw`, `fmv.s`, `fmv.x.w` or `fmv.w.x` for a float register, the prologue saves claimed `fs` registers, a call
passes `f32` arguments in `fa` registers and an `f32` result returns in `fa0`. The operand stack has a register file per
class: depth d is `t0`-`t4` for an integer and `ft0`-`ft7` for an f32 (`OPERAND_STACKS`), both classes share the spill
slot of a depth, and a consumer pops with a scratch register of the class it expects (`t5`/`t6`, `ft10`/`ft11`).
`emit/floats.js` lowers the f32 operations: RV32F with a static `rne` rounding mode, `fsgnj`/`fsgnjn`/`fsgnjx` for
copysign, neg and abs, `feq`/`flt`/`fle` for comparisons, `fcvt` for conversions and floor/ceil/trunc (with a range check:
an |x| of 2^23 or more is its own result), `fmv` for the bit casts. For a function with an f32 parameter, local or
result (only: integer images stay pinned), the planner also homes f32 constants (`"f<bits>"`) and, in a leaf, may keep
the first f32 parameter in `fa0` and use `ft8`, `ft9` and the unused f operand-stack registers; a returned f32 value is
computed in `fa0`; and the function loses its frame when it uses none.

`rv32/encoding/instructions.js` is one table of every instruction the backend may emit: RV32IM, the Zicsr instructions
(on `fflags`, `frm`, `fcsr`), all of RV32F and the five PIE instructions of `typed-pie-loops.js`. A row is its mnemonic,
its fixed bits and its assembler operand syntax (`"fd, f1, f2, rm"`), and `encoder("fadd_s")(rd, a, b, rm)` its encoder, made on first use (85 closures made at load cost the QuickJS realm 35 KB); an
encoder rejects a register of the wrong class. `tests/compiler/typed-rv32-encoding.test.mjs` assembles every row with
GNU `as` from the ESP toolchain (the newest `riscv32-esp-elf`, as `bench/lib/toolchain.sh` finds it) over edge and random
operands and compares the words; it also checks that the six integer formats the emitters call (`instruction.r` ...)
agree with the table. `tests/compiler/typed-rv32-registers.test.mjs` plans and emits a fragment with `f32` parameters
and locals and runs it on the reference interpreter.

## The oracles and the gates

- **WebAssembly** runs the same source in Node's engine; `bench/board/stage.mjs` checks every frame fixture of the ray
  tracer against it, and the Wasm reactors replay the worlds.
- **The host gates** (`make test-host`, [measuring](measuring.md)): the opening ray frame's digest `430f0d50…`, the Chess
  engine against chess 1.11.2 on 6,981 words, and 25 recorded workflows on `rv32emu`.
- **Byte identity**: `tests/compiler/typed-rv32.test.mjs` pins the image digest of each policy, so a refactor that
  claims no output change fails if any image moves.
- **The tape table**: `tests/compiler/typed-tape.test.mjs` compiles every Typed unit in `apps/typed` under `stock` and
  `kernel` and walks each of the roughly 4,200 tapes `observeTape` reports with the table's cell counts, checking a
  structured, typed operand stack (every opcode known, every pop finds its types, every block leaves its declared
  type, every branch targets an enclosing block). A wrong cell count misaligns the walk; the test shows that it fails.
- **The board**: a claim that a change is faster needs a paired study (`make bench-board`).

## Adding an operation

1. Add a row to `ROWS` in `tape.js`: opcode, constant name, operation name, operand formats, pops, pushes, effects.
2. Write it in the front end (`frontend/expressions.js` or `statements.js`) and, unless the Wasm opcode is the
   same with LEB128 operands, give it an expansion in `encodeFunction` (`wasm/encode.js`); run
   `node compiler/typed/frontend/build.mjs`.
3. Teach every pass that interprets operations rather than copying them: the abstract stacks in
   `passes/` (inline, commute, version-loops, hoist, value-sets), `analysis/ranges.js` and `plan/` reject unknown
   opcodes or treat them conservatively; grep for a neighbouring opcode's name to find them. Several of them test
   for a pure binary operation as `op >= I32_ADD && op <= I32_SHR_U` (and `typed-pie-loops.js` likewise).
   A new token also goes into the P4's lexical index (`firmware/port/esp32p4/main/typed_lex_index.c`), which must
   tokenize exactly as `TOKEN` in `frontend/lexer.js`.
4. Lower it in `FunctionCode.step` (and in `LEAF_OPERATIONS` if frameless leaves may contain it).
5. Run `node compiler/typed/rv32/build.mjs`, `make test` and the host gates.
