"""Independently audit one completed study boot against its linked firmware symbols."""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
from statistics import median
import struct
import subprocess

p = argparse.ArgumentParser(description=__doc__)
for key in ('serial', 'firmware_elf', 'manifest', 'supervisor_result'):
    p.add_argument(key, type=Path)
p.add_argument('--label', default='primary study boot')
a = p.parse_args()
lines = a.serial.read_text(errors='replace').splitlines()
assert sum('FCBENCH COMPLETE' in line for line in lines) == 1
assert not any('FCBENCH FAILED' in line or 'LABFAIL' in line for line in lines)
manifest = json.loads(a.manifest.read_text())
supervisor = json.loads(a.supervisor_result.read_text())

def fields(line):
    return dict(re.findall(r'(\w+)=([\w.-]+)', line))

def digest(data):
    return hashlib.sha256(data).hexdigest()

elf = a.firmware_elf.read_bytes()
assert elf[:6] == b'\x7fELF\x01\x01'
phoff, = struct.unpack_from('<I', elf, 28)
stride, num = struct.unpack_from('<HH', elf, 42)
segments = [struct.unpack_from('<8I', elf, phoff + i*stride) for i in range(num)]
symbols = subprocess.check_output(['nm', '-S', str(a.firmware_elf)], text=True)
start = fields(next(line for line in lines if 'FCBENCH START' in line))
assert [start[k] for k in ('core','hz','repeats','blocks','smoke')] == ['1','360000000','128','16','0']
code = fields(next(line for line in lines if 'FCBENCH CODE' in line))
code_receipt = {}
for label in ('old','next'):
    m = re.search(r'^(\w+) (\w+) T compare_'+label+r'$', symbols,re.M)
    addr,size = [int(x,16) for x in m.groups()]
    assert addr == int(code[label+'_ptr'],16)
    seg, = [s for s in segments if s[0]==1 and s[6]&1 and s[2]<=addr and addr+size<=s[2]+s[4]]
    offset = seg[1]+addr-seg[2]
    body = elf[offset:offset+size]
    assert manifest[label]['sha256'] == digest(body)
    assert start['old' if label=='old' else 'new'] == manifest[label]['compiler']['compiler/typed-rv32.js'][:16]
    fnv = 2166136261
    for b in body:
        fnv = ((fnv^b)*16777619)&0xffffffff
    assert fnv == int(code[label+'_fnv'],16) == manifest[label]['fnv']
    assert size == int(code[label+'_bytes']) == manifest[label]['bytes']
    code_receipt[label] = {'address':hex(addr),'bytes':size,'sha256':digest(body),'fnv':hex(fnv)}
assert int(code['old_ptr'],16)%64==int(code['next_ptr'],16)%64

trials = {}
phases = []
phase_run = {}
current = None
pairs = defaultdict(dict)
expected = {'equal91':0,'late91':-31,'prefix':-20,'first':7,'dir':-1}
for line in lines:
    status = re.search(r'\b(base|branch|compact|direct|pb|pd) compile source=bundle status=ok ',line)
    if status:
        f = fields(line)
        current = (status[1],int(f['us']),int(f['peak_js_bytes']),int(f['module_bytes']))
        phase_run = {}
    elif 'LABPHASE ' in line:
        lane,phase,visits,time,peak = line.split('LABPHASE ')[1].split()
        assert lane==current[0] and int(phase) not in phase_run
        phase_run[int(phase)] = {'visits':int(visits),'us':int(time),'bytes':int(peak)}
    elif 'LABSHA ' in line:
        block,position,lane,sha = line.split('LABSHA ')[1].split()
        assert lane==current[0] and int(block) not in trials.get(lane,{})
        assert current[3]==240452 and sha==supervisor['oracle']['lanes'][lane]['sha256']
        if lane in ('pb','pd'):
            assert set(phase_run)==set(range(12))
            assert max(x['bytes'] for x in phase_run.values())==current[2]
            phases.append((lane,phase_run))
        else:
            trials.setdefault(lane,{})[int(block)] = {'position':int(position),'us':current[1],'peak':current[2]}
    elif 'FCBENCH PAIR ' in line:
        row = fields(line)
        n,b = row['case'], int(row['block'])
        assert n in expected and b not in pairs[n]
        checksum = 2166136261
        for _ in range(128):
            checksum=((checksum^expected[n])*16777619)&0xffffffff
        assert int(row['hash'],16)==checksum
        assert row['first']==('new' if (list(expected).index(n)+b)%2 else 'old')
        pairs[n][b]=(int(row['old']),int(row['new']),row['first'])
assert set(trials)=={'base','branch','compact','direct'}
for blocks in trials.values():
    assert set(blocks)==set(range(4))
    assert {x['position'] for x in blocks.values()}==set(range(4))
for b in range(4):
    assert len({blocks[b]['position'] for blocks in trials.values()})==4
for row in supervisor['rows']:
    if row['lane'] in trials:
        assert trials[row['lane']][row['block']]=={k:row[k] for k in ('position','us','peak')}
cold={}
for lane,row in trials.items():
    cold[lane]={m:median([x[m] for x in row.values()]) for m in ('us','peak')}
    for m in ('us','peak'):
        cold[lane]['paired_'+m+'_candidate_minus_base']=median([r[m]-trials['base'][b][m] for b,r in row.items()])
phase_agg={}
for lane in ('pb','pd'):
    selected=[x for name,x in phases if name==lane]
    assert len(selected)==2
    phase_agg[lane]={i:{m:median([x[i][m] for x in selected]) for m in ('us','bytes','visits')} for i in range(12)}
stats={}
assert set(pairs)==set(expected)
for name,rows in pairs.items():
    assert set(rows)==set(range(16))
    assert Counter(x[2] for x in rows.values())=={'old':8,'new':8}
    stats[name]={}
    for which in ('all','old','new'):
        samples=[(old,new) for old,new,first in rows.values() if which in ('all',first)]
        stats[name][which]={'pairs':len(samples),'candidateWins':sum(b<a for a,b in samples),
            'savedCyclesPerCall':median([(a-b)/128 for a,b in samples]),
            'savedPct':median([(a-b)*100/a for a,b in samples])}
print(json.dumps({'source':a.label,'serialSHA256':digest(a.serial.read_bytes()),'core':start['core'],
    'hz':start['hz'],'code':code_receipt,'cold':cold,'phaseMedians':phase_agg,'warmPairs':stats},indent=2))
