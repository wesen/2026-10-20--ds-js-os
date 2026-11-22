# Feedback — Article 10, "Architecture and a Roadmap"

Read once end to end, then again section by section for the quiz. This is a student report, not an expert review: where I say "unclear" I mean I could not extract the meaning from this article alone.

## Passages I had to read twice

- "The same description could therefore carry the facts that Articles 7 and 9 need for each function: which capability it requires, how much fuel a call should be charged, and whether a handle argument is consumed or only lent." Jump from "WIT can declare a resource type" to "the same description carries fuel cost and capability" is not bridged. Value types in an interface description are one thing; attaching a fuel price and an authority requirement to each function is another, and I cannot tell whether that is a WIT feature, a planned extension, or just a place to put the comments.
- "A count of functions is also packed into a header word that the linker checks." Which header, written by which tool, checked when? I only understand from context that it is a count, and therefore useless against reordering — but the article never says that, so I had to reason to it myself (see answer 1).
- "Its insight was that type information can be written in valid JavaScript: a parameter is given the type *integer* 'by means of an explicit coercion on function entry', written `x = x|0`." Read twice because a coercion on entry only promises a 32-bit value *at that moment*; it does not constrain what happens to `x` later in the body. The sentence explains the notation but not why the notation is a guarantee.
- "[The device-language study] considered and rejected compiling the typed language to JavaScript as a way to run applications, because arithmetic would still be boxed. The purpose here is different and does not depend on speed." Read twice because this is the one place the article answers an obvious objection, and the answer is condensed to "different purpose". I still do not know whether boxed arithmetic breaks anything besides speed (e.g. whether it changes results).
- "Steps 0 to 4 are small, independent and low-risk, and they should be done first in any order." Read twice against the flowchart, which draws 0 → 5, 0 → 10, 3 → 6, 3 → 10, 4 → 7. If step 0 unlocks "Every later decision" (roadmap table) and step 3 unlocks "data for steps 6 and 8", then "in any order" cannot be literally right; I think it means "any order consistent with the arrows", which is not what it says.
- "CJI remains valuable as a workstation compiler that turns existing JavaScript worlds into native code for the firmware image … As an on-device compiler it has been superseded." Read twice because "superseded" has no subject. Superseded by the typed compiler? That one takes annotated source, so unannotated JavaScript would seem to have no compiler left on the device — which is consistent with "superseded" but makes the loss of the capability look like a benefit only because section 10.5 says compiling unannotated JavaScript on the device is "a goal". A sentence on what is given up would help.

## Terms used before they were explained, or never explained

- **world** — used from the first table onward ("Runs JavaScript worlds", "every other world's responsiveness", "worlds in user mode"); never defined in this article.
- **nucleus** — "Connects a fully typed application to the nucleus" (10.1), "The nucleus copies the message" (10.3); never defined here.
- **reactor** — the central object of 10.2 and 10.5; the article says what it provides (28 functions) and that per-application reactors hold untyped logic, but never what a reactor *is*.
- **CJI** — never expanded, and it is both a runtime, a compiler tool and a language ("CJI-compiled worlds", "CJI itself, compiled to RV32").
- **WAMR** — never expanded (presumably a WebAssembly runtime, from "Runs WebAssembly worlds").
- **trampoline** — "one jump per function", "one trampoline per function"; the mechanism is implied but the word is not explained.
- **ELF / RV32** — "Loads RV32 ELF modules"; RV32 is inferable from context, ELF is not.
- **fuel** — "how much fuel a call should be charged", "Fuel counter"; a metering unit, never defined here.
- **PMP** — "worlds in user mode under PMP"; never expanded. This is the highest-risk unexplained term because it appears in a roadmap row with risk "high".
- **per-turn arena** — step 8; "turn" and "arena" are both undefined, and this is the step that "unlocks applications that allocate".
- **guard facts** — step 8, "Guard facts for bounds checks"; no explanation anywhere.
- **content key** — step 1, "Cache compiled modules under a content key"; presumably a hash, but the word "hash" only appears later, in 10.7's "look at hashing and load costs".
- **compile-time operand stack** — step 5; the *benefit* is quantified (593 vs 1,529) but the technique is not described, so I cannot judge the risk class.
- **liveness-based saving** — 10.7, "Liveness-based saving is less economical than hand-written state"; liveness is never introduced.
- **typed source / typed language / typed compiler** — used interchangeably, and the typed language is never named.
- **resource, owned handle, borrowed handle** — quoted from WIT and given one gloss ("can only be passed around indirectly via handle values"), but "owned" vs "borrowed" is never spelled out, though 10.2 leans on it for the "consumed or only lent" argument.

