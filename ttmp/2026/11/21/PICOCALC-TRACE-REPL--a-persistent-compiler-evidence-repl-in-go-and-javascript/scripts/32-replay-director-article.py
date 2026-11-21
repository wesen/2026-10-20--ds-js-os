#!/usr/bin/env python3
"""Run the actual JavaScript blocks in the director's manuscript in one session."""
import argparse
import json
import re
from pathlib import Path
from urllib.request import Request, urlopen


def request(method, url, value=None):
    data = None if value is None else json.dumps(value).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    with urlopen(Request(url, method=method, data=data, headers=headers), timeout=30) as response:
        payload = response.read()
    return json.loads(payload) if payload else {}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--addr", default="http://127.0.0.1:3792")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    ticket = Path(__file__).resolve().parent.parent
    manuscript, = (ticket / "analysis").glob("05-*.md")
    cells = re.findall(r"^```js\n(.*?)^```$", manuscript.read_text(), re.M | re.S)
    session_url = args.addr + "/sessions"
    session_url += "/" + request("POST", session_url)["id"]
    try:
        results = []
        for source in cells:
            reply = request("POST", session_url + "/eval", {"source": source})
            if not reply.get("ok"):
                raise ValueError(reply)
            results.append(reply["value"])
        change, blocks = results
        assert (change["from"], change["ordinal"], change["delta"]) == (73, 74, -5)
        assert len(blocks) == len({r["block"] for r in blocks}) == 6
        assert all(len(row["rawRows"]) == 2 for row in blocks)
        outcome = {"article": manuscript.name, "publicCells": len(cells), "results": results}
        data = json.dumps(outcome, ensure_ascii=False, indent=2) + "\n"
        if args.out:
            args.out.write_text(data)
        else:
            print(data, end="")
    finally:
        request("DELETE", session_url)


if __name__ == "__main__":
    main()
