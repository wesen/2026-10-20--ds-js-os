#!/usr/bin/env python3
"""Rebuild the four compiler lanes, verify and benchmark under frozen Linux QuickJS."""

import argparse
import hashlib
import json
from pathlib import Path
import platform
import re
from statistics import median
import subprocess
import tarfile
from tempfile import TemporaryDirectory

from variants import LANES, frontend, native

REVISION = "dd69a81cbf91ebf00e1f527bcbbf785697b1c9a4"
HERE = Path(__file__).resolve().parent
ROOT = next(path for path in HERE.parents if (path / ".git").exists())
QJS = "picocalc-os/third_party/quickjs"


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def frozen(path):
    return git("show", f"{REVISION}:picocalc-os/{path}").decode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def joined(directory, files):
    return "".join(frozen(f"worlds/{directory}/{file}") + "\n" for file in files)


def fixtures():
    params = ", ".join(f"p{i}: i32" for i in range(9))
    over_args = f"function oversized({params}): i32 {{ return p0; }}\n"
    fields = "".join(f"f{i}: i32;" for i in range(35))
    locals_ = "".join(f"const x{i} = {i};" for i in range(131))
    functions = "".join(f"function f{i}(): i32 {{ return {i}; }}\n" for i in range(135))
    wide = (
        f"record R {{ {fields} }}\n" + functions
        + f"function wide(r: R, b: buffer): i32 {{ {locals_} r.f34 = -2147483648;"
        + f" b.writeLiteral(0, {json.dumps('x' * 70 + 'é💡')});"
        + " let i = 0; while (i < 3) { i = i + 1; }"
        + " if (i === 3 && r.f34 < 0) return x130 + f134() + typedSdkYield();"
        + " return b.charCodeAt(72) / -3; }"
    )
    return {
        "wide-operands": (wide, True, None),
        "type-error": ("function f(): i32 { return true; }", False, "expected i32, got bool"),
        "forward-call": ("function f(): i32 { return g(); } function g(): i32 { return 1; }",
                         False, "unknown function g"),
        "native-arity": (over_args, False, "RV32 supports up to eight register arguments"),
        "error-order": (over_args + "function later(): i32 { return true; }", False,
                        "expected i32, got bool"),
    }


def setup(temp):
    archive = temp / "engine.tar"
    archive.write_bytes(git("archive", REVISION, QJS))
    with tarfile.open(archive) as package:
        package.extractall(temp, filter="data")
    engine = temp / QJS
    version = (engine / "VERSION").read_text().strip()
    compiler = ["cc", "-O2", "-D_GNU_SOURCE", f'-DCONFIG_VERSION="{version}"']
    sources = ["quickjs.c", "libregexp.c", "libunicode.c", "cutils.c", "dtoa.c"]
    subprocess.run([
        *compiler, "-I", str(engine), str(HERE / "quickjs-runner.c"),
        *(str(engine / path) for path in sources), "-lm", "-lpthread", "-o", str(temp / "qjs"),
    ], check=True)

    wasm = frozen("compiler/typed-wasm.js")
    rv32 = frozen("compiler/typed-rv32.js")
    for lane in LANES:
        (temp / f"{lane}.js").write_text(frontend(wasm, lane) + native(rv32, lane))
        (temp / f"{lane}-replay.js").write_text(frontend(wasm, lane) + native(rv32, lane, with_replay=True))
    rows = re.findall(r'\["(typedSdk\w+)", "([^"]*)", "(\w+)"\]', frozen("compiler/typed-world.js"))
    if len(rows) != 28 or rows[8] != ("typedSdkYield", "", "i32"):
        raise ValueError("Frozen world import signatures changed")
    imports = [dict(name=name, params=params.split(",") if params else [], result=result)
               for name, params, result in rows]
    return {
        "quickjsVersion": version,
        "quickjsTree": git("rev-parse", f"{REVISION}:{QJS}").decode().strip(),
        "cc": subprocess.check_output(["cc", "--version"], text=True).splitlines()[0],
        "ccFlags": compiler[1:],
        "originalCompilerSha256": {"typed-wasm.js": sha(wasm.encode()), "typed-rv32.js": sha(rv32.encode())},
        "generatedCompilerSha256": {lane: sha((temp / f"{lane}.js").read_bytes()) for lane in LANES},
        "replayCompilerSha256": {lane: sha((temp / f"{lane}-replay.js").read_bytes()) for lane in LANES},
    }, imports


def invoke(temp, source, imports, phase, rounds=1, rotation=0, cpu=None):
    (temp / "input.typed").write_text(source)
    (temp / "imports.json").write_text(json.dumps(imports))
    command = [
        str(temp / "qjs"), str(temp), str(HERE / "driver.js"), str(temp / "input.typed"),
        str(temp / "imports.json"), phase, str(rounds), str(rotation),
    ]
    if cpu is not None:
        command = ["taskset", "-c", str(cpu), *command]
    return [line.split("\t") for line in subprocess.check_output(command, text=True).splitlines()]


