#!/usr/bin/env bash
# Launch from the project root. A separate capture keeps both earlier services available.
set -euo pipefail
ticket=$(realpath "$(dirname "$0")/..")
if ! tmux has-session -t p4-shadow-llvm-repl 2>/dev/null; then
    tmux new-session -d -s p4-shadow-llvm-repl "go run ./cmd/trace-repl serve --archive '$ticket' --addr 127.0.0.1:3795"
fi
