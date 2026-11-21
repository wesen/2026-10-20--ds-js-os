"""Check all benchmark inputs and callable addresses in the linked ESP-IDF image before flashing."""
from pathlib import Path
import argparse
import hashlib
import json
from elftools.elf.elffile import ELFFile

arg=argparse.ArgumentParser(description=__doc__)
arg.add_argument('work',type=Path)
arg.add_argument('out',type=Path)
args=arg.parse_args()
meta=json.loads((args.work/'main/inputs.json').read_text())
firmware=(args.work/'build/heldout_wave.bin').read_bytes()
receipt={'firmwareSHA256':hashlib.sha256(firmware).hexdigest(),'arms':[]}
with (args.work/'build/heldout_wave.elf').open('rb') as f:
    elf=ELFFile(f)
    sym=elf.get_section_by_name('.symtab')
    for i,arm in enumerate(meta['arms'][:-1]):
        raw=(args.work/f'main/arm{i}.bin').read_bytes()
        base=sym.get_symbol_by_name(f'base{i}')[0]
        section=elf.get_section(base.entry.st_shndx)
        addr=base.entry.st_value
        offset=addr-section.header.sh_addr
        assert section.data()[offset:offset+len(raw)]==raw
        assert raw in firmware
        for j,name in enumerate(['readBurst','countEvents','label']):
            assert sym.get_symbol_by_name(f'arm{i}_{j}')[0].entry.st_value==addr+arm['entries'][name]
        receipt['arms'].append({'name':arm['arm'],'addr':addr,'section':section.name,'imageSHA256':arm['imageSHA256']})
args.out.write_text(json.dumps(receipt,indent=2)+'\n')
