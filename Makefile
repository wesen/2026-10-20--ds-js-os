# The repository's entry points (PICOCALC-REPO-LAYOUT). Ticket scripts call these tools; they do not copy them.
#
#   make test                            every fast suite: Node, generated files, Go, the host binary's Python tests, cji,
#                                        the RV32 conformance suite
#   make test-host [OPTIONS=JSON]        the compiler gates: ray frame, Chess oracle, 25 replays (OPTIONS='{"policy":"kernel"}')
#   make firmware PROFILE=playable       build a firmware profile (firmware/port/esp32p4/profiles/*.env) into BUILD
#   make playable                        build the playable profile at HEAD and store its image by digest
#   make install-playable                install the image just built, health-check it, update firmware/PLAYABLE.json
#   make restore-playable                reinstall the image PLAYABLE.json records, from the store
#   make bench-board STUDY=FILE          stage, build and run a board study, restore the playable image, keep the rows
#   make candela-sources                 regenerate firmware/third_party/candela's generated files
#
# BUILD defaults to /tmp/picocalc-<profile>-<commit>; IDF_EXPORT to ESP-IDF v5.4.2's export.sh. PERIPHERALS=off-by-user
# when the keyboard and display are switched off on purpose.
SHELL       := bash
COMMIT      := $(shell git rev-parse --short HEAD)
PROFILE     ?= playable
BUILD       ?= /tmp/picocalc-$(PROFILE)-$(COMMIT)
IDF_EXPORT  ?= $(HOME)/esp/esp-idf-5.4.2/export.sh
OUT         ?= /tmp/picocalc-install-$(COMMIT)-$(shell date +%Y%m%d-%H%M%S)
OPTIONS     ?=
PERIPHERALS ?=
STUDY       ?=
STUDY_OUT   ?= /tmp/picocalc-study-$(basename $(notdir $(STUDY)))-$(COMMIT)

test: test-node test-generated test-go test-native test-cji test-rv32

# Node: the firmware's app tests and the Typed compiler's tests (firmware/Makefile test-apps runs tests/compiler too).
test-node:
	$(MAKE) -s -C firmware test-apps

# Generated files that are tracked must equal what their generator writes now; no source file is over 500 lines
# unless tools/file-length-exceptions.txt lists it with a reason.
test-generated:
	node compiler/typed/rv32/build.mjs --check
	node compiler/typed/frontend/build.mjs --check
	node compiler/typed/async/build.mjs --check
	node tools/gen/candela/regenerate.mjs --check
	node bench/rv32/vectors.mjs --check
	node tools/check-file-length.mjs

test-go:
	go test ./...

# The host binary, its native worlds and the Python tests that drive it.
test-native:
	$(MAKE) -s -C firmware test-clock test-sys test-fs test-native

# cji's included fixtures: native worlds compiled by cji and replayed on rv32emu against their C control.
test-cji:
	$(MAKE) -s -C compiler/cji test

# The RV32 conformance suite (bench/reference/rv32, RV32F captured on the ESP32-P4) on the reference interpreter and
# rv32emu; tools/trace-repl/pkg/tracerv32 runs it in test-go. docs/rv32-executors.md.
test-rv32:
	node --test tests/rv32/conformance.test.mjs tests/rv32/rv32emu.test.mjs

test-host:
	bench/host/gates.sh $(if $(OPTIONS),--options '$(OPTIONS)')

test-replays:
	bench/host/replays/run.sh $(if $(OPTIONS),--options '$(OPTIONS)')

firmware:
	source $(IDF_EXPORT) > /dev/null && firmware/port/esp32p4/build.sh $(PROFILE) $(BUILD)

playable:
	$(MAKE) firmware PROFILE=playable BUILD=$(BUILD)
	python3 bench/board/playable.py store $(BUILD)

install-playable:
	python3 bench/board/playable.py install $(BUILD) $(OUT) $(if $(PERIPHERALS),--peripherals $(PERIPHERALS))

restore-playable:
	python3 bench/board/playable.py restore $(OUT) $(if $(PERIPHERALS),--peripherals $(PERIPHERALS))

# A paired board study (bench/board/studies/*.json): rows land in STUDY_OUT/rows; score them with bench/board/score.js.
bench-board:
	@test -n "$(STUDY)" || { echo "usage: make bench-board STUDY=bench/board/studies/NAME.json" >&2; exit 2; }
	node bench/board/stage.mjs $(STUDY) $(STUDY_OUT)
	IDF_EXPORT=$(IDF_EXPORT) bench/board/build.sh $(STUDY_OUT)
	python3 bench/board/run.py $(STUDY_OUT) $(STUDY_OUT)/capture $(if $(PERIPHERALS),--peripherals $(PERIPHERALS))
	python3 bench/board/rows.py $(STUDY_OUT)/capture $(STUDY_OUT) $(STUDY_OUT)/rows
	@echo "rows: $(STUDY_OUT)/rows; score: (echo 'globalThis.args = {board: \"DIR\"};'; cat bench/board/score.js) | trace-repl eval ..."

candela-sources:
	node tools/gen/candela/regenerate.mjs

.PHONY: test test-node test-generated test-go test-native test-cji test-rv32 test-host test-replays firmware playable \
        install-playable restore-playable bench-board candela-sources
