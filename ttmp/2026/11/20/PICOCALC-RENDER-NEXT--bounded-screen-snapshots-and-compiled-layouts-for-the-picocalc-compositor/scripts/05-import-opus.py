"""Import the public design text and diary from the commissioned Claude CLI response."""
import argparse
import hashlib
import json
from pathlib import Path

ticket = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("design_response", type=Path)
parser.add_argument("survey_response", type=Path)
args = parser.parse_args()


def read_result(path):
    messages = json.loads(path.read_text())
    result = next(m for m in reversed(messages) if m.get("type") == "result") if isinstance(messages, list) else messages
    if result.get("is_error") or not any("opus" in name for name in result["modelUsage"]):
        raise ValueError(f"Expected successful Opus response from {path}")
    return result


def import_body(folder, name, text):
    path, = (ticket / folder).glob(name)
    old = path.read_text()
    header, body = old.split("\n---\n", 1)
    if "<!--" not in body:
        raise ValueError(f"Refusing to replace edited document {path}")
    path.write_text(header + "\n---\n\n" + text.strip() + "\n")


design = read_result(args.design_response)
survey = read_result(args.survey_response)
article, diary = design["result"].split("===LAB RECORD===")
import_body("design-doc", "01-*.md", article)
import_body("reference", "02-*.md", "# Opus research design record\n\n" + diary.strip())
receipt = {
    label: {
        "effort": "xhigh", "modelsInResponse": sorted(result["modelUsage"]),
        "publicTextSha256": hashlib.sha256(result["result"].encode()).hexdigest()
    }
    for label, result in [("design", design), ("survey", survey)]
}
(ticket / "various" / "opus-authorship.json").write_text(json.dumps(receipt, indent=2) + "\n")
(ticket / "various" / "opus-literature.txt").write_text(survey["result"].strip() + "\n")
