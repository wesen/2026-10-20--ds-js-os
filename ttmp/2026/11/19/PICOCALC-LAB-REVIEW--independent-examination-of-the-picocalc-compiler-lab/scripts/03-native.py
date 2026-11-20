"""Inspect emitted words directly and compare signed Agenda forecast residuals."""
import hashlib
import json
import struct
import sys
from pathlib import Path


def signed(value, bits):
    return value - (1 << bits) if value & (1 << (bits - 1)) else value


def jump(word):
    return signed((word >> 31) << 20 | ((word >> 12) & 255) << 12 |
                  ((word >> 20) & 1) << 11 | ((word >> 21) & 1023) << 1, 21)


def branch(word):
    return signed((word >> 31) << 12 | ((word >> 7) & 1) << 11 |
                  ((word >> 25) & 63) << 5 | ((word >> 8) & 15) << 1, 13)


def inspect(path):
    image = path.read_bytes()
    word = lambda at: struct.unpack_from('<I', image, at)[0]
    sig = struct.pack('<III', 0x4147454e, 0x44415256, 0x3332534c)
    assert image.count(sig) == 1
    slot = image.index(sig)
    capacity, exports, imports = struct.unpack_from('<IHH', image, slot + 12)
    imports_at = slot + 20 + 4 * exports
    begin = imports_at + 4 * imports
    end = slot + capacity
    while word(end - 4) == 0:
        end -= 4
    assert end > begin
    elf_segments = []
    phsize, phcount = struct.unpack_from('<HH', image, 42)
    for index in range(phcount):
        at = word(28) + phsize * index
        ty, off, va, _, filesz, memsz, flags, _ = struct.unpack_from('<8I', image, at)
        if ty == 1:
            elf_segments.append((off, va, filesz, memsz, flags))
    rx, = [s for s in elf_segments if s[4] & 1 and s[0] <= slot and slot+capacity <= s[0]+s[2]]
    assert rx[0] == rx[1]  # use file positions as addresses in this segment
    spans = {'conditional': 0, 'jump_in_code': 0, 'jump_to_import': 0, 'indirect': 0}
    entry_offsets = []
    for at in range(slot+20, imports_at, 4):
        w = word(at)
        assert w & 0xfff == 0x6f  # jal x0
        target = at+jump(w)
        assert begin <= target < end and target % 4 == 0
        entry_offsets.append(target-begin)
    for at in range(begin,end,4):
        w = word(at)
        assert w & 3 == 3
        op = w & 127
        if op == 0x67:
            spans['indirect'] += 1
        if op in (0x63,0x6f):
            target = at + (branch(w) if op == 0x63 else jump(w))
            assert target % 4 == 0
            if imports_at <= target < begin:
                assert op == 0x6f and (w >> 7) & 31 == 1
                spans['jump_to_import'] += 1
            else:
                assert begin <= target < end, (at, target)
                spans['conditional' if op == 0x63 else 'jump_in_code'] += 1
    raw = image[begin:end]
    return {'bytes':len(image),'sha':hashlib.sha256(image).hexdigest(),
            'payloadSha':hashlib.sha256(raw).hexdigest(),'payloadBytes':len(raw),
            'capacity':capacity,'headerBytes':begin-slot,'paddingBytes':slot+capacity-end,
            'entryOffsets':entry_offsets,'controlTransfers':spans,'loadSegments':elf_segments}


def forecast(prediction, observed):
    predicted = {r['name']:r['model'] for r in json.loads(prediction.read_text())['rows']}
    actual = {r['name']:r['staged'] for r in json.loads(observed.read_text())['rows']}
    assert predicted.keys() == actual.keys()
    errors = {key:actual[key]-val for key,val in predicted.items()}
    return {'predicted':sum(predicted.values()),'observed':sum(actual.values()),
            'totalError':sum(errors.values()),'absoluteErrors':sum(map(abs,errors.values())),
            'functions':len(errors),'exactFunctions':sum(e==0 for e in errors.values()),
            'errors':{k:v for k,v in errors.items() if v}}


if __name__ == '__main__':
    standard, small, prediction, observed = map(Path, sys.argv[1:])
    old, new = inspect(standard), inspect(small)
    assert old['payloadSha'] == new['payloadSha']
    print(json.dumps({'standard':old,'small':new,'forecast':forecast(prediction, observed)},indent=2))
