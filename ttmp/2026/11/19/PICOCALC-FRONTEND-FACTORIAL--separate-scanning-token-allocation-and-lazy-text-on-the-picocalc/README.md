# Reproduce the PicoCalc frontend comparison

Run from the project root. Use a clean work directory for each stage. The five compiler pairs live under `treatments`. The two physical images each contain their own shared controls.

```sh
ticket=$(find ttmp/2026/11/19 -maxdepth 1 -name 'PICOCALC-FRONTEND-FACTORIAL--*')
previous=$(find ttmp/2026/11/19 -maxdepth 1 -name 'PICOCALC-FRONTEND-COLD--*')
lab=$(find ttmp/2026/11/19 -maxdepth 1 -name 'PICOCALC-COMPILER-LAB--*')
work=$(mktemp -d /tmp/p4-frontend-factorial.XXXXXX)
idf=/home/manuel/esp/esp-idf-5.4.2/export.sh

python3 -B "$ticket/scripts/01-stage.py" "$work"
bash "$previous/scripts/05-build.sh" "$work/factorial" "$idf"
bash "$previous/scripts/05-build.sh" "$work/lazy" "$idf"
node "$lab/scripts/03-oracle.mjs" "$work/factorial"
node "$lab/scripts/03-oracle.mjs" "$work/lazy"
```

Build the host harness against the vendored QuickJS. The lexical comparison verifies object lifetimes separately from the trace comparison.

```sh
qjs="$PWD/picocalc-os/third_party/quickjs"
cc -O2 -fwrapv -fno-strict-aliasing -D_GNU_SOURCE \
  "-DCONFIG_VERSION=\"$(cat "$qjs/VERSION")\"" -I "$qjs" \
  "$previous/scripts/08-quickjs.c" "$qjs/quickjs.c" "$qjs/libregexp.c" \
  "$qjs/libunicode.c" "$qjs/cutils.c" "$qjs/dtoa.c" \
  -lm -lpthread -ldl -o "$work/front-quickjs"
node "$ticket/scripts/03-differential.mjs" "$work" "$work/front-quickjs"
```

Provide the verified factory backup directory and the compiled host Wasm reactors. Preflight checks both partition maps, treatment bytes bundled in each image and every full linked app output.

```sh
node "$ticket/scripts/04-verify-images.mjs" "$work" picocalc-os/build "$backup"
node "$ticket/scripts/07-count-text.mjs" "$work"
```

The single serial operator runs the matched images with the generic runner. Its restoration check requires the original factory backup and prints the restored status of Files, Agenda and Editor.

```sh
python3 -B "$lab/scripts/04-board.py" "$work/factorial" "$backup" --port "$port" --esptool "$esptool" --boots 2
python3 -B "$lab/scripts/04-board.py" "$work/lazy" "$backup" --port "$port" --esptool "$esptool" --boots 2
```

The checked-in board receipts can regenerate the statistics and figure independently of the device.

```sh
python3 -B "$ticket/scripts/05-summarize.py" "$ticket/various/verified-images.json" \
  "$ticket/various/board-factorial/physical.json" "$ticket/various/board-lazy/physical.json" \
  > "$work/physical-summary.json"
python3 -B "$ticket/scripts/06-figure.py" "$work/physical-summary.json" "$work/figure.png"
```

[Newcomer article](analysis/01-what-made-tokenization-faster-on-the-handheld.md) · [Design](design-doc/01-measuring-scanning-and-token-lifetime-independently-on-the-picocalc.md) · [Diary](reference/01-frontend-factorial-investigation-diary.md)
