---
Title: Reproduce the independent compiler checks
Ticket: PICOCALC-LAB2-METHODS
Status: active
Topics: [performance, picocalc]
DocType: reference
Intent: long-term
---

# Reproduce the examiner's checks

Run these from this directory. The checked-in serial extracts retain measurement text and row order. Each capture identity file records hashes for the source and its extraction. A direct run on an extract changes only the reported capture digest.

```sh
python3 01-audit-captures.py ../various/serial/factorial
python3 01-audit-captures.py ../various/serial/lazy
python3 01-audit-captures.py ../various/serial/conditions
python3 01-audit-captures.py ../various/serial/typed-board
python3 05-check-edit-captures.py ../various/editor-clean-images.json ../various/serial/edits/fragments-*.log
```

The next commands use subject study work directories. Each corresponding source ticket contains a staging recipe. For the Editor probe, stage the production and bounded compilers using the Editor Fragments ticket's 01-stage.py into a new directory first. The input source and reactor are the joined Editor file and the linked SDK reactor from the physical build. The probe loads its independent instruction interpreter from the archive next to this ticket.

```sh
node 02-check-editor.mjs /tmp/picocalc-examiner-wave2/fragments \
  /tmp/pico-lab2-wave/editor-fragments/build/esp-idf/main/editor.typed \
  /tmp/pico-lab2-wave/editor-fragments/build/esp-idf/main/typed-world-reactor.elf
node 03-await-fixture.mjs /tmp/pico-lab2-wave/await-stage-v2/lanes/await \
  /tmp/pico-lab2-wave/editor-fragments/build/esp-idf/main/typed-world-reactor.elf \
  ../../../../../../picocalc-os/build/typed-world-reactor.wasm \
  /tmp/pico-lab2-wave/await-board/host.json
python3 04-check-selection.py /tmp/pico-lab2-wave/heldout/scores.json \
  /tmp/picocalc-examiner-wave2/selection.json /tmp/pico-lab2-wave/heldout
```

The selection rerun is the output of the Analysis Selection ticket's 04-evaluate.mjs, invoked with `custom`, its frozen overlay and the clustered, reversed and shuffled sources in that order. The Combined replay uses the Condition Targets ticket's 05-host-replays.py with a fresh output directory, the qualified supervisor baseline, the combined compiler, the ESP-IDF RV32 compiler and CJI rv32emu. The host verifier receipt records the exact archived JSON matched by each independent rerun. None of these commands opens a physical serial device.
