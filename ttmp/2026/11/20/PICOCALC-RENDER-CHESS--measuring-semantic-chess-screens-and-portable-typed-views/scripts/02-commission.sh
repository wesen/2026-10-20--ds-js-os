#!/usr/bin/env bash
set -euo pipefail
brief=$(realpath "$1")
cd /tmp
exec claude -p --model opus --effort high --tools '' --disable-slash-commands --setting-sources '' --strict-mcp-config --no-session-persistence --output-format json < "$brief"
