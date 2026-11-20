#!/usr/bin/env python3
"""Check bounded-policy board images against host hashes and pair within blocks."""
import argparse
import json
from pathlib import Path
from statistics import median

TICKET = Path(__file__).resolve().parent.parent
POLICIES = {"base": "control", "always": "always", "select": "select"}


def read(path):
    return json.loads(path.read_text())


def summarize(values):
    return {"median": median(values), "min": min(values), "max": max(values)}


def compile_summary(rows, oracle):
    blocks = {}
    for row in rows:
        app, policy = row["app"], POLICIES[row["lane"]]
        expected = oracle[app][policy]
        fields = ("bytes", "words", "sha256")
        assert all(row[field] == expected[field] for field in fields), (row, expected)
        assert row["streamed"]
        block = blocks.setdefault(app, {}).setdefault(row["block"], {})
        assert policy not in block
        block[policy] = row
    result = {}
    for app, by_block in blocks.items():
        blocks = list(by_block.values())
        assert all(set(block) == set(POLICIES.values()) for block in blocks)
        result[app] = {
            "blocks": len(blocks),
            "absolute": {
                mode: {field:summarize([b[mode][field] for b in blocks]) for field in ("us", "peak")}
                for mode in POLICIES.values()
            },
            "paired": {
                mode + "_minus_" + reference: {
                    field: summarize([b[mode][field] - b[reference][field] for b in blocks])
                    for field in ("us", "peak")
                }
                for mode,reference in (("always","control"),("select","control"),("select","always"))
            },
        }
    return result


def guest_summary(rows):
    operations = {}
    for row in rows:
        op, mode = row["op"], POLICIES[row["lane"]]
        block = operations.setdefault(op, {}).setdefault(row["block"], {})
        assert mode not in block and row["count"] > 0
        block[mode] = row["cycles"] / row["count"]
    result = {}
    for op, blocks in operations.items():
        assert all(set(block) == set(POLICIES.values()) for block in blocks.values())
        result[op] = {
            "blocks": len(blocks),
            "cycles_per_call": {mode:summarize([block[mode] for block in blocks.values()]) for mode in POLICIES.values()},
            "paired_cycles_per_call": {
                mode + "_minus_control": summarize([block[mode]-block["control"] for block in blocks.values()])
                for mode in ("always","select")
            },
        }
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path)
    args = parser.parse_args()
    x = read(args.receipt)
    oracle = read(TICKET/"various/host-training.json")["outputs"] | read(TICKET/"various/host-editor.json")["outputs"]
    compilers = read(TICKET/"various/compilers.json")["lanes"]
    for label, policy in POLICIES.items():
        for unit in ("rv32", "wasm"):
            assert x["compilers"][label][unit] == compilers[policy]["typed/"+unit+".js"]
    assert x["restored"] and len(x["boots"]) == 2
    assert set(x["restored_worlds"]) >= set(oracle)
    for app in oracle:
        row = x["restored_worlds"][app]
        assert row["engine"] == "native" and row["file"] == app+"/compiled.bin" and not row["last_error"]
    data = {
        "firmware_sha256": x["firmware"],
        "restored": x["restored"],
        "restored_worlds": x["restored_worlds"],
        "compile_rows": sum(len(b["rows"]) for b in x["boots"]),
        "boots": [{"compile":compile_summary(b["rows"],oracle), "guest":guest_summary(b["guest"])} for b in x["boots"]],
    }
    print(json.dumps(data, indent=2))


if __name__ == "__main__":
    main()