## Claims I could not verify from the article itself

- "That is three engines, two compilers, two run-time systems and three reactors." The table above it has eight rows; I cannot map them onto 3/2/2/3 without guessing (engines: QuickJS, WAMR, native loader? compilers: CJI tool, typed compiler; run times: QuickJS's and CJI's; reactors: shared + Agenda + Files). The arithmetic is the article's central summary sentence and it is not shown.
- "The typed versions are five to six times longer than the programs they replace." Editor supports it (1,730 / 316 ≈ 5.5), but Agenda does not: (468 + 869) / 307 ≈ 4.4, and its *typed source* alone is 468 / 307 ≈ 1.5 times the original. Either the C is being counted for Agenda and not consistently for Editor, or the multiplier is really "Editor's". Missing: which lines are counted in each row.
- "A screen of 17 rows of 49 characters is under 2 kB in such a form." 17 × 49 = 833 characters, so the character payload alone nearly fills 1 kB before styles and offsets. I cannot check the claim because the record layout is never given (bytes per style, per indentation, per run).
- "The design notes budget up to six output bytes per input unit for this step." No derivation: six is consistent with a UTF-8 3-byte maximum times a 2-byte `\uXXXX` escape, but the article does not say so, and it has no citation.
- "Editor contains 104 such `writeLiteral` calls" and "about 1,730 lines of typed source" and "508 lines of C" and "28 functions". All are counts of files this article never shows and never cites a repository path for. They are the evidential base for two of the four proposals.
- "Its build times of minutes make it unusable interactively, and it costs 660 kB and a boot-time relocation that had to be scheduled around." No measurement, no machine, no build size. This is the sole justification for step 2, a decision the article calls "the clearest decision".
- "Article 2 presented evidence that the compositor is the largest consumer of time on the path to the screen, and noted that in the measured firmware it was already native code." No numbers are repeated here, so I cannot see how strong the evidence is — yet step 10, the largest proposal, is made conditional on it.
- "Its insight was that type information can be written in valid JavaScript … written `x = x|0` … and a floating-point type by `x = +x` [Herman et al. 2014]." The quotation marks and the bracket suggest a quote, but no section or page is given, and the claim that such code "can also be compiled ahead of time with unboxed integers" is not supported by anything visible to me.
- "TypeScript 5.8 added an option that rejects every TypeScript construct with run-time behaviour … and a proposal before the JavaScript standards committee would have engines ignore annotations as if they were comments (it is at the first of the committee's stages)." Cited only as "release notes, 2025" and "Stage 1"; no indication that either has been applied or prototyped against this typed language, whose semantics the next table says differ from TypeScript's.
- "A third, small backend that emits JavaScript with these rewrites, together with a JavaScript implementation of the reactor's 28 functions, would let QuickJS execute the same typed source." "Small" is asserted, not evidenced, and the 28-function JavaScript reactor shim is a second hand-maintained copy of the interface — the very problem section 10.2 sets out to remove.
- "With a cache, an unedited Editor costs under 100 ms at boot instead of 2–3 s" and "Removes 2–3 s from every boot" (step 1). No breakdown of where the 2–3 s goes, so the 100 ms figure is unfalsifiable from this article.
- "With twelve applications still to port" / "Port the remaining twelve applications". Only Editor and Agenda are discussed anywhere in this article, so the count of twelve is unverifiable here, though it matters for the argument in 10.6.
- Effort classes: "small is days, medium is one to two weeks, large is more." No unit of effort (person-days? one maintainer?) and no basis for the classification of individual steps.

