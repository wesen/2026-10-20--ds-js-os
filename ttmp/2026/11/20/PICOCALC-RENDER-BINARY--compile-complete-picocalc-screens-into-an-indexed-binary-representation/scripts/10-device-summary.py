"""Validate fixed arms against frozen semantic witnesses and summarize P4 block means."""
import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path
import statistics

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('specimens', type=Path)
parser.add_argument('receipts', type=Path, nargs='+')
args = parser.parse_args()
frozen = json.loads(args.specimens.read_text())['receipts']
expected = {'binary': ('P', 'G', 'B'), 'nativebin': ('G', 'B'), 'nativeprod': ('G', 'B')}
groups = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
runs = []
for path in args.receipts:
    raw = path.read_bytes()
    receipt = json.loads(raw)
    assert not receipt['failures'], receipt['failures']
    file = {key: receipt[key] for key in ('firmwareSha256', 'experimentSha256')}
    file.update({'sha256': hashlib.sha256(raw).hexdigest(), 'restored': bool(receipt.get('restored')),
                 'trials': len(receipt['runs'])})
    runs.append(file)
    for row in receipt['runs']:
        name, block, data = row['name'], row['block'], row['data']
        app, arm = row['arm'].split('-')
        check = frozen[app]['fixtureChecksums']
        assert data['reps'] == row['reps'] == (1 if name == 'binary' else 8)
        assert arm in expected[name]
        if name != 'nativeprod':
            for key in ['lookupHash', 'repeatLookupHash', 'walkHash', 'paintHash', 'paintCommands', 'repeatPaintHash', 'repeatPaintCommands']:
                if key in check and (name == 'binary' or not key.startswith(('paint', 'repeatPaint'))):
                    assert data[key] == (check[key] if name == 'binary' else check[key] & 0xffffffff), (app, arm, key, data[key], check[key])
        else:
            assert data['lookupHash'] == (check['lookupHash'] & 0xffffffff)
            assert data['walkHash'] == (check['walkHash'] & 0xffffffff)
        measures = {key: value / data['reps'] for key, value in data.items() if key.endswith('Us')}
        if name == 'binary':
            measures['admitPaintUs'] = measures['admitUs'] + measures['paintUs']
            measures['routePaintUs'] = measures['admitPaintUs'] + measures['encodeUs']
        if name == 'nativebin':
            measures['admitWalkReleaseUs'] = measures['admitUs'] + measures['walkUs'] + measures['releaseUs']
        groups[name][app][arm].append((block, data, measures))
for name, group in groups.items():
    assert set(group) == set(frozen)
    for app, arms in group.items():
        assert set(arms) == set(expected[name])
        for arm, rows in arms.items():
            assert sorted(b for b, _, _ in rows) == list(range(7))
            assert len({data['bytes'] for _, data, _ in rows}) == 1
summary = {}
for name, group in groups.items():
    summary[name] = {}
    for app, arms in group.items():
        summary[name][app] = {}
        for arm, rows in arms.items():
            values = {key: [m[key] for _, _, m in rows] for key in rows[0][2]}
            selected = rows[0][1]
            summary[name][app][arm] = {
                'bytes': selected['bytes'], 'blocks': len(rows), 'repsPerBlock': selected['reps'],
                'medianUs': {key: statistics.median(v) for key, v in values.items()},
                'rangeUs': {key: [min(v), max(v)] for key, v in values.items()},
                **{key: value for key, value in selected.items() if key.endswith('Hash') or key in ('binaryScratchBytes',)}
            }
args.output.write_text(json.dumps({'runs': runs, 'summary': summary}, indent=2) + '\n')
