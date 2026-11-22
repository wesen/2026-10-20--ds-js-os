# Feedback on "7. Safety by Construction"

## Passages I had to read twice

- "A function's name is entered in the table when the compiler has *finished* translating its
  body." The whole no-recursion argument rests on the word "finished". My first reading was
  "functions defined so far", which would leave open whether a function is registered before or
  after the translation of its own body, i.e. whether self-calls compile. A one-clause gloss,
  such as "so a function cannot call itself, not even from its last statement", would settle it.
- "It is the largest sum of frame sizes along any chain of calls, plus the stack needed by the
  deepest reactor function that chain can reach." I could not tell whether the reactor term is
  added once or once per reactor call in the chain, nor what "deepest reactor function" means
  when the chain already names a specific reactor function. Is this the reactor's own call depth
  from its entry point times that function's frames?
- The mermaid diagram in 7.4. The crossed dotted edge labelled "NOT POSSIBLE: scan is not yet
  defined" runs in the same direction as the existing "order in the source file" arrow from
  `helper` to `scan`, so the reader cannot see which direction of call is being rejected. The
  two sentences of prose above the diagram make the point perfectly; the diagram obscures it.
- "The number of instructions between two back-edges is known at compile time, so the amount
  subtracted at each back-edge can be the length of the loop body." With a nested loop, an outer
  iteration contains the inner back-edge, so the outer body's length and the inner body's length
  overlap. I could not tell whether the charge is meant to be per back-edge over the code between
  consecutive back-edges, which would make this sentence say something different from what it
  literally says.
- "Pattern checking confirms that every access is bounds-checked against *some* length word. It
  does not confirm that the base address really is a buffer." I do not know what a non-buffer
  base address would look like in the emitted code, or which check would be missing. A concrete
  example — "the base register holds the frame pointer instead of the buffer pointer, so the
  length word compared belongs to another object" — is what I needed to understand the limit of
  pattern checking.
- "Give each world a data region whose size is a power of two, and before every non-frame access
  force the address into that region with a mask and an add." I could not reconstruct the
  instruction sequence from this: which register is masked, where the base is added, and what
  happens to an out-of-range address. My guess is that an error becomes a wrong-but-inside
  access rather than a trap, which is a consequence a reader should be told.

## Terms used before they were explained, or never explained

- *CJI* — appears only in the 7.7 comparison table ("any compiler, including CJI") and is never
  defined anywhere in the article.
- *nucleus* — used with a definite article from 7.5 onward ("the nucleus checks a native world's
  turn budget", "handles, which the nucleus already uses for files") with no definition.
- *RV32* — in the 7.6 heading and the key points, never stated as the 32-bit RISC-V instruction
  set emitted for this device.
- *slot* — "All code lies in one contiguous slot inside the reactor" and "at the start of the
  slot"; the shape of a slot is assumed from Article 5 but not restated.
- *frame slot* — "the return address was loaded from the frame slot where the function's entry
  saved it"; the frame layout is not given here.
- *the typed language* / *typed source* / *typed program* — never named, so a reader without
  Article 5 cannot tell what the language is or see its rules.
- *WAMR* — first used in the 7.2 table as "QuickJS and WAMR" without expansion; the expansion
  (WebAssembly Micro Runtime) is implied only later by "WAMR's is available to the WebAssembly
  engine".
- *deepest operand stack* — "its deepest operand stack" in 7.4 assumes a definition of the
  operand stack from Article 5 and does not restate it.
- *"Partly present"* in the 7.2 table's last column — the phrase is never unpacked; which part of
  language-based safety is present and which is missing is left to the reader.
- *metering* — named as the WebAssembly name for fuel and then left; the reader must map three
  vocabularies (fuel, reductions, metering) onto one idea without help.
- *reductions* — glossed as "roughly function calls", which is enough, but the gloss is the only
  definition and it is not quite what a reduction is.

## Claims I could not verify from the article itself

- "They measured an average of 4 percent added execution time [Wahbe et al. 1993]." No
  measurement setup, program set or baseline is given, so the number cannot be checked or
  compared with the article's own claimed costs of two instructions per access.
- "The backend uses about twenty different instructions." The verifier's first check is "every
  word decodes to one of the instructions the backend is permitted to emit", so the list is load
  bearing for the design; it is not given, not even as an appendix table.
- "Compiler frontend, backend, linker (about 1,070 lines of JavaScript), QuickJS running them"
  and "the verifier (a few hundred lines of C)". These numbers are the article's whole argument
  about risk, and there is no provenance: no file list, no counting method, no repository state.
- "The reactor is C code with no recursion of its own, so its part is a constant that can be
  measured once." No measurement is given, and nothing says who measures it or when, so the
  claim that "no run-time stack check is needed" rests on an unshown constant.
- "A call names either a function defined in the same source or one of the 28 functions the
  reactor offers." The 28 are not listed, and the claim that there are no function values or
  computed calls is asserted without showing the grammar or type rules that exclude them.
- "Every indexed access is checked. `text.charCodeAt(at)` compares `at` with the stored length
  using one unsigned comparison, which also rejects negative values, and traps on failure." One
  builtin is offered as evidence for every indexed access, including buffers and record fields;
  those are described but no emitted sequence is shown.
- "The firmware already uses PMP to separate code from data in internal memory." No source or
  reference is given for this, though the loader source is cited elsewhere for other claims.
- "The chip's reference manual documents machine and user modes for its main cores, with no
  supervisor mode, and up to 32 PMP entries." The chip is never named in the body (only
  "ESP32-P4" in the reference list), and no section or page of the manual is cited.
