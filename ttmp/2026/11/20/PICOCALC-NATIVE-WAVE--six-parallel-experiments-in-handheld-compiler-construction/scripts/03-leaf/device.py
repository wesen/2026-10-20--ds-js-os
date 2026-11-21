"""Verify all three native arms through the release lab's locked restore runner."""
import argparse
from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import re
import shutil
import time

HERE = Path(__file__).resolve().parent
RELEASE = next(HERE.parents[2].glob("PICOCALC-RELEASE-LAB--*/scripts/chess/device.py"))
spec = importlib.util.spec_from_file_location("release_lab_device", RELEASE)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
ARMS = ("stock", "leaf", "inline")
CASES = (0, 4, 6, 14, 15)
HEADER = re.compile(rb"LEAF-BEGIN cases=5 repeats=3 hz=(\d+)")
ROW = re.compile(rb"LEAF-ROW ((?:-?\d+ ?){10})")


def capture(args, log, host):
    results = {}
    hz = None
    stop = time.monotonic() + 150
    with runner.serial.Serial(args.port, 115200, timeout=.2) as port:
        while time.monotonic() < stop:
            raw = port.readline()
            log.write(raw)
            line = raw.strip()
            if header := HEADER.fullmatch(line):
                if hz is not None:
                    raise ValueError("benchmark rebooted")
                hz = int(header[1])
            elif match := ROW.fullmatch(line):
                if hz is None:
                    raise ValueError("missing benchmark header")
                case, arm, rep, move, score, depth, nodes, slices, wall, ok = map(int, match[1].split())
                key = (case, arm, rep)
                if key in results or case not in CASES or not (0 <= arm < 3 and 0 <= rep < 3):
                    raise ValueError(f"invalid or duplicate row {line!r}")
                actual = dict(zip(runner.FIELDS, (move, score, depth, nodes, slices)))
                expected = {k:host["expected"][case]["result"][k] for k in runner.FIELDS}
                if not ok or actual != expected:
                    raise ValueError(f"unexpected output {line!r}")
                results[key] = {**actual, "wallUs":wall}
            elif line == b"LEAF-DONE ok":
                if len(results) != 45:
                    raise ValueError("incomplete companion run")
                return {"cpuHz":hz, "observations":len(results), "oracleDigest":host["digest"],
                        "rows":[{"case":case, "fixture":host["expected"][case]["name"],
                                 "depthRequested":host["expected"][case]["depth"],
                                 "budget":host["expected"][case]["budget"],
                                 "arms":{arm:[results[case,i,rep] for rep in range(3)]
                                          for i,arm in enumerate(ARMS)}} for case in CASES],
                        "armBuilds":args.arm_builds}
            elif line.startswith(b"LEAF-DONE"):
                raise ValueError(line)
    raise TimeoutError(f"three-arm trial incomplete: {len(results)}/45 rows")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ("build", "release", "output"):
        p.add_argument(name, type=Path)
    p.add_argument("--port", default="/dev/ttyACM0")
    p.add_argument("--esptool", type=Path, default=Path("/home/manuel/.espressif/python_env/idf5.4_py3.11_env/bin/esptool.py"))
    a = p.parse_args()
    main = a.build.parent / "main"
    a.arm_builds = {}
    for arm in ARMS:
        info = json.loads((main / f"engine-{arm}.json").read_text())
        assert info["rv32Sha256"] == sha256((main / f"engine-{arm}.bin").read_bytes()).hexdigest()
        a.arm_builds[arm] = info
    shutil.copyfile(main / "engine-stock.bin", main / "engine.bin")
    runner.capture = capture
    runner.run(a)


if __name__ == "__main__":
    main()
