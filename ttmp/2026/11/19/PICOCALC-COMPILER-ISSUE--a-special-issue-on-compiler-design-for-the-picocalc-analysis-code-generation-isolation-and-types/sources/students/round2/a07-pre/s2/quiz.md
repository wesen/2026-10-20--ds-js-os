# Questions for the article "7. Safety by Construction: Running Native Code Without Trusting It"

1. The native loader's comment says the list of callable functions "is a contract, not a wall". Explain what this means and which of the three safety properties it concerns.
2. Section 7.4 calls the absence of recursion a by-product. A by-product of what? State what must be added to the compiler if the language later allows a function to be called before it is defined, and what is lost if it is not added.
3. Give the definition of a function's stack need from section 7.4, and say why the compiler can compute it at the moment it finishes translating the function.
4. Section 7.5 distinguishes subtracting 1 at each back-edge from subtracting a larger amount. What does each bound? How are a call to a typed function and a call to a reactor function charged?
5. A compiler error passes an integer where a buffer reference belongs. Which of the two memory-safety techniques in section 7.6 still confines the resulting access, and why does the other accept the code?
6. Give one advantage of the software verifier over PMP with user mode, and one advantage of PMP with user mode over the verifier.
