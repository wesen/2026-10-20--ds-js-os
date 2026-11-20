"""Run the shared 3D board protocol with packed-scene identity and paired measurements."""
import re
from pathlib import Path
from statistics import median
import time


def sample(console, name, crc):
    cursors = {"e2": 52, "e3": 44, "f3": 45}
    waiting = list(console.command("chesspacked"))
    result = {}
    benchmark = re.compile(r"chess3d-paired cursor=(\d+) count=(\d+) equal=yes fnv=([0-9a-f]{8}) core=(\d+)")
    timing = re.compile(r"chess3d-cycles arm=(raw-pie|guarded-rv32) calls=(\d+) ([0-9 ]+)")
    deadline = time.monotonic() + 10
    while len(result) < 3:
        line = waiting.pop(0) if waiting else console.line(deadline).decode(errors="replace")
        if match := benchmark.fullmatch(line):
            cursor, words, command, core = match.groups()
            if int(cursor) != cursors[name] or command != crc:
                raise ValueError(f"{name} paired benchmark selected a different retained scene: {line}")
            result["scene"] = {"cursor": int(cursor), "words": int(words), "fnv": command, "core": int(core)}
        elif match := timing.fullmatch(line):
            arm, calls, raw = match.groups()
            samples = list(map(int, raw.split()))
            if int(calls) != 8 or len(samples) != 11:
                raise ValueError(f"{name} unexpected benchmark sample dimensions: {line}")
            result[arm] = {"callsPerSample": int(calls), "samples": samples, "median": median(samples)}
        elif line.startswith("chess3d-paired"):
            raise ValueError(line)
    return result


def inject(source, old, new):
    if source.count(old) != 1:
        raise ValueError("Frozen board protocol integration anchor changed")
    return source.replace(old, new, 1)


base = Path(__file__).resolve().parent.parent / "scene/device.py"
source = base.read_text()
source = inject(source, "    result = {\"firmware\":serial.digest(candidate),",
                """    if args.preflight:
        print(json.dumps({"firmware": serial.digest(candidate), "release": RELEASE_SHA,
                          "linked": serial.digest(linked), "source": serial.digest(source)}))
        return
    result = {"firmware":serial.digest(candidate),""")
source = inject(source, "            result[\"bootPainter\"] = painter(c)",
                """            until = time.monotonic() + 18
            result["bootPainter"] = painter(c)
            while not result["bootPainter"]["installed"] and not result["bootPainter"]["rejects"] and time.monotonic() < until:
                time.sleep(.15)
                result["bootPainter"] = painter(c)
            if not result["bootPainter"]["installed"] or result["bootPainter"]["rejects"]:
                raise RuntimeError(f"packed painter failed to install: {result['bootPainter']}")""")
source = inject(source, "                previous = native", r"""                previous = native
                position = {"e2": 52, "e3": 44, "f3": 45}[name]
                witness = re.findall(
                    rb"chess3d-packed-arm=paired cursor=" + str(position).encode() +
                    rb" count=(\d+) stride=192 capacity=82 witness=abcd draw-fnv=([0-9a-f]{8})",
                    uart.read_bytes())
                if not witness:
                    raise ValueError(f"{name} packed projection witness missing")
                count, crc = witness[-1]
                shot["witness"] = {"value": "abcd", "stride": 192, "capacity": 82, "words": int(count)}
                shot["paired"] = sample(c, name, crc.decode())
                save()""")
source = inject(source, 'chess3d-target=pie source-bytes=', 'chess3d-packed-target=paired source-bytes=')
source = inject(source, '"linkedScalarHostSha256"', '"linkedPackedHostSha256"')
source = inject(source, 'differs from stock host identity', 'differs from the staged paired host identity')
source = inject(source, '    def interrupted(*_):', '    p.add_argument("--preflight", action="store_true")\n    def interrupted(*_):')
exec(compile(source, str(base), "exec"), {"__name__": "__main__", "__file__": str(base), "sample": sample})
