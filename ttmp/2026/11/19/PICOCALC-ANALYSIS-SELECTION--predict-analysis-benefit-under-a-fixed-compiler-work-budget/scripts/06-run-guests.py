"""Replay the selected native instructions using the earlier study's verified ABI harness."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import runpy

HERE = Path(__file__).resolve().parent
REPLAY, = HERE.parent.parent.glob("PICOCALC-BOUNDED-FACTS--*/scripts/06-run-guests.py")
verify = runpy.run_path(str(REPLAY))["verify"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cc", type=Path)
    parser.add_argument("emulator", type=Path)
    parser.add_argument("fixtures", type=Path)
    args = parser.parse_args()
    results = {policy: verify(str(args.cc.resolve()), str(args.emulator.resolve()),
                              args.fixtures / policy)
               for policy in ("none", "source", "literal", "density")}
    assert len({r["results_sha256"] for r in results.values()}) == 1
    assert all(r["expected_traps"] == results["none"]["expected_traps"] for r in results.values())
    assert all(r["words"] < results["none"]["words"] for name, r in results.items() if name != "none")
    print(json.dumps({"emulator": sha256(args.emulator.read_bytes()).hexdigest(),
                      "results": results}, indent=2))


if __name__ == "__main__":
    main()
