# Questions for the article "8. Asynchrony as a Compiler Transformation"

1. What is a token in this system, and what must an application do with it between a request and its completion?
2. In the `openFile` example, which variables are live at the second wait and which are not? Justify `stop`.
3. In the Editor's hand-written code, which two fields together form the tag that distinguishes the two continuations of opening a file, and which fields are the saved variables?
4. The generated code has two entry points, `start` and `resume`. Say what each one is called with, and for each value of `frame.state` where `resume` continues.
5. Section 8.6 says the unit that needs storage is the task, not the function. Explain why one frame per function is not enough, how the compiler lays frames out instead, and what restriction remains.
6. The article advises against inserting waits automatically when fuel runs low. State the reason in terms of what can happen during a wait.
