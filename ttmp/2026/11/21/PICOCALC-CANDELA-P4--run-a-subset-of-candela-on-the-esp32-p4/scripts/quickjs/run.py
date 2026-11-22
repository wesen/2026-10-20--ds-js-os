#!/usr/bin/env python3
"""run.py: run the QuickJS front-end measurements for Candela and append raw records to a JSONL file.

usage: python3 -I run.py --build-dir DIR --candela ROOT --out RAW.jsonl [--phases load,ggx,build,memo,node,stack,all,limit]
                         [--presets B-01,R-01,...] [--memo-presets ...]

Each record is one driver.mjs result (a line starting with "@@") plus what ran it: engine binary, arguments, the
host's load average before and after, the exit code and the tail of stderr. Processes run one after another (never
in parallel) so they do not compete with each other. summarize.py turns RAW.jsonl into the ticket's JSON and text.
"""
import argparse
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
DRIVER = os.path.join(HERE, 'driver.mjs')
PRESETS = ['B-01', 'R-01', 'F-01', 'A-01', 'L-03', 'W-02', 'G-01', 'K-01', 'X-02']


def loadavg():
    with open('/proc/loadavg') as f:
        return [float(x) for x in f.read().split()[:3]]


def run(out, phase, engine, cmd, cwd, timeout=3600):
    la0, t0 = loadavg(), time.time()
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, stdin=subprocess.DEVNULL)
        rc, so, se = p.returncode, p.stdout, p.stderr
    except subprocess.TimeoutExpired as e:
        rc, so, se = 'timeout', (e.stdout or b'').decode() if isinstance(e.stdout, bytes) else (e.stdout or ''), 'timeout'
    wall = time.time() - t0
    recs = [json.loads(line[2:]) for line in so.splitlines() if line.startswith('@@')]
    meta = {'phase': phase, 'engine': engine, 'cmd': cmd[1:], 'argv': cmd, 'rc': rc, 'processSeconds': round(wall, 2), 'loadavgBefore': la0,
            'loadavgAfter': loadavg(), 'stderrTail': se[-2000:] if (rc != 0 or not recs) else ''}
    if not recs:
        out.write(json.dumps({**meta, 'record': None}) + '\n')
    for r in recs:
        out.write(json.dumps({**meta, 'record': r}) + '\n')
    out.flush()
    print(f"{phase:6} {engine:7} rc={rc} {wall:7.1f}s la={la0[0]:.1f} {' '.join(cmd[2:])[-90:]}", flush=True)
    return recs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--build-dir', required=True)
    ap.add_argument('--candela', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--phases', default='load,ggx,build,memo,node,stack,all,limit')
    ap.add_argument('--presets', default=','.join(PRESETS))
    ap.add_argument('--memo-presets', default=','.join(PRESETS + ['K-09']))
    ap.add_argument('--procs', type=int, default=3)
    a = ap.parse_args()
    phases, presets, memo_presets = a.phases.split(','), a.presets.split(','), a.memo_presets.split(',')
    q = {w: os.path.join(a.build_dir, f'qjs{w}', 'candela-qjs') for w in ('64', '32')}
    cwd = os.path.dirname(os.path.abspath(a.out))
    with open(a.out, 'a') as out:
        if 'load' in phases:
            for w in ('64', '32'):
                for _ in range(5):
                    run(out, 'load', 'qjs' + w, [q[w], DRIVER, a.candela, 'load'], cwd)
            for _ in range(5):
                run(out, 'load', 'node', ['node', '--expose-gc', DRIVER, a.candela, 'load'], cwd)
        if 'ggx' in phases:
            for w in ('64', '32'):
                for _ in range(2):
                    run(out, 'ggx', 'qjs' + w, [q[w], DRIVER, a.candela, 'ggx', '3'], cwd)
            run(out, 'ggx', 'node', ['node', '--expose-gc', DRIVER, a.candela, 'ggx', '3'], cwd)
        if 'build' in phases:   # Candela as shipped: every compile recomputes the GGX table
            for pid in presets:
                for w in ('64', '32'):
                    for _ in range(a.procs):
                        run(out, 'build', 'qjs' + w, [q[w], DRIVER, a.candela, 'build', pid, '2'], cwd)
        if 'memo' in phases:    # the table computed once per runtime, before the first build
            for pid in memo_presets:
                for w in ('64', '32'):
                    for _ in range(a.procs):
                        run(out, 'memo', 'qjs' + w, [q[w], '--memo-ggx', DRIVER, a.candela, 'build', pid, '4'], cwd)
        if 'node' in phases:
            for pid in memo_presets:
                for _ in range(a.procs):
                    run(out, 'node', 'node', ['node', '--expose-gc', DRIVER, a.candela, 'build', pid, '4'], cwd)
        if 'stack' in phases:   # the ESP32-P4 gives a world's QuickJS 56 KB of C stack (port_p4.c port_js_stack)
            for pid in memo_presets:
                for w in ('32', '64'):
                    run(out, 'stack', 'qjs' + w, [q[w], '-s', '56', '--memo-ggx', DRIVER, a.candela, 'build', pid, '1'], cwd)
        if 'all' in phases:
            for w in ('64', '32'):
                run(out, 'all', 'qjs' + w, [q[w], '--memo-ggx', DRIVER, a.candela, 'all'], cwd)
            run(out, 'all', 'node', ['node', '--expose-gc', DRIVER, a.candela, 'all'], cwd)
        if 'limit' in phases:   # a world's default limit is 1 MB (nucleus/kernel.c); does Candela even load?
            for kb in ('1024', '2048'):
                run(out, 'limit', 'qjs32', [q['32'], '-m', kb, DRIVER, a.candela, 'load'], cwd)
            run(out, 'limit', 'qjs32', [q['32'], '-m', '4096', '--memo-ggx', DRIVER, a.candela, 'build', 'B-01', '1'], cwd)


if __name__ == '__main__':
    sys.exit(main())
