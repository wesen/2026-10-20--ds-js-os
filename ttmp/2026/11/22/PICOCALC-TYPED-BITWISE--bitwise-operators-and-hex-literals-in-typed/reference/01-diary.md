---
Title: Diary
Ticket: PICOCALC-TYPED-BITWISE
Status: active
Topics:
    - compiler
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Implementation diary of PICOCALC-TYPED-BITWISE: & | ^ << >>> ~ and hex literals through the tape, WebAssembly, RV32 and the P4 lexical index."
LastUpdated: 2026-11-22T22:01:31.45548777-05:00
WhatFor: ""
WhenToUse: ""
---

# Diary

## Step 1: Verify the design against the code and capture base digests

I merged main (fast-forward to f4fc56c, TYPED-PIPELINE merged), read the program rules, the design,
docs/typed-compiler.md and Candela's pcgH, and grepped every place that matches tape operators. Before any edit I
digested every compile unit under every policy with TYPED-PIPELINE's harness, so that "no existing image moves" could
be checked at the end.

### Prompt Context
**User prompt (verbatim):** "TICKET: PICOCALC-TYPED-BITWISE — add &, |, ^, <<, >>> (and ~ if cheap) and hex literals to Typed, through the tape, WebAssembly and RV32, with differential tests." Coordinator's work plan (abridged faithfully): verify the design and append Refinements; keep this diary; implement tokenizer and precedence (JavaScript's), tape rows i32.and 0x71, or 0x72, xor 0x73, shl 0x74, shr_s 0x75, shr_u 0x76, the Wasm serializer, RV32 lowering (and/or/xor/sll/srl/sra and immediate forms when a literal fits), teach every pass in rv32/passes and rv32/analysis about the new opcodes or leave them opaque and say so; regenerate bundles with the build scripts; gates: a differential test (Wasm in Node vs RV32 on the reference interpreter vs JavaScript `|0`), a Typed pcgH equal to the C++ one on 10,000 inputs, existing images byte-identical via the FRONTEND/ASYNC digest harness, `make test`, `make test-host` default and kernel (ray 430f0d501659, Chess 6,981 words, 24/24); no board work; keep RV32 changes small and local because PICOCALC-RV32-REGISTERS works in rv32/encoding, emit and plan; commit on the branch, never push or merge.
**Assistant interpretation:** Add the operators end to end, prove them differentially, prove nothing else moved.
**Inferred user intent:** Unblock a Typed Candela (pcgH, rnd) and `v & 1` style code without C.

### What I did
- `git merge --ff-only main`.
- `grep -rnE "SHR_S|SHL|I32_REM_S" compiler/typed ...` to list every operator matcher.
- Base digests: `git archive HEAD compiler/typed` into the scratchpad, then
  `bash ttmp/2026/11/22/PICOCALC-TYPED-PIPELINE*/scripts/02-compare-digests.sh $S/base $S` -> `IDENTICAL 84 of 84`.

### Why
- The PIPELINE harness is the newest of the three (FRONTEND, ASYNC-TAPE, PIPELINE) and digests images and every
  observed tape under seven arms.

### What worked
- Baseline captured.

### What didn't work
- No failures in this step.

### What I learned
- `>>` (i32.shr_s) already existed at precedence 5; `i32.shl` was a tape row only the Wasm expansion of
  text.checked_address wrote.
- The design missed a second tokenizer: `firmware/port/esp32p4/main/typed_lex_index.c` (`__typedLexIndex`), whose token
  rows the lexer reads on the P4. Unchanged, it splits `0x1f` into `0` + `x1f` and `>>>` into `>>` + `>`.
- Six files test "pure binary op" as `op >= I32_ADD && op <= I32_SHR_S`: and/or/xor (0x71-0x73) fall inside, shr_u
  (0x76) does not.

### What was tricky to build
- Nothing yet; the hazard identified is the opcode range above.

### What warrants a second pair of eyes
- N/A.

### What should be done in the future
- N/A.

