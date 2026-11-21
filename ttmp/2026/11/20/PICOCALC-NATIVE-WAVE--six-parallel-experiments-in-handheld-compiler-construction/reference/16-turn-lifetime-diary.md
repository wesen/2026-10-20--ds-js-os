---
Title: Turn-lifetime inference investigation diary
Ticket: PICOCALC-NATIVE-WAVE
DocType: reference
Status: active
---

# Turn-lifetime inference investigation diary

## Step 1. Pin what can cross a turn

I started an independent Claude Opus High design run with tools disabled. The reader and local compiler review converged on a narrow objective. Infer whether a buffer formal is an ordinary turn-local reference, still using the existing continuation rule that saves only needed scalar values. I wrote the guide and its selection limits before staging code.

### Prompt context

The director delegated the sixth study in the handheld compiler wave. The task compares explicit turn-lifetime declarations and inferred choices on fixed-source fixtures, measures host compiler costs and tests a realistic workflow plus independently specified held-out cases. Project excerpts and aggregates were authorized for Anthropic. I kept device serial output and credentials separate.

### What I did

I read `picocalc-os/compiler/typed-async.js` at parameter admission, liveness, frame allocation and dispatch. I also inspected `typedSdkBuffer` and `typedSdkEventText` in `picocalc-os/sdk/typed/world.c`. The former returns runtime-owned scratch slots. The latter decodes into a caller buffer after checking capacity and returns a count. I staged a separate variant with checked explicit sidecar membership or resolved buffer type discovery. No production file changed.

### Why

The current async compiler accepts a buffer local that dies before a wait. Rejecting a buffer formal entirely leaves no route for a small helper to consume a scratch buffer in the initial turn. Inference can admit this form without changing what the generated state frame is allowed to hold.

### What worked

The stock compiler rejected the initial buffer formal. The checked explicit and inferred arms compiled the same source with a direct synchronous alias and reader to identical 1,100-byte native images in the smoke run. The parser keeps resolved binding identities, and the existing analysis rejects a nonambient buffer that must be saved over a wait. The synchronous summary walks the actual translated statement tree, including nested calls.

### What didn't work

My first smoke returned `start task(...)` as an i32. The compiler correctly diagnosed `expected i32, got bool` because start is Boolean. I changed the fixture to branch on that result. An assertion on VM-realm statistics compared object prototypes rather than numeric content, despite identical printed results. Copying the fields into the runner's own realm resolved the mismatch.

### What I learned

The prototype uses a coarse lifetime type classification. Aliases preserve the `buffer` type. There is no special durable-buffer value type and no per-allocation points-to solver. Synchronous returned aliases remain viable in the current turn, then the ordinary live-after check rejects their use across a wait.

### What was tricky to build

A resumed function still expects its original machine signature. I supplied current ambient output as the dead buffer formal's placeholder and kept the original pointer out of saved fields. This depends on standard liveness, stock frame generation and the SDK's complete-world contract. Real SDK scratch storage can have stable addresses even when later events reuse its contents.

### What warrants a second pair of eyes

Audit the link-time restriction to scalar WorldState fields and the signatures of approved helpers. A semantic contract about a native import is separate from type inference over the Typed program.

### What should be done in the future

A declaration-site buffer lifetime type could preserve stronger alias distinctions. The current study can expose false rejections in actual source first.

### Code review instructions

Read `scripts/06-lifetimes/stage.mjs`, then `policy.js`. Compare against `AsyncBody`, `analyze`, `allocate` and `emitDispatcher` in the stock compiler. Read the [independent design](../various/06-lifetimes/opus-design.txt) alongside the implemented scope. Several design alternatives, such as full alias-site bitsets, are future directions.

### Technical details

I gave the director the pre-code guide digest `c469807e…` and implementation policy SHA-256 `1ff03e14ea3899e91cb9c302c256f89e3fac432cdd687444f8bac4ea83f45547` before receiving the held-out inputs. The code-level stage hash `f2c29295c5a24147bc92f27048f585c89eb174f6771ba30ef9ffd4deaefa10a7` stayed frozen.

## Step 2. Exercise the explicit and inferred paths

