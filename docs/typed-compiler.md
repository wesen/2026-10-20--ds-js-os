# The Typed compiler

The Typed compiler turns Typed source (JavaScript with type annotations) into RV32 machine code on the PicoCalc
itself, at boot, inside a QuickJS runtime with a few megabytes of heap. It also writes WebAssembly, which serves as an
independent oracle, from the same tape. This guide describes its parts as they are: the pipeline, the tape that connects the front end to
the backends, the passes, the backends and the checks that keep them honest. Later tickets keep it current.

The sources are in `compiler/typed/`. They are classic scripts, not ES modules: each file is an IIFE that publishes one
object on `globalThis`, and the loaders evaluate them in this order:

| File | Publishes | Contents |
|---|---|---|
| `tape.js` | `typedTape` | The tape's definition: opcodes, operand cells, operand and result types, effects, walkers |
| `typed-wasm.js` | `typedWasm` | The front end (lexer, signature pass, parser and type checker writing the tape) and the WebAssembly backend, built from `frontend/*.js` and `wasm/*.js` by `node compiler/typed/frontend/build.mjs` |
| `typed-async.js` | `typedAsync` | Lowers `async` functions into ordinary Typed functions over `WorldState` frames before emission (worlds that have them), built from `async/*.js` by `node compiler/typed/async/build.mjs` |
| `typed-rv32.js` | `typedRv32` | The RV32 backend, built from `rv32/*.js` by `node compiler/typed/rv32/build.mjs` ([README](../compiler/typed/rv32/README.md)) |
| `typed-world.js` | `typedWorld`, `compileTypedWorld*` | The world ABI: two entries and the SDK imports, in trampoline order |
| `typed-pie-loops.js` | `typedPieLoops` | Optional: ESP32-P4 PIE vector words for qualifying loops (`pieLoops`) |

