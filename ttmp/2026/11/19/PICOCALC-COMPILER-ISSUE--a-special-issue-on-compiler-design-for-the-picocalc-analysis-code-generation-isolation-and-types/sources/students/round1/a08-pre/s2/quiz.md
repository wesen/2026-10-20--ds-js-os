# Questions for the article "8. Asynchrony as a Compiler Transformation"

1. What is a token in this system, and what must an application do with it between a request and its completion?
2. In the `openFile` example, which variables are live at the second wait and which are not? Justify `stop`.
3. Explain the statement "the token fields are defunctionalized continuations written by hand", using the terms *tag* and *saved variables*.
4. Write the three possible values of the `state` field for `openFile` and say, for each, where execution continues when the function is entered.
5. Why can the saved state of an asynchronous function be placed at a fixed address in this language, and what restriction on the number of simultaneous instances follows?
6. The article advises against inserting waits automatically when fuel runs low. State the reason in terms of what can happen during a wait.
