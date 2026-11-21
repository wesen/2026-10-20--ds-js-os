"""Compare the calibrated host particle image to the firmware verified on the P4.

The two linkers place the same code in different relative positions. Check every
nonrelocated wrapper byte and decode each AUIPC/JALR destination on both sides.
"""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import struct

def locations(haystack, needle):
    at, found = 0, []
    while True:
        at = haystack.find(needle,at)
        if at < 0: return found
        found.append(at)
        at += len(needle)

def unique(haystack, needle):
    result = locations(haystack,needle)
    if len(result) != 1: raise ValueError(("expected unique region",len(result)))
    return result[0]

def dest(data, at):
    upper, low = struct.unpack_from("<II",data,at)
    assert upper & 0x7f == 0x17 and low & 0x707f == 0x67
    assert ((upper >> 7) & 31) == ((low >> 15) & 31)
    # Both RISC-V immediates are signed. The call instruction pair uses
    # AUIPC's PC, even though the JALR is four bytes farther along.
    hi = (upper & 0xfffff000) - (1 << 32 if upper >> 31 else 0)
    lo = (low >> 20) - (1 << 12 if low >> 31 else 0)
    return (at + hi + lo) & ~1

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("flashed",type=Path)
    ap.add_argument("calibration",type=Path,help="output of 03-qualify.py")
    ap.add_argument("generated",type=Path,help="original/ output of 10-verify-recognition.py")
    ap.add_argument("report",type=Path)
    args = ap.parse_args()
    t = Path(__file__).resolve().parents[2] / "various/physics"
    firmware = args.flashed.read_bytes()
    firmware_sha = sha256(firmware).hexdigest()
    assert firmware_sha == json.loads((t/"board-image.json").read_text())["sha256"]
    generated = (args.generated/"module.bin").read_bytes()
    manual = (args.calibration/"guard.bin").read_bytes()
    assert generated == manual
    sections,object_hashes = {}, {}
    for kind in ("native","typed","guard"):
        auto = (args.generated/(kind+".o")).read_bytes()
        assert auto == (args.calibration/(kind+".o")).read_bytes()
        object_hashes[kind] = sha256(auto).hexdigest()
        if kind != "guard":
            image = (args.calibration/(kind+".bin")).read_bytes()
            sections[kind] = {"offset":unique(firmware,image),"hostOffset":unique(generated,image),"size":len(image)}
    # Each macro invocation has two norelax AUIPC/JALR relocation pairs.
    guard_bytes = sections["native"]["hostOffset"]
    assert guard_bytes == 4*68
    starts = locations(firmware,generated[:36])
    assert len(starts)==4
    guards = []
    names = ["guarded_aos_scalar","guarded_aos_pie","guarded_soa_scalar","guarded_soa_pie"]
    for i,(name,at) in enumerate(zip(names,starts)):
        base=i*68
        assert firmware[at:at+36] == generated[base:base+36]
        assert firmware[at+44:at+60] == generated[base+44:base+60]
        targets={}
        for offset,kind in [(36,"native"),(60,"typed")]:
            original,actual = dest(generated,base+offset),dest(firmware,at+offset)
            expected = original - sections[kind]["hostOffset"] + sections[kind]["offset"]
            assert expected == actual
            assert 0 <= actual - sections[kind]["offset"] < sections[kind]["size"]
            # Only the two immediate fields may differ; preserve all opcodes and registers.
            for delta,mask in [(0,0xfff),(4,0xfffff)]:
                def word(buf,at): return struct.unpack_from("<I",buf,at)[0]
                assert word(generated,base+offset+delta)&mask == word(firmware,at+offset+delta)&mask
            targets[kind] = actual
        guards.append({"name":name,"boardFileOffset":at,"targetFileOffsets":targets})
    report={"flashedFirmwareSHA256":firmware_sha,"generatedHostSHA256":sha256(generated).hexdigest(),
        "calibratedObjectSHA256":object_hashes,"sections":sections,"guards":guards,
        "scope":"Original module. Absolute offsets index the firmware file; the PC-relative displacement agrees across both complete sections."}
    args.report.write_text(json.dumps(report,indent=2)+"\n")
    print("bound four checked entries, eight calls/tails and",sum(x["size"] for x in sections.values()),"intact kernel/stock bytes")

if __name__=="__main__": main()
