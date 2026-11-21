"""Run the maintained app suites and two historical Chess oracles with today's generic world reactor."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("gcc", type=Path)
parser.add_argument("emulator", type=Path)
parser.add_argument("release", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
root = Path.cwd()
day = Path(__file__).resolve().parents[3]
study = next(day.glob("PICOCALC-TYPED-CHESS--*")) / "scripts"
wave = next(day.glob("PICOCALC-NATIVE-WAVE--*"))
manifest = json.loads((wave / "various/04-deps/release-inputs.json").read_text())
release = args.release.read_bytes()
assert sha256(release).hexdigest() == manifest["applicationSHA256"]
entry = manifest["files"]["editor.elf"]   # Generic world ABI used by the event oracle
start = entry["releaseOffset"]
reactor = release[start:start + entry["bytes"]]
assert sha256(reactor).hexdigest() == entry["sha256"]

def replace_once(text, old, new):
    assert text.count(old) == 1, old
    return text.replace(old, new)

def run_json(script, *extra):
    data = subprocess.check_output(["node", script, args.gcc.resolve(), args.emulator.resolve(), *extra])
    return json.loads(data)

apps = subprocess.check_output(["make", "-C", "picocalc-os", "test-apps"], text=True)
counts = {}
for name, count in re.findall(r"^node tests/([\w-]+)\.test\.mjs$.*?^ℹ pass (\d+)$", apps, re.M | re.S):
    counts[name] = int(count)
assert {"editor", "calc", "agenda", "sysapps"} <= counts.keys() and all(counts.values()), apps
engine = run_json(study / "03-engine-oracle.mjs")

with tempfile.TemporaryDirectory(prefix="promotion-chess-events-") as work:
    tmp = Path(work)
    target = tmp / "world.elf"
    target.write_bytes(reactor)
    # The original oracle predates two host services imported by today's generic reactor.
    # Its expected events, screen checks and cross-target comparisons stay in the original source.
    driver_name = "08-chess-world-driver.c"
    driver = (study / driver_name).read_text()
    driver = replace_once(driver, "extern int64_t __divdi3", "extern double __floatsidf(int);\nextern int64_t __divdi3")
    driver = replace_once(driver, '{"strlen", strlen}', '{"strcmp", strcmp}, {"__floatsidf", __floatsidf}, {"strlen", strlen}')
    (tmp / driver_name).write_text(driver)
    script_name = "07-chess-world-oracle.mjs"
    script = (study / script_name).read_text().replace("../../../../../../picocalc-os/", (root / "picocalc-os").as_uri() + "/")
    (tmp / script_name).write_text(script)
    trace = run_json(tmp / script_name, target)

receipt = {
    "appSuitePasses": counts,
    "engine": {"reference": engine["reference"], "positions": len(engine["rows"]),
               "targets": engine["targets"], "wordsMatched": engine["wordsMatched"]},
    "genericWorld": {"reactorSHA256": entry["sha256"], "addedHostSymbols": ["strcmp", "__floatsidf"], **trace},
}
args.output.write_text(json.dumps(receipt, indent=2) + "\n")
