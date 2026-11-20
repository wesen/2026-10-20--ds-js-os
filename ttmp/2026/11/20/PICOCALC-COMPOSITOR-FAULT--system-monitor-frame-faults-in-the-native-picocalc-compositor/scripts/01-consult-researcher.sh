#!/usr/bin/env bash
set -eu
lane=$1
case "$lane" in
producer) question='Design a minimal implementation for bounding a System screen table update while preserving all rows, selection, headers and scrolling. Design differential behavioral tests. Investigate display semantics.' ;;
receiver) question='Investigate the native receive ABI and event cost. Design a way to distinguish a per-event allocation limit, a parsing exception and an elapsed budget. Propose an implementation and physical test that preserves fault reporting.' ;;
*) exit 2 ;;
esac
cd /tmp
printf '%s\n' "You are the $lane researcher in a two-person team. $question The board runs a System monitor that samples every 500 ms. Its focused Worlds tab serializes all rows of a seven-column table, a 48-point activity history and selected world details. The native compositor receives the JSON frame, retains its tree and queues a separate draw. Four observed native frame faults: two 80 ms overruns, two event returns of 2 where 0 or 1 are accepted. Memory at faults 504 or 512 KB of 768 KB. Research from these facts and give precise predictions, pseudocode, limitations. Begin your own investigation diary using headings Prompt Context, What I did, Why, What worked, What didn't work, What I learned, What was tricky to build, What warrants a second pair of eyes, What should be done in the future, Code review instructions, Technical details. You will receive experimental feedback and write a final detailed textbook-style Obsidian report with no analogies. Do not claim unperformed work." | claude -p --model opus --effort high --tools '' --disable-slash-commands --strict-mcp-config --no-session-persistence --output-format json
