---
Title: Independent diary for the production streaming review
Ticket: PICOCALC-COMPILER-INTEGRATION
DocType: reference
Status: complete
Topics: [picocalc, native, performance]
---

# Independent streaming integration diary

## Step 1. Determine the lifetime and error contracts

The revised scope paired numeric operands with per-function streaming. I kept the old direct-bounds experiment as an archived qualification and selected `3785155` as the unambiguous buffered control. I read the production patch during development, then reran the full examination on its committed revision `2317696`.

The patch pushes target and signature descriptors in definition order, lowers the current body, and nulls that body's operand-array reference through the shared descriptor. Source checks continue after the first lowering error. This gave two independently testable claims: an earlier backend error can lose precedence to a later source error, and subsequent numeric arrays are still released on the error path.

### Prompt context

The original integration prompt appears in [the supervisor's diary](01-compiler-integration-diary.md). The supervisor clarified that the second requested change was numeric operand streaming. The delegated task specified independent checks of JavaScript diagnostics, retained references, public entry points and call fixups with no production edits.

### What I did

Built a 138-function source with 130 imports and special JavaScript property names. Compared all six real world artifacts, publicly observable function metadata, exact rejection strings, and recovery from failure. Wrote a test-only V8 probe to measure live numeric array objects at four function boundaries for successful and rejected input.

### Why

Image equality cannot show that the streaming option was forwarded, or that temporary operations became collectible. Inspecting the callback signature in a real public wrapper exposes the first property. Counting reachable tagged arrays during compilation exposes the second. A maintained diagnostics contract requires checking messages and source positions across error classes and function-order permutations.

### What worked

The six artifact comparisons completed on actual reactors. The native wrappers supplied a function consumer only for the explicit streaming selection. A program imported symbols at indices 0 and 129 and produced the same image in each mode. All thirteen exact diagnostics matched, including both primary error orderings and mixed frontend/backend cases. The same valid source reproduced the baseline image after the invalid calls in the same runtime.

### What did not work

In an early zsh setup loop I used the special variable `path` as the loop identifier. This made that temporary shell report `command not found: git`, `command not found: cp` and `command not found: node`. I changed the local identifier to `module_file` and regenerated every source snapshot before use. No project files were affected by that shell lookup failure.

The initial `empty` fixture supplied `// done\n`. The baseline actually reported `SyntaxError 1:1: expected function`, rather than the assumed `expected a function`. I retained comment-only input under its observed diagnostic and added an actually empty string as a separate check.

### What I learned

V8's heap query measures objects created in the querying realm. A subclass created inside a separate Node VM context produced a spurious zero. I independently checked a retained instance in that setup, then made the observed class in the host realm and constructed body arrays with that class in the compiler realm. A deliberately live control then returned one. The buffered lane's steadily growing count provides an additional in-experiment positive control.

### What was tricky to build

A generic test hook could inadvertently keep a reference to the objects it is supposed to observe. The hook receives only the function's name. The host class labels numeric code arrays without storing them externally, and V8 returns a count. The probe is separate from all contract and artifact checks. Its buffered and streamed error rows also show whether keeping the recorded exception or parsing the remaining bodies retains their arrays.

### What warrants a second pair of eyes

Distinguish array reachability under instrumented host V8 from actual peak device heap. Machine-word buffers and function signatures survive both modes until final assembly. The profile is deliberately limited to operation arrays. The simulated image and diagnostics make no measurement of hardware compilation latency or execution isolation.

### What should be done in the future

If future lowering allows forward declarations or recursion, review when the callee target and signature become available. If firmware selects a new default, qualify that board path separately from these explicit JavaScript options.

### Code review instructions

Review `consume` and `lower` in the candidate native compiler, the invocation point in `typedWasm.compileFunctions`, and the three public wrappers. Reproduce the complete experiment with the commands in [the independent streaming review](independent-streaming-review.md). Compare the four live-count rows and exact error outputs in the separate streaming receipt. The historical direct-bounds oracle independently replayed byte-identically after adding digest guards.

### Technical details

Node v24.18.0 used V8's `queryObjects` with the count result. Samples were taken at finished body numbers 1, 8, 16 and 32. In the error case, body three has nine native parameters. The counts were 1, 8, 16 and 32 buffered and 1, 1, 1 and 1 streamed for both kinds of source. The 7,252-byte generated image SHA-256 was `22ba6ec4d00a724de626d6f3666cce872057b837d5026442c4ae4a596fff1552`.
