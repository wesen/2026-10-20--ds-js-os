---
Title: Archived source-free review of the counted painter-message protocol
Ticket: PICOCALC-MOBILE-PAINTER
DocType: reference
Status: complete
Topics: [picocalc]
---

# Transport Experiment: Pinned Procedure and Counted Snapshots Across Isolated Worlds

## 1. Setup

**Worlds**
- **P (producer):** application world.
- **R (receiver):** render world.

**Scheduler.** One lane runs one turn at a time to completion. Sends are copied by value into the destination instance's inbox and become visible only after the sending turn ends. Every delivered message carries an unforgeable sender identity.

**Identifiers**
- `r_inc`: the R incarnation number. The scheduler assigns it at spawn. It is 64-bit, monotonic, and never reused within a boot.
- `p_epoch`: the P lifecycle number, likewise scheduler-assigned.
- `gen`: the lifecycle key `(p_epoch, r_inc)`. One procedure is sent per `gen`.
- `seq`: snapshot counter. It is strictly increasing within a `gen` and starts at 1.

**Messages**

| Message | Direction | Contents |
|---|---|---|
| `HELLO{r_inc}` | R→P | Sent at R start |
| `PROC{gen, len, digest, text[len]}` | P→R | Procedure text, `len ≤ P_MAX` |
| `SNAP{gen, seq, body[S]}` | P→R | Fixed-schema canonical body of exactly S bytes |
| `CREDIT{gen, seq_dequeued}` | R→P | Returns one snapshot credit |
| `COMPILED{job_token}` | scheduler→R | Delivered as a normal later turn |

**Firmware pin.** R holds `PINNED_DIGEST` and `COMPILER_ID` in firmware. A `PROC` whose `digest` or recomputed hash differs from the pin is never compiled.

## 2. Ownership and Quota Scheme

### Producer owns
- The canonical procedure text, or a reference to the firmware copy.
- One `latest` snapshot buffer of S bytes and a dirty flag.
- Its current belief of `r_inc`.
- A snapshot credit counter `c ∈ [0, W]`, with `W = 2`.

### Scheduler owns queued bytes
Ownership transfers to R at dequeue. Each per-(sender, destination instance) inbox has a hard quota:
- At most 1 `PROC` outstanding.
- At most W `SNAP`s.
- At most 2 control messages.
- `Q_bytes = P_MAX + W·S + 2·H`, where H is the header size.

An over-quota send fails synchronously in the sender's turn. It is never dropped silently. When an instance dies, its inbox is destroyed with it.

### Receiver owns (fixed, preallocated)
- `proc_buf[P_MAX]`. It is held only until the compile job copies or consumes it, then released.
- **One compile job.** The job owns `arena[C_MAX]` and is tagged with `{r_inc, gen, digest, token}`, where `token` is a fresh 64-bit value per job.
- **One active artifact.** It is tagged `{r_inc, gen}` and is the only object that can be painted.
- **One `latest_snap[S]` slot** plus `latest_seq`. Snapshots coalesce latest-wins; R never queues snapshots internally.

### Credit flow
1. P sends a `SNAP` only when `c > 0` and its buffer is dirty, then decrements `c`.
2. R returns `CREDIT` at dequeue time, not at paint time. This keeps the inbox drained even while compile is pending.
3. Bursts collapse into P's single `latest` buffer.

## 3. Epoch Checks

### Publication (P, at send)
- P sends nothing until it has received `HELLO` from the bound R identity.
- P stamps the current `gen` on every message.
- When a `HELLO` with a new `r_inc` arrives, P:
  - resets `gen`, `seq = 0`, and `c = W`;
  - sends `PROC` once;
  - marks `latest` dirty.

### Enqueue (scheduler)
- A destination is addressed by `(world, r_inc)`. A send to a dead incarnation fails at enqueue.
- On restart, the old inbox is discarded, never migrated.

### Dequeue (R, defense in depth)
For every message, in this order:
1. Sender identity equals the bound producer, else drop.
2. `msg.gen.r_inc == my_inc`, else drop. This guards against scheduler bugs.
3. Then, per message type:
   - **`PROC`:** requires `gen` not yet seen, `len ≤ P_MAX`, `hash(text) == digest == PINNED_DIGEST`. If all hold, allocate a job with a fresh `token` and start the compile. A duplicate `PROC` for the same `gen` is rejected.
   - **`SNAP`:** requires `gen == cur_gen`, `seq > latest_seq`, and the validator to pass (§6). If all hold, overwrite `latest_snap` and mark paint pending. Return `CREDIT` in every case, including drops, so credits cannot leak.

