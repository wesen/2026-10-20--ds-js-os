"""Use the staged C declarations and lifecycle routines with a checked native test entry."""
from pathlib import Path
import argparse
import subprocess
import tempfile

here=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('tree',type=Path)
parser.add_argument('arm',choices=['scalar','pie','witness','paired'])
args=parser.parse_args()
os=args.tree.resolve()/'picocalc-os'
main=os/'port/esp32p4/main'
receiver=(main/'mobile_painter_p4.c').read_text()
start=receiver.index('typedef int (*paint_entry)')
split=receiver.index('bool mobile_painter_source_allowed',start)
end=receiver.index('mobile_painter *mobile_painter_load',split)
with tempfile.TemporaryDirectory(prefix='receiver-abi-review-') as tmp:
    folder=Path(tmp)
    (folder/'staged-receiver.inc').write_text(receiver[start:split]+receiver[end:].split('#include "freertos/FreeRTOS.h"',1)[0])
    slot=(main/'mobile_painter_slot.c').read_text()
    (folder/'slot.c').write_text(slot+'''
typedef int (*expected_entry)(const void *,void *,void *,void *,void *,void *,void *,void *);
_Static_assert(__builtin_types_compatible_p(paint_entry,expected_entry),"slot handoff must take eight buffers");
_Static_assert(__builtin_types_compatible_p(__typeof__(&mobile_painter_generated),expected_entry),
               "slot target must take eight buffers");
''')
    exe=folder/'check'
    subprocess.run(['cc','-O2','-std=c11','-Wall','-Wextra','-Werror','-I',str(folder),
                    '-I',str(main),'-I',str(os/'nucleus'),'-DWITNESS='+str(int(args.arm in ('witness','paired'))),'-DPAIRED='+str(int(args.arm=='paired')),
                    str(here/'receiver-mock.c'),str(folder/'slot.c'),'-o',str(exe)],check=True)
    subprocess.run([exe],check=True)
