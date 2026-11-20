#!/usr/bin/env python3
"""Materialize the paired real Editor sources and shared await-aware typed linker."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
DAY = HERE.parent.parent
REPO = DAY.parents[3]
REVISION = "dbe26be"
BACKEND = "532c5ed74ac6105b98c6a4609bae7f9c551f89e5a19ab36cd0e6faba91745e5b"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def replace(text, before, after):
    if text.count(before) != 1:
        raise ValueError(f"missing unique anchor {before!r}")
    return text.replace(before, after)


def await_linker(text):
    text = replace(text, "typedWasm.linkWorld(source, reactor, entries, imports, maxSourceLength)",
                   "typedWasm.linkWorld(typedAsync.lower(source).source, reactor, entries, imports, maxSourceLength)")
    return replace(text, "typedRv32.compile(source, imports, maxSourceLength, options)",
                   "typedRv32.compile(typedAsync.lower(source).source, imports, maxSourceLength, options)")


def editor_lane(reference, use_await):
    cancel_check = """    if (n === 6 && scratch.charCodeAt(0) === 99 && scratch.charCodeAt(1) === 97 &&
        scratch.charCodeAt(2) === 110 && scratch.charCodeAt(3) === 99 &&
        scratch.charCodeAt(4) === 101 && scratch.charCodeAt(5) === 108)
        return editorCancelOpen(state, output);
"""
    cancel = """function editorCancelOpen(state: WorldState, output: buffer): i32 {
    if (state.reading || state.readToken <= 0) return 0;
    const handle = state.offered;
    state.readToken = 0;
    state.offered = 0;
    state.offeredNameLength = 0;
    typedSdkRelease(handle);
    typedSdkReply(output, output.writeLiteral(0, "{\\"ok\\":false,\\"why\\":\\"Open canceled.\\"}"));
    return 0;
}

"""
    ask_check = "    if (!(n === 4)) return 0;\n"
    editor_start = "function editorOpen(state: WorldState, output: buffer): i32 {\n"
    if not use_await:
        return replace(replace(reference, editor_start, cancel + editor_start), ask_check, cancel_check + ask_check)

    editor_open, opened_fn = reference.index(editor_start), reference.index("function editorOpened(")
    base_open = reference[editor_open:opened_fn].split("    const pending = typedSdkBuffer(2);")[0]
    new_signature = "function editorOpen(event: WorldEvent, state: WorldState, output: buffer, hints: buffer): i32 {\n"
    base_open = replace(replace(base_open, editor_start, new_signature), ask_check, cancel_check + ask_check)
    new_open = base_open + "    return editorReadTaskStart(event, state, output, hints, handle);\n}\n\n"
    reference = reference[:editor_open] + reference[opened_fn:]

    # Keep the existing success and error continuation. Only the normalization
    # timer is still dispatched with the original readToken.
    prefix = """function editorReadDone(event: WorldEvent, state: WorldState, output: buffer, hints: buffer): i32 {
    state.readToken = 0;
    const doc = typedSdkBuffer(0);
    if (state.reading) return editorResumeRead(state, doc, output, hints);
    if (event.ok) return editorReadSuccess(state, output, hints);
"""
    helpers = """function editorReadDone(state: WorldState, output: buffer, hints: buffer): i32 {
    state.readToken = 0;
    return editorResumeRead(state, typedSdkBuffer(0), output, hints);
}

function editorReadNotStarted(handle: i32, output: buffer): i32 {
    typedSdkRelease(handle);
    typedSdkReply(output, output.writeLiteral(0, "{\\"ok\\":false,\\"why\\":\\"Cannot read file.\\"}"));
    return 0;
}

function editorReadFailure(state: WorldState, output: buffer, hints: buffer): i32 {
"""
    reference = replace(reference, prefix, helpers)
    cancel = replace(cancel, """    if (state.reading || state.readToken <= 0) return 0;
    const handle = state.offered;
    state.readToken = 0;
    state.offered = 0;
    state.offeredNameLength = 0;
""", """    const handle = editorReadTaskCancel(state);
    if (handle <= 0) return 0;
""")
    dispatch = "function typedWorldEvent("
    read_task = (HERE.parent / "sources/editor-read-task.typed").read_text()
    reference = replace(reference, dispatch, read_task + "\n" + cancel + new_open + dispatch)
    reference = replace(reference, "return editorOpen(state, output);", "return editorOpen(event, state, output, hints);")
    reference = replace(reference, "editorReadDone(event, state, output, hints);", "editorReadDone(state, output, hints);")
    read_block = """    if (event.kind === 4 && state.readToken > 0 && event.token === state.readToken) {
        editorReadDone(state, output, hints);
    }
"""
    reference = replace(reference, read_block, read_block + """    if (event.kind === 4 && editorReadTaskPending(state)) {
        editorReadTaskResume(event, state, output, hints);
    }
""")
    reference = replace(reference, "if (event.kind === 0 && state.readToken === 0)",
                        "if (event.kind === 0 && state.readToken === 0 && !editorReadTaskPending(state))")
    reference = replace(reference, "if (state.preview && state.readToken === 0)",
                        "if (state.preview && state.readToken === 0 && !editorReadTaskPending(state))")
    return replace(reference, "if (state.readToken > 0 || state.findToken > 0 || state.frameToken > 0)",
                   "if (editorReadTaskPending(state) || state.readToken > 0 || state.findToken > 0 || state.frameToken > 0)")


def stage(output, staged):
    output.mkdir(parents=True)
    if staged is None:
        recipe, = DAY.glob("PICOCALC-STAGED-RV32--*/scripts/01-stage.py")
        staged = output / "frozen"
        subprocess.run(["python3", "-B", recipe, staged], check=True)
    def frozen(part):
        return subprocess.check_output(["git", "-C", REPO, "show",
                                        f"{REVISION}:picocalc-os/worlds/editor/{part}"]).decode()
    parts = frozen("source.list").splitlines()
    last = parts[-1]
    assert last == "editor.typed"
    reference = frozen(last)
    rows = {}
    for name, candidate in (("manual", False), ("await", True)):
        lane = output / "lanes" / name
        shutil.copytree(staged / "lanes/staged/typed", lane / "typed")
        assert sha((lane / "typed/rv32.js").read_bytes()) == BACKEND
        shutil.copyfile(HERE / "02-typed-async.js", lane / "typed/async.js")
        linker = lane / "typed/world.js"
        linker.write_text(await_linker(linker.read_text()))
        editor = editor_lane(reference, candidate)
        (lane / "editor.typed").write_text(editor)
        combined = "".join(frozen(part) + "\n" for part in parts[:-1]) + editor + "\n"
        (lane / "world.typed").write_text(combined)
        rows[name] = {"sourceSha256": sha(combined.encode()), "compiler":
            {part.stem: sha(part.read_bytes()) for part in sorted((lane / "typed").glob("*.js"))}}
    (output / "inputs.json").write_text(json.dumps({"revision": REVISION, "lanes": rows}, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--staged", type=Path)
    args = parser.parse_args()
    stage(args.output.resolve(), args.staged.resolve() if args.staged else None)
