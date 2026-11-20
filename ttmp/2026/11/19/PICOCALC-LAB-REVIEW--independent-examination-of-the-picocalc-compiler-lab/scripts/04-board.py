"""Audit complete boot receipts, validate identity/position/partitions, and derive paired effects."""
from collections import Counter
from pathlib import Path
from statistics import median
import hashlib
import json
import sys


def effects(by_block, reference, candidate, field):
    a = [block[reference][field] for block in by_block]
    b = [block[candidate][field] for block in by_block]
    diff = [y-x for x,y in zip(a,b)]
    return {'referenceMedian':median(a), 'candidateMedian':median(b),
            'pairedMedian':median(diff), 'pairedRange':[min(diff),max(diff)],
            'deltaOfMaxima':max(b)-max(a), 'paired':diff}


def inspect(path):
    data = json.loads(path.read_bytes())
    trace = 'variants' in data['compilers']
    lane_key = 'variant' if trace else 'lane'
    result = {'receiptSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
              'firmware':data.get('firmware', data.get('firmware_sha256')), 'boots':[]}
    for number, boot in enumerate(data['boots'],1):
        rows = boot['rows']
        variants = sorted({r[lane_key] for r in rows})
        n = len(variants)
        blocks = n if trace else 2*n
        assert len(rows) == 3 * n * blocks
        output = {'number':number,'compileSamples':len(rows),'apps':{}}
        for app in ('files','agenda','editor'):
            by_block = []
            for i in range(blocks):
                sample = [r for r in rows if r['app']==app and r['block']==i]
                group = {r[lane_key]:r for r in sample}
                assert sorted(group)==variants and len(sample)==n
                assert sorted(r['position'] for r in sample)==list(range(n))
                for lane,r in group.items():
                    oracle = data['oracle']['outputs'][app][lane] if trace else data['oracle'][lane][app]
                    assert r['sha256']==oracle['sha256'] and r['bytes']==oracle['bytes']
                    if trace and lane.endswith('_trace'):
                        phases=r['phases'].values()
                        assert sum(p['us'] for p in phases)==r['us'] and max(p['peak'] for p in phases)==r['peak']
                    if not trace: assert r['streamed']
                by_block.append(group)
            table=output['apps'][app]={}
            for lane in variants:
                counts=Counter(group[lane]['position'] for group in by_block)
                assert len(counts)==n and set(counts.values())=={blocks//n}
                if lane=='base': continue
                table[lane]={f:effects(by_block,'base',lane,f) for f in ('us','peak')}
            if trace:
                table['markerCostUs']={v:effects(by_block,v,v+'_trace','us')['pairedMedian']
                                        for v in ['base','cursor']}
            if not trace and 'always' in variants:
                table['selectVsAlways']={f:effects(by_block,'always','select',f) for f in ('us','peak')}
        result['boots'].append(output)
    return result


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: 04-board.py physical-receipt.json')
    p = Path(sys.argv[1])
    print(json.dumps({p.name:inspect(p)},indent=2))
