#!/usr/bin/env python3
"""02-vendor.py: copy the generated Candela kernel (PICOCALC-CANDELA-CPU-KERNEL) and the section interpreter
(PICOCALC-CANDELA-SECTIONS) into the firmware tree, byte for byte, and record where each file came from.

usage: python3 -I 02-vendor.py [--check] [SCENES_C]

Writes picocalc-os/third_party/candela/kernel/ (cdl_kernel.h, cdl_kernel.cpp, cdl_post.cpp, manifest.json and the
cpu/ headers, flattened into one directory), picocalc-os/third_party/candela/vm/ (cdl_vm.h, cdl_vm.c, cdl_vm_isa.h,
cdl_vm_ck_math.h) and picocalc-os/third_party/candela/VENDOR.json (source path and SHA-256 of every copied file).
With SCENES_C (01-prepare-scenes.mjs's output) it also copies the scene table to
picocalc-os/third_party/candela/gallery/candela_gallery_scenes.c. With --check nothing is written: every vendored file
must equal its source."""
import hashlib
import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = next(p for p in HERE.parents if (p / ".git").exists())
T21 = REPO / "ttmp/2026/11/21"
CK = next(T21.glob("PICOCALC-CANDELA-CPU-KERNEL--*")) / "scripts"
SE = next(T21.glob("PICOCALC-CANDELA-SECTIONS--*")) / "scripts"
DEST = REPO / "picocalc-os/third_party/candela"
FILES = {
    "kernel": [CK / "generated" / f for f in ("cdl_kernel.h", "cdl_kernel.cpp", "cdl_post.cpp", "manifest.json")]
    + [CK / "cpu" / f for f in ("cdl_api.h", "cdl_math.h", "cdl_overrides.inc", "cdl_post.inc", "cdl_switches.h")],
    "vm": [SE / "vm" / f for f in ("cdl_vm.h", "cdl_vm.c", "cdl_vm_isa.h")] + [SE / "ck" / "cdl_vm_ck_math.h"],
}


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    args = sys.argv[1:]
    check = "--check" in args
    args = [a for a in args if a != "--check"]
    record = {"note": "Copied by PICOCALC-CANDELA-GALLERY scripts/02-vendor.py; do not edit here, regenerate in the source tickets.",
              "files": {}}
    bad = []
    for sub, srcs in FILES.items():
        for src in srcs:
            dst = DEST / sub / src.name
            if check:
                if not dst.exists() or sha(dst) != sha(src):
                    bad.append(str(dst))
            else:
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(src, dst)
            record["files"][f"{sub}/{src.name}"] = {"source": str(src.relative_to(REPO)), "sha256": sha(src)}
    if args:
        src = Path(args[0]).resolve()
        dst = DEST / "gallery" / "candela_gallery_scenes.c"
        if check:
            if sha(dst) != sha(src):
                bad.append(str(dst))
        else:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dst)
        record["files"]["gallery/candela_gallery_scenes.c"] = {"source": "01-prepare-scenes.mjs output", "sha256": sha(src)}
        # The firmware kernel's identity: the SHA-256 of fixedText() of the kernel.js it was generated from. The scenes
        # were prepared with that same kernel.js (its digest equals the vendored manifest's pin), so the digest
        # 01-prepare-scenes.mjs computed is the kernel's too; candela_gallery_p4.c refuses a table compiled otherwise.
        meta = json.loads((src.parent / "scenes.json").read_text())
        pin = json.loads((CK / "generated/manifest.json").read_text())["pin"]["src/kernel.js"]
        if meta["kernelJsSha256"] != pin:
            sys.exit(f"scenes prepared with kernel.js {meta['kernelJsSha256']}, the kernel was generated from {pin}")
        text = ("/* cdl_fixed_kernel.c: written by PICOCALC-CANDELA-GALLERY scripts/02-vendor.py. The SHA-256 of Candela's fixedText()\n"
                " * (PRELUDE + SPECTRAL + ggxTableWGSL() + CORE + metalAt + hitAlbedo + hitEmission + PATH) of the kernel.js this\n"
                f" * kernel was generated from (manifest.json pin src/kernel.js {pin}). */\n"
                f"const char cg_kernel_fixed_sha256[] = \"{meta['fixedKernelSha256']}\";\n")
        fixed = DEST / "kernel" / "cdl_fixed_kernel.c"
        if check:
            if fixed.read_text() != text:
                bad.append(str(fixed))
        else:
            fixed.write_text(text)
        record["files"]["kernel/cdl_fixed_kernel.c"] = {"source": "02-vendor.py", "sha256": hashlib.sha256(text.encode()).hexdigest()}
    if check:
        print("vendored files equal their sources" if not bad else "DIFFERENT: " + ", ".join(bad))
        sys.exit(1 if bad else 0)
    old = json.loads((DEST / "VENDOR.json").read_text()) if (DEST / "VENDOR.json").exists() else {"files": {}}
    for k, v in old["files"].items():
        record["files"].setdefault(k, v)
    (DEST / "VENDOR.json").write_text(json.dumps(record, indent=1, sort_keys=True) + "\n")
    print(f"{len(record['files'])} files under {DEST.relative_to(REPO)}")


if __name__ == "__main__":
    main()
