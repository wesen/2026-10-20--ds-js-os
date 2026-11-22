# The repository's entry points (PICOCALC-REPO-LAYOUT). Ticket scripts call these tools; they do not copy them.
#
#   make test-host                       the host gates: ray frame, Chess oracle, 24 replays (OPTIONS='{"policy":"kernel"}')
#   make firmware PROFILE=playable       build a firmware profile (firmware/port/esp32p4/profiles/*.env)
#   make playable                        build the playable profile at HEAD and store its image by digest
#   make install-playable                install the image just built, health-check it, update firmware/PLAYABLE.json
#   make restore-playable                reinstall the image PLAYABLE.json records, from the store
#
# BUILD defaults to /tmp/picocalc-<profile>-<commit>; IDF_EXPORT to ESP-IDF v5.4.2's export.sh.
SHELL       := bash
COMMIT      := $(shell git rev-parse --short HEAD)
PROFILE     ?= playable
BUILD       ?= /tmp/picocalc-$(PROFILE)-$(COMMIT)
IDF_EXPORT  ?= $(HOME)/esp/esp-idf-5.4.2/export.sh
OUT         ?= /tmp/picocalc-install-$(COMMIT)-$(shell date +%Y%m%d-%H%M%S)
OPTIONS     ?=
PERIPHERALS ?=

test-host:
	bench/host/gates.sh $(if $(OPTIONS),--options '$(OPTIONS)')

firmware:
	source $(IDF_EXPORT) > /dev/null && firmware/port/esp32p4/build.sh $(PROFILE) $(BUILD)

playable:
	$(MAKE) firmware PROFILE=playable BUILD=$(BUILD)
	python3 bench/board/playable.py store $(BUILD)

install-playable:
	python3 bench/board/playable.py install $(BUILD) $(OUT) $(if $(PERIPHERALS),--peripherals $(PERIPHERALS))

restore-playable:
	python3 bench/board/playable.py restore $(OUT) $(if $(PERIPHERALS),--peripherals $(PERIPHERALS))

.PHONY: test-host firmware playable install-playable restore-playable