### Compile completion (R, in a later turn)
- **Activate only if** all of the following hold:
  - `job.token == outstanding_token`
  - `job.r_inc == my_inc`
  - `job.gen == cur_gen`
  - `COMPILER_ID` matches the pin
- **Otherwise:** free the artifact and arena, and increment `stale_compile_dropped`.

If teardown cannot cancel a running compile, the completion still arrives under the token check. The token makes late completions from an old instance inert.

### Paint (R)
- Requires `artifact.gen == cur_gen` and a valid `latest_snap`.
- If no artifact is active yet, paint a fixed placeholder frame and never interpret the snapshot.

## 4. Retain and Replay Across Restart

| Item | Retained by | Replayed? |
|---|---|---|
| Procedure text / pinned reference | P | Yes, once, as `PROC` for the new `gen` |
| Latest complete snapshot | P | Yes, once, with `seq = 1` |
| `r_inc` counter | Scheduler | Advanced, never reset |
| In-flight `SNAP`s, credits, ACKs | — | No, discarded with the old inbox and old `gen` |
| Compile jobs, artifacts, `proc_buf` | — | No, destroyed or token-invalidated |
| Older snapshots | — | No, the schema is complete per snapshot |

R retains nothing in the base experiment.

**Optional variant:** a digest-keyed compiled-artifact cache. An entry is valid only if `(PINNED_DIGEST, COMPILER_ID)` match. Treat it as a separate experiment, because it adds a cross-instance object whose lifetime must be proven independently.

**P restart:** produces a new `p_epoch`, hence a new `gen`. R rejects anything stamped with the old `p_epoch`.

## 5. Falsifiable Tests

Each test has a pass criterion that a single counterexample breaks.

### Byte tests
- **B1. Golden vectors.** Exact hex encoding for about 20 hand-chosen snapshots, including every field at its minimum and maximum value. Any byte difference fails.
- **B2. Exhaustive single-bit flips.** Flip each bit of each golden packet. Acceptance must equal the reconstruction oracle's verdict for every flip.
- **B3. Length boundaries.** Lengths `0`, `S−1`, `S+1`, and `Q_bytes+1` are all rejected. The receiver's state hash is unchanged afterward.
- **B4. Digest pinning.** Change one byte of the procedure text. Pass only if `compile_jobs_started == 0`.
- **B5. Differential fuzz.** Run at least 10⁸ mutated and random inputs through the structural and reconstruction validators. Pass only with zero disagreements.
- **B6. Quota.** Peak inbox high-water mark must be `≤ Q_bytes`. The send that would exceed the quota must fail in the sender's turn.

### Lifetime tests (host allocator instrumented, ASan/poisoning)
- **L1. Restart leak check.** After 10⁴ restarts at random points, live allocations equal the baseline exactly.
- **L2. Stale compile completion.** Kill R mid-compile, then force the stale completion to arrive in the new instance via a fault hook. Pass only if:
  - the active artifact is null or from the new job;
  - `stale_compile_dropped == 1`;
  - nothing was painted with the old artifact.
- **L3. Stale queued snapshots.** Enqueue 2 `SNAP`s for incarnation k, then restart to k+1 before they are dequeued. Pass only if the first non-placeholder frame hash equals `render(replayed_latest)` and no frame equals `render(stale)`. Choose stale bodies so their renders differ.
- **L4. Single processing.** Every message ID is processed at most once. Every buffer is freed exactly once.

### Scheduling tests
- **S1. Deferred delivery.** For every message, `recv_turn > send_turn`.
- **S2. Latest-wins under burst.** P publishes 10⁵ snapshots in a burst. Pass only if:
  - painted `seq` values are strictly monotone;
  - the final painted frame is the final published snapshot;
  - in-flight `SNAP`s never exceed W.
- **S3. Compile does not block painting.** During compile, R keeps processing turns. Maximum R turn duration must be `≤ T_budget` on the host model.
- **S4. Compile count.** `compiles_started == restarts + 1`. Exactly one `PROC` is sent per `gen`.
- **S5. Bounded model check.** Enumerate all interleavings of {send, enqueue, dequeue, restart, compile-complete, paint} to depth 12, under seeded deterministic scheduling. Check these invariants:
  - no activation with a mismatched `gen`;
  - no paint of a stale `gen`;
  - credits are conserved: `c + in_flight == W` per `gen`.

