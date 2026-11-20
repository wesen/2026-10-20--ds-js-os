"""Import public Claude text, omitting account/session metadata from repository receipts."""
import hashlib
import json
import pathlib
import sys

raw, target, receipt, prompt = map(pathlib.Path, sys.argv[1:])
data = json.loads(raw.read_text())
response = next(row for row in reversed(data) if row["type"] == "result") if isinstance(data, list) else data
assert not response.get("is_error") and response["result"].strip()
assert any("opus" in name for name in response["modelUsage"])
header = target.read_text().split("\n---\n", 1)[0]
body = response["result"].strip() + "\n"
target.write_text(header + "\n---\n\n" + body)
digest = lambda data: hashlib.sha256(data).hexdigest()
receipt.write_text(json.dumps(dict(model=list(response["modelUsage"]), effort="high", turns=response["num_turns"],
    stop=response["stop_reason"], durationMs=response["duration_ms"], promptSha256=digest(prompt.read_bytes()),
    textSha256=digest(body.encode()), output=target.name, toolAccess=False), indent=2) + "\n")
