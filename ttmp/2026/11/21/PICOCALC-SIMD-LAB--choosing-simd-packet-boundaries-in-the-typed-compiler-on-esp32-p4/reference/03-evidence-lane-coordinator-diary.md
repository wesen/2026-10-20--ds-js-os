---
Title: Evidence lane coordinator investigation diary
Ticket: PICOCALC-SIMD-LAB
Status: active
Topics: [compiler, performance, picocalc]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Engineering investigation for the image-pinned host capture and SIMD REPL extension.
LastUpdated: 2026-11-21
---

# Evidence lane coordinator investigation diary

## Step 1: Inspect the program counter and reproduce the actual opening-scene loop

I established a shared capture contract with the compiler, ray and physics investigators. I gave the Opus High evidence researcher a private working directory and a numbered-cell bridge to a dedicated REPL session on port 3792. The researcher read the prior design and queried the physical corpus. I implemented a host capture from the existing Typed compiler, independent Wasm output and RV32 interpreter while the researcher built the optional provider.

### Prompt Context

**User prompt (verbatim):** See [research commission](../sources/research-commission.txt). “The most valuable extension would be the ability to follow one compiler decision from Typed source to measured execution.”

**Assistant interpretation:** Create a checked join from a compiler's emitted instruction ranges to actual dynamic counts using the emitted image bytes as identity. Make those measurements accessible to the lab in persistent JS.

**Inferred user intent:** Let an investigator test a mechanism and falsify a performance explanation.

### What I did

- Read the earlier `PICOCALC-ROW-IR/scripts/07-typed-counts.mjs`, `typed-pie-loops.js` and the RV32 interpreter fetch hook. Compared the three image identities issued by `typed-inspect.mjs` against separate ordinary compiles of the same source.
- Captured all 160 starting states and corresponding Wasm oracle results into scratch, reconstructing them with the original fixture maker. Ran every row through each of three RV32 images. Compared all 4,100 observable bytes for every call.
- At the start of an admitted eight-lane group, began collecting eight dynamic sign-test branch destinations. Derived the hit bit from the actual destination. Independently recalculated every mask from the original unsigned cells, checked arithmetic and alignment prologue. Matched the two complete lists from the scalar and PIE treatments.
- Captured the inspector's actual rejected loops with their input tape offsets and existing source positions. The stock compiler omits the optional PIE loop analysis and still produces a trace.
- Attached the evidence collector to the Opus room and preserved the whole capture in `various/evidence/ray.json`. The command and source for reproduction live in `scripts/evidence/`.

### Why

An LLVM trace and a separately built Typed image can reuse identical numerical offsets. A valid instruction lookup needs its own exact emitted image. A source-level classification of convenient groups beginning at x=0 also need not describe the groups the actual machine executes after alignment and range checks.

### What worked

Three independent image compiles agreed with the inspector hashes. The traces counted 3,608,697 stock steps, 3,199,910 matched scalar steps and 3,131,435 packed steps. The packet capture recorded 2,111 all-miss, 282 mixed and 742 all-hit groups. Matched scalar and packed each retired 26,070 scratch lane loads.

### What didn't work

The default sandbox rejected the inspector's child process with `spawnSync .../node EPERM`. The permitted host replay reached the vendor decoder and initially failed with `The input did not match the regular expression /^x\\d+$/. Input: 't5'`. The newer ESP 14.2.0 20260121 objdump spells some extension operands with ABI aliases. Selecting the locally installed ESP 14.2.0 20241119 prefix restored numeric operands for the independent interpreter. The first rejection-mapping run attempted to iterate the stock image's absent loop metadata and raised a TypeError. The capture now explicitly accepts absence for that build.

### What I learned

The 3,135 emitted eight-lane scratch stores account for full groups only. Another 990 single-lane prefix operations contribute to the 26,070 lane reads. The two numbers reconcile as 3,135 × 8 + 990. This particular scalar fallback also processes the tail separately.

### What was tricky to build

The sign guard has an inverted emitted conditional followed by a long jump. The collector compares the next fetched PC to the actual branch target decoded in the image listing. It checks that the other possible next PC is the fall-through. It does not guess a hit from a mnemonic alone.

### What warrants a second pair of eyes

The checked collector can recover a decision about consumer admission for the present lowering. A changed register schedule or a new branch arrangement must make the current exact pattern fail loudly before someone interprets a new arm.

### What should be done in the future

Replay the example joins against the new provider, check the cross-image refusal, review all public session tests and verify the scientist's article against the original counts.

### Code review instructions

