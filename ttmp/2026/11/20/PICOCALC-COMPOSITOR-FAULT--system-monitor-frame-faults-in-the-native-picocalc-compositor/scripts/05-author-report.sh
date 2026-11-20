#!/usr/bin/env bash
# Pass only the public review and the reviewed, aggregate results as inputs.
set -eu
case "$1" in
producer) title='How much of a System screen must cross the mailbox?' ;;
receiver) title='Reading the two faults behind a compositor restart' ;;
*) exit 2 ;;
esac
review=$(realpath "$2")
evidence=$(realpath "$3")
cd /tmp
{
  printf '%s\n' "You are the $1 researcher. Author your own standalone, 1100–1600 word pedagogical technical project report titled '$title' for a new intern, based on the corrected record below and your preliminary review. Include a concrete worked example, a diagram (Mermaid), pseudocode, an evidence table and source paths. Use textbook prose, no analogies. Treat the corrected record as authoritative if it disagrees with your preliminary review. Then write a separate public implementation diary in Markdown starting with '## Step 1' and '## Step 2', each briefly summarizing the research and containing headings: Prompt Context, What I did, Why, What worked, What did not work, What I learned, What was tricky to build, What warrants a second pair of eyes, What should be done in the future, Code review instructions, Technical details. Document public actions, experimental results, corrections and limits. Credit the supervisor for running the board and harness. Do not invent a quote or claim direct hardware access. Return the article first with '# ' heading, then a line containing exactly ---DIARY--- and the diary. Do not use a wrapper code fence. Do not include unpublished speculations as findings."
  printf '\nCorrected evidence:\n'
  cat "$evidence"
  printf '\nPreliminary review (subject to the above corrections):\n'
  cat "$review"
} | claude -p --model claude-opus-4-6 --effort high --tools '' --disable-slash-commands --strict-mcp-config --no-session-persistence --output-format json
