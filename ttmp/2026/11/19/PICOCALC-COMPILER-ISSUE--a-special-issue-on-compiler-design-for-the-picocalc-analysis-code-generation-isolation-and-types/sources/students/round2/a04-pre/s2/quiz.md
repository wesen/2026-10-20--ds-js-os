# Questions for the article "4. Making Inference Affordable, or Avoiding It"

1. For the function `nextIndex` in section 4.1, write the jump function for the first argument of `clamp`, and use it to compute that argument's range when `i` is in [5, 7].
2. A classmate says: "A summary computed once must be wrong, because callers keep changing." Explain the error in this reasoning.
3. Plain SSA gives `i` one name on both outcomes of the test `i < n`. Why does this lose information for a range analysis, and what do extended SSA forms add?
4. Of the 11,760 function visits made while compiling Agenda, how many analyzed a function body, and why is that the number that matters for judging what summaries could save?
5. State what "local checking" means, and give two practical consequences of it for a compiler that runs on the handheld.
6. Section 4.3 says the two families of remedy meet. Which existing feature of CJI makes that possible, and what would have to become mandatory?
