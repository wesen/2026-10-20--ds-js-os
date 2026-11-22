# Reader feedback: Article 7, "Safety by Construction"

## Passages I had to read twice

1. "Solid arrows show the order of definitions in the source file. Dotted arrows are calls the
   compiler accepts; each points from a later function to an earlier one." — The pair `helper` →
   `scan` appears twice in the diagram, once as a solid arrow (definition order) and once as the
   thick rejected-call arrow, which reads as a contradiction until you notice the two arrows have
   different meanings. The file also gives the diagram only as mermaid source, so I had to rebuild
   the picture in my head, and the prose immediately before it argues with `f` and `g` while the
   diagram uses helper/scan/render/onEvent, so I had to re-map the argument onto new names.

2. "the compiler subtracts a larger amount: the greatest number of instructions that one trip
   around the loop body can execute, not counting inner loops, which have back-edges of their own.
   For an `if` it takes the longer branch." — This is one rule spread over four sentences in three
   different grammatical forms ("subtracts a larger amount", "it takes the longer branch", "it adds
   that function's own greatest straight-line cost"), and it never says explicitly that the charge
   is a sum of straight-line instructions plus the longer arm plus callee costs. It is also unclear
   whether a typed callee's "greatest straight-line cost" already includes *its* callees, and what
   happens if an inner loop sits inside a called function rather than in the body being charged.

3. "Give each world a data region whose size is a power of two, and keep the region's base address
   and a mask in two reserved registers. Before every non-frame access, the code computes
   `address = base + (address AND mask)`, two instructions." — The mask is never defined; for the
   trick to work it must be `size − 1`, and the incoming "address" must be treated as an offset
   within the region. The same name `address` is used for the value before and after masking, which
   hides that the input is an offset and the output an absolute address. I convinced myself it works
   only by working an example on paper (region 0x1000..0x1FFF, base 0x1000, mask 0x0FFF).

4. "With a verifier that includes address masking, what must be trusted changes as follows. With
   pattern checking alone, the compiler's handling of types would remain in the first row." — "The
   first row" is ambiguous: of the table that follows, and in which column? I read it three times
   before deciding it means "the compiler's type handling would stay in the trusted column", which
   is what the prose two paragraphs earlier already says.

## Terms used before they were explained, or never explained

- **RV32** — used in the article's own opening aims ("checks a verifier would perform on emitted RV32 code") and never expanded. The glossary lists it only as "native (RV32 machine code)". I inferred "RISC-V, 32-bit" from section 7.7.
- **WAMR** — the glossary glosses it as "WAMR (WebAssembly)" without saying what the letters stand for or what kind of engine it is; section 7.5 then calls it "the WebAssembly interpreter on this device", which is the first real explanation.
- **linear memory** — "linear-memory accesses" in the VeriWasm sentence (7.6) is WebAssembly-internal vocabulary; neither the article nor the glossary says what a linear memory is.
- **soundness** — "the verifier's own soundness is proved in a proof assistant" (7.6); the notion of a checker being sound, and why that is the property worth proving, is never stated.
- **`sp`** — the stack-pointer register appears in the verifier table of 7.6 without being introduced anywhere in the article or glossary.
- **supervisor mode** — 7.7 says the manual documents machine and user modes "with no supervisor mode", but the three RISC-V privilege levels are never laid out, so the absence of the middle one means nothing yet.
- **sandbox** — "the result lies inside the sandbox" (7.2), used as if previously defined; the glossary has "software fault isolation" and "address masking" but no entry for the sandbox itself.
- **type-safe language** — 7.2's language-based safety row leans on it ("relying on a type-safe language to keep them apart") before section 7.3 gives this project's version of the idea.

## Claims I could not verify from the article itself

1. "On their benchmark programs they measured an average of 4 percent added execution time [Wahbe et
   al. 1993]." — no benchmark is named, no baseline given, and "average" is not defined (mean
   over programs, weighted by run time?). The number has to be taken on faith from the reference.
2. "The reactor functions are C code with no recursion, so each one's stack use is a fixed quantity
   that is measured once when the firmware is built." — the article does not say how it is measured,
   where the number is stored, or who keeps it in step with the reactor's C sources when they change.
3. "The backend uses about twenty different instructions" — the article points at Article 5's table
   of "the common ones", so I can neither count them nor tell whether the verifier's whitelist is
   complete; the whole first row of the verifier table depends on that list.
4. "three files, about 1,070 lines and 43 kB of JavaScript" — no file names beyond
   `compiler/typed-wasm.js`, no measurement shown. A reader cannot check the size of what is being
   trusted, which is the article's own central measure of risk.
