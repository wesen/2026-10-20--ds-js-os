#!/usr/bin/env python3
"""Qualify physical Open with each cold-compiled Editor and restore the saved app."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import runpy
import shutil

HERE = Path(__file__).resolve().parent
DAY = HERE.parent.parent
SUITE, = DAY.glob("PICOCALC-COMPILER-LAB--*/scripts/04-board.py")
BOARD = runpy.run_path(str(SUITE))
SCENARIOS = ("ok", "bad", "cancel", "reopen")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def observe(log, oracle):
    # Opening the serial stream after flashing can retain a complete boot
    # that preceded our actual timed reboot. Qualify the explicit boot only.
    sections = re.split(r"^i2c0 .*; rebooting[ \t]*$", log, flags=re.M)
    if len(sections) != 2:
        raise ValueError("expected one explicit trial reboot")
    preamble, log = sections
    worlds = BOARD["worlds"](log)
    expected = oracle["nativeSha256"]
    seen = re.findall(r"^AWAITELF bytes=(\d+) sha256=([0-9a-f]+)$", log, re.M)
    assert seen == [(str(oracle["nativeBytes"]), expected)], seen
    compiled = re.findall(r"^editor compile source=bundle status=ok us=(\d+) peak_js_bytes=(\d+)"
                          r" module_bytes=(\d+)$", log, re.M)
    assert len(compiled) == 1 and int(compiled[0][2]) == oracle["nativeBytes"], compiled
    assert log.count("editor native compiler functions=streamed") == 1
    starts = {}
    remotes = {}
    duplicate = {}
    injections = {}
    for line in log.splitlines():
        if not line.startswith("AWAITPROBE "):
            continue
        if match := re.fullmatch(r"AWAITPROBE start (\S+) token=(\d+) r=1 requests=1", line):
            mode, token = match.groups()
            assert mode not in starts
            starts[mode] = int(token)
        elif match := re.fullmatch(r"AWAITPROBE settle (\S+) token=(\d+) ok=(\d) r=(\d)"
                                   r" held=(\d) unchanged=(\d) screen=([0-9a-f]{64}) reply=(.*)", line):
            mode, token, ok, result, held, unchanged, screen, reply = match.groups()
            assert mode not in remotes
            remotes[mode] = {"token":int(token), "ok":int(ok), "result":int(result), "held":int(held),
                             "unchanged":int(unchanged), "screen":screen, "reply":json.loads(reply)}
        elif match := re.fullmatch(r"AWAITPROBE duplicate (\S+) r=0 unchanged=1", line):
            mode, = match.groups()
            assert mode not in duplicate
            duplicate[mode] = True
        elif match := re.fullmatch(r"AWAITPROBE cancel token=(\d+) r=0 unchanged=1 reply=(.*)", line):
            token, reply = match.groups()
            assert "cancel" not in injections
            injections["cancel"] = {"token":int(token), "reply":json.loads(reply), "unchanged":True}
        elif match := re.fullmatch(r"AWAITPROBE stale token=(\d+) current=(\d+) r=1 unchanged=1", line):
            old, new = match.groups()
            assert "stale" not in injections
            injections["stale"] = {"token":int(old), "current":int(new), "unchanged":True}
        else:
            raise ValueError(line)
    assert tuple(starts) == tuple(remotes) == tuple(duplicate) == SCENARIOS, (starts, remotes, duplicate)
    assert len(set(starts.values())) == 4
    for mode, result in remotes.items():
        assert result["token"] == starts[mode] and result["result"] == 0
        assert result["held"] == int(mode in ("ok","reopen"))
        assert result["unchanged"] == int(mode in ("bad","cancel"))
        assert result["ok"] == int(mode != "bad")
    assert remotes["ok"]["reply"] == remotes["reopen"]["reply"] == {"ok": True}
    assert (not remotes["bad"]["reply"]["ok"]) and "not text (UTF-8)" in remotes["bad"]["reply"]["why"]
    assert remotes["cancel"]["reply"] is None
    assert injections["cancel"]["reply"] == {"ok":False, "why":"Open canceled."}
    assert injections["cancel"]["token"] == injections["stale"]["token"] == starts["cancel"]
    assert injections["stale"]["current"] == starts["reopen"]
    return {"cold_compile":{"us":int(compiled[0][0]), "peak_js_bytes":int(compiled[0][1]),
                            "module_bytes":int(compiled[0][2]), "sha256":expected},
            "worlds":worlds, "start_tokens":starts, "settles":remotes, "duplicate":duplicate,
            "injections":injections,
            "pre_reboot_compiles":preamble.count("editor compile source=bundle status=ok")}


def outcomes(boot):
    return {"settles":{mode:{k:v for k,v in row.items() if k!="token"} for mode,row in boot["settles"].items()},
            "cancel_reply":boot["injections"]["cancel"]["reply"], "duplicate":boot["duplicate"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ("build", "backup", "output"):
        parser.add_argument(key, type=Path)
    parser.add_argument("--port", required=True)
    parser.add_argument("--esptool", type=Path, required=True)
    parser.add_argument("--boots", type=int, choices=(1,2,3), default=2)
    parser.add_argument("--reuse-manual", type=Path, help="validate a completed manual log from this restored trial directory")
    args = parser.parse_args()
    args.esptool_python = args.esptool.parent / "python"
    if not args.reuse_manual:
        args.output.mkdir(parents=True)
    build = args.build.resolve()
    original = args.backup / "factory-original.bin"
    assert original.stat().st_size == 0x800000
    table = (args.backup / "partition-table.bin").read_bytes()
    oracle = json.loads((build / "host.json").read_text())["oracle"]
    for lane, expected in oracle.items():
        assert (build / lane / "partition-table.bin").read_bytes().ljust(4096, b"\xff") == table
        assert sha(build / lane / "picocalc-os-p4.bin") == expected["firmwareSha256"]
    receipt = {"before_factory_sha256":sha(original), "oracle":oracle, "lanes":{}, "restored":False}
    if args.reuse_manual:
        prior = args.output / "physical.json"
        before = json.loads(prior.read_text())
        assert before["restored"] and not before.get("all_observable_outcomes_identical")
        assert before["oracle"] == oracle and before["before_factory_sha256"] == sha(original)
        assert args.reuse_manual.resolve().parent == args.output.resolve()
        boot = observe(args.reuse_manual.read_text(errors="replace"), oracle["manual"])
        archived = args.output / "physical-first-attempt.json"
        assert not archived.exists()
        shutil.copyfile(prior, archived)
        receipt["reused_manual_log_sha256"] = sha(args.reuse_manual)
        receipt["lanes"]["manual"] = [boot]
    def save():
        (args.output / "physical.json").write_text(json.dumps(receipt, indent=2) + "\n")
    def capture(label, duration, commands):
        return BOARD["shared"]["capture"](args.port, args.output, label, duration, commands)
    save()
    try:
        for lane in ("manual", "await"):
            measured = receipt["lanes"].setdefault(lane, [])
            if len(measured) == args.boots:
                continue
            flash_name = lane + "-retry" if measured else lane
            BOARD["shared"]["flash"](args, args.output, build / lane / "picocalc-os-p4.bin", flash_name)
            for i in range(len(measured), args.boots):
                log = capture(f"{lane}-{i+1}", 25, ["0.7 reboot",
                    "15 awaitcheck ok", "16.5 awaitcheck bad", "18 awaitcheck cancel", "19.5 awaitcheck reopen", "22 worlds"])
                receipt["lanes"][lane].append(observe(log, oracle[lane]))
                save()
        control = outcomes(receipt["lanes"]["manual"][0])
        assert all(outcomes(boot) == control for lane in receipt["lanes"].values() for boot in lane)
        receipt["all_observable_outcomes_identical"] = True
    finally:
        BOARD["shared"]["flash"](args, args.output, original, "restore")
        receipt["restored_worlds"] = BOARD["worlds"](capture("restored", 17, ["14 worlds"]))
        receipt["restored"] = True
        save()


if __name__ == "__main__":
    main()
