# Reproduce the function selection study

Run from the project root and use a new scratch directory. The evaluator checks the committed policy lock before reading the held-out app or generating the reserved modules.

```sh
ticket=$(find ttmp/2026/11/19 -maxdepth 1 -name 'PICOCALC-ANALYSIS-SELECTION--*')
work=$(mktemp -d /tmp/p4-analysis-selection.XXXXXX)
python3 -B "$ticket/scripts/01-stage.py" "$work/overlay"
node "$ticket/scripts/04-evaluate.mjs" training "$work/overlay" "$reactors" > "$work/training.json"
node "$ticket/scripts/04-evaluate.mjs" held-out "$work/overlay" "$reactors" > "$work/held-out.json"
node "$ticket/scripts/04-evaluate.mjs" custom "$work/overlay" "$typed_source"
```

Set `reactors` to the built firmware application reactor directory, usually the ESP-IDF build’s `esp-idf/main`. Native compiler scripts, input digests and held-out metrics are pinned in the lock and the receipts. Elapsed times vary between runs.

```sh
previous=$(find ttmp/2026/11/19 -maxdepth 1 -name 'PICOCALC-BOUNDED-FACTS--*')
cji=$(find ttmp/2026/11/17 -maxdepth 1 -name 'PICOCALC-CJI--*')/sources/cji
cc -O2 "$cji/tools/rv32/emu.c" -lm -o "$work/rv32emu"
node "$ticket/scripts/05-guest-fixtures.mjs" "$work/overlay" "$previous/scripts/04-arithmetic.typed" "$work/guests"
python3 -B "$ticket/scripts/06-run-guests.py" "$riscv_gcc" "$work/rv32emu" "$work/guests"
python3 -B "$ticket/scripts/07-figure.py" "$ticket/various/held-out.json.gz" "$work/figure.png"
```

Set `riscv_gcc` to the installed RV32 GCC executable. The independent test inputs are included under `various/independent` with compressed source and byte identities. Extract them into the scratch directory before using the custom-source command.

[Newcomer article](analysis/01-which-functions-deserve-limited-compiler-analysis.md) · [Design](design-doc/01-a-preregistered-comparison-of-bounded-function-selectors.md) · [Diary](reference/01-analysis-selection-investigation-diary.md)
