---
Title: Leaf functions and selective inlining in Typed RV32
Ticket: PICOCALC-NATIVE-WAVE
DocType: design-doc
Status: active
---

# Leaf functions and selective inlining in Typed RV32

Measure the cost of small synchronous helpers in the maintained Chess search. A function that makes no calls is a leaf. The stock compiler gives it a stack frame, saves the return address, stores its parameters, and reloads them on use. Small integer helpers can keep incoming parameters in argument registers and use the existing operand registers. An inlined call also removes its jump to the callee and the callee's jump back. Neither change should alter the Typed source or the search it computes.

## Three separate arms

The production control uses the checked-out compiler's default streaming mode. The leaf arm keeps streaming and intercepts allocation for one body at a time. The inline arm buffers bodies, identifies small eligible leaves and copies selected recipes at direct call sites. It still emits an independently callable original body. Include buffered leaf as a host compile-cost control. Its executable code should equal the streamed leaf arm, so a host cold-cost difference can be attributed to buffering separately from recipe assembly.

Use only scalar read-only parameters with physical homes a0 through a7, at most eight. Exclude any function with frontend locals, nested calls, loop/backedge structure, memory instructions or unknown opcodes. Keep the ordinary five value registers as operand homes and abandon the candidate as soon as it would spill. Early returns and forward structured branches can use the stock patching scheme. Signed divide checks use t5 as their temporary constant register in a leaf, preserving a0 until return. The operand registers t0 through t4 stay distinct from t5 and a0–a7. Ordinary code still runs its existing divide-zero and overflow checks. A rejected recipe is discarded before publishing any words or labels.

Inlining retains stock argument evaluation, pre-call spilling and restoration of live caller operands. It pastes the eligible leaf words before the terminal return and reanchors any internal jump targets to its insertion point. The common leaf exit maps to the first caller instruction after the copied recipe. The leaf has no imports, memory effects or outgoing jumps. Select in deterministic compile/source order, without benchmark-specific names, and keep whole-module added words bounded. Measure the actual added bytes and the selected site counts rather than assuming every eligible site inlines.

## Compare complete results before measuring

Use the release lab's 17 canonical Chess cases to compare the packed move, signed score, completed depth, node count, slice count and restored root state under all three arms. Require each arm to agree with the stock bytes' original result digest. Run additional direct tests for forward branches, stack depth rejection, local mutation, signed division overflow, divisor zero and maximum register arguments. Run another maintained compute workload and a held-out module received after the policy freezes. Report eligibility, emitted bytes, exact modeled instruction counts and compiler costs. Use medians and spreads for repeated host compiles.

The board test embeds each native artifact into an isolated lab app and rotates order across repeat blocks. Use the same fixed-work FEN and budgets. Time only entry-to-final-slice, verify complete outcomes and restore the published 134f3a24… image and unchanged partition before handing the board onward. The physical benchmark uses flash-mapped text and internal scratch. A result for the standalone driver does not establish the installed game's key-to-frame timing.

## Locked prototype policy

Limit a leaf to 128 raw operation cells, 0 frontend locals, at most 8 i32 or bool parameters, at most 5 operand values, and the supported structured forward-control and integer subset. Reject loads, stores, loop opcodes and calls. Copy at most 20 native words per selected call recipe, excluding its terminal return, with an aggregate growth allowance of 96 words and 32 sites. Lower eligible calls in function-body visitation order. All denied candidates take the existing compiler path.

## Follow a small call

```typescript
function plusSeven(a: i32): i32 { return a + 7; }
function caller(a: i32): i32 { return a + plusSeven(a); }
```

The checked frontend leaves a direct call with one argument. At that point the first `a` is already a live operand in the caller, and the second `a` is the argument. The optimizer uses the same spill and restore sequence as the normal call so the first operand survives. The leaf body reads the argument from a0, computes the sum using the ordinary operand registers, moves its result to a0 and returns. The inline arm copies the leaf's computation at the call site and falls through to the caller's operand restore. The caller still returns `2*a + 7` in i32 arithmetic.

For that example, the stock helper occupies 40 bytes and the frameless helper occupies 20. The complete module goes from 100 bytes to 80 in the leaf arm. Copying four computation words in place of one call makes the inline module 92 bytes. The original helper entry remains callable. Larger programs can grow relative to stock even though their leaf bodies shrink.

```text
Typed source
     |
     v
checked operation cells
     |
     +-- verified small leaf --> direct parameter registers --> return via ra
     |
     +-- ordinary function ----> existing frame and operand stack
                                    |
                                    +-- direct call under budget
                                    |      spill caller's live operands
                                    |      copy/reanchor selected leaf
                                    |      restore operands, push a0
                                    |
                                    +-- other call -> original jal/return
```

```text
try_leaf(function):
    reject frame locals, instructions outside allowlist, excessive operands
    reuse checked integer and forward-control operations
    replace parameter loads with reads of incoming argument registers
    leave sp and ra untouched
    return recipe or fall back before any words escape

inline_at_call(caller, recipe):
    evaluate and place arguments using original call sequence
    spill the values already on caller's operand stack
    if selected, copy body without ret and reanchor internal labels
    otherwise emit ordinary call with ra
    reload the caller operands and push a0
```

The stage adapter in `scripts/03-leaf/stage.mjs` leaves the checked-out control unmodified. For reproducibility, `images.mjs SOURCE OUTPUT PREFIX` emits the three raw images and their paired entry maps, and `prepare-board.py WORK RELEASE_LAB_MAIN` creates the private board application from the release-lab Chess case data. Run the known board restore wrapper in `device.py` only after board handoff. See the independent lead's design for broader choices about leaf eligibility and cache policy. [Independent Opus design](../various/03-leaf/opus-design.txt)
