"""Launch Chess, play e2e4, measure the reply, and restore the original app partition."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import runpy
import signal

HERE = Path(__file__).resolve().parent
DAY = HERE.parents[1]
QUAL, = DAY.parent.glob("19/PICOCALC-EG-QUAL--*/scripts/03-board-qualification.py")
METHOD = runpy.run_path(str(QUAL))
BOARD = METHOD["BOARD"]
COMPILE = re.compile(r"chess compile source=bundle status=ok us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)")
RUN = re.compile(r"^CHESSRUN e2e4 b8c6 (-?\d+(?: +-?\d+){9})$", re.M)
FIELDS = ("depth", "nodes", "score", "white_frame_us", "reply_wall_us", "world_cpu_us",
          "engine_us", "kernel_render_us", "segments", "settlements")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def chess_record(log):
    attempts = RUN.findall(log)
    if "CHESSBAD" in log or "CHESSARM e2e4" not in log or len(attempts) != 1:
        raise ValueError("the Chess observer did not see a complete e2e4 / b8c6 exchange")
    row = dict(zip(FIELDS, map(int, attempts[0].split()), strict=True))
    if (row["depth"], row["nodes"], row["score"], row["settlements"]) != (3, 1600, 12, 78):
        raise ValueError(f"Chess differs from the shared-reactor host oracle: {row}")
    if not (0 < row["white_frame_us"] < row["reply_wall_us"]
            and row["engine_us"] > 0 and row["kernel_render_us"] > 0
            and row["engine_us"] + row["kernel_render_us"] <= row["world_cpu_us"] <= row["reply_wall_us"]
            and row["settlements"] < row["segments"]):
        raise ValueError(f"inconsistent Chess timing/counter boundaries: {row}")
    row["after_white_frame_us"] = row["reply_wall_us"] - row["white_frame_us"]
    row["white"] = "e2e4"
    row["black"] = "b8c6"
    return row


def check_inputs(a):
    original = a.backup / "factory-original.bin"
    if original.stat().st_size != 8 * 1024 * 1024:
        raise ValueError("the original 8 MiB app partition backup is required")
    table = (a.backup / "partition-table.bin").read_bytes()
    actual = (a.image / "partition-table.bin").read_bytes()
    if not table or actual.ljust(len(table), b"\xff") != table:
        raise ValueError("Chess image and original partition tables differ")
    build = json.loads((a.image / "build.json").read_text())
    image = a.image / "picocalc-os-p4.bin"
    if digest(image) != build["firmwareSha256"]:
        raise ValueError("Chess image does not match its build receipt")
    manifest = json.loads((a.image / "system.typed-agenda.json").read_text())
    chess, = (w for w in manifest["worlds"] if w["name"] == "chess")
    engine = {"rv32": "native", "wasm": "wasm"}[build["target"]]
    if chess["file"] != "chess/compiled.bin" or chess["engine"] != engine:
        raise ValueError("Chess image has an unexpected world manifest")
    return original, image, build, engine


def complete_world_list(log):
    # The UART capture can end inside a large response, especially while boot logs are arriving.
    for line in reversed(log.splitlines()):
        if line.startswith('[{"name":'):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("image", "output", "backup", "esptool"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--port", default="/dev/ttyACM0")
    parser.add_argument("--preflight", action="store_true", help="validate both images without opening the serial port")
    a = parser.parse_args()
    a.esptool_python = a.esptool.parent / "python"
    original, image, build, engine = check_inputs(a)
    if a.preflight:
        print(json.dumps({"build": build, "backupSha256": digest(original)}, indent=2))
        return
    a.output.mkdir(parents=True)
    receipt = {"build": build, "backupSha256": digest(original), "restored": False}

    def save():
        METHOD["write_json"](a.output / "physical.json", receipt)

    def capture(label, duration, commands, **kwargs):
        return BOARD["capture"](a.port, a.output, label, duration, commands, **kwargs)

    def query_worlds(label):
        for attempt in range(1, 3):
            apps = complete_world_list(capture(f"{label}-{attempt}", 9, ["0.3 worlds"]))
            if apps is not None:
                return apps
        raise ValueError("two settled world-list captures had incomplete JSON")

    def interrupted(signum, _):
        raise SystemExit(128 + signum)

    save()
    signal.signal(signal.SIGTERM, interrupted)
    try:
        BOARD["flash"](a, a.output, image, "chess")
        boot = capture("boot", 25, ["0.6 reboot"])
        compiles = COMPILE.findall(boot)
        if not compiles:
            raise ValueError("missing Chess source compile completion")
        compile_us, peak, size = map(int, compiles[-1])
        receipt["compile"] = {"wall_us": compile_us, "peak_js_bytes": peak, "module_bytes": size}
        save()

        chess, = (w for w in query_worlds("worlds") if w["name"] == "chess")
        if chess["engine"] != engine or chess["last_error"]:
            raise ValueError(f"Chess did not start on {engine}: {chess}")
        receipt["worldBeforePlay"] = {k: chess[k] for k in ("engine", "file", "last_error")}
        save()
        play = capture("play", 10, ["0.3 key f1", "1.1 key h", "2.3 key enter", "2.9 key up",
                                    "3.5 key up", "4.1 chessarm", "4.5 key enter"])
        receipt["move"] = chess_record(play)
        save()
        # UART screenshots start after the clock and counter windows have stopped.
        for attempt in range(1, 3):
            label = f"reply-{attempt}"
            capture(label, 22, ["0.3 shot"], screenshots=True)
            if "crc ok" in (a.output / f"{label}-capture.log").read_text():
                shot = a.output / "reply.png"
                (a.output / "shot-1.png").replace(shot)
                receipt["replyPngSha256"] = digest(shot)
                save()
                break
        else:
            raise ValueError("reply screenshot did not pass UART CRC")
    finally:
        BOARD["flash"](a, a.output, original, "restore")
        capture("restored-boot", 15, [])
        restored = query_worlds("restored-worlds")
        receipt["worlds"] = METHOD["worlds"](json.dumps(restored, separators=(",", ":")))
        if any(w["name"] == "chess" for w in restored):
            raise ValueError("factory world list still contains Chess")
        receipt["restored"] = True
        save()


if __name__ == "__main__":
    main()