The same compiler is responsible for code in both cases. I separated parameter discovery from checking, then compared continuation layouts, raw native instructions and full modeled memory. The test paid particular attention to references that survive under a second name after the original formal is dead.

### Prompt context

See Step 1. The held-out inputs were supplied by the director after the policy lock. Five could be translated exactly. Three needed a reference-valued durable buffer, which the validated world state cannot provide.

### What I did

I ran `check.mjs` for fixed-source development cases, an adaptation of the actual maintained Editor normalization loop and the five expressible held-out cases. The runner initialized the original scratch area, delivered an event, replaced stale buffer contents on simulated wake, and compared final memory. I swept 16, 64 and 120 distinct synchronous helpers and retained 11 interleaved warm samples per arm for analysis and complete compilation.

### Why

A storage alias can make a syntactically different binding unsafe after resumption. The Editor loop has a useful positive shape. It mutates the scratch buffer before yielding and carries just a count forward. Scaled helper graphs test the same proof rule without conflating it with whole-game scheduling.

### What worked

All expressible held-out cases matched their independent labels. Three were accepted and two rejected. On the development suite, four of five expected positive cases were accepted and all five expected negative cases were rejected. Explicit and inferred output bytes, frame counts and modeled final memory matched on every accepted case. The Editor fragment normalized A CR LF B into A LF B and kept count 3 across a modeled yield. The 129-helper control hit the stated budget.

At 16, 64 and 120 helper summaries, the inspected-token counts were 359, 1,415 and 2,647 in both modes. Analyze medians in inferred mode were 0.486, 1.186 and 2.489 ms. The corresponding explicit medians were 0.518, 1.405 and 1.872 ms. Ranges overlapped. Timed analysis includes parsing, liveness and allocation. It excludes source generation and RV32 emission.

### What didn't work

The unchanged policy rejected `state.sum=b.charCodeAt(0)` as `turn buffer: unproved retained store` even though the RHS returns a scalar. Putting that exact observation into a scalar local before storing was accepted. I recorded the conservative miss and left the policy frozen.

The first translation of a held-out read used a discarded `charCodeAt` statement and got `expected setCharCodeAt`; this grammar expects the read in an expression. Assigning its scalar result to a local preserved the supplied operation. The first Editor frame extraction also omitted its `length` local and got `unknown local length`. I supplied the fixture's actual four-unit input length to the copied loop.

A follow-up boundary test discovered a real hole in generic use. `state.stash=typedSdkBuffer(0)` has no buffer local in its RHS, so the raw compiler emitted 1,036 bytes for a deliberately buffer-valued state record. The ordinary complete-world linker rejected it with `WorldState supports up to 80 scalar fields`. The qualification is therefore explicitly limited to complete Typed worlds with the existing scalar state boundary. [Boundary receipt](../various/06-lifetimes/world-boundary.json)

### What I learned

Explicit sidecar and inferred discovery share almost all proof cost. Upper and lower timings alternate between arms over the warm sample ranges. These measurements do not establish either as the faster checker. A full alias tracker would add distinctions that the coarse type-based prototype intentionally cannot express.

### What was tricky to build

The modeled dispatcher must use a fresh completion event while preserving generated scalar frame fields. The test poisons the original scratch and changes output contents after the initial event. It checks the explicit/inferred final frames byte for byte and the expected observed scalar values independently.

### What warrants a second pair of eyes

The raw compiler accepts a reference-valued record that the complete world validator rejects. Any future public exposure must make that assumption explicit or add typed member-store checking and retention summaries.

### What should be done in the future

A worthwhile next change is a local typed RHS category for scalar member writes. Test it against the existing false-negative case and the generic buffer-field boundary before expanding source acceptance.

### Code review instructions

Run `node scripts/06-lifetimes/check.mjs HELD_OUT OUTPUT` and optionally `world-boundary.mjs REACTOR_ELF`. Compare reported scopes in the article and [runtime receipt](../various/06-lifetimes/runtime-and-cost.json).

### Technical details

Claude Opus High authored the final article from approved aggregate inputs. I checked numbers and links, clarified the maintained in-place UTF-16 loop, and added the separately measured complete-world boundary example. [Writing provenance](../various/06-lifetimes/opus-provenance.json)
