#!/bin/bash
set -eu
cd /home/manuel/code/wesen/2026-10-20--ds-js-os
runner=(ttmp/2026/11/17/PICOCALC-CJI-PORT--*/scripts/07-check-bundled-catalog.py)
python3 "${runner[0]}" --timeout 7200 agent > /tmp/cji-agent-board.jsonl 2>/tmp/cji-agent-board-progress.log
python3 "${runner[0]}" settings logs loader sysmon repl sandbox snake faults flaky keys about > /tmp/cji-catalog-after-agent.jsonl 2>/tmp/cji-catalog-after-agent-progress.log
python3 "${runner[0]}" compositor launcher files editor >/tmp/cji-catalog-after-agent-replay.jsonl 2>/tmp/cji-catalog-after-agent-replay-progress.log
