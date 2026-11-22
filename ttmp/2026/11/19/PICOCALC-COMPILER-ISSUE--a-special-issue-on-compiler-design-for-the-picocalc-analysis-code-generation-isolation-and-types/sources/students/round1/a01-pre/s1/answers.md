# Answers — "1. The Machine, the Mission and the Vocabulary"

Note: I was not given the article. These answers come from general knowledge of small
embedded runtimes (single-core microcontroller with an LCD, a JavaScript engine such as
QuickJS, a WebAssembly engine, and a typed native compiler) plus reasoning about what the
question must be describing. Where the article is needed for a specific fact, I say so.

## 1. Why can a world on this device not simply run a long loop to completion, and what must it do instead?

I cannot know this without the article, but the reasoning is forced. The device has one
processor and (apparently, from the memory limits in question 4) well under a megabyte of
RAM, and it must keep the user interface, the other worlds and the hardware alive while a
world is computing. So a world may not own the CPU until its loop finishes; it must run in
bounded slices and hand control back — typically by making its interpreter or generated code
check an instruction/time budget at loop back-edges and function entries and then "yield",
saving enough state to resume later. In effect every world is compiled or interpreted as a
resumable state machine that can be suspended at safe points and rescheduled.

Confidence: 4

## 2. Name the three engines and state, for each, whether a fault in the program can damage other worlds.

I cannot know the article's exact names or the three-way split. The three are almost
certainly a native/C engine, a JavaScript engine (QuickJS is named in question 6) and a
WebAssembly engine, since questions 4 and 6 refer to exactly those kinds of runtime. The
isolation answer follows from the hardware: with no memory-management unit, a native engine
running in the same address space as everything else can corrupt another world's data with a
stray pointer or buffer overrun, whereas the bytecode/WebAssembly engines enforce bounds and
type checks on every access and so contain a buggy program. The JavaScript engine sits in
between depending on whether it is retaining raw pointers into buffers, but in principle its
garbage-collected heap and array bounds keep faults inside the world.

Confidence: 3

## 3. The typed compiler compiles `countUnit` using only the text of that function. Name two facts CJI would have to find elsewhere in the program before it could compile the same function without annotations.

I cannot know the article's specific list, but two facts must obviously come from outside the
function body. First, the types (or at least sizes and signedness) of the globals, constants
and imported symbols the function reads and writes — e.g. what a counter's storage actually
is, since that decides load width, arithmetic and overflow behaviour. Second, the signatures
of the functions `countUnit` calls, so the compiler knows argument types, return type and
calling convention rather than guessing. Without annotations, CJI would have to compute these
by whole-program analysis — a symbol table plus type inference and possibly call-graph
propagation — which is exactly the "find elsewhere in the program" step the question
contrasts with the module-local path.

Confidence: 4

## 4. The native Editor uses 710 KiB of a 768 KiB limit and the WebAssembly Editor uses 528 KiB. Give one reason from this article why the native version is larger.

I cannot know the article's stated reason. The structural reason for such a gap is that the
WebAssembly build gets to reuse machinery that the native build must carry itself: the
WebAssembly module is compiled for a virtual machine whose runtime, memory management and
driver bindings already live in the host, so the module only ships logic plus a thin set of
imports. The native build, by contrast, is a self-contained program that links its own copy
of the support code — allocator, C runtime, graphics and hardware drivers, and the engine
itself — and code density is typically lower than a bytecode or WebAssembly binary. Any of
these (or a combination) would account for roughly 180 KiB.

Confidence: 2

## 5. An application wants to draw a line of text. Describe the path from the application to the LCD in terms of worlds and messages.

I cannot know the article's exact world names or message formats. The shape is a message
cascade rather than a direct write. The application world issues a "draw text at (x, y)" style
message to a display or window world, which owns the framebuffer and clips/positions the
request relative to the application's surface; that world emits a lower-level message (glyph
blits, or a rectangular region update) to the driver world that owns the LCD controller. The
driver world is the only one permitted to touch the hardware, so it speaks the SPI/parallel
protocol that pushes pixels to the panel. The application never holds a pointer into the
framebuffer, which is what makes the isolation in question 2 meaningful.

Confidence: 3

## 6. QuickJS compiles Agenda in 37 ms and CJI needs between 523 and 1,475 seconds. What is different about what the two compilers produce?

I cannot know the article's wording, but the timescale says almost everything. QuickJS
produces bytecode for its own interpreter: a single fast pass, no global analysis, no
optimisation, output consumed immediately by a dispatch loop. CJI appears to produce
something much stronger — presumably optimised, fully typed code (native machine code or a
verified typed intermediate form with whole-program type and layout resolution, as question 3
implies), so it does expensive analyses over the whole program and schedules registers, which
is where the four orders of magnitude go. A ~four-order-of-magnitude slowdown is not
interpreter-to-JIT overhead; it is the difference between "emit code fast, run it slower" and
"spend minutes, then run it directly.

Confidence: 3
