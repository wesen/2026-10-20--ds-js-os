"""Compare a clean release profile with the qualified ordinary camera build."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import subprocess
import tempfile

here = Path(__file__).resolve().parent
qualify = next(here.parents[2].glob("PICOCALC-CHESS-3D--*/scripts/camera/07-qualify-build.mjs"))


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def compare(source, build, shipped, sdk_reference):
    installed = json.loads((shipped / "qualify.json").read_text())
    recorded = json.loads((shipped / "build.json").read_text())
    with tempfile.TemporaryDirectory(prefix="release-attest-") as tmp:
        stage = Path(tmp)
        (stage / "tree").symlink_to(source.resolve())
        (stage / "build").symlink_to(build.resolve())
        (stage / "sdkconfig").symlink_to(build.resolve() / "sdkconfig.smooth-chess")
        receipt = stage / "qualify.json"
        subprocess.run(["node", qualify, stage, receipt], check=True, capture_output=True, text=True)
        found = json.loads(receipt.read_text())
    keys = ["painterSource", "chessSource", "painter", "chess", "idfConfig", "partitionSHA256"]
    differences = [key for key in keys if found[key] != installed[key]]
    source_difference = [
        name for name, item in recorded["source"].items()
        if not (source/name).is_file() or digest(source/name) != item["sha256"]
    ]
    stable_artifacts = ("esp-idf/main/natives/compositor.elf", "esp-idf/main/mobile-painter-slot.elf",
                        "esp-idf/main/typed-world-reactor.elf", "esp-idf/main/chess.typed")
    code_artifacts = {
        name: {"cleanSHA256": digest(build/name), "shippedSHA256": recorded["products"][name]["sha256"]}
        for name in stable_artifacts
    }
    for details in code_artifacts.values():
        details["match"] = details["cleanSHA256"] == details["shippedSHA256"]
    no_observers = b"camobs" not in (build / "picocalc-os-p4.bin").read_bytes()

    def settings(path):
        return dict(line.split("=",1) for line in path.read_text().splitlines()
                    if line.startswith("CONFIG_") and "=" in line)

    config_differences = None
    if sdk_reference:
        original = settings(sdk_reference)
        clean = settings(build/"sdkconfig.smooth-chess")
        config_differences = {name: [original.get(name),clean.get(name)]
                              for name in original.keys()|clean.keys() if original.get(name)!=clean.get(name)}
    return {
        "clean":found, "shippedFirmwareSHA256":installed["firmwareSHA256"], "firmwareBytesMatch":
            found["firmwareSHA256"] == installed["firmwareSHA256"],
        "logicalIdentityDifferences":differences, "shippedSourceDifferences":source_difference,
        "ordinary":no_observers, "codeArtifacts":code_artifacts, "configDifferences":config_differences,
        "passed":not differences and not source_difference and no_observers
            and all(item["match"] for item in code_artifacts.values()) and not config_differences,
    }


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    for field in ("source","build","shipped","receipt"):
        cli.add_argument(field,type=Path)
    cli.add_argument("--sdk-reference",type=Path)
    args=cli.parse_args()
    result=compare(args.source,args.build,args.shipped,args.sdk_reference)
    args.receipt.write_text(json.dumps(result,indent=2)+"\n")
    if not result["passed"]:
        raise SystemExit("One or more release identities differed, see receipt")
