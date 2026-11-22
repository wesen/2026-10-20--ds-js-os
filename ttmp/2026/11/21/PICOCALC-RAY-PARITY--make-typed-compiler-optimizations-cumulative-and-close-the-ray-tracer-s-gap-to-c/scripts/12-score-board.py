"""Score imported board rows in a trace-REPL session.

usage: python3 12-score-board.py PORT ROWS_DIR OUT.json
"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from repl_client import Session

ticket = Path(__file__).resolve().parents[1]
rows_dir = Path(sys.argv[2])
s = Session(int(sys.argv[1]))
s.bind_string("globalThis.rowsText", (rows_dir / "rows.json").read_text())
s.eval("globalThis.modes = %d; undefined" % json.loads((rows_dir / "receipt.json").read_text())["modes"])
scores = s.eval((ticket / "scripts/12-score-board.js").read_text())
Path(sys.argv[3]).write_text(json.dumps(dict(session=s.sid, scores=scores), indent=1) + "\n")
print(json.dumps(scores, indent=1))