### Negative controls
Each is a deliberately broken build. Each must make its named test fail. If a control passes, that test is non-discriminating and must be fixed.

| Control | Change | Must fail |
|---|---|---|
| NC1 | Remove token/`r_inc` check on compile completion | L2 |
| NC2 | Accept `seq ≤ latest_seq` | S2 |
| NC3 | Validator ignores one padding byte | B2, B5 |
| NC4 | Migrate the inbox on restart and remove the dequeue `r_inc` check | L3 |
| NC5 | Leak the artifact on drop | L1 |
| NC6 | Deliver synchronously | S1 |
| NC7 | Disable quota | B6 |
| NC8 | Return `CREDIT` only on accepted `SNAP`s | S5 (credit conservation) |
| NC9 | Skip the digest check | B4 |

## 6. Validator Comparison

### Exact canonical reconstruction
Method: `decode(x) → struct → encode → memcmp(x)`.
- **Strengths**
  - Canonicality is defined by the single encoder, so padding, reserved bits, non-minimal forms, and float quirks such as `−0.0` or NaN payloads are rejected automatically.
  - Each rule is written once.
- **Costs**
  - An S-byte scratch buffer, two passes, and no fail-fast exit.
  - Rejections carry a coarse reason ("mismatch").
- **Blind spot:** a bug present in both the encoder and decoder round-trips cleanly. For example, an out-of-range enum that the decoder clamps and the encoder writes back.

### One-pass structural check
Method: exact length, then each field's domain, enum set, reserved and padding bits zero, and float canonical form, checked in order.
- **Strengths**
  - No scratch memory, early exit, and precise reject codes.
  - Constant time is easy to achieve.
  - Range checks are explicit rather than inherited from the decoder.
- **Weakness:** every canonicality rule must be enumerated. A forgotten rule silently accepts non-canonical bytes.

### Recommendation
- **On device:** ship the structural check, because it is fixed-cost and needs no scratch.
- **On host:** keep reconstruction as the test oracle.
- **Agreement:** B2 and B5 enforce that `structural_accept(x) ⇔ roundtrip_equal(x) ∧ domain_ok(decode(x))`.
- **Small schemas:** when S is small enough, enumerate every field domain exhaustively rather than fuzzing.

## 7. Assumptions and Limits

**Assumptions**
- Strictly one lane, and no interrupt handler touches inboxes or R state.
- Sender identity cannot be forged, and `r_inc` and `p_epoch` never repeat within a boot.
- The procedure is trusted. Digest pinning establishes integrity, not sandboxing, so compiler hardening against hostile text is out of scope.
- The compiler is deterministic and bounded by `C_MAX` and a time limit.
- The schema is fixed per firmware build. Schema versioning is out of scope.

**Limits**
- No persistence across power loss.
- No display-pipeline guarantees beyond "paint selected snapshot X".

## 8. What Host Results Leave Unproven on Hardware

- **Timing:** worst-case turn latency and compile duration on the target CPU, flash wait states, and cache behavior. S3 validates only the host model.
- **Interrupts:** interaction between ISRs or DMA and the scheduler, and whether deferred delivery holds when interrupts post work.
- **Display coherence:** whether the painted frame is the one the panel shows, including tearing and cache/DMA coherence of the framebuffer.
- **Allocator:** fragmentation over long uptime with the real allocator, as opposed to the instrumented host allocator.
- **Executable memory:** permissions for compiled artifacts (write-xor-execute (W^X) transitions, instruction-cache flush after compile). Skipping the flush can execute stale code even when every epoch check passes.
- **Monotonicity under faults:** `r_inc` monotonicity across brownout, watchdog reset, and partial restart.
- **Hardware faults:** RAM bit errors, stack depth at worst case, and power loss during teardown.
- **Fidelity of the model:** whether the target scheduler implements purge-on-death and synchronous quota failure as the host model assumes.

Close these gaps by re-running on target hardware:
- L2, L3, S2, S3, and the negative controls;
- with hardware timers and fault injection (forced resets mid-compile, brownout);
- with frame-hash readback from the actual framebuffer.
