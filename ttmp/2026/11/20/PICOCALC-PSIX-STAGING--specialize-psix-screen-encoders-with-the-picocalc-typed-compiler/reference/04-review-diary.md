---
Title: Independent review diary for PSIX staging
Ticket: PICOCALC-PSIX-STAGING
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-PSIX-STAGING--specialize-psix-screen-encoders-with-the-picocalc-typed-compiler/scripts/review/03-cross-review.mjs
      Note: Independent cross-arm driver
ExternalSources: []
Summary: Source reading, hypothesis, controlled counterexample and independent qualification of the two candidates.
LastUpdated: 2026-11-20T12:13:00-05:00
WhatFor: Recover exactly which assumptions and byte comparisons the independent arm checked
WhenToUse: When replicating this arm or reviewing a proposed generalization
---

# Independent review diary for PSIX staging

## Step 1. Identify the proof obligation

The director commissioned an independent review of declared and observed specialization, with a small experiment on string IDs and value representations. The research question in this workstream is summarized here. The user’s authored project request belongs to the director’s [investigation diary](01-director-investigation-and-reading-diary.md). The reviewer received the delegation, so this entry does not present the delegation as a quotation from the user.

I read the supplied local macro course without copying it to the ticket or sending it to any service. It separates when code expands from when values exist, and explains two directions of lexical capture. I followed the wire writer from `checkValue` through `encode` and then `admit`, at project revision `f27d5b7`. The corresponding compiler is the Typed tree in `picocalc-os/compiler`. PSIX v1 itself is in the previous binary-render study. A first `rg -l -i PSIX picocalc-os` produced zero paths. Expanding the search to the study tree found the encoder and its native reader/producer. The scope matters when reporting an experiment as distinct from a shipped normal screen entry point.

- **Sources and reasoning.** I read the authors' partial-evaluation definition, the paired pickler/unpickler description, the LMS staged exponent example, Flatt’s scope account and the FlatBuffers builder-order discussion. The key separation in our application is lexical identity versus when a dictionary rank becomes available. Flatt’s original scope-sets website timed out (“Failed to fetch … (400) Timeout fetching”), so I used the author's university-hosted paper. Links and relevance are in the [design notes](../design-doc/04-staging-and-binding.md).
- **Decision.** Choose a three-field record and a nested tail. The nested record gives promotion from an inline score to binary64 somewhere visible to relocate. Put a permanent U+E000 in that record to expose an incorrect UTF-16 sort using a supplementary-plane label.
- **Review invitation.** Check the role of `strIds` in both object field IDs and string value refs. Object field *order* survives added dictionary members. The field IDs usually do not. The generic reader verifies bounds, ordering and preorder traversal, without knowing what application data the writer intended.
- **Next step.** Use the unchanged generic encoder as a byte oracle. A separate experiment should exercise a genuinely incorrect reuse assumption while supplying an otherwise valid prefix.

## Step 2. Build the one-string residual and run a failing control

I implemented `write(label, score)` as a Node host function specialized by hand for the declaration. It keeps the four always-present strings ordered, inserts or aliases one UTF-8 label and calculates body positions after choosing the number representation. The reader at this point is exactly the previous research implementation. The specialized writer invokes no generic encoding helper. Intent and correct handling are independently visible in its fewer-than-one-hundred-line encoding routine.

The failure control uses the canonical prefix for the new frame and copies the entire body from the old frame. This arrangement isolates the body dependency and makes a surviving reader admission meaningful. A generic writer's total-time comparison here would say little about handheld code generation, so this arm records correctness and selected byte positions.

| Run | Result and interpretation |
| --- | --- |
| `node scripts/review/01-binding-boundary.mjs` from this ticket | 299/299 valid cross-product inputs identical by complete byte comparison. All produced packets admitted and returned the expected label, score and last list value. Six invalid inputs agreed in error text. |
| `write("zz", 524287)` and `write("aa", 524287)` | Both 72 bytes. Each root starts at 44 and each tail at 61. Ranked key IDs move from 0,1,2 to 1,2,3. |
| Fresh prefix for “aa” plus old body | Passes unchanged reader admission. The returned object contains `aa`, `label`, `score`; querying `label` yields integer 524287. Four bytes in the body differ from the correct body. |
| `write("aa", 524288)` | Root remains 44, list moves to 69 and total grows by eight. |
| `write("label", 524287)` | Dictionary falls to four unique strings. Root shifts back to 40 and tail to 57. |

