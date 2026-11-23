# Tasks

## Done

- [x] SDK imports for directories, the editor hand-off, clock and timer (`world.c`, `typed-world.js`, `rv32-slot.S`)
- [x] Agenda as a complete Typed world (`apps/typed/agenda`)
- [x] Files as a complete Typed world (`apps/typed/files`)
- [x] Replays: the JavaScript apps as the oracle of the Wasm worlds; RV32 = Wasm transcripts; 25 replays
- [x] Delete the app-specific C reactors (`scripts/01-delete-app-reactors.py`)
- [x] An editable source after other sources (`typed_apps.py`, `typed_p4.c`)
- [x] Gates: `make test`, `make test-host` default and `kernel`
- [x] Board: boot compiles against deadlines, Agenda's first frame, the workflows; playable image restored

## Open

- [ ] Compiler: local records, or a record view of a buffer, so that parser results need not live in `WorldState`
  (Typed cannot allocate a `Task`)
- [ ] Compiler/build: Typed sources shared between apps (Agenda and Files each carry their own JSON quoting and digit
  writers)
- [ ] Reduce Agenda's boot compile: it grew with the app (see the diary's board step), and every boot app's first
  frame waits for the sum of the boot compiles
