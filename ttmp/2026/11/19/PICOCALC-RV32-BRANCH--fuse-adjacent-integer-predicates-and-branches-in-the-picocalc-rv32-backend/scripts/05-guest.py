#!/usr/bin/env python3
"""Compare matched whole-driver RV32 instruction counts and stdout."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile


def command(*args, cwd=None):
    return subprocess.run(args, cwd=cwd, check=True, capture_output=True, timeout=90)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_hash(path):
    return digest(path.read_bytes())


def cross_compile(cc, flags, output, sources):
    command(cc, *flags, "-o", output, *sources)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("gcc", type=Path)
    parser.add_argument("emulator", type=Path)
    parser.add_argument("pair", type=Path)
    args = parser.parse_args()
    cc, emu, pair = (p.resolve(strict=True) for p in vars(args).values())
    root = Path(command("git", "rev-parse", "--show-toplevel").stdout.decode().strip())
    scripts = Path(__file__).resolve().parent
    os = root / "picocalc-os"
    sdk = os / "sdk"
    agenda, = root.glob("ttmp/2026/11/18/PICOCALC-AGENDA-COMPILER--*/scripts")
    editor, = root.glob("ttmp/2026/11/18/PICOCALC-TYPED-WORLDS--*/scripts")
    files, = root.glob("ttmp/2026/11/18/PICOCALC-TYPED-APPS--*/scripts")
    reactor_flags = [
        "-march=rv32imafc_zicsr_zifencei", "-mabi=ilp32f", "-Os", "-fPIC", "-shared",
        "-nostartfiles", "-nostdlib", "-e", "app_main", "-ffunction-sections", "-fdata-sections",
        "-Wl,--gc-sections", "-fvisibility=hidden", "-Wl,--strip-all", "-Wl,-z,max-page-size=16",
        "-Wno-attributes", "-I", sdk,
    ]
    driver_flags = [
        "-march=rv32im", "-mabi=ilp32", "-O2", "-fno-builtin", "-msmall-data-limit=0",
        "-mno-relax", "-nostdlib", "-Wl,-Ttext=0x10000", "-Wl,-e,_start", "-I", sdk,
    ]
    hostcalls = [emu.parent / name for name in ("libc.o", "hostcalls.o", "softfloat.o")]
    lanes = ("baseline", "candidate")
    outcomes = {}
    linked = {}

    def link(app, reactor, work):
        result = command("node", scripts / "03-apps.mjs", "link", pair, app, reactor, work, cwd=root)
        receipt = json.loads(result.stdout)
        if app in linked:
            assert receipt == linked[app]
        linked[app] = receipt
        return {lane: (work / (lane + ".elf")).read_bytes() for lane in lanes}

    def measure(work, driver, modules, name, end_marker, copies=1):
        module = work / name
        result = {"driverSha256": file_hash(driver), "runs": []}
        for order in (lanes, lanes[::-1]):
            for lane in order:
                module.write_bytes(modules[lane])
                run = command("env", "RV32_STEPS=1", emu, driver, *[name] * copies, cwd=work)
                match = re.search(rb"rv32emu: (\d+) instructions", run.stderr)
                if not match or not run.stdout.rstrip().endswith(end_marker):
                    raise RuntimeError((run.stdout, run.stderr))
                result["runs"].append({
                    "lane": lane, "instructions": int(match[1]), "stdoutBytes": len(run.stdout),
                    "stdoutSha256": digest(run.stdout),
                })
        assert len({entry["stdoutSha256"] for entry in result["runs"]}) == 1
        for lane in lanes:
            assert len({r["instructions"] for r in result["runs"] if r["lane"] == lane}) == 1
        result["finalLine"] = end_marker.decode()
        return result

    with tempfile.TemporaryDirectory(prefix="picocalc-branch-guest-") as temp:
        work = Path(temp)
        for app, reactor_source, driver_source, end_marker in [
            ("files", "world.c", files / "02-files-rv32-driver.c",
             b"Files RV32 startup, directory sorting, rounding, and mkdir passed"),
            ("agenda", "wasm-world.c", agenda / "08-rv32-world-runner.c",
             b"frames=3 reminders=1 writes=4 durable_restart=pass grouped_navigation=pass "
             b"mutations=pass editor=pass diagnostics=pass refresh=pass"),
        ]:
            directory = work / app
            directory.mkdir()
            source = os / "worlds" / app
            reactor = directory / "reactor.elf"
            cross_compile(cc, reactor_flags, reactor, [source / reactor_source, source / "rv32-slot.S", sdk / "nw_elf.c"])
            modules = link(app, reactor, directory)
            driver = directory / "driver.elf"
            cross_compile(cc, driver_flags, driver, [driver_source, *hostcalls])
            outcomes[app] = measure(directory, driver, modules, app + ".so", end_marker, 2 if app == "agenda" else 1)

        for workload in ("--edit", "--large", "--preview-dense-inline", "--late-navigation"):
            directory = work / workload[2:]
            directory.mkdir()
            check = command("env", f"TMPDIR={directory}", "node", editor / "02-check-editor-world.mjs",
                            cc, emu, workload, "--keep-fixture", cwd=root)
            fixture, = directory.glob("typed-editor-reactor-*")
            modules = link("editor", fixture / "reactor.so", directory)
            assert (fixture / "editor.so").read_bytes() == modules["baseline"], "baseline fixture used a different backend"
            outcomes["editor/" + workload[2:]] = measure(
                directory, fixture / "driver.elf", modules, "editor.so",
                b"Typed Editor startup, file read, missing file, and grant release passed",
            )
            outcomes["editor/" + workload[2:]]["fixture"] = json.loads(check.stdout)

    print(json.dumps({
        "metric": "all guest instructions from entry to exit, including driver, reactor and typed app",
        "ordering": ["baseline", "candidate", "candidate", "baseline"],
        "gcc": command(cc, "--version").stdout.decode().splitlines()[0],
        "emulatorSha256": file_hash(emu),
        "supportObjects": {p.name: file_hash(p) for p in hostcalls},
        "linked": linked,
        "workloads": outcomes,
    }, indent=2))


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(f"{error.cmd}\n{error.stdout.decode(errors='replace')}\n{error.stderr.decode(errors='replace')}")
