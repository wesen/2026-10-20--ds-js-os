# RV32 backend sources

`compiler/typed/typed-rv32.js` is built from the files in this directory. Edit these files, then run:

```sh
node compiler/typed/rv32/build.mjs          # rewrite compiler/typed/typed-rv32.js
node compiler/typed/rv32/build.mjs --check  # fail if it is stale (tests/compiler/typed-rv32.test.mjs runs this)
```

Every loader still reads the single bundle: the unit tests, the 25 replays, the trace-REPL workbench, the tools and the firmware's compiler bundle. Splitting the source changed none of them. The files are not ES modules. They share one scope, the bundle's IIFE, and are joined in file-name order. Top-level `const` and `class` definitions run in that order, so a file may only use, at load time, what an earlier file defines. Functions can be used anywhere.

| File | Contents |
|---|---|
| `00-encoding.js` | the tape names from `compiler/typed/tape.js` (`typedTape`, loaded first), registers, instruction encoders, ALU and predicate tables, immediates, division magic numbers |
| `10-function-code.js` | `FunctionCode`, the streaming emitter: operand stack, homes, checked addresses, pointers, branches, prologue and epilogue |
| `11-leaf-code.js` | guarded-return helpers, `LeafCode` (frameless leaves), `observeSteps`, `lowerLeaf` |
| `20-inline-and-commute.js` | `inlineCalls`, `commuteConstants` |
| `30-version-loops.js` | `versionLoops` with induction variables, `hoistInvariants`, `hoistSubexpressions` |
| `31-split-locals.js` | `splitLocals` (one local per live range) |
| `40-ranges.js` | `localRanges`, `divisionFacts` (`select.facts`) |
| `41-value-sets.js` | `foldValueSets` and its analyses (`select.sets`) |
| `42-conjunctions-and-rotation.js` | `fuseConjunctions`, `rotateLoops` |
| `43-inline-candidate.js` | `inlineCandidate` |
| `50-planner.js` | `planLocations` (homes, pointer groups, pointer-only skips), `planSavedHomes` |
| `60-policies.js` | `DEFAULT_POLICY`, `POLICIES`, `resolveOptions` |
| `70-compile.js` | `compile` (the pass order lives here), `linkSlot`, the `typedRv32` export |

The split was a pure move: the first build reproduced the previous `typed-rv32.js` byte for byte. The bundle's first line, added after that check, marks it as generated.
