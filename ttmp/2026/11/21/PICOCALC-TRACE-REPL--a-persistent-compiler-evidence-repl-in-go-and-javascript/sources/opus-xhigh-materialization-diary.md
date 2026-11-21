# Investigation diary (retrospective)

**1. Evidence (repro.json, build d8a8b5ae…).** Investigators sent `q.run(profiles.arm("checked-llc-nolsr").describe())` and got:
`QueryError: [notAPlan] q.run expects a plan (from a.events(), q.ir…, profiles…, q.bundle…); got object\n  fix: q.run(a.events().count())`.
The same descriptor used directly worked: `….describe().arm` → `"checked-llc-nolsr"`.
They also read `q.help("profiles")`. It lists `profiles.arm("checked-gcc").describe()` on the same line as plan constructors, one line above `q.run(...)` examples, and says nothing about which calls are eager.
They read `q.help("errors")` too. It lists `notAPlan` with no explanation.

**2. Root cause (baseline.js as read, before edits).**
- `runPlan` (l.114–121) knew two shapes: a plan, or an object made entirely of plans. Every other value got a message built from `typeof`. A descriptor, a function handle and a hand-built object all came out as "object", and undefined as a bare "undefined". The fix line was always the same unrelated example.
- `ProfileSelection.describe()` (l.1319–1325) is eager and returns a plain object with nothing marking it as library output, so `runPlan` could not tell a descriptor from a stray object.
- Side findings on the same boundary:
  - `newContext` (l.110–113) ignored unknown option keys.
  - `q.run(p1, p2)` silently ran only `p1`.
  - `describeValue` (l.1033) printed `undefined undefined` and `function undefined`.

**3. Choice.** I made a valid use idempotent through a creation-time `WeakMap` tag (descriptors and plan results). Everything else gets an explicit, classified refusal (`err.got` plus a specific `err.fix`).
I rejected a shape heuristic, such as "has an `arm` key", because it would let lookalikes through.
I rejected an error-only design because the investigators' repeated `q.run(…)` showed that their mental model expects one entry point.

**4. Deliberately not done.**
- Loop scope and coverage are owned elsewhere.
- I did not tag `profiles.arms()` or `sel.totals()` arrays. The contract stays "describe() descriptors and results", and arrays get a pointed message instead.
- Error code lists in help are still incomplete for codes I did not add (for example `unknownProfile`, `needState`, `noSuchArgument`). That was already true before this change.

**5. Open.** The tests are written but have not been run, because this environment had no shell. Next step: `go test -run Materialization` on the release branch.
