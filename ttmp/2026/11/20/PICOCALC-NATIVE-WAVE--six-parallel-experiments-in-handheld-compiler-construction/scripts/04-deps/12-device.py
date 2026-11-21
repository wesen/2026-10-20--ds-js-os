"""Use the release-readback runner. Require 5 rotated blocks x 3 arms x 3 edits x 2 apps."""
from pathlib import Path
base=next(Path(__file__).resolve().parents[2].parent.glob('PICOCALC-RELEASE-LAB--*'))/'scripts/incremental/11-device.py'
text=base.read_text();before="assert len(receipt['cold'])==4 and len(receipt['rows'])==44"
assert text.count(before)==1
replacement="""assert len(receipt['cold'])==4 and len(receipt['rows'])==90
            assert {(r['app'],r['key'],r['arm'],r['block']) for r in receipt['rows']} == {
                (app,edit,arm,block) for app in ('editor','chess') for edit in ('body','signature','layout')
                for arm in ('clean','global','precise') for block in range(5)}"""
exec(compile(text.replace(before,replacement),str(base),'exec'),{'__file__':str(base),'__name__':'__main__'})
