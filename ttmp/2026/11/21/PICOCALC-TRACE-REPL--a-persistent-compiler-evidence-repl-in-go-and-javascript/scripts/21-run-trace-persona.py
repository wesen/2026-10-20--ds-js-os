#!/usr/bin/env python3
"""Run one blind Pi/DeepSeek session. Retain public actions and the final debrief only."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import time
from urllib.request import Request, urlopen

SCRIPTS = Path(__file__).resolve().parent
MODEL = "deepseek-4.1-flash"

def request(url, method):
    with urlopen(Request(url, method=method), timeout=10) as response:
        return response.read()

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("card", choices=["catalog", "pass", "ablation", "allocator"])
    p.add_argument("receipt", type=Path)
    p.add_argument("--port", default=3791, type=int)
    p.add_argument("--build", required=True, help="Git revision or binary SHA for the serving process")
    p.add_argument("--provider-extension", type=Path,
                   default=Path.home() / ".pi/agent/npm/node_modules/@lunaroute/pi-extension")
    args = p.parse_args()
    if not 1 <= args.port <= 65535:
        p.error("--port must be a valid TCP port")
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    if args.receipt.exists():
        p.error("choose a new receipt path so an earlier run stays intact")
    origin = f"http://127.0.0.1:{args.port}/sessions"
    session = json.loads(request(origin, "POST"))["id"]
    endpoint = f"{origin}/{session}"
    result = {"provider": "lunaroute", "model": MODEL, "thinking": "high", "card": args.card,
              "build": args.build, "limit": 14, "steps": [], "answer": "", "errors": []}
    cmd = ["pi", "--mode", "json", "--no-session", "--no-extensions", "--no-mcp",
           "--no-context-files", "--no-skills", "--no-prompt-templates", "--no-builtin-tools",
           "--extension", str(args.provider_extension), "--extension", str(SCRIPTS / "20-trace-persona-tool.ts"),
           "--tools", "trace_eval", "--provider", "lunaroute", "--model", MODEL, "--thinking", "high",
           "--trace-session", endpoint + "/eval", "--system-prompt", str(SCRIPTS / "personas/brief.md"),
           "--print", (SCRIPTS / "personas" / f"{args.card}.md").read_text()]
    active = {}
    begun = time.monotonic()
    def checkpoint():
        result["seconds"] = round(time.monotonic() - begun, 2)
        temporary = args.receipt.with_suffix(".tmp")
        temporary.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
        temporary.replace(args.receipt)
    try:
        checkpoint()
        # A private empty cwd and disabled context discovery keep the task key out of the prompt.
        with tempfile.TemporaryDirectory(prefix="trace-persona-") as work:
            proc = subprocess.Popen(["timeout", "--kill-after=5", "480", *cmd], cwd=work,
                                    stdout=subprocess.PIPE, text=True)
            for line in proc.stdout:
                try:
                    e = json.loads(line)
                except ValueError:
                    continue
                t = e.get("type")
                if t == "tool_execution_start":
                    step = {"tool": e["toolName"], "source": e["args"].get("source", "")}
                    active[e["toolCallId"]] = step
                    result["steps"].append(step)
                    checkpoint()
                elif t == "tool_execution_end":
                    step = active.get(e["toolCallId"])
                    if step is not None:
                        r = e.get("result", {})
                        step.update(reply="".join(i["text"] for i in r.get("content", []) if i.get("type") == "text"),
                                    error=e.get("isError", False), details=r.get("details", {}))
                        checkpoint()
                elif t == "message_end":
                    m = e.get("message", {})
                    if m.get("role") == "assistant":
                        result["observedModel"] = m.get("model")
                        result["observedProvider"] = m.get("provider")
                        if m.get("errorMessage"):
                            result["errors"].append(m["errorMessage"])
                        if m.get("stopReason") != "toolUse":
                            final = "".join(b.get("text", "") for b in m.get("content", []) if b.get("type") == "text")
                            if final:
                                result["answer"] = final
            result["exit"] = proc.wait()
    finally:
        try:
            request(endpoint, "DELETE")
        finally:
            checkpoint()
    print(f"{args.card}: {len(result['steps'])} calls, {result['seconds']}s, "
          f"answer={bool(result['answer'])}, exit={result.get('exit')}")
    if result.get("exit") or not result["steps"] or not result["answer"]:
        raise SystemExit(1)
if __name__ == "__main__":
    main()