### Code review instructions
- The Refinements appended to the design doc list the decisions.

### Technical details
- The worktree sandbox refused compound shell commands containing `git` or long pipelines; edits went through small
  Python scripts in the scratchpad.

## Step 2: Front end, tape and the P4 lexical index

Tape rows 0x71-0x73 and 0x76; `TOKEN` gains `0[xX]\w*`, `>>>`, `<<`, `& | ^ ~`; `Lexer.integerValue` reads decimal or
hex (hex wraps to i32, so `0xffffffff` is -1; enum values too); `BINARY` is renumbered to JavaScript's precedences with a
`NOMINAL` set naming the levels a distinct integer passes through; prefix `~` writes `x, i32.const -1, i32.xor`. The C
scanner learns the same tokens.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** The language and IR half of the ticket.
**Inferred user intent:** As Step 1.
**Commit (code):** 59e3097 — "feat(typed): bitwise operators, ~ and hex literals in the front end and the tape"

### What I did
- `compiler/typed/tape.js`, `frontend/lexer.js`, `frontend/expressions.js`, `frontend/declarations.js`;
  `node compiler/typed/frontend/build.mjs`. The Wasm serializer needed no change: a 0-cell row is its own opcode.
- `typed_lex_index.c`: a `0x`/`0X` integer continues over word characters; `>>>` width 3; `<<` width 2; `&|^~` width 1.
- A host QuickJS with the index (`scripts/01-qjs-lex-index.c`) runs `scripts/02-check-lex-index.js`: reference and
  indexed token streams, Wasm bytes and kernel RV32 images agree on a bitwise source, adjacent tokens
  (`a>>>=b<<<c&&&d|||e^~f 0x1fz 0x 0X 07x 1x2 ~~a`), bad and long hex, and the ray tracer -> `AGREE 5 of 5`. Built
  against main's version of the C file it reports `TOKENS DIFFER badHex` (`int:0@27 id:x1g@28` against `int:0x1g@27`)
  and `4 FAILURES`, so the check sees the bug it guards against.
- `typed-tape.test.mjs`: its "every row is exercised by apps/typed" assertion now expects the five bitwise rows missing.
- docs/typed-compiler.md: 40 rows, an "Operators and literals" section, and step 3 of "Adding an operation" names the
  `I32_SHR_U` range checks and the C lexical index.

### Why
- `0[xX]\w*` as one token makes `0xfg`, `0x` and nine digits one clear error ("invalid hex literal") instead of `0`
  followed by an identifier.
- Bitwise operands are i32 only: `a & 1 === 1` (JavaScript parses `a & (1 === 1)`) becomes a type error.
- Distinct types pass through `| ^ &` like `+ -` (flag sets); shifts are i32 only like `>> * / %`.

### What worked
- Digest harness after the change: `IDENTICAL 84 of 84`.

### What didn't work
- `node --test tests/compiler/` -> `Error: Cannot find module '.../tests/compiler'`; used the `*.test.mjs` glob.
- First suite run: 45 of 46, `typed-tape.test.mjs` "every tape the compiler produces from apps/typed matches the tape
  table": `actual: [ 'i32.and', 'i32.or', 'i32.xor', 'i32.shl', 'i32.shr_u' ], expected: [ 'i32.shl' ]`. Expected: no
  app uses the operators yet; the assertion was updated.

### What I learned
- A written `-1` is `0 - 1` on the tape (prefix minus), not a literal; only `-2147483648` folds. So `x ^ -1` uses a
  register while `~x` gets `xori x, -1`.

### What was tricky to build
- Keeping the C scanner and the regexp identical at token boundaries (`>>>=`, `<<<`, `&&&`, `0X`, `07x`); the check
  script covers them.

### What warrants a second pair of eyes
- The C scanner change ships in firmware; it was exercised on the host QuickJS only (no board work in this ticket).

### What should be done in the future
- Fold `-literal` into one `i32.const` in the front end (moves existing images; its own ticket).

