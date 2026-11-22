# Questions for the article "3. Why Whole-Program Inference Costs Minutes"

1. In section 3.1, adding the function `half` changes the machine code for `scale`. Explain why, and say what this implies about compiling `scale` separately from the rest of the program.
2. Trace the range of `i` at the loop head in section 3.2 for the first three visits, then state what widening does on a later visit and what it costs.
3. Give two reasons, from section 3.3, why `a + b` in JavaScript cannot always be compiled as a single integer add instruction.
4. Agenda needs six specialization rounds. Why does specializing one library call create the need for another round?
5. Which measurement in section 3.5 shows that the cost remaining after the range analysis is removed is still large, and what is that cost attributed to?
6. Self's designers solved their compile-pause problem with two compilers. Which component of the handheld already plays the role of Self's fast first compiler, and what does CJI lack compared with Self's design?