Start at `identify` and `expectedMasks` in `scripts/evidence/03-capture-ray.mjs`. Check the alignment prefix, unsigned interpretation of input cells and equivalence check against the Wasm reference. Run the script with the ESP 14.2.0 20241119 toolchain prefix.

### Technical details

Image offsets and intervals are bytes from the raw emitted image start. Intervals are half open. Histogram keys are aligned instruction addresses. Counts describe one complete workload containing 160 independent calls. Physical timing still requires paired board records.

## Step 2: Mount two new compiler candidates and check the causal prediction

The director generated two experimental native images. One classifies and skips all-miss packets. The second also keeps all-hit discriminants in vector registers until their scalar consumers need them. I measured the new images using the same fixture inputs and the same verified Wasm reference as the original capture.

### Prompt Context

**User prompt:** See Step 1 and [research commission](../sources/research-commission.txt).

**Assistant interpretation:** Recover the source-to-binary decision records and verify both mechanisms at the actual instruction addresses. Test that identical offset numbers in unrelated images cannot be joined.

**Inferred user intent:** Make the experimental mechanism and limits visible to a newcomer through one practical research interface.

**Commit (code):** `1f4359a` — Expose image-pinned SIMD decisions and execution witnesses in persistent REPL sessions. Original input capture `f0df85a`.

### What I did

- Integrated the actual Opus High researcher's provider and Go tests, added discovery in `q.help()`, and supplied real JS decision queries. Verified the classifying images against the director’s whole-image and per-row digests.
- Extended the existing host test interpreter's packed model to decode the unsigned min/max and immediate lane reads. Replayed every fixture with the unmodified guest bytes and verified every observable byte.
- Counted each new image's packet stores, scalar loads, reductions and lane extractions at addresses resolved by the independent ESP disassembler. Used the prior baseline census to predict the expected difference before comparing with new counters.
- Composed the physics lane's independently generated capture with the original and new ray arms on port 3794. Verified the 128-body packed arithmetic query returned sixteen fetches. Left baseline port 3793 and original LLVM workbench 3792 running for separate investigators.
- Ran `go test -race -count=1 ./...`, with permission to bind the test HTTP listeners. All six packages passed. Replaced error wrapping with the project's pkg/errors convention and reran the relevant race tests. `go vet ./...` passed.
- Resumed the first Opus High session with its verified capture and a second private session against 3794. The researcher issued independent public queries, including a refused cross-image join.

### Why

A count of expected empty groups measures potential. The code could still spill before classifying or branch back through the scalar consumer. Actual program-counter counters can verify whether the predicted change occurs in the binary.

### What worked

The 2,111 empty groups predicted 16,888 removable lane reads. The first candidate actually executed 9,182 lane reads versus 26,070 previously, a decrease of precisely 16,888. The all-hit strategy removed the additional 5,936 reads predicted by 742 full groups × 8 and executed 5,936 explicit extractions instead. Both candidates agreed with the original on all 160 rows.

### What didn't work

An early workbook treated `simd.packets(workload)` as an array. The implemented API exposes an identified packet set with `.packets` and `.sourceSHA`. Adjusted the workbook before verification so the data retains its provenance across cell evaluations. The rendered result intentionally leaves absent scalar-plan extraction as null rather than inventing an observed zero for an unidentified code interval.

### What I learned

The row symbol grew from 1,688 bytes to 1,712 for the all-miss version, and to 4,064 for the additional all-hit path. The marginal decrease of 29,116 guest steps between the first two candidates must be evaluated with that code-size growth and independent physical timings.

### What was tricky to build

The appended full-path code uses unrolled lane extraction. The established compiler interval named `packet backedge` also covers that new code. The independent decoder locates individual extract instructions and counts their exact executions. Roles intentionally overlap across distinct questions; adding overlapping roles would double count.

### What warrants a second pair of eyes

The declared source digest is provenance supplied by the capture producer. Image digests are independently recomputed at load time. Workload names alone cannot establish input equivalence. The capture script separately generates and checks the actual reference fixtures.

### What should be done in the future

Join the independently collected board results only at their measured workload, configuration and image identity, then review cold compiler time and image size as separate outcomes.

### Code review instructions

Run `07-capture-packet-candidates.mjs` with the generated packet image directory and ESP 14.2.0 20241119 tool prefix. Run `09-candidate-workbook.js` in the merged 3794 session and compare the spike counts with `various/evidence/candidate-workbook.json`. The two query workbooks are independent of the physics scoring protocol.

### Technical details

Guest counts come from instrumented host fetches. A predictor with simultaneous min and max operations must count the second reduction only for nonempty groups. In the full path there are 3,135 min reductions, 1,024 max reductions, 282 packed stores and 5,936 lane extractions. Full-frame capture was owned by the board operator.
