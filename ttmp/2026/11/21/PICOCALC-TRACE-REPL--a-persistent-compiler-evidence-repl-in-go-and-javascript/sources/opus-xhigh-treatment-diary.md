# Investigation diary: treatment metadata for profile arms (2026-11-21)

**1. Reading the surface.** `ProfileSelection.describe()` in candidate.js returned only the raw entry: totals, `rowsVerified`, `rowBytes`, sample keys and the contract. Nothing said what `typed-scalar` or `typed-pie` *is*. The arm name was all a reader had, and "scalar" next to a stack-load drop reads naturally as a stack-placement treatment. `rowBytes` had no unit anywhere, and a row output is a byte buffer too, so its misreading as output length followed easily.

**2. Grounding in the capture scripts.** `typed-counts.mjs` showed the three typed arms are a single `pieLoops` option (undefined / `"scalar"` / `"pie"`) on the unchanged source. Each call must reproduce `.gold` exactly. The stack predicate decodes the word at every PC, with no symbol filter. `execute.py` showed `rowBytes = size` from `nm -S … T row`. That's static code size, unrelated to the stdout bytes compared against `.gold`. It also showed the C counts keep only PCs inside that symbol range.

**3. Grounding in the studies.** study.md settled the design question. Scalar and PIE share admission, intervals, domain, lane consumer and fallback, and differ only in the producer. The shared lowering ("reuses a checked input interval and keeps the induction state in registers") accounts for most of the stock→scalar change. So scalar→pie isolates the producer, while stock→scalar is a bundle that the totals can't split. evidence.md §3 gave the C build labels and the fact that the LSR pair comes from one optimized module.

**4. Choosing scope.** I kept to the described arms and pairs. I gave no isolating claim for gcc/gcc-noiv and no build recipe for the `llvm` label, because the sources don't support either. Those arms report `partial` or no comparisons rather than a plausible guess. Labels are keyed by source+entry and carry `provenance.measured: false`, so they can't pass for measurements.

**5. Help.** I added six lines pointing at `describe().treatment`, `fields`, `comparisons` and `cannotAttribute`. They also state the steps vs board time and `rowBytes` vs output distinctions. I kept corpus numbers out of help.

**6. Test.** `treatment_test.go` checks identity bound to source/entry, the role/build/notA of each typed arm, and the LSR pair. It checks static `rowBytes` against dynamic totals, and that `checked-llvm` says it is not described. Two scans run over the live corpus: one for hash-like tokens in the metadata, one for corpus values in help. Neither hard-codes corpus numbers.

**7. Director's Goja run (follow-up).** Every assertion passed except the help leak check, which reported `[160 160 160 160]`. The cause: at least one measured sp-access total equals the workload size, and the help mentions that number four times, all legitimately. Three come from the public identifier `opening-160-rows` and one from the fixture contract `rowsVerified === 160`. The old check matched every digit run, including digits inside identifiers. The fix touches only the test:
- Replace each digit-bearing public identifier (arm and workload names) with a placeholder.
- Neutralise `rowsVerified === <n>`, but only when n is a declared `rowsVerified` value.
- Match only standalone numeric tokens, i.e. tokens not joined to a word character or hyphen.

The test also asserts that the identifier is still documented. Two probes keep the check meaningful: a corpus total appended as prose must be flagged, and so must a total equal to the workload size ("executes <n> stack loads"). Product semantics and help text are unchanged. I have not re-run it; no shell is available here.

**8. Not done.** I couldn't run anything myself: there is no shell tool in this session. The edits and the test were checked by reading only. Two small unit/region mismatches I noticed outside this scope are listed in treatment-notes.md under follow-ups.
