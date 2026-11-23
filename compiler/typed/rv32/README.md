# RV32 backend sources

The RV32 backend is a set of ES modules in this directory. `build.mjs` bundles them into three plain scripts, which
every loader reads (the tests, the replays, the trace-REPL workbench, the tools and the firmware):

| Bundle | Entry | Holds |
|---|---|---|
| `compiler/typed/typed-rv32.js` | `index.js` | the core: encoding, the emitters, the planner, the pass registry, policies, `compile`, `linkSlot`; publishes `typedRv32` |
| `compiler/typed/typed-rv32-inline.js` | `passes/inline-group.js` | the passes `balanced` adds: `inline`, `commute`, `rotate` |
| `compiler/typed/typed-rv32-loops.js` | `passes/loops-group.js` | the passes `default` and `kernel` add: `version` (with `hoist`, `induction`), `split`, `conjunctions`, `sets`, `ranges`, `facts` |

```sh
node compiler/typed/rv32/build.mjs          # rewrite the three bundles
node compiler/typed/rv32/build.mjs --check  # fail if one is stale (make test-generated, tests/compiler/typed-rv32.test.mjs)
```

A group bundle loads after `typed-rv32.js` and installs its passes in the registry. `compile` asks for the groups
its pass list needs: a host that defines `globalThis.typedRv32Load(file)` gets the call and evaluates the file (the
P4's `typed_p4.c` does, so a boot compile under `interactive` never loads a group); a host without it loads every
bundle up front. The modules also run unbundled in Node (`package.json` sets `"type": "module"`), once `tape.js` and
`typed-wasm.js` have published `typedTape` and `typedWasm`.

| Path | Contents |
|---|---|
| `index.js` | the core bundle's entry: `globalThis.typedRv32 = {compile, linkSlot, policies, passes}` |
| `compile.js` | `compile`: per function the policy's pipeline, then `lowerLeaf` or `planLocations` + `FunctionCode`; layout and relocations; per-stage timers (`options.timing`) |
| `policy.js` | `POLICIES` (each a pass list plus planner and emitter switches), `resolveOptions` (`passes`, `enable`, `disable`) |
| `link.js` | `linkSlot` |
| `encoding/` | `tape.js` (the names from `compiler/typed/tape.js`), `registers.js` (registers, encoders), `selection.js` (ALU, predicates, immediates, `constantForm`), `division.js` (division magic numbers) |
| `emit/` | `function-code.js` (`FunctionCode`: constructor, `step`, `lower`) and its method groups `stack.js`, `homes.js`, `addresses.js`, `branches.js`, `arithmetic.js`, `calls.js` (joined by `mixin.js`); `leaf-code.js`, `guarded-return.js`, `inspection.js` |
| `passes/` | `registry.js` (the pass table, groups, `loadPasses`), the group entries, and one module per pass: `inline.js`, `commute.js`, `rotate.js`, `conjunctions.js`, `value-sets.js`, `version-loops.js`, `hoist.js`, `split-locals.js` |
| `analysis/` | `ranges.js` (`localRanges`, `divisionFacts`), `storeless.js` |
| `plan/` | `locations.js` (`planLocations`), `saved-homes.js` |

The bundler understands `import {a, b as c} from "./x.js"` and `export` before a top-level `function`, `class` or
`const`. Each bundle is one scope (scope hoisting: every top-level name in rv32/ is unique, which the build checks; a
function scope per module made the QuickJS bytecode half again as large), the core publishes the names the groups
import as `globalThis.typedRv32Modules`, and the module graph must be acyclic. The move from the
numbered files (PICOCALC-TYPED-PIPELINE) changed no image: every policy's image and every observed tape of twelve
compile units equals the numbered files' build.
