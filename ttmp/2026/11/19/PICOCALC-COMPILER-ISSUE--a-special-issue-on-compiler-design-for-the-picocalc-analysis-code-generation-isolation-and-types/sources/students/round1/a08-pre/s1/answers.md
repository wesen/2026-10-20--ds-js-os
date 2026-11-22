# Answers — "8. Asynchrony as a Compiler Transformation"

## 1. What is a token in this system, and what must an application do with it between a request and its completion?

A token is the explicit, caller-supplied record that holds the state of one in-flight asynchronous operation: a `state` field (which resume point the function is at), the variables that must survive the wait, and somewhere to put the result or error. It is the machine-readable stand-in for "the rest of the computation", so the language itself needs no coroutines, no stacks, and no scheduler. Between issuing the request and its completion the application must keep the token alive at a stable address and must not touch or overwrite it, then re-enter the same function with that same token whenever the operation makes progress, so the function can read its `state` field and continue where it stopped. In other words, the caller owns the token's storage and drives the re-entry; the function owns the meaning of its fields.

Confidence: 4

## 2. In the `openFile` example, which variables are live at the second wait and which are not? Justify `stop`.

I do not know the exact variable list without the article, so I can only reason about its shape. Just before the second wait the variables that must survive are those read after it: typically the handle or descriptor obtained from the first wait, the destination buffer pointer, the byte count still to transfer, and any accumulator such as a checksum or index that is updated incrementally across the wait. Variables that are already dead are typically the input path string, the open mode or flags, and any prologue temporaries, because the open call has already turned the name into a handle and nothing after the second wait can refer to them.

The justification for `stop` is exactly that: liveness is computed over the remaining path, not over the whole function. If a variable's last read precedes the wait, its value cannot influence the resumed computation, so keeping it would waste scarce token fields and, worse, imply a dependency that could force an extra copy. `stop` therefore marks the end of a variable's live range, and the article presumably uses it to show that a variable's live range ends at the last use before a wait, not at function exit.

Confidence: 2

## 3. Explain "the token fields are defunctionalized continuations written by hand", using the terms *tag* and *saved variables*.

A continuation is the remainder of the computation from a point onward; defunctionalization replaces a first-class function value with plain data — a *tag* naming which code block to run plus a tuple of the values that block will need. The `state` field is precisely that tag: it names the resume point, and the single entry dispatch on `state` plays the role of the one interpreter function that all those closures were folded into. The remaining token fields are the *saved variables*, i.e. the closure environment: the live values that the selected block expects to find already in place. "Written by hand" means the programmer declares the tag numbering, decides which variables to copy in and out, and writes the dispatch, instead of a compiler deriving them from scoping and liveness analysis.

Confidence: 3

## 4. Write the three possible values of the `state` field for `openFile` and say, for each, where execution continues when the function is entered.

Names will differ, but the three values must partition the function into: not yet started, waiting for the open to complete, and waiting for the transfer (or finalisation) to complete. Entry with `state == 0` (fresh) means the dispatch falls through to the function's first statement, which issues the open request and writes the resulting handle into the token. Entry with `state == 1` (opened) means execution continues immediately after the first wait, i.e. in the code that issues the read/transfer request. Entry with `state == 2` (transferring/done) means execution continues after the second wait, in the epilogue that checks the transferred length, stores the result, and marks the token finished.

The key structural point is that every value of the tag corresponds to one contiguous block of the original function body, and the block always ends by writing the next tag and returning, never by falling further down the body.

Confidence: 3

## 5. Why can the saved state of an asynchronous function be placed at a fixed address in this language, and what restriction on the number of simultaneous instances follows?

I cannot know the article's exact justification, but the reasoning that would make this work is that the language gives each asynchronous function exactly one statically allocated instance: no recursion, no reentrancy, and no dynamic allocation of activation records, so the token's storage can live in a fixed global slot that both the resuming caller and the resumed function can name with the same address. The machine is single-threaded, so there is no concurrent second writer to that slot. The immediate restriction is at most one operation of each asynchronous function in flight at a time: opening a second file through the same `openFile` while the first is pending would clobber the first token's tag and saved variables. Needing two concurrent opens therefore forces either a distinct copy of the function or a small array of tokens, and the chapter probably ends by pointing at that as the motivation for the next chapter.

Confidence: 3

## 6. The article advises against inserting waits automatically when fuel runs low. State the reason in terms of what can happen during a wait.

A wait is not a benign pause: the function yields and other code — interrupt handlers, other state machines, the driver completing the operation — runs and may change every piece of global state before control returns. If the compiler picks the yield point from fuel accounting alone, it can land the wait in the middle of a sequence that the code assumed was atomic: after the request was issued but before the token recorded that it was issued, or inside a critical section holding a resource. Resumption would then observe a half-updated invariant, or a request would be re-issued or lost, which is a correctness bug that no fuel counter can detect. That is why the yield point has to be a place the programmer chose, where the set of live variables and the externally visible partial state are both well under control.

Confidence: 3
