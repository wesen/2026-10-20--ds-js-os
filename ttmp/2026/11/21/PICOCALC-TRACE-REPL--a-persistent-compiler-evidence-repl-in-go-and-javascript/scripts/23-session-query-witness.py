#!/usr/bin/env python3
"""Run a cited metric and reuse its JS binding in a single long-lived service."""
import argparse
import json
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--address", default="http://127.0.0.1:3791")
    args = parser.parse_args()
    endpoint = urlsplit(args.address)
    if endpoint.hostname not in ("127.0.0.1", "::1", "localhost") or endpoint.scheme != "http":
        parser.error("choose a local trace service")

    def send(method, path, payload=None):
        data = None if payload is None else json.dumps(payload).encode()
        req = Request(args.address + path, data=data, method=method, headers={"Content-Type": "application/json"})
        with urlopen(req, timeout=20) as response:
            raw = response.read()
            return json.loads(raw) if raw else None

    def cell(path, source):
        before = time.monotonic_ns()
        result = send("POST", path + "/eval", {"source": source})
        elapsed = time.monotonic_ns() - before
        if not result["ok"]:
            raise RuntimeError(result)
        return {"source": source, "value": result.get("value"), "elapsedClientNS": elapsed}

    paths = []
    try:
        for _ in range(2):
            paths.append("/sessions/" + send("POST", "/sessions")["id"])
        setup = '''
const fn = a.variant("checked").function("row");
const middle = fn.timeline("middle");
const header = q.ir.instructions().opcode("load").resultType("i32").pointer(fn.argument(0)).count();
const measure = n => q.run(header.at(middle.at(n).after));
"ready"'''.strip()
        results = [cell(paths[0], setup)]
        caches = {"afterSetup": cell(paths[0], "q.cache()")["value"]}
        results.append(cell(paths[0], "const saved = [measure(73), measure(74)]; saved"))
        caches["afterFirstMeasurement"] = cell(paths[0], "q.cache()")["value"]
        results.append(cell(paths[0], "saved.map(x => x.value)"))
        caches["afterReadingBinding"] = cell(paths[0], "q.cache()")["value"]
        results.append(cell(paths[0], "[measure(73).value, measure(74).value]"))
        caches["afterRunningMetricAgain"] = cell(paths[0], "q.cache()")["value"]
        results.append(cell(paths[1], "typeof saved"))
        caches["otherSession"] = cell(paths[1], "q.cache()")["value"]
        if results[2]["value"] != [11, 6] or results[3]["value"] != [11, 6] or results[4]["value"] != "undefined":
            raise ValueError("unexpected result or session visibility")
        print(json.dumps({"unit": "one loopback HTTP call including serialization; uncontrolled single observation",
                          "steps": results, "cacheObservations": caches}, indent=2))
    finally:
        for path in paths:
            send("DELETE", path)


if __name__ == "__main__":
    main()
