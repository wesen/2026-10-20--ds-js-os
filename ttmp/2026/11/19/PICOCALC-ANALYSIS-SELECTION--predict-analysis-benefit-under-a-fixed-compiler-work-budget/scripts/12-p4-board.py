"""Adapt the verified lab runner to the designated selector image and extra raw input."""
import hashlib
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
LAB, = HERE.parent.parent.glob("PICOCALC-COMPILER-LAB--*/scripts/04-board.py")


def replace(source, old, new):
    if source.count(old) != 1:
        raise ValueError(f"expected one runner anchor {old!r}")
    return source.replace(old, new)


if __name__ == "__main__":
    # Let the original argparse board interface handle its usual options.
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        from runpy import run_path
        run_path(str(LAB), run_name="__main__")
    work = Path(sys.argv[1]).resolve()
    ready = json.loads((work / "transfer-preflight.json").read_text())
    image = work / "build/picocalc-os-p4.bin"
    if hashlib.sha256(image.read_bytes()).hexdigest() != ready["firmware"]:
        raise ValueError("selector transfer build does not match preflight")
    native = (work / "synthetic.typed").is_file()
    runner = LAB.read_text()
    if native:
        runner = replace(runner, 'APPS = ("files", "agenda", "editor")',
                         'APPS = ("files", "agenda", "editor", "synthetic")')
    runner = replace(runner, '    duration=round(18+8.2*len(compilers)**2)',
                     '    duration=' + ("145" if native else "112"))
    command = f'    subprocess.run(["node", {str(HERE / "11-p4-oracle.mjs")!r}, work], check=True)'
    runner = replace(runner, '    oracle=json.loads((work/"oracle.json").read_text())',
                     command + '\n    oracle=json.loads((work/"oracle.json").read_text())')
    exec(compile(runner, str(LAB), "exec"), {"__file__": str(LAB), "__name__": "__main__"})