The subtle implementation choices were validating unpaired surrogates before calling Node’s UTF-8 converter (which normally substitutes a replacement character), and comparing the canonical representation of minus zero (the encoder returns integer zero). The experiment intentionally includes valid wire values that the current textual SDK cannot accept as an ordinary screen, such as a label containing NUL. Review output against [the raw JSON](../scripts/review/02-binding-results.json). The recorded file can be reproduced on Node v24.18.0 with a single command.

## Step 3. Challenge the two actual candidates

I read the independent generation and observation implementations after writing the small residual. The static generator makes a fixed structural packet template for the Chess semantic envelope. Both dynamic hex strings have known, different lengths. It computes each rank among static ASCII constants and compares board and mask when they land in the same interval. Concrete output uses packed byte writes to a counted halfword buffer. One concern was that it appends large numbers after the fixed structural records. Inspection showed that this works in the specific available envelope because all container headers have been emitted by the time a potentially wide numeric leaf occurs and subsequent leaves need no other body. A generalized record builder with a container later in preorder must recalculate offsets or reject that layout. I reported this to the generator author and the director.

The observational candidate records tags, relative positions, field names, key order and array sizes. The guard collects the actual leaves on each hit. The writer rebuilds the packet-wide string table, sorts the strings by UTF-8 bytes and uses fresh IDs even for static names. An i20-to-float change misses the first plan, falls back to the canonical writer and may install a new plan. Exact insertion-order guards can miss equivalent schemas safely. Training’s collection of all distinct prefix plans precedes bank-budget enforcement. A retained cost ledger cannot estimate total training heap by itself. I shared this distinction with its author.

- **Independent driver.** `scripts/review/03-cross-review.mjs` compiles seven different generated sources using the repository's actual Wasm compiler. It writes the 90-halfword input directly in linear memory. For each title it crosses six board/mask combinations with seven scores, sets the node count to the absolute value of the score and compares every output byte to the original generic encoder.
- **Capacity checks.** A one-byte-short destination claim produced `-2` and preserved the full poisoned destination in 294/294 cases. A fitting claim then gave the canonical output and preserved the following byte, including odd-end writes. Two static titles deliberately overlapping the allowed runtime string domain were rejected during generation. This checks a conservative domain proof, separately from frame validity.
- **Observation checks.** The adaptive candidate handled 60 fresh ordinary objects with repeated and reordered keys, labels that alias other strings, crossed integer representations, a subnormal floating value, astral Unicode and NUL. It emitted the canonical bytes on every frame, using 56 guarded hits and four fallbacks/installations.
- **Limits and follow-up.** This independently exercised the actual generated Wasm function and host JavaScript plan interpreter. It did not execute the emitted RV32 machine code or measure the device heap. Verify those claims against the director’s device records. [Independent cross-arm source](../scripts/review/03-cross-review.mjs) · [Counts](../scripts/review/04-cross-results.json)

## Step 4. Read the chapter as a newcomer

I reread the full draft with the old and new dictionaries side by side. The provisional title said “four fields”, which implied a fourth record member. The changed bytes encode *four IDs*, three naming fields and one naming a value. The revised title makes that distinction visible before the first example. A second gap was the jump from the one-string hand-written function to the team's two candidate writers. I added the independent seven-module and 60-frame test results where the chapter first describes prospective native execution. The writing review also distinguished a fallthrough to a slower encoder from invalid input, and a typed integer promise from its wire-width test.

For verification, replay both scripts and compare their stdout to the committed JSON. Read the three-field derivation using the ordinary byte indexes and the unchanged oracle, then inspect the template placement rule before applying the experiment to another declaration. The distinction between validation and equality is observable directly in the four-byte control. Timing and adoption judgments belong to the separate performance arms.

## Step 5. Repeat the observed trace qualification

I ran the observational researcher’s complete Node replay in a fresh process. The input comprised 427 application frames and 581,602 PSIX bytes in its complete qualification. The rotating seven-block timing harness also replayed nine separate held-out and control streams. I preserved the counts, hit counts and median stream times in a compact file. This timing run shared a development host with other research jobs.

The stable-shape control exercised 40/40 fixed hits and 39/40 adaptive-cold hits. In the 72-frame churn control the fixed bank hit 24 times and adaptive-cold hit zero times. On the mixed 209-frame holdout, the fixed bank hit 42 times and adaptive-cold hit 157. Yet the adaptive-cold stream took 10.69 ms versus 10.20 ms for the generic writer in this run. A hit count alone cannot stand in for saved time. Use the pinned researcher trials and device measurements for timing decisions.

```sh
node scripts/runtime/03-run.mjs node /tmp/psix-runtime-independent.json
```

The run exited 0 on Node v24.18.0. [Bounded replay record](../scripts/review/05-independent-node-replay.json)