def verify(temp, source, imports, rejected=None):
    lanes = {lane: json.loads(data) for lane, data in invoke(temp, source, imports, "verify")}
    full_lanes = {lane: json.loads(data)
                  for lane, data in invoke(temp, source, imports, "verify-full")}
    for lane, row in lanes.items():
        if {key: value for key, value in row.items() if key != "frontend"} != full_lanes[lane]:
            raise AssertionError(f"Timed and replay compiler bundles disagree in {lane}")
    if rejected:
        baseline = lanes["bytes"]
        if (baseline.get("errorClass") != "SyntaxError"
                or rejected not in baseline.get("error", "") or any(row != baseline for row in lanes.values())):
            raise AssertionError(lanes)
        return baseline
    if any("compiled" not in row for row in lanes.values()):
        raise AssertionError(lanes)
    baseline = lanes["bytes"]["compiled"]
    if any(row["compiled"] != baseline for row in lanes.values()):
        raise AssertionError("Native image or metadata differs between compiler lanes")
    image = bytes.fromhex(baseline["hex"])
    meta = baseline["metadata"]
    return {
        "sourceBytes": len(source.encode()),
        "sourceSha256": sha(source.encode()),
        "imageBytes": len(image),
        "imageSha256": sha(image),
        "metadataSha256": sha(json.dumps(meta, sort_keys=True, separators=(",", ":")).encode()),
        "relocationCount": len(meta["relocations"]),
        "importCount": meta["importCount"],
        "recordCount": len(meta["records"]),
        "entryCount": len(meta["entries"]),
        "verifiedLanes": list(lanes),
        "frontend": {lane: row["frontend"] for lane, row in lanes.items() if "frontend" in row},
    }


def measurements(temp, source, imports, rotations, rounds, cpu):
    results = {}
    for phase in ("full", "front", "lower"):
        full = phase == "full"
        repeats = {lane: [] for lane in LANES[:4 if full else 3]}
        first_calls = {lane: [] for lane in repeats}
        compiler_load = {lane: [] for lane in repeats}
        for rotation in range(rotations):
            for kind, lane, auxiliary, ms in invoke(temp, source, imports, phase, rounds, rotation, cpu):
                if kind == "first":
                    first_calls[lane].append(float(ms))
                    compiler_load[lane].append(float(auxiliary))
                else:
                    repeats[lane].append(float(ms))
        results[phase] = {
            lane: {
                "compilerLoadMs": compiler_load[lane],
                "firstCallMs": first_calls[lane],
                "repeatMs": samples,
                "repeatMedianMs": median(samples),
                "pairedRatioMedian": median(a / b for a, b in zip(samples, repeats["bytes"], strict=True)),
            }
            for lane, samples in repeats.items()
        }

    results["heap"] = {
        lane: dict(initial=int(initial), peak=int(peak), resultLive=int(live), extraPeak=int(peak) - int(initial))
        for lane, initial, peak, live in invoke(temp, source, imports, "memory", cpu=cpu)
    }
    return results


def intent_probe(temp):
    boolean = "function f(): i32 { const x: bool = true; return 0; }"
    integer = "function f(): i32 { const x: i32 = 1; return 0; }"
    inspect = lambda source: {lane: json.loads(value)
                              for lane, value in invoke(temp, source, [], "inspect")}
    before, after = inspect(boolean), inspect(integer)
    if before != after or before["packed"]["code"] != [65, 1, 33, 0, 65, 0, 11]:
        raise AssertionError("Expected the emitted operations to erase the local's source type")
    return {"boolean": boolean, "integer": integer, "identicalFunctionRepresentations": before}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--rounds", type=int, default=16)
    parser.add_argument("--rotations", type=int, default=4)
    parser.add_argument("--cpu", type=int)
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    if args.rounds < 1 or args.rotations < 1:
        parser.error("--rounds and --rotations must be positive")

    with TemporaryDirectory(prefix="picocalc-representation-") as directory:
        temp = Path(directory)
        engine, imports = setup(temp)
        editor_files = frozen("worlds/editor/source.list").splitlines()
        corpus = {
            "files": (joined("files", ["files.typed"]), []),
            "agenda-reminder-entry": (joined("agenda", ["reminder.typed", "entry.typed"]), []),
            "editor": (joined("editor", editor_files), imports),
        }
        result = {
            "revision": REVISION, "engine": engine, "host": platform.platform(),
            "schedule": {"cpu": args.cpu, "rounds": args.rounds, "rotations": args.rotations,
                         "warmupsPerProcess": 2},
            "verification": {}, "measurements": {},
        }
        for name, (source, source_imports) in corpus.items():
            print(f"verifying {name}", flush=True)
            result["verification"][name] = verify(temp, source, source_imports)
        for name, (source, world_imports, rejected) in fixtures().items():
            result["verification"][name] = verify(temp, source, imports if world_imports else [], rejected)
        result["sourceIntentProbe"] = intent_probe(temp)
        if not args.verify_only:
            for name, (source, source_imports) in corpus.items():
                print(f"benchmarking {name}", flush=True)
                result["measurements"][name] = measurements(
                    temp, source, source_imports, args.rotations, args.rounds, args.cpu)
        args.receipt.write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
