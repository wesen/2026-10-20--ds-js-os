# Answers

1. A world on this device cannot run a long loop to completion because the machine is a small
   single-core microcontroller with no preemption and a shared cooperative scheduler, so a loop that
   never returns starves the scheduler, the display refresh and input handling, and there is no OS
   thread to preempt it. It must therefore break the work into bounded slices and yield between them
   (resume next tick from saved state), so a "long loop" becomes a state machine spread over many
   turns. The article presumably states the exact budget per slice; the numbers are not something I
   can know without reading it.
   Confidence: 3

2. I cannot know this without the article — the three engines are named in it and I am guessing at
   the names. My reasoning is that the split is almost certainly interpreter / bytecode VM /
   WebAssembly: the tree-walking interpreter runs inside the host's own heap, so a wild write or a
   runaway fault can corrupt neighbouring worlds; the bytecode VM has per-world registers and a
   guarded heap but still shares one allocator, so corruption is contained in practice but not
   proved; the WebAssembly engine has a linear memory bounds check on every access, so a fault there
   kills only its own world and cannot damage others. That is the only ordering that makes the
   "isolation" argument in the title hold.
   Confidence: 2

3. I cannot know this without the article, since `countUnit` is from the sample program. To compile
   it without annotations CJI would have to find at least: (a) the declared shape/type of whatever
   `countUnit` reads or mutates outside itself — the buffer, collection or unit table it counts and
   the element type it walks — and (b) the signatures and effects of the functions it calls, e.g.
   the display or console primitive it writes through and whether that primitive can block, allocate
   or fault. A third likely one is the capability the function is allowed to use (which world owns
   the object it touches). Without those, the compiler can only emit dynamic checks, which is
   exactly the cost the annotations exist to remove.
   Confidence: 3

4. I cannot know this without the article — it gives the actual explanation. The plausible reason
   is that the native Editor is a full world that cannot import host services, so it statically
   links the parts of the system it needs: font and text-shaping data, the widget/damage-redraw
   code, its own copy of the buffer and undo machinery, plus reserved stack and heap. The
   WebAssembly Editor ships only its own logic and calls the same facilities through host imports,
   so the shared code is counted once against the host rather than against the world's 528 KiB.
   Confidence: 3

5. The application never touches the LCD. It emits a draw request — a message naming a console or
   surface world and carrying the text and a cursor position — and that message is queued and
   delivered to the receiving world by the scheduler; the receiving world owns the surface,
   converts the request into commands in its damage queue, and only the driver world (or the kernel
   holding the display capability) writes those bytes to the LCD over the device's bus. The reply,
   if any, comes back as a second message, so the whole path is messages between worlds, not
   calls into hardware.
   Confidence: 3

6. Hybrids means Files and Agenda are not one implementation each but a mixture: a compiled core
   (native or WASM) plus persistent state kept as ordinary files, and possibly a data description in
   the filesystem that is read at load time rather than compiled from source. Their rows in the
   compile-time table are therefore not directly comparable with Editor's, because the table is
   measuring source-to-runnable cost and those rows mix a small compiled part with a large amount of
   work that happens at load or open time (parsing/serialising the file-backed state). Editor's row
   is one compile of one body of code; theirs counts different units of work.
   Confidence: 2
