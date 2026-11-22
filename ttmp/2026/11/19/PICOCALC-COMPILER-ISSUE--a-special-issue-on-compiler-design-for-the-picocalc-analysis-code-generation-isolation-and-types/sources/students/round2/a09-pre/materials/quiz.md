# Questions for the article "9. Types That Pay for Themselves"

1. Section 9.2 gives three places in the existing typed sources where a bare integer carries a meaning. Name two of them, and say what replacing them by an enumeration would change in the generated code.
2. Name the four coordinate systems in which the Editor expresses a position, and describe the specific mistake that section 9.3 says tests tend to miss.
3. In the loop of section 9.4, state the fact the compiler records, the three kinds of event that discard it, and why nothing needs to be remembered from one iteration to the next.
4. Why does a signed test `at < text.length` not justify removing the whole bounds check, and how does an unsigned index type resolve this?
5. State the two rules that make a per-turn arena safe, and say what a program must do with data that has to outlive the turn.
6. A function receives a linear `Grant` and contains an `if` with two branches. What must be true of the grant at the end of each branch, and may the two branches dispose of it in different ways?
