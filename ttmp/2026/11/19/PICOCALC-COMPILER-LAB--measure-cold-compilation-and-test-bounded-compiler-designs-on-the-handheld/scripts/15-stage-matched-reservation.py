"""Stage the small-slot researcher's identical compiler and wrapper with the stock reservation."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy

HERE = Path(__file__).resolve().parent
recipe, = HERE.parent.parent.glob("PICOCALC-STAGED-RV32--*/scripts/06-stage-small-slot.py")
native = runpy.run_path(str(recipe))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("staged", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    native["stage"](args.staged, args.output)
    relative = Path("picocalc-os/sdk/typed/rv32-slot.S")
    slot = args.output / "tree" / relative
    native["replace_once"](slot, ".space 81920 - (.-.Lprogram)", ".space 229376 - (.-.Lprogram)")
    assert slot.read_bytes() == (HERE.parents[5] / relative).read_bytes()
    receipt = args.output / "inputs.json"
    inputs = json.loads(receipt.read_text())
    inputs.update(slotBytes=229376, slotSourceSha256=hashlib.sha256(slot.read_bytes()).hexdigest())
    receipt.write_text(json.dumps(inputs, indent=2)+"\n")


if __name__ == "__main__":
    main()
