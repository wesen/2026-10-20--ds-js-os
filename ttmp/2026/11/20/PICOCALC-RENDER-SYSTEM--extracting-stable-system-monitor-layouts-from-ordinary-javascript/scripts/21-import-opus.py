"""Preserve CLI attribution and apply documented factual corrections to the article."""
import json
import sys
from pathlib import Path

ticket = Path(__file__).resolve().parents[1]

def import_reply(name, path, target):
    events = json.loads(Path(path).read_text())
    init = events[0]
    reply = events[-1]
    assert not reply.get("is_error") and reply["type"] == "result"
    body = reply["result"].strip()
    if name == "article":
        for old, new in [
            ("Running A against itself", "Running two independently instantiated generic controls"),
            ("82 identical publications", "82 publications at identical positions in the trace"),
            ("S1's advantage over M on small changes", "M's byte advantage over S1 on small changes"),
            ("the `worlds` tag", "tab tag 0 for Worlds"),
            ("The board capsule ran 20 frames", "In host rehearsal the portable board capsule ran 20 frames"),
            ("No extraction rule was changed after the holdout was run.", "The rules were frozen before Keys was opened and stayed fixed through scoring."),
            ("A view contains a clock string, a table of rows, detail strings for the selected row, and a graph.", "Worlds shows a table, a graph, and details about the selected world. Handles lists hardware resources. Buses shows two traffic histories and counters. The header includes a clock string."),
            ("the histogram limit of 48", "the history limit of 48 samples"),
            ("no formal 60% held-out recovery gate applies.", "the formal 60% held-out recovery gate remains unqualified."),
            ("Each candidate was compared against a matched control over 100 System frames and 26 Keys frames.", "Both System candidates were compared against the control over 100 frames. The automatic candidate was also compared against the Keys control over 26 frames."),
            ("A separate reproduction document is forthcoming.", "The complete host replay is scripts/18-reproduce.sh. The controls and dependencies are documented in reference/04-reproduction.md."),
        ]:
            assert old in body, old
            body = body.replace(old, new)
    if name == "diary":
        start=body.index("- **Prompt Context:**")
        end=body.index("\n",start)
        body=body[:start]+"- **Prompt Context.** The user’s original commission is quoted in Step 1 of the operator diary. The director assigned this study to the System researcher."+body[end:]
    if target.exists():
        front = target.read_text().split('---\n', 2)[1]
        target.write_text('---\n' + front.replace('Status: active','Status: complete') + '---\n\n' + body + '\n')
    out = {k:reply.get(k) for k in ["duration_ms","session_id","modelUsage","usage","is_error"]}
    out.update(model=init["model"], requestedEffort="high", availableTools=init["tools"])
    (ticket/"various"/f"opus-{name}-authorship.json").write_text(json.dumps(out,indent=2)+"\n")

if __name__=='__main__':
    import_reply("article",sys.argv[1],next((ticket/"analysis").glob("01-*")))
    import_reply("diary",sys.argv[2],next((ticket/"reference").glob("02-*")))
