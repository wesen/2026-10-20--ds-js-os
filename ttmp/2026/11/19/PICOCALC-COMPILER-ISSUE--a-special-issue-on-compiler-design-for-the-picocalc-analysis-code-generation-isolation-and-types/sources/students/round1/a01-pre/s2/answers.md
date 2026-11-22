# Answers — "1. The Machine, the Mission and the Vocabulary"

Note: the article itself was not provided to me, so these answers are reasoned from the
question text and from general knowledge of small single-address-space interpreter/compiler
hosts. Each answer ends with a `Confidence:` line (1 = guessing, 5 = certain).

## 1. Why a world cannot simply run a long loop to completion

I cannot know this without the article (the specific mechanism it names). The likely reason is
that the device has one CPU core, one address space and one scheduler shared by all worlds, so a
loop that never returns would starve the display refresh, the input handling and every other
world. What a world must do instead is cooperate: yield control back to the scheduler at
regular, bounded intervals — either by calling a yield/wait primitive inside the loop, or by the
engine interrupting it after a bounded number of instructions and resuming it later at the same
point.

Confidence: 3

## 2. The three engines and whether a fault can damage other worlds

I cannot know this without the article — I cannot name the three engines as the author names
them. The structure the answer would have to take is a per-engine isolation verdict, e.g. an
interpreted engine that owns all its state in a heap it checks (a fault stays inside that world),
a compiling engine that emits unchecked native code into the shared address space (a bad token
or bad code generation can overwrite another world's memory or the kernel), and a sandboxed
engine with a validated instruction format and guarded memory (a fault is trapped, not
propagated). The interesting part of the answer is precisely that these differ, which suggests
each engine buys isolation with a different amount of speed.

Confidence: 2

## 3. Two facts CJI would have to find elsewhere before compiling `countUnit` unannotated

Two plausible candidates: (a) the types of the module-level/global bindings the function reads
and writes, since those are declared outside the function body, and (b) the shape and field
layout of the heap objects it touches (which receiver type a property load or method call hits,
and where the field sits in that representation). A third would be the calling convention and
parameter/return types of the functions and builtins it calls, which live in other modules or in
the kernel's host API. So compiling from the text alone works only because the annotations
restate, locally, information the whole-program view would have to supply.

Confidence: 2

## 4. Why the native Editor is larger than the WebAssembly Editor

I cannot know this without the article's inventory of the two builds. The general reason such a
gap appears is that the native build carries host-specific code that the WebAssembly build gets
from its runtime: the native binary must contain the compiler backends and code generators for
the target instruction set plus their tables, whereas in the WebAssembly case one compact,
uniform encoding is shipped and the runtime does the machine-specific work. Duplication is the
other usual suspect — a native build that embeds both an interpreter and compiled code paths
pays for the runtime twice, while the WebAssembly build reuses a single code image.

Confidence: 2

## 5. Path from an application to the LCD, in worlds and messages

I cannot know this without the article's actual world names. The shape the answer must have is a
chain of messages rather than a direct call: the application world issues a draw request (text
at a position, or a string on the console) and posts it as a message to whatever world owns the
text/console layer; that world turns characters into glyphs and pixels in a framebuffer it
owns, then posts a message (or a dirty-rectangle description) to the display-driver world, which
is the only world holding the hardware registers and pushes the pixels out. At no point does the
application hold a pointer into the framebuffer, which is exactly what makes the chain of
messages necessary.

Confidence: 2

## 6. What differs between what QuickJS and CJI produce

I cannot know the article's exact framing, but the time gap of four orders of magnitude points
at the product: QuickJS emits bytecode, a compact and quickly produced form that is then
interpreted, with type decisions deferred to run time. CJI emits typed machine code — it must
infer or consume types, specialize arithmetic and property access, allocate registers and
schedule instructions — so compilation time is spent once to buy steady-state speed, and doing
that inside a 768 KiB machine with no host operating system makes it expensive per function.
The 37 ms figure is a compile-and-go cost; the 523–1475 s figure is a whole-program
analysis-and-optimization cost.

Confidence: 3
