"""Score the imported board rows in a trace-REPL session.

usage: python3 08-score-board.py PORT  (writes various/14-board-scores.json)
"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from repl_client import Session

ticket = Path(__file__).resolve().parents[1]
s = Session(int(sys.argv[1]))
s.bind_string("globalThis.rowsText", (ticket / "various/13-board/rows.json").read_text())
scores = s.eval((ticket / "scripts/08-score-board.js").read_text())
(ticket / "various/14-board-scores.json").write_text(json.dumps(dict(session=s.sid, scores=scores), indent=1) + "\n")
print(json.dumps(scores, indent=1))
