from array import array
import zlib
import importlib.util
import json
import re
import time

from common import DAY, HERE, painter, save, unit

MATCH = HERE.parents[1] / "various/device/reference"
REPO = next(p for p in HERE.parents if (p / ".git").exists())
ORACLE = next(DAY.glob("PICOCALC-CHESS-3D--*")) / "scripts/scene/oracle.py"
sp = importlib.util.spec_from_file_location("pixel_oracle", ORACLE)
pixels = importlib.util.module_from_spec(sp)
sp.loader.exec_module(pixels)


def key(c, name, delay=0.24):
    c.command("key " + name)
    time.sleep(delay)


def type_text(c, s):
    assert s and s.isascii() and "\n" not in s and s.strip() == s
    c.command("type " + s)
    time.sleep(0.09 * len(s) + 0.4)


def snapshot(c, out, label):
    shot = c.shot(label, out)
    return shot, (out / (label + ".rgb565")).read_bytes()


def match(c, out, label, ref):
    shot, raw = snapshot(c, out, label)
    assert raw[22 * 320 * 2 :] == zlib.decompress(
        (MATCH / (ref + ".ref.z")).read_bytes()
    ), label + " differs from " + ref
    return shot["appSha256"]


def world(c, name):
    return c.health()[name]


def bus(c):
    line = next(item for item in c.command("stats") if "bus spi2" in item)
    return int(unit.BUS.search(line)[4])


def rows_elapsed(t):
    return round(1000 * (time.monotonic() - t), 3)


def play(c, out, reps):
    key(c, "f1")
    key(c, "h", 0.6)
    key(c, "f2", 0.4)
    source = json.loads((MATCH / "match.json").read_text())[:2]
    shots = {"opening": match(c, out, "initial-chess", "opening")}
    measured = []
    for i in range(reps):
        key(c, "f2", 0.35)
        for k in ["enter", "up", "up"]:
            key(c, k)
        b = world(c, "chess")
        spi0 = bus(c)
        p0 = painter(c)
        t = time.monotonic()
        c.command("key enter")
        lower = 0
        while True:
            poll_begin = rows_elapsed(t)
            p = painter(c)
            upper = rows_elapsed(t)
            if p["packets"] >= p0["packets"] + 2 and p["paints"] >= p0["paints"] + 2:
                break
            if upper > 18000:
                raise TimeoutError(("Chess completion", i, p0, p))
            lower = poll_begin
            time.sleep(0.04)
        a = world(c, "chess")
        spi1 = bus(c)
        assert (
            p["installed"]
            and p["compiles"] == 1
            and p["rejects"] == 0
            and a["restarts"] == b["restarts"]
        )
        final = match(c, out, "reply-" + str(i), "turn-1")
        measured.append(
            {
                "block": i,
                "chessWorldCpuMs": round(a["cpu_ms"] - b["cpu_ms"], 3),
                "worldTurns": a["turns"] - b["turns"],
                "hostCompletionBracketMs": [lower, upper],
                "painterPacketDelta": p["packets"] - p0["packets"],
                "painterPaintDelta": p["paints"] - p0["paints"],
                "spiByteDelta": spi1 - spi0,
                "replyAppSHA256": final,
            }
        )
        save(
            out / "chess.json",
            {"opening": shots, "independentOpeningReply": source[1], "rows": measured},
        )
        print("Chess", i, measured[-1], flush=True)
    return measured


