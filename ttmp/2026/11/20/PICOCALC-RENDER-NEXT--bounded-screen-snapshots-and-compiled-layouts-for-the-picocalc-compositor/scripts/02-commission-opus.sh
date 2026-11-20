#!/usr/bin/env bash
set -eu
brief=$(realpath "$(dirname "$0")/01-opus-assignment.txt")
cd /tmp
exec claude -p --model opus --effort xhigh --tools '' --strict-mcp-config --disable-slash-commands --no-session-persistence --output-format json < "$brief"