### Code review instructions
- `frontend/expressions.js` (`BINARY`, `NOMINAL`, `PREFIX`, `case "~"`), `frontend/lexer.js` (`TOKEN`,
  `integerValue`), `typed_lex_index.c` `scan_token`.
- Build the index check as in the header of `scripts/01-qjs-lex-index.c`, then from the repository root
  `qjs-lex-index compiler/typed/tape.js compiler/typed/typed-wasm.js compiler/typed/typed-rv32.js compiler/typed/typed-rv32-inline.js compiler/typed/typed-rv32-loops.js ttmp/.../scripts/02-check-lex-index.js`.

### Technical details
- Precedences: `|| 1, && 2, | 3, ^ 4, & 5, === !== 6, < <= > >= 7, << >> >>> 8, + - 9, * / % 10`, prefix operand 11.

## Step 3: RV32 lowering and the passes

`ALU` gains and (funct3 7), or (6), xor (4), srl (5, funct7 0); `IMMEDIATE_FORMS` gains andi/ori/xori for literals in
[-2048, 2047] and srli; commute treats `& | ^` as commutative; the pure-binary range checks in commute, inline, hoist
(3), value-sets (3), ranges and typed-pie-loops stop at `I32_SHR_U`; value-sets folds and/or/xor/shr_u; ranges bounds
`x & y` (the rule TYPED-TAPE left unreachable at 0x71, now: either operand non-negative) and `x >>> c`. Leaf code picks
the new ops up through `ALU.keys()`. The rv32/encoding change is table entries only.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** The backend half.
**Inferred user intent:** As Step 1.
**Commit (code):** a640ddd — "feat(rv32): lower and/or/xor/srl and their immediate forms; passes learn the new opcodes"

### What I did
- Edited `rv32/encoding/{tape,selection}.js`, `rv32/passes/{commute,inline,hoist,value-sets}.js`,
  `rv32/analysis/ranges.js`, `typed-pie-loops.js`; `node compiler/typed/rv32/build.mjs`.
- Left opaque (pattern matchers that never match the new ops, or walkers that stop at unknown shapes):
  version-loops, rotate, split-locals, conjunctions, storeless; plan/locations uses `constantForm`, so constant homes
  follow the new immediate forms automatically.

### Why
- Changing only table entries and range bounds keeps the merge with PICOCALC-RV32-REGISTERS small.

### What worked
- Kernel policy: `const x = a & 1023; return x / 8 + x % 8;` is 11 words against 17 for the unmasked `a`;
  `a >>> 20` then `/ 3 + % 5` is 17 against 18 for `a >> 20` (the range facts drop the sign corrections).
- Digests after the change: `IDENTICAL 84 of 84`.

### What didn't work
- My edit script asserted `op <= I32_SHR_S)` in inline.js, which spells it `opcode <= I32_SHR_S)`:
  `AssertionError: ('rv32/passes/inline.js', 'op <= I32_SHR_S)', 0)` after three files were already written; reran the
  remaining edits with the corrected pattern.

### What I learned
- Every pass that does not know an operation either rejects the function or copies it; none mis-models it.

### What was tricky to build
- The opcode range: and/or/xor were silently inside it already, shr_u silently outside.

### What warrants a second pair of eyes
- The `ranges.js` AND rule: `[0, min of the non-negative operands' maxima]`; the SHR_U rule excludes c = 0 (the
  result may be negative).

### What should be done in the future
- PICOCALC-RV32-REGISTERS' encoder table will need these four ALU entries and four immediate forms.

### Code review instructions
- `git show a640ddd -- compiler/typed/rv32 compiler/typed/typed-pie-loops.js` (the generated bundles follow).

### Technical details
- `[I32_AND,[7,0]], [I32_OR,[6,0]], [I32_XOR,[4,0]], [I32_SHR_U,[5,0]]` beside `[I32_SHL,[1,0]], [I32_SHR_S,[5,0x20]]`.

## Step 4: Tests and gates

