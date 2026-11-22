# Questions for the article "9. Types That Pay for Themselves"

1. A new value is added to an enumeration that is examined in six places. What does exhaustive matching make the compiler do, and why is that valuable?
2. `Unit` and `Point` are both represented as 32-bit integers. What does declaring them as distinct types prevent, and what does it cost at run time?
3. In the loop of section 9.4, state the fact the compiler records, where it becomes invalid, and why it does not need to survive the back-edge of the loop.
4. Why does a signed test `at < text.length` not justify removing the whole bounds check, and how does an unsigned index type resolve this?
5. State the two rules that make a per-turn arena safe, and say what a program must do with data that has to outlive the turn.
6. A function receives a linear `Grant` and contains an `if` with two branches. What must be true of the two branches for the function to be accepted?