## Section scores

- **10.1 What the firmware contains** — 3. The inventory table is clear and useful, but the summary sentence "three engines, two compilers, two run-time systems and three reactors" cannot be reconstructed from the table, and the "five to six times longer" multiplier does not hold for Agenda's own numbers.
- **10.2 One description of the reactor's functions** — 4. The order hazard, the three files that must agree, and the fix are all clear, and the diagram earns its space; marks lost for the WIT/resource paragraph, which introduces fuel and capabilities without saying how they attach to an interface description.
- **10.3 A typed screen protocol** — 5. The five numbered steps are the clearest passage in the article: each says who does what and why, and the alternative is contrasted step by step. The conditionality ("only if the measurement confirms") is also stated twice, which is right for the largest proposal.
- **10.4 One source for both engines** — 3. The rewrite table is excellent and the limit on what the reference can prove is honestly stated, but the asm.js paragraph is dense and the response to the device-language study's boxed-arithmetic objection is compressed to one sentence.
- **10.5 Fewer engines** — 4. The "needed as long as / could be removed when" framing is a good teaching device; "has been superseded" leaves the reader guessing what is given up, and no term in the table (PMP excepted) is defined.
- **10.6 The roadmap** — 4. The table and the flowchart agree, and the three sentences on ordering are genuinely useful; "should be done first in any order" contradicts the arrows, and the effort classes have no unit.
- **10.7 Predictions that would falsify the plan** — 5. Concrete numbers, a named check, and a stated response for each row. This is the section I trusted most.
- **10.8 Key points** — 5. Six bullets that match the body, including the conditional wording on the compositor and the "now" on the CJI tool.
- **10.9 Check your understanding** — 4 (as a quiz, not as prose). Every question is answerable from the text, but question 2 is slightly underdetermined about step 3 (see below), and question 4 is nearly a paraphrase of two sentences the article already states.

## Questions that the article did not let me answer

None were unanswerable, but two were not answerable *cleanly*:

- **Question 2** ("list the steps … that exist only because the application and the compositor exchange text"): the article names five steps and says both sides "exchange text", but never says which of the five are text-caused. A reader has to reason that step 1 (formatting), step 2 (escaping) and step 4 (parsing) are the text steps, and that step 3 (copy to the queue) is messaging rather than text. A reasonable reader might also pick step 3, since the 16 KiB limit and the queue presumably exist because messages are text-sized. Missing: one sentence marking the three text-caused steps, or reordering the list to separate transport from representation.
- **Question 5** (`await` before the remaining ports): answerable, but only by combining 10.1's parenthetical "no `await`" with 10.6's "would produce a great deal of code that `await` would then make obsolete". The article never says *how much* of the 5–6× multiplier is attributable to `await`, so the strength of the ordering decision cannot be judged. Missing: a line on how much of the growth in the ported Editor comes from hand-written state (section 10.7 gives 71 fields, which would serve).

Everything else (questions 1, 3, 4, 6) was directly answerable, including all the numbers needed for working.

## One thing to add and one thing to cut

**Add:** a short "what each mechanism costs" line for the section 10.1 inventory — flash, boot time and maintainer surface per component — because every removal decision in 10.5 is justified by exactly those three quantities and only one of them (660 kB) is ever given a number. Even a coarse table (flash kB, seconds added to boot, "one more thing to learn") would let a reader check "the clearest decision is the fourth row" instead of taking it on trust.

**Cut:** the asm.js paragraph in 10.4, or reduce it to one sentence. The table of five rewrites already carries the argument that the typed language's semantics differ from JavaScript's, and it is the part a reader can check. The asm.js history (`x = x|0`, "explicit coercion on function entry", a 2014 working draft) adds a fourth named technology that the article then does not use again — the proposal it supports is 10.4's own emitter, not asm.js, and no row of the roadmap depends on it. What the paragraph does that is useful — "type information can live inside valid JavaScript" — is one clause, not a page.
