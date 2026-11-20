## Theory: Testing a Renderer That Draws Only Changed Cells

A changed-cell renderer holds three states. The **back buffer** *B* is the frame the game logic wants next. The **committed front buffer** *F* records what the renderer believes it last sent. The **display** *D* is what the handheld screen actually shows. Each frame, the renderer computes Δ = {cells where *B* ≠ *F*}, sends only Δ to *D*, then commits by copying *B* into *F*.

**Example.** The snake occupies cells *h*, *s1*, *s2* (head first) and moves right into empty cell *n*. The intended *B* marks *n*, *h*, *s1* as snake and *s2* as empty. Assuming one uniform snake colour, the correct Δ is {*n*, *s2*}.

**Shared primitive.** Suppose the game update and the test oracle both find the tail with the same function `tail()`, and `tail()` wrongly returns *s1*. Both computations clear *s1*, so they agree and the test passes, but the frame is wrong. Agreement between computations that share a primitive shows only that they are consistent. To show correctness, derive expected cells independently, for example from a hand-written list.

**What each comparison justifies.**

- *B* vs. independent expectation: the game logic produced the intended frame. It says nothing about drawing.
- *F* vs. *B* after commit: the commit step copied correctly. It does not show that *D* changed.
- *D* vs. *F*: the sent cells reached the screen, provided *D* is read back without reusing the write path's driver call.

Only all three comparisons, each with an independent oracle, together justify the claim that the screen shows the intended frame.

*Author diary: I wrote this section as a pedagogical methods illustration only, and it reports no measurements, implementation details or test outcomes.*
