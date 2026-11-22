"""Open a trace-REPL session that holds the Typed compiler, the ray tracer and the assembled worlds.

usage: python3 01-open-compiler-session.py PORT [--baseline REV]

Loads typed-wasm, typed-async, typed-world, typed-rv32 and typed-pie-loops from the working
tree. With --baseline REV it first loads typed-rv32.js from that git revision and keeps it
as `typedRv32Base`, so a session can compare a candidate backend with a fixed control.
Prints the session id. Bindings: raySource, worlds.{chess,editor,agenda,files}, sources{path: text}.
"""
import argparse, glob, os, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(__file__))
from repl_client import Session

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), *[".."] * 6))
OS = os.path.join(REPO, "picocalc-os")
W = os.path.join(OS, "worlds")

def world(name):
    with open(os.path.join(W, name, "source.list")) as f:
        parts = [line.strip() for line in f if line.strip()]
    return "\n".join(open(os.path.join(W, name, p)).read() for p in parts)

ap = argparse.ArgumentParser()
ap.add_argument("port", type=int)
ap.add_argument("--baseline")
args = ap.parse_args()
s = Session(args.port)
s.load(*(os.path.join(OS, "compiler", f) for f in ["typed-wasm.js", "typed-async.js", "typed-world.js"]))
if args.baseline:
    old = subprocess.run(["git", "-C", REPO, "show", f"{args.baseline}:picocalc-os/compiler/typed-rv32.js"],
                         check=True, capture_output=True, text=True).stdout
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as tmp:
        tmp.write(old)
    s.load(tmp.name)
    os.unlink(tmp.name)
    s.eval("globalThis.typedRv32Base = typedRv32; undefined")
s.load(os.path.join(OS, "compiler", "typed-rv32.js"), os.path.join(OS, "compiler", "typed-pie-loops.js"))
s.eval("globalThis.worlds = {}; globalThis.sources = {}; undefined")
s.bind_string("globalThis.raySource", open(os.path.join(W, "raytrace", "raytrace.typed")).read())
s.bind_string("worlds.chess", world("chess"))
s.bind_string("worlds.editor", world("editor"))
s.bind_string("worlds.agenda", open(os.path.join(W, "agenda", "reminder.typed")).read() + "\n" +
              open(os.path.join(W, "agenda", "entry.typed")).read())
s.bind_string("worlds.files", open(os.path.join(W, "files", "files.typed")).read())
for path in sorted(glob.glob(os.path.join(W, "**", "*.typed"), recursive=True)):
    s.bind_string(f"sources[{os.path.relpath(path, OS)!r}]", open(path).read())
print(s.sid)
