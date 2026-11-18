#!/bin/bash
set -eu
cd /home/manuel/code/wesen/2026-10-20--ds-js-os
runner=(ttmp/2026/11/17/PICOCALC-CJI-PORT--*/scripts/07-check-bundled-catalog.py)
python3 "${runner[0]}" --timeout 7200 agent > /tmp/cji-agent-second.jsonl 2>/tmp/cji-agent-second-progress.log
python3 "${runner[0]}" settings logs loader sysmon repl sandbox snake faults flaky keys about > /tmp/cji-catalog-second.jsonl 2>/tmp/cji-catalog-second-progress.log
python3 "${runner[0]}" compositor launcher files editor >/tmp/cji-catalog-second-replay.jsonl 2>/tmp/cji-catalog-second-replay-progress.log