5. "The verifier (estimated at a few hundred lines of C)" — an estimate, not a measurement, in a
   table whose point is that the verifier is small.
6. "The chip's technical reference manual documents machine and user modes for its main cores, with
   no supervisor mode, and up to 32 PMP entries." — a claim about a document not quoted and not
   reachable from the article; section 7.7 itself then says how many entries can be spared is
   unknown, so the reader cannot tell what part of the hardware route is established and what is
   hoped for.
7. "The firmware already uses PMP to separate code from data in internal memory, an option visible
   in its build configuration." — no file, no option name, no configuration snippet, so the one piece
   of evidence that PMP already works on this chip has to be accepted unexamined.
8. "WAMR, the WebAssembly interpreter on this device, has it." — the article says WAMR offers
   metering, not that the device's build enables it or what a budget in WAMR's units costs in
   milliseconds.
9. "Because no unbounded execution can avoid passing a back-edge, the program cannot run
   indefinitely." — true for loops written in typed source, but the fuel decrement is emitted only in
   typed code, and reactor functions are C with loops of their own. The article only requires
   worst-case charging of reactor calls in the "fuel can be made to bound work" variant; in the
   decrement-by-1 variant a reactor function that loops internally is unbilled. The missing step is a
   statement of the scope of the claim, or a bound on reactor internals.
10. "each process is given a budget of 4,000 reductions" — no Erlang version or configuration is
    given, and the Erlang default is configurable, so the figure should be dated or qualified.
11. "Article 9 argues for letting functions be called before their definition, for convenience" and
    "Article 10 records this as one of the tests of the plan" — cross-references I could not follow
    from this article alone.

## Section scores

| Section | Score | Reason |
| --- | --- | --- |
| 7.1 What can go wrong | 5 | The three properties and the three kinds of fault are separated cleanly in two tables, and the quotations from the loader are concrete. |
| 7.2 Four ways to confine code | 5 | The "what must be trusted" column is the clearest idea in the article and carries the rest of it. |
| 7.3 What the typed language already guarantees | 4 | The four bullets are assertions rather than proofs; I believe them, but the record-field and reactor-call cases get one clause each. |
| 7.4 No recursion, therefore a bounded stack | 4 | The acyclicity argument is convincing in two sentences; the diagram and its caption cost me more time than the argument did, and the figure is only available as mermaid source. |
| 7.5 Time: fuel for loops | 3 | The idea is clear and the three clarifications are useful, but the "bound work" calculation is one dense passage with no worked number, and the reactor-internals gap is not mentioned. |
| 7.6 Verifying the output | 4 | The check table is excellent; the masking arithmetic is under-specified (no `mask = size − 1`) and the "first row" sentence is ambiguous. |
| 7.7 The hardware route | 4 | Honest about what is unknown, which I valued; the closing paragraph drifts to ESP-TEE and CHERIoT, which are about other chips. |
| 7.8 Key points | 5 | Each bullet maps to one section and adds no new vocabulary. |

## Questions that the article did not let me answer

None were impossible, but two were harder than they should be.

- **Question 4** was the worst. The question asks how a typed call and a reactor call are *charged*,
  and the article gives three different charging rules in one prose bullet without ever stating the
  rule they compose into. I had to assemble the answer from "not counting inner loops", "for an `if`
  it takes the longer branch" and "it adds that function's own greatest straight-line cost", and I am
  still not certain whether a typed callee's straight-line cost includes its own callees' costs.
- **Question 2** asks what is lost if the acyclicity check is not added. The article answers this only
  in the last clause of the section ("the stack bound silently disappears"); the connection to the
  loader's refusal decision has to be reconstructed from 7.4's third consequence.
- **Question 6** is answerable, but only from the comparison table at the end of 7.7; the prose of
  7.6 and 7.7 never says which of the two covers a compiler you do not trust for *untyped* input.

## One thing to add and one thing to cut

**Add:** one worked numerical example, printed as a table, of computing maximum stack use and the
fuel charge for a three-function program — say `helper` (frame 24 bytes, no calls), `scan` (frame 40,
calls `helper`, loops with a body of 5 own instructions, an `if` with arms 8 and 3, and one call to
`helper` costing 30) — showing the stack need of each function and the resulting fuel charge of 43
per iteration and what that means in milliseconds. That single table would replace the hardest
sentences in 7.4 and 7.5 and would make quiz questions 3 and 4 mechanical.

**Cut:** the last three sentences of 7.7, the ESP-TEE and CHERIoT material. Both concern other chips
and neither changes any decision the article asks the reader to make; the paragraph's useful content
(handles lead to capabilities when hardware adopts the idea) is a single clause and belongs with
Article 9's handles.