def has_text(raw, text, color):
    font = pixels.small_font(REPO / "picocalc-os/nucleus/font_data.h")
    w = len(text) * 6
    if w > 320:
        return False
    bg = pixels.rgb565(0xF6F4EF)
    lines = array("H", [bg]) * (320 * 12)
    pixels.draw_small(lines, font, 0, 0, text, pixels.rgb565(color), 320)
    bands = [lines[y * 320 : y * 320 + w].tobytes() for y in range(12)]
    probe = max(range(12), key=lambda i: len(set(bands[i])))
    start = 0
    while True:
        off = raw.find(bands[probe], start)
        if off < 0:
            return False
        start = off + 1
        if off % 2:
            continue
        x = (off // 2) % 320
        y = (off // 2) // 320 - probe
        if (
            y >= 22
            and x + w <= 320
            and y + 12 <= 320
            and all(
                raw[(320 * (y + i) + x) * 2 : (320 * (y + i) + x + w) * 2] == b
                for i, b in enumerate(bands)
            )
        ):
            return True


def document_lines(lines):
    # ESP-IDF log records can interleave application console output.
    return [
        line
        for line in lines
        if not re.match(
            r"^I [(][0-9]+[)] fs: op [0-9]+ on qcprobe7/qcheck7[.]txt took [0-9]+ ms$",
            line,
        )
    ]


def edit(c, out):
    folder = "qcprobe7"
    fn = "qcheck7.txt"
    name = folder + "/" + fn
    assert "no directory " + folder in c.command("ls " + folder)
    assert "no file " + fn in c.command("cat " + fn)
    key(c, "f1")
    key(c, "d", 0.45)
    key(c, "f3")
    type_text(c, folder)
    key(c, "enter", 0.45)
    assert "no directory " + folder not in c.command("ls " + folder)
    key(c, "enter", 0.4)
    _, raw = snapshot(c, out, "scratch-dir")
    assert has_text(raw, "/" + folder, 0x1D1C1A), (
        "Files is not in our scratch directory"
    )
    key(c, "f2")
    type_text(c, fn)
    key(c, "enter", 0.55)
    w0 = world(c, "editor")
    type_text(c, "alpha text")
    key(c, "enter")
    type_text(c, "beta")
    key(c, "left")
    key(c, "backspace")
    type_text(c, "T")
    start = time.monotonic()
    c.command("key f2")
    while True:
        body = document_lines(c.command("cat " + name))
        if body == ["alpha text", "beTa"]:
            break
        if rows_elapsed(start) > 5000:
            raise ValueError(("Editor save", name, body))
        time.sleep(0.08)
    row = {
        "firstSaveHostMs": rows_elapsed(start),
        "expectedFirst": "alpha text\nbeTa",
        "readback": body,
    }
    w1 = world(c, "editor")
    row["editorWorldCpuMs"] = round(w1["cpu_ms"] - w0["cpu_ms"], 3)
    row["editorWorldTurns"] = w1["turns"] - w0["turns"]
    row["editedScreen"] = snapshot(c, out, "edited")[0]["appSha256"]
    key(c, "esc", 0.45)
    key(c, "enter", 0.55)
    key(c, "end")
    type_text(c, "7")
    key(c, "f2", 0.45)
    deadline = time.monotonic() + 6
    while True:
        after = document_lines(c.command("cat " + name))
        if after == ["alpha text", "beTa7"]:
            break
        if time.monotonic() > deadline:
            raise ValueError(("reopen", after))
        time.sleep(0.08)
    row["reopenedReadback"] = after
    remove_owned(c, out, folder, fn)
    row["scratchRemoved"] = True
    return row


def remove_owned(c, out, folder, fn):
    name = folder + "/" + fn
    assert document_lines(c.command("cat " + name)) == ["alpha text", "beTa7"]
    key(c, "esc", 0.45)
    key(c, "f5", 0.3)
    _, raw = snapshot(c, out, "delete-owned-file")
    assert has_text(raw, "F5 again deletes " + fn, 0xD42A2F), (
        "unexpected file selected for removal"
    )
    key(c, "f5", 0.45)
    assert "no file " + name in c.command("cat " + name)
    assert not [s for s in c.command("ls " + folder) if s.startswith("  ")]
    key(c, "backspace", 0.5)
    key(c, "f5", 0.35)
    _, raw = snapshot(c, out, "delete-owned-directory")
    assert has_text(raw, "F5 again deletes " + folder, 0xD42A2F), (
        "unexpected directory selected for removal"
    )
    key(c, "f5", 0.45)
    assert "no directory " + folder in c.command("ls " + folder)
