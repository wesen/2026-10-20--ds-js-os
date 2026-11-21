# Small Finite Expression DAGs

## 1. What We Are Building

An *expression DAG* is a finite list of nodes. Each node is either a leaf or an operation whose inputs are other nodes. Leaves include constants, parameters, and coordinates. The graph is directed (inputs flow to consumers) and acyclic (no node depends on itself, directly or indirectly).

This chapter uses one representation throughout. Nodes are stored in an array, and every operation may refer only to nodes with smaller indices. We call these *backward references*. Under this rule the array index order is a topological order, so any single forward pass sees each node's inputs before the node itself.

## 2. Type Validation in One Pass

Every node has a result type. In our examples the types are `Real` and `Bool`. Each operation has a signature: `add : Real × Real → Real`, `less : Real × Real → Bool`, and `select : Bool × Real × Real → Real`.

Validation visits nodes in index order. For node *i* it performs three checks:

1. Every input index *j* satisfies `0 ≤ j < i`. This check alone guarantees acyclicity.
2. The number of inputs matches the operation's arity.
3. The types of the inputs, which have already been recorded, match the signature. If they do, the node's result type is recorded.

Each node is checked exactly once, using only information that is already final. Validation is therefore linear in the number of edges and needs no recursion or cycle detection. A failing graph is rejected with the index of the first bad node. For example, `add(n5, n9)` is rejected if `n9` has type `Bool`.

## 3. Immutable Topology, Mutable Parameters

We separate two kinds of state:

- **Topology** is the node list, the operations, and the input indices. It is fixed once validation succeeds.
- **Parameters** are named numeric values that leaf nodes read. They may change between runs.

This split matters because every analysis derived from the topology stays valid for the lifetime of the graph. Validation results, dependency sets, and evaluation plans can all be computed once. A parameter change cannot make a validated graph ill-typed, because parameters carry values, not structure.

## 4. Coordinates That Move

A *run* evaluates the graph at a sequence of coordinate values *t₀, t₁, …, tₙ₋₁*, for example sample times. Parameters are held fixed for the duration of a run. This fixedness is a stated contract, not an assumption.

Under that contract, some nodes produce the same value at every step. We can find them with one forward pass. Define `varies[i]` as follows:

- It is true if node *i* is a coordinate leaf.
- It is false if node *i* is a constant or parameter leaf.
- Otherwise it is the logical OR of `varies[j]` over all inputs *j*.

Backward references make this pass well defined. Nodes with `varies[i] = false` are *run-invariant*. Their values depend only on constants and parameters.

## 5. Worked Expression

Consider f(t) = (a·b + c)·sin(t) + (a·b + c). As a DAG it has nine nodes:

| Index | Node | Type | varies |
|---|---|---|---|
| 0 | param `a` | Real | false |
| 1 | param `b` | Real | false |
| 2 | param `c` | Real | false |
| 3 | coord `t` | Real | true |
| 4 | mul(0, 1) | Real | false |
| 5 | add(4, 2) | Real | false |
| 6 | sin(3) | Real | true |
| 7 | mul(5, 6) | Real | true |
| 8 | add(7, 5) | Real | true |

Node 5 is shared: both node 7 and node 8 read it. The table above records the result of the dependency pass for every node.

**Evaluating the constant subexpression once per run.** At the start of a run, the parameters are read, and nodes 0, 1, 2, 4, and 5 are evaluated once. Their values are stored in slots. At each step, only nodes 3, 6, 7, and 8 are evaluated, and they read the stored slots.

This is sound when three conditions hold:

1. All operations are pure. They have no side effects and give the same output for the same inputs.
2. Parameters do not change during the run.
3. The `varies` flags were computed from the same immutable topology being evaluated.

If a parameter may change mid-run, the stored slots must be recomputed at that point. Otherwise the optimization is unsound. With n steps, this plan performs 5 + 4n node evaluations instead of 9n.

## 6. Shared References Versus Independent Validation

Two different claims are easy to confuse.

**A shared reference is correct** when computing node 5 once and handing its value to both consumers gives the same result as evaluating node 5 separately for each. For pure operations this holds by construction. The claim concerns the semantics of sharing.

**Independent validation** asks a different question: does the optimized evaluator agree with a separately written, straightforward evaluator? A typical straightforward evaluator recomputes every node at every step with no hoisting. To answer this question, the comparison must not share the code under test. Suppose both paths call the same hoisting routine. Then agreement shows only that the routine agrees with itself.

A sound test compares the two evaluators across many parameter settings and coordinate sequences. Floating-point results should be compared exactly when the operation order is identical, and with a stated tolerance otherwise.

## 7. What to Measure Separately

Combined timings hide where the cost actually lies. The following quantities should be recorded individually.

Times:
- validation time, which is paid once per graph;
- planning time for the dependency pass and slot assignment, also paid once per graph;
- per-run setup time for evaluating invariant nodes;
- per-step evaluation time;
- total run time.

Counts:
- the number of steps;
- invariant node evaluations per run;
- varying node evaluations per step;
- the number of runs per parameter change.

A hoisting optimization can look worse than it is if planning time is charged to every run. It can look better than it is if runs are very short. Reporting the quantities separately makes the actual trade-off visible.

## 8. Exercise

Add node 9: `less(5, 3)`, then node 10: `select(9, 8, 5)`.

(a) Give the types of nodes 9 and 10.

(b) Give `varies` for both nodes.

(c) With n steps, how many node evaluations does the hoisted plan perform?

**Solution.**

(a) Node 9 is `Bool`, since `less` takes two `Real` inputs. Node 10 is `Real`, since its inputs have types `Bool`, `Real`, and `Real`.

(b) Node 9 reads node 3, which varies, so node 9 varies. Node 10 reads nodes 9 and 8, which both vary, so node 10 varies.

(c) The invariant set is unchanged at 5 nodes. The varying nodes per step are now 3, 6, 7, 8, 9, and 10, which is 6 nodes. The total is therefore 5 + 6n.
