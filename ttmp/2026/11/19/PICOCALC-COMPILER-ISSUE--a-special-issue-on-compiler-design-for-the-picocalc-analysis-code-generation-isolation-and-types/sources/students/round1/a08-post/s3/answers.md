# Answers to 8.9 "Check your understanding"

## 1. What is a token, and what must the application do with it?

A token is a plain number that the reactor hands back immediately when the application starts a long operation, and it identifies that particular request (§8.1). Because the completion arrives later as a separate event, the application has to keep the token in a long-lived field such as `state.readToken`, then return to the nucleus. When a new event arrives with `event.kind === 4` and some token, the handler compares that token with its stored ones so it can recognise which operation has finished and carry on. If no stored token matches, the event belongs to something else and is ignored.

Confidence: 5

## 2. Which variables are live at the second wait, and which are not? Justify `stop`.

Working: a variable is live at a point if some path from that point reads it before writing it.

| Variable | Live at wait 2? | Reason |
| --- | --- | --- |
| `handle` | no | the read is already issued; nothing later reads it |
| `ok` | no | tested once right after wait 1 |
| `length` | **yes** | the `loop_test` comparison reads it |
| `read` | **yes** | compared with `length` and advanced by the copy |
| `written` | **yes** | final value is stored into `state.textLength` |
| `stop` | no | it is recomputed by `stop = min(length, read + 4096)` at the top of each outer iteration before being read |
| `text` | no | a `buffer`, so under the rule of §8.4 it may not be live across a wait; it must be reacquired |

So exactly three scalars are saved: `length`, `read`, `written`, which is what the frame in §8.5 contains.

Confidence: 4

## 3. "The token fields are defunctionalized continuations written by hand"

Defunctionalization replaces a function-like value with a data record: a **tag** saying which piece of code is meant, plus the **saved variables** that piece of code will read. In the hand-written Editor the tag is which token field is non-zero, and the saved variables are the fields that routine keeps beside it. The article's example: `state.readToken > 0` is tag 1 (the read is outstanding), and `unitsRead`, `unitsWritten`, `sourceLength` are the saved variables of the continuation that resumes the normalization loop. Dispatching in `typedWorldEvent` — compare `event.token` with each token field and jump to the matching branch — is the defunctionalized "look at the tag and jump" step. What the compiler would generate as a tag integer, the author encodes implicitly in which field is non-zero.

Confidence: 3

## 4. The three values of `state` and where execution continues

`state = 0` means "not running": a fresh entry, so the function starts at the beginning, calls `typedSdkFileRead(handle)`, stores the returned token in `frame.token`, sets `state = 1` and returns `LATER`. `state = 1` means "waiting for the read": entry goes to `case 1`, which tests `event.ok` (returning `DONE(0)` and `state = 0` on failure), initialises `length`, `read`, `written` and jumps to `loop_test`. `state = 2` means "waiting for the yield": entry goes to `case 2`, which first reloads `length`, `read`, `written` from the frame and then jumps to the same `loop_test` label. Reaching the end of the loop sets `state.textLength`, resets `frame.state = 0` and returns `DONE(1)`.

Confidence: 5

## 5. Why a fixed address, and what restriction follows

In a language with recursion a function may be active several times simultaneously, each activation with its own locals, so continuations would have to be allocated dynamically. Article 7 showed the typed call graph is acyclic, so on any chain of calls a function is active at most once; one fixed frame per asynchronous function is therefore enough, exactly as a leaf procedure's activation record can be statically allocated. The restriction is one static frame means one live instance: two reads outstanding at once need two frames, so the compiler must be told the maximum. The usual design is one frame per function by default with a declared larger fixed count, and starting an instance when all frames are busy becomes a visible result the program must handle rather than a silent allocation failure.

Confidence: 4

## 6. Why not insert waits automatically when fuel runs low

A wait is a place where other events are handled and the application's state can change underneath the suspended task. In the example, a key press could be processed between two slices and modify the very document being normalised, and the Editor has to keep the open request pending to guard against that. An explicit `await` in the source marks precisely those interleaving points, so the author can reason about them; a wait inserted invisibly where fuel happened to run out would move those points around without the author knowing. Hence the division of labour: `await typedSdkYield()` divides long work in a correct program, fuel only stops an incorrect one.

Confidence: 5
