#!/usr/bin/env bash
set -euo pipefail
brief=$(realpath "$1")
cd /tmp
exec claude -p --model opus --effort high --tools "" --strict-mcp-config --disable-slash-commands --no-session-persistence --output-format json < "$brief"
