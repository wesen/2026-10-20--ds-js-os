"""Stage a bounded editing session beside its pinned production compiler and optional P4 image."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import shutil

HERE = Path(__file__).resolve().parent
PREV, = HERE.parent.parent.glob("PICOCALC-FUNCTION-REBUILD--*/scripts/01-stage.py")
prior = runpy.run_path(str(PREV))
exact = prior["exact"]


def stage(work, board):
    prior["stage"](work, endpoint=True)
    candidate = work / "candidate"
    p = candidate / "incremental.js"
    text = p.read_text()
    text = exact(text, "function(profile, reactor) {", "function(profile, reactor, byteCapacity, entryCapacity) {")
    start = text.index("    function publish(source, items, bytes)")
    end = text.index("        build(source,", start)
    text = text[:start] + """    if (!Number.isSafeInteger(byteCapacity) || byteCapacity < 0 ||
        !Number.isSafeInteger(entryCapacity) || entryCapacity < 0) throw new RangeError("fragment budget");
    function publish(items) {
        const keep = new Map();
        let nativeBytes = 0;
        for (const [name, item] of items || []) {
            if (keep.size === entryCapacity) break;
            if (item.words.byteLength > byteCapacity - nativeBytes) continue;
            keep.set(name, item);
            nativeBytes += item.words.byteLength;
        }
        current = {items: keep, nativeBytes, revision: Object.freeze({})};
        return current.revision;
    }
    return {
        get revision() { return current?.revision; },
        get resident() { return {count: current?.items.size || 0, bytes: current?.nativeBytes || 0}; },
""" + text[end:]
    text = text[:text.index("                if (exact && current")] + text[text.index("                try {",text.index("                if (exact && current")):]
    text = exact(text, "exact = true, clock","clock")
    text = exact(text, "publish(source, items, bytes)", "publish(items)")
    text = exact(text, "publish(source, null, bytes)", "publish(null)")
    p.write_text(text)
    shutil.copyfile(HERE / "02-edits.js", candidate / "endpoint.js")
    if board:
        prior["p4_tree"](work, endpoint=True)
        main = work / "tree/picocalc-os/port/esp32p4/main"
        p = main / "typed_p4.c"
        p.write_text(p.read_text().split("#define PICOCALC_REBUILD_ENDPOINT 1")[0] + (HERE / "04-endpoint.c").read_text())
        cm = main / "CMakeLists.txt"
        anchor = "set(BUNDLE ${CMAKE_CURRENT_BINARY_DIR}/js_bundle.c)"
        stock_world = work / "stock/world.js"
        cm.write_text(exact(cm.read_text(),anchor,
            f'list(APPEND BUNDLE_EXTRA "rebuild/stock-world.js={stock_world}")\n'
            f'list(APPEND BUNDLE_EXTRA_DEPS "{stock_world}")\n' + anchor))
        shutil.copyfile(work / "editor-oracle.h", main / "editor-oracle.h")
    files = sorted(p for folder in ("stock", "candidate") for p in (work/folder).iterdir())
    (work / "sources.json").write_text(json.dumps({str(p.relative_to(work)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files},indent=2)+"\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path)
    parser.add_argument("--board", action="store_true")
    args = parser.parse_args()
    stage(args.work.resolve(), args.board)
