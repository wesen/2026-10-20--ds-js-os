#!/usr/bin/env python3
"""Run the original 26 JS modules in one named Goja session on an existing service."""

import argparse
import hashlib
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def request(addr, method, path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = Request(addr + path, method=method, data=data, headers={"Content-Type": "application/json"})
    try:
        with urlopen(req, timeout=60) as response:
            raw = response.read()
    except HTTPError as err:
        raw = err.read()
        if not raw:
            raise
    return json.loads(raw) if raw else {}


def sample(value):
    # A diff timeline can contain many kilobytes of byte-range citations.
    # Keep a deterministic commitment to its entire response and a readable sample.
    raw = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    if len(raw) <= 3500:
        return {"value": value}
    return {"jsonBytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
            "preview": raw[:900].decode(errors="replace")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--addr", default="http://127.0.0.1:3791")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    modules = sorted(next(root.glob("PICOCALC-TRACE-QUERY--*")).joinpath("scripts/examples").glob("*.mjs"))
    if len(modules) != 26:
        raise ValueError(f"expected 26 prior workbook modules, found {len(modules)}")
    sid = request(args.addr, "POST", "/sessions")["id"]
    base = "/sessions/" + sid
    def evaluate(source):
        return request(args.addr, "POST", base + "/eval", {"source": source})

    results = []
    try:
        setup = evaluate("""
            const run = a.variant("checked");
            const row = run.function("row");
            const middle = row.timeline("middle");
            const header = q.ir.instructions().opcode("load").resultType("i32")
                              .pointer(row.argument(0)).count();
            const workbookCtx = {q, a, run, row, middle, header, profiles, session: {}};
            'ready';
        """)
        if not setup.get("ok"):
            raise ValueError(f"workbook setup failed: {setup}")
        for n, module in enumerate(modules, start=1):
            function = module.read_text().split("export default ", 1)[1].strip()
            expression = f"({function})(workbookCtx)"
            if n not in (24, 25):
                expression = f"q.run({expression})"
            reply = evaluate(expression)
            record = {"example": n, "file": module.name, "ok": reply.get("ok", False)}
            record.update(sample(reply.get("value")) if record["ok"] else {"error": reply.get("error", reply)})
            results.append(record)
    finally:
        request(args.addr, "DELETE", base)
    artifact = json.dumps(results, ensure_ascii=False, indent=2) + "\n"
    if args.out:
        args.out.write_text(artifact)
    else:
        print(artifact, end="")
    print("Evaluated", len(results), "modules;", sum(entry["ok"] for entry in results), "returned a value.")
    return int(any(not entry["ok"] for entry in results))


if __name__ == "__main__":
    raise SystemExit(main())
