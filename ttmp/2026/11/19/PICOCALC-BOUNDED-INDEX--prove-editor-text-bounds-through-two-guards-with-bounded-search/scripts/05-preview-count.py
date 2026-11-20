#!/usr/bin/env python3
"""Count executed native charCodeAt checks inside the real Editor preview replay."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
DAY = HERE.parent.parent
REPO = HERE.parents[5]


def replace(text, a, b):
    if text.count(a) != 1:
        raise ValueError(f"expected a unique anchor: {a!r}")
    return text.replace(a, b)


def prepare(output):
    cji = REPO / "cji"
    replay, = (DAY.parent / "18").glob("PICOCALC-TYPED-WORLDS--*/scripts/02-check-editor-world.mjs")
    original_driver = replay.with_name("02-editor-world-driver.c")
    source = (cji / "tools/rv32/emu.c").read_text()
    source = replace(source, "static uint64_t hc_calls[128];",
                     "static uint64_t preview_reads, preview_steps;\n"
                     "static int preview_active;\nstatic uint64_t hc_calls[128];")
    source = replace(source, "case 1: flush_out();",
                     'case 1: flush_out(); fprintf(stderr, "INDEXCHECKS %llu %llu\\n",\n'
                     '        (unsigned long long)preview_reads, (unsigned long long)preview_steps);')
    source = replace(source, "\t\tsteps++;",
                     "\t\tsteps++;\n"
                     "\t\tif (i == 0x17a00013) preview_active = 1;\n"
                     "\t\telse if (i == 0x17b00013) preview_active = 0;\n"
                     "\t\telse if (preview_active) {\n"
                     "\t\t\tpreview_steps++;\n"
                     "\t\t\tif (i == 0x17900013) preview_reads++;\n\t\t}")
    native = output / "emu.c"
    native.write_text(source)
    emu = output / "rv32emu"
    subprocess.run(["cc", "-std=gnu11", "-O2", "-Wall", "-o", emu, native, "-lm"], check=True)
    for name in ("libc.o", "hostcalls.o", "softfloat.o"):
        shutil.copyfile(cji / "build/rv32" / name, output / name)
    driver = original_driver.read_text()
    driver = replace(driver, "#ifdef TEST_PREVIEW\n    for ",
                     '#ifdef TEST_PREVIEW\n    __asm__ volatile(".word 0x17a00013" ::: "memory");\n    for ')
    driver = replace(driver, "    }\n#endif\n#ifdef TEST_POS\n    key",
                     '    }\n    __asm__ volatile(".word 0x17b00013" ::: "memory");\n#endif\n#ifdef TEST_POS\n    key')
    (output / original_driver.name).write_text(driver)
    return emu, replay.read_text()


def replay_source(source, work, mode):
    for part in ("wasm", "rv32", "world"):
        target = work / "count" / mode / "typed" / (part + ".js")
        source = replace(source, f"'../../../../../../picocalc-os/compiler/typed-{part}.js'", repr(target.as_uri()))
    source = replace(source,
                     "const source = sources.map(name => readFileSync(join(editorDir, name), 'utf8') + '\\n').join('');",
                     f"const source = readFileSync({str(work / 'sources/editor/app.typed')!r}, 'utf8');")
    source = replace(source, "    const rv32 = execFileSync(emu, [driver, app], {encoding:'utf8',timeout:15000}).trim().split('\\n');",
                     "    const raw = execFileSync(emu, [driver, app], {encoding:'utf8',timeout:45000,stdio:['ignore','pipe','inherit']});\n"
                     "    console.error('INDEXSTDOUT '+createHash('sha256').update(raw).digest('hex'));\n"
                     "    const rv32 = raw.trim().split('\\n');")
    return "import {createHash} from 'node:crypto';\n" + source


def run(work, output, gcc, flavors):
    output.mkdir(parents=True)
    emu, source = prepare(output)
    receipt = {}
    for mode in ("current", "direct", "bounded"):
        replay = output / (mode + ".mjs")
        replay.write_text(replay_source(source, work, mode))
        for flavor in flavors:
            process = subprocess.run(["node", replay, gcc, emu, flavor], cwd=REPO,
                                     capture_output=True, text=True, timeout=90)
            (output / f"{mode}-{flavor[2:]}.stdout").write_text(process.stdout)
            (output / f"{mode}-{flavor[2:]}.stderr").write_text(process.stderr)
            if process.returncode:
                raise RuntimeError(process.stderr)
            report = json.loads(process.stdout)
            counts = re.findall(r"^INDEXCHECKS (\d+) (\d+)$", process.stderr, re.M)
            digests = re.findall(r"^INDEXSTDOUT ([0-9a-f]{64})$", process.stderr, re.M)
            assert report["inputBytes"] == 65536 and report["rv32Open"] and len(counts) == len(digests) == 1
            count, steps = map(int, counts[0])
            assert 0 < count < steps
            receipt.setdefault(flavor[2:], {})[mode] = {**report, "executedReadChecks": count,
                                                        "instrumentedPreviewSteps": steps, "semanticSha256": digests[0]}
    for flavor, rows in receipt.items():
        assert len({row["semanticSha256"] for row in rows.values()}) == 1, flavor
        assert rows["current"]["executedReadChecks"] == rows["direct"]["executedReadChecks"], flavor
        assert rows["bounded"]["executedReadChecks"] < rows["direct"]["executedReadChecks"], flavor
    print(json.dumps({"emulatorSourceSha256": hashlib.sha256((output / "emu.c").read_bytes()).hexdigest(),
                      "workloads": receipt}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("gcc")
    parser.add_argument("flavors", nargs="*", choices=["--preview-inline", "--preview-dense-inline"])
    args = parser.parse_args()
    run(args.work.resolve(), args.output.resolve(), args.gcc, args.flavors or ["--preview-inline", "--preview-dense-inline"])
