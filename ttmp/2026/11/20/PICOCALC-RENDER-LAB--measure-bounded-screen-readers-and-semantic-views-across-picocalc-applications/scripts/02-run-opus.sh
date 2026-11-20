#!/usr/bin/env bash
set -eu
prompt=$(realpath "$1")
cd /tmp
exec claude -p --model opus --effort high --tools '' --disable-slash-commands --strict-mcp-config --no-session-persistence --output-format json < "$prompt"
