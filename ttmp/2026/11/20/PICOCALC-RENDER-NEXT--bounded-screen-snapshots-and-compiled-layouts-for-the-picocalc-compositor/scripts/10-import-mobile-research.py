"""Import a commissioned Opus public memo into fresh docmgr documents."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("response", type=Path)
args = parser.parse_args()
ticket = Path(__file__).resolve().parent.parent
raw = json.loads(args.response.read_text())
response = next(m for m in reversed(raw) if m.get("type") == "result") if isinstance(raw, list) else raw
models = sorted(response["modelUsage"])
if response.get("is_error") or not any("opus" in model for model in models):
    raise ValueError("Expected a successful Opus response")
memo, record = response["result"].split("===LAB RECORD===", 1)
path, = (ticket / "analysis").glob("02-opus-research-on-receiver-compiled-view-programs.md")
header, previous = path.read_text().split("\n---\n", 1)
if previous.strip():
    raise ValueError("Refusing to overwrite an edited document")
path.write_text(header + "\n---\n\n# Independent Opus assessment of receiver-compiled views\n\n"
                + "This commissioned memo uses a generic architecture brief and public literature. "
                + "The director’s accompanying design contains verified project APIs and host measurements.\n\n"
                + memo.strip() + "\n\n## Researcher’s work record\n\n" + record.strip() + "\n")
receipt = {"effort": "xhigh", "modelsInResponse": models,
           "publicTextSha256": hashlib.sha256(response["result"].encode()).hexdigest()}
(ticket / "various/mobile-opus-authorship.json").write_text(json.dumps(receipt, indent=2) + "\n")
