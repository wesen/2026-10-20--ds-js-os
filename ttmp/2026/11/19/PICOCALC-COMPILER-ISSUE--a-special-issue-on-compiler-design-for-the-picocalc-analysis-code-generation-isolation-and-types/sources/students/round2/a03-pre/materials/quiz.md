# Questions for the article "3. Why Whole-Program Inference Costs Minutes"

1. In section 3.1, adding the function `half` changes the machine code for `scale`. Explain why, and say what this implies about compiling `scale` separately from the rest of the program.
2. Trace the range of `i` at the loop head in section 3.2 for the first three passes, then state what widening does, on which pass it produces the fixpoint in the table, and what it costs.
3. With `max` equal to 2⁵³ − 1, JavaScript evaluates `(max + 2) - max` to 1, and a build of CJI without the range proof computed 2. Explain where each result comes from.
4. Compiling Agenda took six specialization rounds, seven complete range analyses and 95 passes. Explain how the seven and the 95 arise.
5. Which measurement in section 3.5 shows that the cost remaining after the range analysis is removed is still large, and what is that cost attributed to?
6. Self's designers solved their compile-pause problem with two compilers. Which component of the handheld already plays the role of Self's fast first compiler, and what does CJI lack compared with Self's design?
