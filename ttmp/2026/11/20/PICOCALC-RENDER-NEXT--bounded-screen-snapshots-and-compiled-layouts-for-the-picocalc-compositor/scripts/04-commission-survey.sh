#!/usr/bin/env bash
set -eu
brief=$(realpath "$(dirname "$0")/03-opus-literature-followup.txt")
cd /tmp
exec claude -p --model opus --effort xhigh --tools WebSearch --allowedTools WebSearch --disable-slash-commands --strict-mcp-config --no-session-persistence --output-format json < "$brief"
