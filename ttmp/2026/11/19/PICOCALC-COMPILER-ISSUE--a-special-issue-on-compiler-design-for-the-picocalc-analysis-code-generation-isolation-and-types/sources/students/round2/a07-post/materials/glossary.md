# Glossary

Each term is defined as it is used in this issue. The number in brackets is the article that introduces it.

## The system

**Claim** [1]. An entry in the system's manifest stating that a world may open a given kind of hardware or a given directory. The nucleus checks every such use against the world's claims.

**Compositor** [1]. The world that owns the screen. Applications send it a description of their screen; it lays the description out and draws it.

**Engine** [1]. The mechanism that executes a world's code. There are three: QuickJS (JavaScript), WAMR (WebAssembly) and native (RV32 machine code).

**Handle** [9]. A number that stands for an open file or a granted permission. Authority is exercised by presenting a handle to the nucleus.

**Manifest** [1]. The file that lists the system's worlds with their engines, memory limits, turn budgets and claims.

**Nucleus** [1]. The kernel, written in C. It schedules worlds, delivers messages and checks claims.

**Reactor** [1]. A prebuilt C module shipped in the firmware that connects a compiled application to the nucleus. Compiled code is copied into a reserved place inside it. The *shared typed reactor* serves any fully typed application.

**Slot** [5, 7]. Two meanings, distinguished by context. A *frame slot* is a fixed position in a function's stack frame. *The slot* in a reactor is the contiguous region reserved for an application's compiled RV32 code.

**Split-phase operation** [8]. An operation with a request that returns at once and a completion delivered later as a separate event.

**Token** [8]. A number returned when a split-phase operation is started and carried by the event that completes it.

**Trampoline** [7]. A fixed single-jump entry at the start of the reactor's slot, one per reactor function. Compiled native code calls reactor function *k* by jumping to the *k*-th trampoline.

**Trap** [1]. An immediate fault that ends a world's turn, raised for example by an out-of-range index or a division by zero.

**Turn** [1]. The handling of one event by one world.

**Turn budget** [1]. The longest time one uninterrupted piece of a turn may run. A world that overruns is stopped.

**World** [1]. One scheduled program: an application, a driver or a service, with its own memory limit and turn budget.

## The compilers

**CJI** [1]. The first compiler: it accepts unannotated JavaScript, infers types over the whole program, and emits RV32 machine code. Named after the book *Compiling JavaScript, Incrementally*.

**Demotion** [3]. In CJI, replacing an operation provisionally compiled as integer arithmetic by general floating-point arithmetic when the range proof fails.

**Library specialization** [3]. In CJI, generating a separate copy of a library routine for each call site, specialized to the types used there. Called *customization* in the Self literature.

**Lowering** [1, 5]. Translating a program from a higher-level form to a lower-level one; here, WebAssembly to RV32.

**Typed compiler** [1]. The second compiler: it accepts a small JavaScript-like language with declared types, emits WebAssembly in one pass, and optionally lowers that to RV32.

**Typed language** [1]. The source language of the typed compiler, with the types `i32`, `bool`, `string`, `buffer` and `record`.

## Program analysis

**Abstract interpretation** [3]. The general theory of analyses that compute approximate facts about all executions of a program by iterating over an ordered set of facts.

**Constraint graph** [4]. A graph with a node for each value and an edge wherever one value's facts feed another's.

**Dense and sparse analysis** [4]. A dense analysis keeps facts for every variable at every program point. A sparse analysis attaches each fact to the definition of a value and propagates it only to that value's uses.

**Demand-driven analysis** [4]. An analysis that starts from a question (for example, "is this check redundant?") and computes only what is needed to answer it.

**Fixpoint** [3]. The state of an iterative analysis in which a further visit to the program changes nothing.

**Join** [3]. The operation that combines the facts arriving at a control-flow merge. For ranges, the join of [0, 3] and [2, 9] is [0, 9].

**Jump function** [4]. For one argument of one call, a small expression giving the argument's value in terms of the enclosing function's own parameters. A form of summary.

**Liveness** [8]. A variable is live at a point if some path from that point reads it before writing it.

**Local checking** [4]. Checking and compiling a function from its own text and the declared signatures of what it calls, with no facts about its callers.

**Range (interval)** [3]. The smallest and largest value a variable can take, in CJI with flags for fraction, negative zero and NaN.