- "Fuel can be made to measure work accurately ... Its charge can be computed from its
  arguments at the call." Nothing shows that every one of the 28 reactor functions has a cost
  computable from its arguments; a search, for example, depends on the data as well as on the
  length argument.
- "The absence of recursion is a by-product of how the compiler happens to register names." No
  file, function or symbol is named, so a reader cannot look at the code that produces this
  property — the one property the whole stack bound depends on.
- "The check is a few dozen lines." An estimate with nothing behind it.
- "Tock ... demonstrates that the two mechanisms of section 7.2 combine well, each used where it
  is cheaper." The two mechanisms are never named in that sentence, so the reader has to guess
  which pair is meant.

## Section scores

- **7.1 — 5.** Every property and every fault comes with an example and a violation, and the
  quoted loader comment supports each row, so the problem is unambiguous.
- **7.2 — 4.** The four-mechanism table is genuinely useful, but the "cost" column is vague
  ("a few instructions per access"), and the last column leaves "partly present" unexplained.
- **7.3 — 4.** The bullet argument is easy to follow, but it asserts the language's rules rather
  than showing them, and one builtin is the only emitted check the reader ever sees.
- **7.4 — 4.** The order-of-definition argument is clean and repeatable, though the diagram
  muddles it and the stack-sum quantity is stated once, in one dense sentence.
- **7.5 — 3.** Fuel is clear as an idea and the three clarifications are the right ones, but the
  accounting works only for flat loops and the reactor charging is a single unargued sentence.
- **7.6 — 3.** The check table is the best part of the article, but the two memory-safety
  techniques get one compressed paragraph each, and the limit of pattern checking is stated in a
  way I could not turn into a concrete failure.
- **7.7 — 3.** The line between plausible and unproven is drawn honestly, but the section leans
  on unverifiable chip facts and mentions CJI as if it had been introduced.
- **7.8 — 5.** The key points are accurate and would stand alone as a summary of the argument.
- **7.9 — 4.** Five of the six questions are answerable from the text; question 3 and the second
  half of question 5 require re-reading the same unclear sentences.

## Questions that the article did not let me answer

- **Question 1, partly.** It asks which of the three properties "a contract, not a wall"
  concerns. The same quoted sentence also says a module "can read and write anything", so both
  control safety and memory safety are in play; the article does not say which one the quiz
  means, and "the list of callable functions" only settles it by implication.
- **Question 3, partly.** I could name the two summed quantities, but only by repeating the
  sentence. The article never tells me what "the stack needed by the deepest reactor function"
  is, so I cannot explain *why* it is a single constant or how it would be measured.
- **Question 5, partly.** I could say that masking survives and pattern checking does not, but
  the reason for the second half depends on "does not confirm that the base address really is a
  buffer", which is never made concrete. What was missing is a worked example of a compiler bug
  that passes pattern checking.

## One thing to add and one thing to cut

**Add:** one worked program taken end to end — a small typed source with a `while` loop and one
indexed access — followed by the emitted RV32 listing annotated with the frame sizes, the fuel
decrement at the back-edge, the bounds-check sequence, and the verifier's decision on it. That
single example would let a reader check the claims of 7.3 to 7.6 instead of taking them on
trust, and it would supply the instruction list the first verifier check currently assumes.

**Cut:** the mermaid diagram in 7.4, and the CHERIoT sentence at the end of 7.7. The diagram
duplicates a two-sentence argument and gets the direction of the rejected call wrong; CHERIoT is
a different processor that the article itself says is out of scope, and the aside costs the
reader more than it gives.
