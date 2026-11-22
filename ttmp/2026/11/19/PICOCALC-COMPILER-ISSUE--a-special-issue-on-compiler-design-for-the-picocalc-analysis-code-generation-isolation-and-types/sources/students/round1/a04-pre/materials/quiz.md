# Questions for the article "4. Making Inference Affordable, or Avoiding It"

1. For the function `nextIndex` in section 4.1, write the jump function for the first argument of `clamp`, and use it to compute that argument's range when `i` is in [5, 7].
2. A classmate says: "A summary computed once must be wrong, because callers keep changing." Explain the error in this reasoning.
3. Plain SSA gives `i` one name on both outcomes of the test `i < n`. Why does this lose information for a range analysis, and what do extended SSA forms add?
4. In dependency-order solving, where is iteration still required and where is it never required?
5. State what "local checking" means, and give two practical consequences of it for a compiler that runs on the handheld.
6. Static TypeScript's compiler performs only a peephole pass, yet its output is much faster than an interpreter. What supplies the information that an optimizer would otherwise have to discover?
