---
Title: "Opus High ray research diary"
Ticket: PICOCALC-SIMD-LAB
Status: complete
Topics: [compiler, performance, picocalc]
DocType: reference
Intent: long-term
---

# Opus High ray research diary

## Step 1: Test the packet decision and its numerical boundary

### Prompt Context

**User prompt (verbatim excerpt):** “A wrong answer disqualifies a fast plan.”

**Assistant interpretation:** Check fast-path arithmetic before attributing an improvement to SIMD.

**Inferred user intent:** Preserve observable behavior while making generated code faster.

### What I did

The team authored two artifacts: an exhaustive standalone Node numerical test, `09-opus-exhaustive-lanes.mjs`, and the packet-schedule article. The operator ran the experiments. The operator executed the script on our exact signed-saturation model across every input s = 0..65535 at thresholds R = 0, 1, 31, 1024, 32765, 32766 and 32767. That is 458,752 pairs, and the run produced `opus-exhaustive-halfwords.json`. The physical membership census was verified in a separate REPL session.

### Why

Sampling cannot rule out a boundary error in a 16-bit decision. Exhaustive enumeration over all halfwords can. The chosen thresholds cluster at the ends of the signed range, where signed saturation is most likely to fail.

### What worked

Six of the seven thresholds were exact on all 65,536 inputs. The census matched at every opening block: 2111 empty, 282 mixed and 742 full.

### What didn't work

At R = 32767 the model produced 32,768 false admissions, starting at input 32768. No threshold had any false rejections or wrong accepted values. In the article, the extra full-group path was slower by 126 µs. An earlier broad session hit its response limit, and smaller, output-bounded commissions completed the work.

### What I learned

The decision is exact for every tested threshold below R = 32767. At R = 32767 it fails only through false admission. The false-admission count equals the size of the input range 32768..65535. Timing results are meaningful only after numerical exactness is established.

### What was tricky to build

The hard part was keeping the metrics separate:

- Guest instruction counts are not physical time.
- Micros measured for a clean complete frame are not hand-schedule cycles per packet.

The article reports each metric in its own terms.

### What warrants a second pair of eyes

- Whether R = 32767 is excluded from the admissible threshold range or handled by a separate path.
- The baselines behind 0.904% and 3.346%, so each savings figure is read against the correct reference.
- That complete-frame micros and per-packet cycle counts are never combined in one comparison.

### What should be done in the future

- Define the admissible threshold range explicitly in the schedule.
- Rerun the exhaustive test after any change to the saturation model.
- Record the membership census alongside each timing run.

### Code review instructions

In `09-opus-exhaustive-lanes.mjs`, check the following:

- The loop covers s = 0..65535 inclusive.
- The threshold list is exactly the seven values above.
- The model matches the signed-saturation semantics used in the schedule, including halfword sign interpretation.
- False admissions, false rejections and wrong accepted values are counted separately.
- The first failing input for each threshold is recorded in `opus-exhaustive-halfwords.json`.

### Technical details

- Pairs tested: 65,536 × 7 = 458,752.
- Exact thresholds: 0, 1, 31, 1024, 32765, 32766.
- R = 32767: 32,768 false admissions, first at input 32768; 0 false rejections; 0 wrong accepted values.
- Six-paired-block default, complete frame: 508.5 µs, 0.904% saved.
- Primary: 546.5 µs, 3.346%.
- Extra full-group path: 126 µs slower.
- Census at every opening block: 2111 empty, 282 mixed, 742 full.