**SSA form** [4]. Static single-assignment form: a program representation in which every variable is assigned in exactly one place, with φ-functions selecting between definitions at merges. *Extended* SSA adds a renaming (π) on each outcome of a branch.

**Strongly connected component** [4]. A maximal group of nodes in a graph that all depend on each other through cycles.

**Summary** [4]. A compact description of how a function's outputs depend on its inputs.

**Whole-program inference** [3]. Solving for types or other facts using every function and every call in the program.

**Widening** [3]. Jumping a bound that keeps moving to a much larger value so that iteration terminates, at some cost in precision.

## Code generation

**Back-edge** [7]. The jump from the end of a loop body back to the loop's start.

**Branch over a jump** [5]. A conditional branch that skips an unconditional jump, used where the distance to the target is not known to be short.

**Compile-time operand stack** [5]. A list kept by the compiler during translation that records where each operand-stack value currently is: in a register, a known constant, the current value of a local, or a pending comparison. Also called a value stack, a virtual stack, or static stack caching.

**Flush** [5]. Moving every pending entry of the compile-time operand stack to a fixed, agreed location before control flow splits or merges, or before a call.

**Frame** [5]. A function's private area of memory on the stack. In Article 8, also the fixed group of persistent fields that holds an asynchronous function's saved state.

**Join (control flow)** [5]. A point in the code reached from two or more paths.

**Leaf function** [5]. A function that calls no other function.

**Peephole optimizer** [5]. A pass that slides a small window over emitted instructions and replaces wasteful patterns.

**Register and stack machines** [5]. A stack machine takes operands from and returns results to an operand stack. A register machine uses named storage places inside the processor.

## Loading and caching

**Break-even point** [6]. The amount of use after which the time saved by better code equals the extra time spent producing it.

**Content key** [6]. A cache key formed from hashes of every input that affects a compiled output.

**Mixed mode** [6]. Running some functions of an application as native code and the rest in an interpreter.

**Slim binary** [6]. A compact, target-independent, already-checked program representation from which native code is generated at load time.

**Tier** [6]. One of several forms in which a system can run the same code, from cheap and slow to expensive and fast.

## Safety

**Address masking** [7]. Forcing an address into a program's own region with a mask before each access, so that any address lands inside the sandbox.

**Control, memory, stack and time safety** [7]. A confined program executes only its own code and given entry points; reads and writes only its own data; keeps its call stack within bounds; and cannot hold the processor beyond its budget.

**Fuel** [7]. A counter given to a world at the start of a turn and decremented at each loop back-edge; reaching zero ends the turn with a trap.

**Language-based safety** [7]. Confinement that rests on the source language being unable to express a violation and the compiler preserving that.

**PMP** [7]. Physical memory protection: RISC-V registers that restrict which memory regions code running in user mode may access.

**Software fault isolation** [7]. Constructing machine code so that every access and jump is confined, and confirming this with a checker before the code runs.

**Verifier** [7]. A small program that checks emitted machine code against a fixed list of safety properties.

## Language design

**Arena** [9]. A block of memory with a pointer to its first free byte. Allocation advances the pointer; the whole arena is freed at once.

**Continuation** [8]. What remains to be done at a point in a computation: the rest of the code together with the values it will use.

**Declared boundary** [4]. A statement in the program of the types of a function's parameters and result.

**Defunctionalization** [8]. Representing a function-like value as a data record: a tag saying which code is meant, and the values that code needs.

**Distinct type** [9]. A new name for an existing representation that the checker treats as a different type.

**Effect system** [9]. A type-system extension that records which side effects each function may perform.

**Enumeration and exhaustive matching** [9]. A type whose values are a fixed list of names, and the rule that a `match` must mention all of them.

**Flow-sensitive typing** [9]. Typing in which what is known about a variable at a place depends on the tests that control reaching that place. Also called occurrence typing.

**Linear type** [9]. A type whose values must be used exactly once.

**Region** [9]. A set of values with a common lifetime that is freed all at once.

**Stack ripping** [8]. Cutting a task into event handlers by hand and moving its local variables into a persistent structure.

**State machine (of an asynchronous function)** [8]. The compiled form of a function containing waits: a state number, saved variables, and code that dispatches on the state number when entered.

**Typestate** [9]. The state of an object that determines which of its type's operations are permitted at a given moment.
