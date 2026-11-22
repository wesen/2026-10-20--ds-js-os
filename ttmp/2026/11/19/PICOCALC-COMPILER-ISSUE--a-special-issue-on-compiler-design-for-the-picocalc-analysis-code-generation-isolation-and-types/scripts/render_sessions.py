#!/usr/bin/env python3
"""Render student session transcripts to Markdown and audit them.

For every sources/students/<round>/**/sN/session/*.jsonl this writes sN/transcript.md (a readable
transcript: prompts, the model's text and thinking, every tool call and a clipped result) and
collects an audit row: effective thinking level, tool calls, token use, and whether the student
read any path outside its own directory (which would contaminate a closed-book condition).

Usage: render_sessions.py --round round1
Writes sources/students/<round>/audit.json and audit.md.
"""
import argparse
import json
from pathlib import Path

TICKET = Path(__file__).resolve().parent.parent


def clip(text: str, limit: int) -> str:
    text = text.strip()
    return text if len(text) <= limit else text[:limit] + f"\n… [{len(text) - limit} more characters]"


def render(session: Path, student: Path) -> dict:
    row = {"dir": str(student.relative_to(TICKET)), "session": session.name, "tool_calls": 0,
           "outside_paths": [], "reads": [], "writes": [], "output_tokens": 0, "max_context_tokens": 0,
           "assistant_turns": 0, "thinking": None, "model": None, "model_ms": 0}
    out = [f"# Transcript: {row['dir']}", ""]
    for line in session.read_text().splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        kind = event.get("type")
        if kind == "model_change":
            row["model"] = f"{event.get('provider')}/{event.get('modelId')}"
            out.append(f"- model: `{row['model']}`")
        elif kind == "thinking_level_change":
            row["thinking"] = event.get("thinkingLevel")
            out.append(f"- thinking level: `{row['thinking']}`")
        elif kind == "session":
            out.append(f"- session: `{event.get('id')}` started {event.get('timestamp')}")
        elif kind == "message":
            message = event["message"]
            role = message.get("role")
            if role == "system":
                continue
            usage = message.get("usage") or {}
            if role == "assistant":
                row["assistant_turns"] += 1
                row["output_tokens"] += int(usage.get("output", 0) or 0)
                row["max_context_tokens"] = max(row["max_context_tokens"], int(usage.get("totalTokens", 0) or 0))
                row["model_ms"] += int(message.get("durationMs", 0) or 0)
            content = message.get("content")
            blocks = content if isinstance(content, list) else [{"type": "text", "text": str(content)}]
            out.append("")
            out.append(f"## {role}")
            for block in blocks:
                btype = block.get("type")
                if btype == "text":
                    limit = 1500 if role == "toolResult" else 6000
                    out.append("")
                    out.append(clip(block.get("text", ""), limit))
                elif btype == "thinking":
                    text = block.get("thinking") or block.get("text") or ""
                    if text.strip():
                        out.append("")
                        out.append("> **thinking**")
                        out.extend("> " + l for l in clip(text, 3000).splitlines())
                elif btype == "toolCall":
                    row["tool_calls"] += 1
                    name = block.get("name")
                    arguments = block.get("arguments") or {}
                    path = arguments.get("path") or arguments.get("file_path") or ""
                    if path:
                        # Sessions were recorded when this material lived in <ticket>/students; it now lives in
                        # <ticket>/sources/students. Map absolute paths from the old layout before judging them.
                        old_root, new_root = str(TICKET / "students"), str(TICKET / "sources" / "students")
                        mapped = path.replace(old_root, new_root, 1) if path.startswith(old_root) else path
                        resolved = (student / mapped).resolve() if not Path(mapped).is_absolute() else Path(mapped).resolve()
                        if student.resolve() not in resolved.parents and resolved != student.resolve():
                            row["outside_paths"].append(path)
                        (row["reads"] if name == "read" else row["writes"]).append(Path(path).name)
                    shown = {k: (clip(str(v), 300) if k in ("content", "new_string", "old_string", "newText", "oldText") else v)
                             for k, v in arguments.items()}
                    out.append("")
                    out.append(f"**tool call** `{name}` {json.dumps(shown, ensure_ascii=False)[:900]}")
    (student / "transcript.md").write_text("\n".join(out) + "\n")
    return row


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--round", required=True)
    args = parser.parse_args()
    round_dir = TICKET / "sources" / "students" / args.round
    rows = []
    for session in sorted(round_dir.glob("**/session/*.jsonl")):
        rows.append(render(session, session.parent.parent))
    (round_dir / "audit.json").write_text(json.dumps(rows, indent=2) + "\n")
    lines = [f"# Session audit for {args.round}", "",
             "| Session | Thinking | Turns | Tool calls | Output tokens | Largest context | Model time (s) | Read outside own directory |",
             "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |"]
    for r in rows:
        name = r["dir"].split("/", 3)[-1]
        lines.append(f"| {name} | {r['thinking']} | {r['assistant_turns']} | {r['tool_calls']} | {r['output_tokens']} | "
                     f"{r['max_context_tokens']} | {r['model_ms'] / 1000:.0f} | {', '.join(r['outside_paths']) or 'no'} |")
    (round_dir / "audit.md").write_text("\n".join(lines) + "\n")
    outside = [r for r in rows if r["outside_paths"]]
    print(f"{len(rows)} sessions rendered; {len(outside)} read outside their directory")
    for r in outside:
        print("  ", r["dir"], r["outside_paths"])


if __name__ == "__main__":
    main()
