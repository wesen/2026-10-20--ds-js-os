# Answers — "1. The Machine, the Mission and the Vocabulary"

## 1. Why can a world on this device not simply run a long loop to completion, and what must it do instead?

Because all worlds share one small machine, a world that spins in a long loop would starve every other world and freeze the user interface that is supposed to stay responsive; a single owner of the CPU cannot be allowed. Resources are also bounded per world (the memory figure later in the questions, 768 KiB, looks like a per-world budget), so an unbounded loop with allocation would hit a hard ceiling rather than merely being slow. So a world must be written as something resumable: it does a bounded slice of work and then yields back to the scheduler, typically returning to a message/event loop that hands it the next message when it is its turn again. The article's vocabulary almost certainly makes this explicit — a world is a message-processing thing with an entry point per message, not a `main()` that runs to completion.

Confidence: 4

## 2. Name the three engines and state, for each, whether a fault in the program can damage other worlds.

I cannot know this without the article — the three names are the article's own vocabulary (the title even flags "the Vocabulary"), and I only have the later hints: QuickJS is named in question 6, WebAssembly appears in question 4, and CJI is named in questions 3 and 6 as the thing that compiles without annotations. So the three engines are almost certainly QuickJS, a WebAssembly engine, and CJI. On damage: an interpreter (QuickJS) and a WebAssembly VM are memory-safe by construction — a bad program can at worst corrupt its own heap or trap, and the host keeps the damage inside that world's quota. CJI, if it emits native code that runs in the shared address space, is the one where a fault in the generated code can reach out and damage other worlds, which would explain why the article bothers to discuss isolation and what an unsound annotation can cost.

Confidence: 2

## 3. The typed compiler compiles `countUnit` using only the text of that function. Name two facts CJI would have to find elsewhere in the program before it could compile the same function without annotations.

The whole point of a typed compiler here is that the text carries its own types, so anything the text does not carry must come from the rest of the program. Two concrete candidates: (a) the type and representation of what is passed in — what a "unit" actually is, its fields and their widths and signedness — which lives in a declaration or in the constructor that builds units, not in `countUnit`; and (b) the meaning and result type of the operations used inside, for example whether a counter is a 32-bit integer that can wrap or a float, and whether a call it makes returns a value or throws. A likely third is who may call it and with what, since without annotations CJI has to infer a calling convention or assume the narrowest one from actual call sites. Any of these, if not derivable from the text, forces CJI to look at other worlds' code — which is exactly the cost that shows up as compile time.

Confidence: 2

## 4. The native Editor uses 710 KiB of a 768 KiB limit and the WebAssembly Editor uses 528 KiB. Give one reason from this article why the native version is larger.

I cannot know this without the article, since the reason given is specific to its measurements. The most plausible reason from the numbers alone: the native build has to carry things the WebAssembly build gets from its host. A native world links its own runtime, its own allocator and the hardware/driver glue (framebuffer access, keyboard, SPI to the LCD) and possibly static copies of shared code, whereas the WebAssembly module can import those services from the engine that already has them and only ships its own compiled functions plus its linear memory. Debug or symbol information left in a native binary, and native code not being as compact as a well-compressed wasm module (which is a dense bytecode with a compacting design goal), would push it in the same direction. Whatever the article's exact wording, the answer it wants is of this shape: the native side duplicates machinery that the wasm side imports.

Confidence: 2

## 5. An application wants to draw a line of text. Describe the path from the application to the LCD in terms of worlds and messages.

The application world does not touch the panel. It builds a message — "draw this text at this position, in this style" — and sends it to the world that owns the display: a window/compositor or graphics world that knows the screen layout and the font. That world turns the request into pixels in a framebuffer it owns and, because it must also give the CPU back, sends (or queues) a message to the driver world that actually speaks the LCD protocol, which pushes the changed region out over the bus. Each hop is a message with a defined shape, each receiver keeps its own state across messages, and the sender is not blocked waiting: rendering completes across several scheduling turns rather than inside one call stack. That is also why the vocabulary needs worlds, messages and yields as first-class words — the line of text is a conversation, not a function call.

Confidence: 3

## 6. QuickJS compiles Agenda in 37 ms and CJI needs between 523 and 1,475 seconds. What is different about what the two compilers produce?

Different products from different jobs. QuickJS is a front-end in the ordinary sense: it parses and emits bytecode for a virtual machine, with essentially no analysis beyond what it takes to emit correct stack code, so its output is unoptimised bytecode that is interpreted later and its cost is roughly linear in the source text. CJI, taking 523–1,475 s, is not just translating a function — the range itself is a symptom of a search or a fixed point, and question 3 says it must learn things the function's text does not contain, so it is doing whole-program inference: finding types and representations, deciding conventions and layouts, and only then emitting real machine code that runs at native speed. In one line: QuickJS produces bytecode for an interpreter that pays for the decisions at run time, while CJI produces native code whose speed is bought by paying for the decisions at compile time.

Confidence: 3
