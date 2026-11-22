# Questions for the article "10. Architecture and a Roadmap"

1. The reactor's header stores the number of reactor functions, and the linker checks it. Which mistake does that check catch, which does it miss, and how does the proposed interface description remove both?
2. Of the five steps of a screen update in section 10.3, which three exist only because the two sides exchange text, and why do the other two remain under a binary protocol?
3. Why is deleting type annotations not sufficient to make typed source run correctly in a JavaScript engine? Give two specific constructs and what must be added for each.
4. A JavaScript emitter gives a reference implementation derived from the same source. What kind of error can it detect, and what kind can it not?
5. Why does the roadmap place `await` before porting the remaining applications? Use the figures of section 10.1 in your answer.
6. Choose one prediction from section 10.7 and state what observation would refute it and what the plan says to do then.
