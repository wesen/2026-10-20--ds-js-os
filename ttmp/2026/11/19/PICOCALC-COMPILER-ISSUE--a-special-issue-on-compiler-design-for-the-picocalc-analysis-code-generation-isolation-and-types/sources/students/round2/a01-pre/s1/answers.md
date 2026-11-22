# Answers — "1. The Machine, the Mission and the Vocabulary"

1. A single world cannot run a long loop to completion because there is one small machine behind all
   of the worlds: one core, a small RAM, and other worlds that also need to run. A world that never
   returned would starve the scheduler and the hardware. So instead it must run in short bounded
   slices and yield at explicit points (between messages, or per-loop-iteration), letting the
   scheduler switch away and resume it later. That is a cooperative model: worlds are never
   preempted mid-instruction, they hand control back.
   Confidence: 3

2. I cannot know this without the article — the names of the three engines are the article's own
   vocabulary, and so is the claim about which of them can damage other worlds. My best reasoning: the issue title names "isolation" and "types", so the engines are
   probably the typed compiler (compiled worlds run in a checked sandbox), the native Editor, and the
   WebAssembly Editor. In that reading a fault in a compiled world can only damage that world, and a
   fault in the Wasm Editor is likewise contained by the Wasm sandbox; the native Editor is the one
   running privileged code near the hardware, so if any engine could damage other worlds it would be
   that one. But whether the article actually says so, and on which side of the line each of the
   three falls, is something only the article can tell me.
   Confidence: 1

3. I cannot know this without the article — "CJI" and `countUnit` belong to the article. Two facts a
   whole-program compiler would have to recover from outside the function text are: (a) the type and
   memory layout of the value being counted (integer width, struct fields, pointer/reference status),
   which lives in the declaration or at the call sites; and (b) the type and signature of whatever
   the function reads or writes — the display/cell handle, the row struct, the imported API it calls
   — which lives in interface or import declarations. A third candidate is any global or constant it
   refers to, plus the result type needed where the function is used. Without annotations, that
   information must come from module-level or whole-program type information.
   Confidence: 1

4. I cannot know this without the article — the exact accounting comes from its own memory
   breakdown. A plausible reason is that the native build links everything as machine code: any
   interpreter/compiler pieces it drags in, its own allocator, font and glyph tables, and the
   hardware driver are all inside the image, with no shared runtime to import from. The WebAssembly
   build can instead import fonts, printing and other low-level services from the host and uses a
   compact module format, so the same Editor costs fewer resident kilobytes there. The article would
   have to justify the extra ~180 KiB with a concrete component before this counts as an answer.
   Confidence: 2

5. I cannot know this without the article, since it depends on the world names and the exact
   message types defined there. The shape, though, must be must be message passing between isolated
   worlds rather than a direct call into the hardware. The application world sends a "draw this text
   at this position" message to the world that owns text or the document (a console or Editor
   world), which decides which glyphs go where and emits a further message downward describing the
   line or its pixels. The display world — the one holding the frame or the privilege to touch the
   LCD — is the only one that actually writes to the hardware. Every hop is a queued message, so the
   application never waits on the physical write.
   Confidence: 2

6. I cannot know this without the article; "hybrid" most plausibly most plausibly means the app is not
   one purely typed-compiled world: part of it is compiled from source and part is pre-existing
   native or built-in code that it composes with, so its behaviour comes from more than one
   compilation route. That makes its row in the compile-time table not comparable with Editor's row,
   because the hybrid's numbers include fixed, already-built components that the pipeline under test
   never compiled, plus whatever linking or wiring they need, whereas Editor's row measures a single
   compilation of a single program. Comparing the two would mix "what the compiler did" with "what
   was prebuilt elsewhere".
   Confidence: 2
