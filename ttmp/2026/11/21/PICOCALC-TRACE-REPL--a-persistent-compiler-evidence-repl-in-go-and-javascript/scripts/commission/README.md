# Reproducing the Opus implementation commission

Use an empty working directory and copy the following four files into it. The two playbooks describe the usability methodology. The workbook contains upstream API requirements and is available to the implementer. Persona runners use separate rooms and receive only the short task brief.

| Working name | Source |
|---|---|
| brief.md | This directory's opus-query.md |
| workbook.md | PICOCALC-TRACE-QUERY, design-doc/02-a-worked-query-workbook-for-the-picocalc-llvm-row-archive.md |
| homolog-playbook.md | go-go-parc, Projects/2026/11/21/ARTICLE - Playbook - Improving an Agent-Facing JavaScript API with Persona Runs - Lessons from homolog-bench.md |
| persona-sessions.md | go-go-parc, Projects/2026/11/21/ARTICLE - Playbook - Persona Sessions with Agents - Improving Software and APIs from Usability Reports.md |

Run the authenticated Claude Code CLI in that directory. Authentication is local to the operator. The requested model alias and effort were:

```sh
claude -p --safe-mode --model opus --effort xhigh \
  --tools Read,Write,Edit --allowedTools Read,Write,Edit \
  --permission-mode acceptEdits --output-format json < brief.md > outcome.json
```

Review the generated query.js, run the project tests and independently replay the source workbook. The command can generate a different implementation on repetition. Commit the reviewed source and the numerical verification with the project. Keep provider transcripts and any model-internal reasoning out of the evidence corpus. The independent persona procedure is in this ticket's playbooks directory.
