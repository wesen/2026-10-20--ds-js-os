"""Extract the production GCC shadow IR and disassembly from the ROW-IR capture.

    python3 03-gcc-reference.py path/to/firmware riscv32-esp-elf-objdump

Recreate the input capture with PICOCALC-ROW-IR/scripts/02-passes.py.
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

stage = Path(sys.argv[1])
objdump = sys.argv[2]
out = Path(__file__).resolve().parents[2] / 'various/compile'
unit = stage / 'gcc.o'
tree = stage / 'gcc.c.265t.optimized'
asm = subprocess.check_output([objdump, '-dr', '-j', '.text.in_shadow', str(unit)], text=True).split('00000000 <in_shadow>:', 1)[1]
ir = re.search(r'^;; Function in_shadow\b.*?(?=^;; Function |\Z)', tree.read_text(), re.M | re.S)[0]
(out / 'gcc-in-shadow.asm').write_text('00000000 <in_shadow>:' + asm)
(out / 'gcc-in-shadow.gimple').write_text(ir.rstrip()+'\n')
(out / 'gcc-source.json').write_text(json.dumps({
    'objectSHA': hashlib.sha256(unit.read_bytes()).hexdigest(),
    'sourcePreprocessedSHA': hashlib.sha256((stage / 'firmware.i').read_bytes()).hexdigest(),
    'objdumpVersion': subprocess.check_output([objdump, '--version'], text=True).splitlines()[0],
    'instructionLines': len(re.findall(r'^\s*[0-9a-f]+:\s+[0-9a-f]+\s+[a-z]', asm, re.M)),
    'calls': len(re.findall(r'R_RISCV_CALL(?:_PLT)?\b', asm)),
    'gimpleAbs': ir.count('ABS_EXPR'),
}, indent=2)+'\n')
