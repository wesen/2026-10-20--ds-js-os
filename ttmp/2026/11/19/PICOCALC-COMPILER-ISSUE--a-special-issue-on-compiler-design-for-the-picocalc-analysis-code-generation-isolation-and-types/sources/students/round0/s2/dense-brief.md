# What to build next for the PicoCalc compilers (dense expert brief)

Context: PicoCalc OS is a JavaScript operating system on an ESP32-P4 handheld. It has two compilers. CJI compiles a subset of ordinary JavaScript to RV32 machine code using whole-program inference; it takes 8 seconds to 25 minutes per app on the device. The typed compiler compiles a small typed JavaScript subset (i32, bool, string, buffer, records) to WebAssembly in one pass, and lowers that Wasm to RV32; it takes 0.2 to 3.1 seconds per app at boot.

## What I would do next

1. Measure before building anything. No latency in the tickets reaches the LCD, and the typed Editor on RV32 used 52.9 ms of CPU over 33 turns. During startup the compositor took 235 ms of a 462 ms gap. The hypothesis is that app code is no longer the bottleneck, and the compositor and its JSON screen protocol are.
2. Stop compiling at every boot. Cache the compiled module keyed by source, compiler and reactor hashes.
3. Rewrite the RV32 lowering.
4. Make native code safe by construction instead of trusted.
5. Add `await`, enums and distinct integer types to the language before porting the other twelve apps.
6. Take CJI off the device.

## Why one compiler is slow and the other fast

The cost difference comes from whole-program inference versus declared boundaries, not from JavaScript semantics. Self hit long compile pauses from call-site customization; Hölzle and Ungar's answer was a fast non-optimizing compiler first, with optimization reserved for hot code. RPython and Shed Skin infer types over the whole program and take minutes for the same reason CJI does. Modula-2 definition modules, OCaml interface files and TypeScript's isolatedDeclarations all declare the boundary so checking becomes local. Static TypeScript compiled a TypeScript subset with classes, closures and a garbage-collected heap to machine code for microcontrollers with only a peephole pass.

If CJI's analysis is kept: jump functions summarize each procedure once instead of re-analysing bodies each round; sparse propagation on SSA replaces the dense fixpoint; constraint graphs solved in SCC order replace global rounds with one topological pass; ABCD gives the demand-driven variant.

## Code generation

The RV32 backend stores every operand in a stack-frame slot. Each binary operation is two loads, the operation and a store, and every conditional branch is a branch over a jump. Track at compile time which register holds each stack entry, and write to memory only at calls and control-flow joins (TCC's value stack, Liftoff, Ertl's static stack caching). Best's algorithm picks the eviction. A peephole pass removes a store followed by a load from the same location. Destination-driven generation removes the branch-over-jump shape. Native code is two to five times larger than VM code, so mixed mode (native for hot functions, Wasm for the rest) is an option. Copy-and-patch is not worth it here.

## Load time

Slim binaries shipped a checked, target-independent tree and generated code at load. Wasm is that format here: store checked Wasm and run only the lowering step on the device.

## Isolation

The typed language has no pointers and bounds-checks every access. A function's name is registered only after its body is parsed, so recursion is impossible and the call graph is acyclic. Stack depth is therefore a compile-time constant. Loops are the only unbounded construct, so a fuel counter decremented at loop back-edges gives pre-emption inside a turn. The output can be verified instead of the compiler trusted: a checker confirms that every jump lands inside the slot or on a trampoline. The hardware route is PMP with user mode.

## Type system directions

Sum types with exhaustive matching. Distinct integer types for the four coordinate systems (bytes, UTF-16 units, code points, rows). Flow-sensitive refinement so that in `while (at < s.length) { s.charCodeAt(at) }` the bounds check is removed. `await` compiled to state machines: the WorldState token fields are defunctionalized continuations written by hand; liveness analysis identifies which locals cross an await, and with no recursion each frame has a fixed offset. Regions: a per-turn arena reset when the handler returns. Linear handles and typestate for the grant-and-revoke protocol. Effects as capabilities: manifest claims checked against the code. Gradual typing only at world-message boundaries.

## Architecture

One source for both engines via erasable type annotations. An interface definition for the 28 SDK imports, generated into the three places that list them by hand. A typed binary screen protocol instead of JSON built with writeLiteral. Fewer engines.
