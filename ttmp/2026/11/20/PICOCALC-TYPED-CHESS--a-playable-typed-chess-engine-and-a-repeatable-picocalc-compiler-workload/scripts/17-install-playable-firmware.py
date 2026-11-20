"""Install the normal four-app image in the existing app partition and open Chess."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import subprocess

HERE = Path(__file__).resolve().parent
CHESS = runpy.run_path(str(HERE / "11-run-board-chess.py"))
BOARD = CHESS["BOARD"]
APPS = ("chess", "agenda", "editor", "files")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("work", "partition-table", "esptool"):
        parser.add_argument("--" + name, required=True, type=Path)
    parser.add_argument("--port", required=True)
    args = parser.parse_args()
    args.esptool_python = args.esptool.parent / "python"
    build = args.work / "build"
    image = build / "picocalc-os-p4.bin"
    table = args.partition_table.read_bytes()
    new_table = (build / "partition_table/partition-table.bin").read_bytes()
    if not table or new_table.ljust(len(table), b"\xff") != table:
        raise ValueError("partition map differs")
    manifest = json.loads((build / "esp-idf/main/system.typed-agenda.json").read_text())
    expected = {row["name"]: row["file"] for row in manifest["worlds"] if row.get("engine") == "native"}
    if any(expected.get(app) != f"{app}/compiled.bin" for app in APPS):
        raise ValueError("missing bundled native app")
    log = args.work / "install"
    log.mkdir()
    BOARD["flash"](args, log, image, "playable")
    capture = BOARD["capture"]
    capture(args.port, log, "boot", 17, [])
    worlds = None
    for attempt in range(2):
        worlds = CHESS["complete_world_list"](capture(args.port, log, f"worlds-{attempt}", 10, ["0.4 worlds"]))
        if worlds:
            break
    if not worlds:
        raise ValueError("incomplete boot world list")
    apps = {row["name"]: row for row in worlds if row["name"] in APPS}
    for name in APPS:
        row = apps[name]
        if row["engine"] != "native" or row["last_error"] or row["file"] != expected[name]:
            raise ValueError(f"{name} did not boot successfully")
    drivers = {row["name"]: row for row in worlds if row["name"] in ("keyboard", "display")}
    for name in ("keyboard", "display"):
        if drivers[name]["engine"] != "native" or drivers[name]["last_error"]:
            raise ValueError(f"{name} driver did not boot successfully: {drivers[name]}")
    capture(args.port, log, "open-chess", 4, ["0.3 key f1", "1.4 key h"])
    for attempt in range(3):
        name = f"chess-screen-{attempt}"
        capture(args.port, log, name, 22, ["0.4 shot"], screenshots=True)
        if "crc ok" in (log / f"{name}-capture.log").read_text():
            break
    else:
        raise ValueError("unverified screenshot")
    receipt = dict(source_revision=subprocess.check_output(
        ["git", "rev-parse", "HEAD"], text=True).strip(), firmware_sha256=hashlib.sha256(image.read_bytes()).hexdigest(),
        image_bytes=image.stat().st_size, port=args.port, app_offset="0x10000",
        worlds={name: {k: row[k] for k in ("file", "engine", "last_error")} for name, row in (apps | drivers).items()},
        screenshot_sha256=hashlib.sha256((log / "shot-1.png").read_bytes()).hexdigest())
    (log / "installed.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    main()