Every loader lists them: `bench/lib/compiler.mjs` (all bench scripts), the tests in `tests/compiler/`,
`compiler/typed/tools/typed-inspect.mjs`, `bench/board/stage.mjs` (the board app's cold compiles), the trace REPL's
module table (`tools/trace-repl/pkg/tracecompiler/compiler.go`) and the firmware, which bundles them as `typed/tape.js`, `typed/wasm.js`
and so on (`firmware/port/esp32p4/main/CMakeLists.txt`, `BUNDLE_EXTRA`) and evaluates them in `typed_p4.c`, keeping each
file's QuickJS bytecode so that later compiles skip the parse.

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
into one IIFE (one scope, so they are not ES modules), and `--check`, run by `make test-generated` and by
`tests/compiler/typed-wasm-inspect.test.mjs`, fails when the bundle is stale. Edit the modules, never the bundle.

| Module | Contents |
|---|---|
| `frontend/lexer.js` | `TOKEN`, `RESERVED`, the host-provided lexical index (`withLexIndices`, `indexFor`), `Lexer` |
| `frontend/declarations.js` | records, enums, distinct types, member aliases (`parseDeclarations`), `scanSignatures`, `checkAcyclic`, `recordLayouts` |
| `frontend/expressions.js` | the tape's constants for the bundle; `ExpressionParser`: the tape writer (`emitConst`, `emitIndex`, `emitMemory`, `codeUnitAddress`, `emitLiteralStores`) and the expressions |
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
| `STORES` | writes memory | `i32.store`, `i32.store16`, `text.literal_stores` |
| `LOADS` | reads memory | `i32.load`, `i32.load16_u` |
| `CALLS` | calls a function (whose own effects are the callee's) | `call` |
| `BRANCHES` | may transfer control away from the next operation | `if`, `else`, `br`, `br_if`, `return`, `unreachable` |
| `TRAPS` | may trap | `i32.div_s`, `i32.rem_s`, `text.checked_address`, `unreachable` |
| `CONTROL` | opens, separates or closes a block, or leaves the function | `block`, `loop`, `if`, `else`, `end`, `br`, `return`, `unreachable` |

The table has 36 rows: `unreachable`, `block`, `loop`, `if`, `else`, `end`, `br`, `br_if`, `return`, `call`, `drop`,
`local.get`, `local.set`, `i32.load`, `i32.load16_u`, `i32.store`, `i32.store16`, `i32.const`, eight comparisons
(`eqz`, `eq`, `ne`, `lt_s`, `gt_s`, `le_s`, `ge_s`, `ge_u`), seven arithmetic operations (`add`, `sub`, `mul`,
`div_s`, `rem_s`, `shl`, `shr_s`) and the pseudo-ops:

| Opcode | Name | Cells | Meaning |
|---|---|---|---|
| `0xf1` | `text.checked_address receiver position` | 2 | the address of `receiver[position]` after checking `position` against the capacity; an `i32.load16_u` or `i32.store16` at offset 4 follows |
| `0xf2` | `text.literal_stores address literal` | 2 | stores the UTF-16 units of `fn.literals[literal]` from `address + 4`, after a check covering the whole range |
| `0xf3` | `text.unchecked_address receiver position j` | 3 | the address of `receiver[position + j]` without a check; written by loop versioning inside a loop whose range it proved |

All values are `i32` today: `bool`, enums, `buffer` and `string` references are `i32` at the tape level. The type columns
use WebAssembly's value types so that `f32` (PICOCALC-TYPED-F32) adds rows, not structure.

`typedTape` publishes the constants (`typedTape.I32_ADD`, `typedTape.CHECKED_ADDRESS`, `typedTape.VOID`, the effect
bits), `cells` and `effects` (typed arrays indexed by opcode; `cells` is -1 outside the tape), `rows`, `row(code)`,
`name(code)`, `next(tape, at)` (the offset of the next operation), `close(tape, at)` (the `end` of the block at `at`)
and `decode(tape, wasm)` (operation records, for tools; with `wasm` it reads LEB128 immediates). The backend's files
destructure the constants once at load time (`rv32/00-encoding.js`), and the passes walk raw cells with `CELLS` and
compare opcodes with the names: decoding every tape into objects cost a bare QuickJS realm about a quarter of a compile.

The Wasm backend (`encodeFunction`) serializes a tape operation by operation: the opcode is the Wasm opcode and each
operand cell becomes a LEB128 immediate (signed for `i32.const`). The pseudo-ops expand: `text.checked_address
receiver position` becomes `local.get position; local.get receiver; i32.load 2 0; i32.ge_u; if; unreachable; end;
local.get receiver; local.get position; i32.const 1; i32.shl; i32.add`, and `text.literal_stores address literal`
one `local.get address; i32.const unit; i32.store16 1 (4 + 2i)` per UTF-16 unit. `text.unchecked_address` has no Wasm
encoding: only loop versioning writes it. So the WebAssembly oracle runs exactly the tape the RV32 backend receives.

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

`compile` in `rv32/70-compile.js` runs the tape transforms in this order for each function, each switched on by an
option (the policies in `rv32/60-policies.js` name sets of them):

| Phase | Pass | File | Option |
|---|---|---|---|
| `inline` | `inlineCalls` (calls to small functions in loops) | `20-inline-and-commute.js` | `inline` |
| `commute` | `commuteConstants` (`c OP e` → `e c OP`) | `20-inline-and-commute.js` | `select.commute` |
| `conjunctions` | `fuseConjunctions` | `42-conjunctions-and-rotation.js` | `select.conjunctions` |
| `sets` | `foldValueSets` | `41-value-sets.js` | `select.sets` |
| `rotate` | `rotateLoops` | `42-conjunctions-and-rotation.js` | `select.rotate` |
| `version` | `versionLoops` (with hoisting and induction variables) | `30-version-loops.js` | `select.version`, `select.hoist`, `select.induction` |
| `split` | `splitLocals` | `31-split-locals.js` | `operandLocations.split` |

Then come the analyses that do not rewrite the tape: `localRanges` and `divisionFacts` (`40-ranges.js`,
`select.facts`) and `planLocations` (`50-planner.js`, `operandLocations`), which assigns register homes.
`options.observeTape(name, phase, code, nlocals)` sees a copy of the tape after each phase and `options.observePlan`
the plan; the trace REPL's example 21 uses both.

## The backends

- **RV32** (`typed-rv32.js`). `lowerLeaf` (`11-leaf-code.js`) lowers small functions without a frame; everything else
  goes through `FunctionCode` (`10-function-code.js`), a streaming emitter that walks the tape once with an operand
  stack in `t0`–`t4`, homes from the plan, checked addresses and fused compare-and-branch. `compile` lays the functions
  out, patches calls and returns `{image, entries, relocations, signatures, ...}`; `linkSlot` copies the image into a
  reactor ELF's reserved slot.
- **PIE loops** (`typed-pie-loops.js`, `pieLoops`). Recognizes one loop shape in the decoded tape and emits ESP32-P4 PIE
  vector words for it; opt-in.
- **WebAssembly** (`wasm/*.js` in `typed-wasm.js`, `typedWasm.compile` and `linkWorld`). Serializes each tape as the
  front end hands it over (`compileWasmFunctions`), then writes a module or links a world into a Wasm reactor. Its
  inspection events describe Wasm operations, each with the source span of the tape operation it encodes.

## The oracles and the gates

- **WebAssembly** runs the same source in Node's engine; `bench/board/stage.mjs` checks every frame fixture of the ray
  tracer against it, and the Wasm reactors replay the worlds.
- **The host gates** (`make test-host`, [measuring](measuring.md)): the opening ray frame's digest `430f0d50…`, the Chess
  engine against chess 1.11.2 on 6,981 words, and 24 recorded workflows on `rv32emu`.
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
   `20-inline-and-commute.js`, `30-version-loops.js`, `40-ranges.js`, `41-value-sets.js` and the planner reject unknown
   opcodes or treat them conservatively; grep for a neighbouring opcode's name to find them.
4. Lower it in `FunctionCode.step` (and in `LEAF_OPERATIONS` if frameless leaves may contain it).
5. Run `node compiler/typed/rv32/build.mjs`, `make test` and the host gates.