`tests/compiler/typed-bitwise.test.mjs`, added to `firmware/Makefile` test-apps: 300 generated expressions over
`& | ^ << >> >>> + - *` and prefix `~ -`, parameters and decimal or hex literals, printed with minimal parentheses (so
precedence is under test), 12 random inputs each, in Wasm in Node and in RV32 under stock, interactive, balanced,
default and kernel on the reference interpreter, against a tree evaluator with i32 semantics, plus JavaScript's own
parser as the oracle for expressions without `+ - *` (3,600 checks); statement functions (an FNV loop, value sets,
ranged divisions, buffer stores, a loop) comparing results and memory; pcgH on 10,000 inputs; RV32 instruction
selection; the language rules and their errors.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** The gates.
**Inferred user intent:** As Step 1.
**Commit (code):** 0e37786 — "test(typed): differential bitwise test, Candela's pcgH, RV32 selection and language rules"

### What I did
- `scripts/03-pcg-against-gcc.mjs $SCRATCH`: extracts `pcgH` from cdl_kernel.cpp, compiles it with `g++ -O2` and
  compares with the Typed pcgH -> `pcgH: g++, Wasm, RV32 stock and kernel agree on 10000 inputs`. The test itself uses
  a JavaScript transcription and asserts that the exact C text it transcribes is still in the kernel source.
- Mutation checks: srl given funct7 0x20 -> 4 of 5 tests fail; andi given funct3 6 -> 3 of 5 fail (restored).
- `GOWORK=$S/go.work make test` (a go.work in the scratchpad pointing go-go-goja at its absolute path; not committed).
- `make test-host`; `make test-host OPTIONS='{"policy":"kernel"}'`.

### Why
- A tree evaluator is needed because JavaScript's `+` and `*` are not exact on i32; JavaScript's parser checks the
  printer's precedence only where its operators are exact.

### What worked
- `make test`: exit 0 (Node suites 0 failures, generated files, `file length: 887 source files, 94 over 500 lines, all
  listed`, Go ok, Python OK, cji).
- `make test-host`: `default: 4,888,369 instructions, 11964 B image, output 430f0d501659 (reference)`,
  `6981 words match; engine 128,152,624 instructions, 21716 B`, `24/24 workflows passed`.
- kernel: `custom: 3,239,635 instructions, 11544 B image, output 430f0d501659 (reference)`,
  `6981 words match; engine 118,361,847 instructions, 19892 B`, `24/24 workflows passed`.
- Digest harness: `IDENTICAL 84 of 84`; the pins in `tests/compiler/typed-rv32.test.mjs` unchanged.

### What didn't work
- First `make test`: test-native failed, `/usr/include/stdint.h:26:10: fatal error: 'bits/libc-header-start.h' file
  not found` ... `make: *** [Makefile:47: test-native] Error 2`. Fixed by `bash firmware/tools/wasm-toolchain.sh` in
  the worktree, as the coordinator anticipated.
- First run of the selection test: no `xori` for `(a & 255 | 0x700) ^ -1`, because `-1` is `0 - 1` (Step 2); the test
  now uses `~(...)`.
- The new test was not in `make test` at first: `firmware/Makefile` lists the compiler tests explicitly; added.

### What I learned
- The differential test passed on its first run; the mutations show it would not have passed a wrong encoding.

### What was tricky to build
- Printing `- -x` would lex as JavaScript's `--`; the printer parenthesizes every non-leaf operand of a prefix operator.

### What warrants a second pair of eyes
- The generator never mixes comparisons with bitwise operators; the language-rules test covers those by hand.

### What should be done in the future
- A Typed Candela (PICOCALC-CANDELA-TYPED) can now write pcgH and rnd; the board has not run a bitwise image yet.

### Code review instructions
- `node --test tests/compiler/typed-bitwise.test.mjs`; the gates above.

### Technical details
- Typed pcgH: `const st = v * 747796405 + 0xac564b05; const w = ((st >>> ((st >>> 28) + 4)) ^ st) * 277803737;
  return (w >>> 22) ^ w;`
