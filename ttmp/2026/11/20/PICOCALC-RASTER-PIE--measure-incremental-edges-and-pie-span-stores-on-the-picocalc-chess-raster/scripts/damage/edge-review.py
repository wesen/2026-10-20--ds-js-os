"""Build the sibling researcher's edge/span sources with independent arithmetic and write guards."""
import json
import subprocess
import tempfile
from pathlib import Path

here = Path(__file__).resolve().parent
root = next(p for p in here.parents if (p / '.git').is_dir())
with tempfile.TemporaryDirectory(prefix='picocalc-edge-review-') as directory:
    work = Path(directory)
    subprocess.run(['python3', '-B', here.parent / '01-stage.py', work], check=True)
    subprocess.run(['cc', '-std=gnu11', '-O2', '-fsanitize=undefined', '-fno-sanitize-recover=all',
                    '-ffunction-sections', '-fdata-sections', '-I', work / 'picocalc-os/nucleus',
                    '-I', root / 'picocalc-os/nucleus', here / 'edge-review.c',
                    '-Wl,--gc-sections', '-o', work / 'check'], check=True)
    result = subprocess.check_output([work / 'check'], text=True)
    print(json.dumps(json.loads(result), indent=2))
