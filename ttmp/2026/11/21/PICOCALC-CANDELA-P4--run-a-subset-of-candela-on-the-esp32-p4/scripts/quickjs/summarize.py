#!/usr/bin/env python3
"""summarize.py: turn run.py's raw JSONL into the ticket's JSON summary and a short text report.

usage: python3 -I summarize.py OUT.json OUT.txt RAW.jsonl[:PHASE,PHASE...] [RAW2.jsonl[:PHASES] ...]
  A ":PHASES" suffix takes only those phases from that file (so a phase measured twice is counted once).

Definitions used below:
  cold   the first build in a fresh process (after Candela's modules are imported; with the memo, after the table
         has been computed once). Reported as the median over processes.
  warm   later builds in the same process, median over all of them.
  memo   candela-qjs --memo-ggx: ggxTableWGSL() keeps its first result, so builds exclude the constant GGX table.
  minus-table  a build without the memo, minus the median time of ggxAlbedoTable() alone (same engine).
  peakAbs      the largest heap (requested bytes) seen during the build, including Candela's loaded modules.
  peakDelta    peakAbs minus the heap at the start of the build (after a GC).
  retained     the heap still alive after the build and its five pack() calls (after a GC): the compiled scene,
               whatever pack() caches in it, and the last packed arrays. A renderer that packs every frame keeps this.
"""
import json
import statistics
import subprocess
import sys
from collections import defaultdict


def med(xs):
    xs = [x for x in xs if x is not None]
    return round(statistics.median(xs), 2) if xs else None


def mx(xs):
    xs = [x for x in xs if x is not None]
    return max(xs) if xs else None


def load(paths):
    rows = []
    for spec in paths:
        p, _, ph = spec.partition(':')
        keep = set(ph.split(',')) if ph else None
        with open(p) as f:
            rows += [r for r in (json.loads(line) for line in f if line.strip()) if keep is None or r['phase'] in keep]
    return rows


def sh(cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, shell=True).stdout.strip()
    except Exception as e:  # noqa: BLE001
        return f'error: {e}'


def main():
    out_json, out_txt, raws = sys.argv[1], sys.argv[2], sys.argv[3:]
    rows = load(raws)
    by = defaultdict(list)
    for r in rows:
        by[(r['phase'], r['engine'])].append(r)
    engines = ['qjs64', 'qjs32', 'node']
    S = {'meta': {}, 'load': {}, 'ggx': {}, 'presets': {}, 'all': {}, 'stack56': {}, 'limit': [], 'loadavg': {}}

    # ---------- load ----------
    for e in engines:
        recs = [r['record'] for r in by[('load', e)] if r['record']]
        if not recs:
            continue
        x = recs[0]
        S['load'][e] = {
            'processes': len(recs), 'importMsMedian': med([r['importMs'] for r in recs]),
            'importCpuMsMedian': med([r.get('importCpuMs') for r in recs]),
            'compileMsMedian': med([r['loader']['ms'] for r in recs]) if x.get('loader') else None,
            'modules': x['loader']['modules'] if x.get('loader') else None, 'sourceBytes': x['loader']['bytes'] if x.get('loader') else None,
            'heapEmptyRuntime': x['engine'].get('runtimeBytes'), 'heapAfterImport': x['memAfterImportGc']['cur'],
            'heapAfterImportAcct': x['memAfterImportGc'].get('curAcct'), 'peakDuringImport': x['memAfterImport'].get('peak'),
            'memUsage': x.get('memUsage'),
            'perModuleCompileMs': {m['name']: round(m['selfMs'], 2) for m in x['loader']['modulesList']} if x.get('loader') else None,
        }

    # ---------- ggx ----------
    for e in engines:
        recs = [r['record'] for r in by[('ggx', e)] if r['record']]
        if not recs:
            continue
        tab = [x for r in recs for x in r['table']['runs']]
        wg = [x for r in recs for x in r['tableWGSL']['runs']]
        cal = {k: {'ms': med([x['ms'] for r in recs for x in r['calib'][k]['runs']]), 'cpuMs': med([x['cpuMs'] for r in recs for x in r['calib'][k]['runs']]), 'steps': recs[0]['calib'][k]['steps']} for k in recs[0]['calib']}
        S['ggx'][e] = {'entries': recs[0]['table']['entries'], 'hash4dp': recs[0]['table']['hash4dp'], 'runs': len(tab),
                       'tableMsMedian': med([x['ms'] for x in tab]), 'tableCpuMsMedian': med([x['cpuMs'] for x in tab]),
                       'tableMsMin': min(x['ms'] for x in tab), 'tableSteps': tab[0]['steps'], 'tablePeakDelta': mx(x['peakDelta'] for x in tab),
                       'tableWGSLSteps': wg[0]['steps'], 'tableWGSLMsMedian': med([x['ms'] for x in wg]), 'tableWGSLCpuMsMedian': med([x['cpuMs'] for x in wg]), 'calibration': cal}

    # ---------- per preset ----------
    def summarize_builds(recs, table_cpu=None, table_ms=None, table_steps=None):
        if not recs:
            return None
        cold = [r['runs'][0] for r in recs]
        warm = [x for r in recs for x in r['runs'][1:]]
        okv = all(x['ok'] for r in recs for x in r['runs'])
        first = cold[0]
        d = {'processes': len(recs), 'ok': okv,
             'coldMsMedian': med([x['ms'] for x in cold]), 'coldCpuMsMedian': med([x.get('cpuMs') for x in cold]),
             'warmMsMedian': med([x['ms'] for x in warm]), 'warmCpuMsMedian': med([x.get('cpuMs') for x in warm]),
             'coldSteps': first.get('steps'), 'warmSteps': warm[0].get('steps') if warm else None,
             'coldMsAll': [x['ms'] for x in cold], 'warmMsAll': [x['ms'] for x in warm]}
        if not okv:
            d['errors'] = [x.get('error') or x.get('thrown') for r in recs for x in r['runs'] if not x['ok']][:2]
            return d
        d.update({'wgslBytes': first['wgslBytes'], 'wgslLines': first['wgslLines'], 'wgslHash': first['wgslHash'],
                  'wgslHashesAgree': len({x['wgslHash'] for r in recs for x in r['runs']}) == 1,
                  'peakAbs': mx(x['peakAbs'] for x in cold), 'peakAbsAcct': mx(x.get('peakAbsAcct') for x in cold),
                  'peakDelta': mx(x['peakDelta'] for x in cold), 'warmPeakDelta': mx(x['peakDelta'] for x in warm),
                  'stackBytes': mx(x.get('stackBytes') for r in recs for x in r['runs']),
                  'packStackBytes': mx(x['pack'].get('stackBytes') for r in recs for x in r['runs'] if x.get('pack')),
                  'retained': med([x['retained'] for x in cold]), 'stats': first.get('stats'),
                  'pack0FirstMsMedian': med([x['pack']['ms0'] for x in cold if x.get('pack')]),
                  'pack0MsMedian': med([x['pack']['ms0'] for r in recs for x in r['runs'] if x.get('pack')]),
                  'packTMsMedian': med([x['pack']['msT'] for r in recs for x in r['runs'] if x.get('pack')]),
                  'packTCpuMsMedian': med([x['pack'].get('cpuMsT') for r in recs for x in r['runs'] if x.get('pack')]),
                  'packTMedian3Median': med([x['pack'].get('msTmedian3') for r in recs for x in r['runs'] if x.get('pack')]),
                  'packSteps': first['pack'].get('stepsT') if first.get('pack') else None,
                  'packPeakDelta': mx(x['pack']['peakDelta'] for x in cold if x.get('pack')),
                  'packedBytes': first['pack']['packedBytes'] if first.get('pack') else None,
                  'packArrays': {k: v['len'] for k, v in first['pack']['arrays'].items()} if first.get('pack') else None,
                  'sourceBytes': recs[0]['sourceBytes']})
        if table_cpu is not None:
            d['coldMinusTableCpuMs'] = round(d['coldCpuMsMedian'] - table_cpu, 2)
            d['warmMinusTableCpuMs'] = round(d['warmCpuMsMedian'] - table_cpu, 2) if d['warmCpuMsMedian'] is not None else None
            d['coldMinusTableMs'] = round(d['coldMsMedian'] - table_ms, 2)
        if table_steps is not None and d.get('coldSteps') is not None:
            # deterministic: the shipped build's interrupt-counter steps minus the table's
            d['coldStepsMinusTable'] = d['coldSteps'] - table_steps
            d['warmStepsMinusTable'] = d['warmSteps'] - table_steps if d.get('warmSteps') is not None else None
            d['tableShareOfColdSteps'] = round(table_steps / d['coldSteps'], 4)
        if recs[0]['load'].get('memoPrewarm'):
            d['memoPrewarm'] = recs[0]['load']['memoPrewarm']
        return d

    ids = []
    for ph in ('build', 'memo', 'node'):
        for e in engines:
            for r in by[(ph, e)]:
                if r['record'] and r['record'].get('id') and r['record']['id'] not in ids:
                    ids.append(r['record']['id'])
    for pid in ids:
        P = {}
        for e in ('qjs64', 'qjs32'):
            g = S['ggx'].get(e, {})
            nb = [r['record'] for r in by[('build', e)] if r['record'] and r['record'].get('id') == pid]
            mb = [r['record'] for r in by[('memo', e)] if r['record'] and r['record'].get('id') == pid]
            P[e] = {'asShipped': summarize_builds(nb, g.get('tableCpuMsMedian'), g.get('tableMsMedian'), g.get('tableWGSLSteps')), 'memo': summarize_builds(mb)}
        P['node'] = summarize_builds([r['record'] for r in by[('node', 'node')] if r['record'] and r['record'].get('id') == pid])
        S['presets'][pid] = P

    # ---------- all ----------
    node_rows = {}
    for e in engines:
        rs = [r['record'] for r in by[('all', e)] if r['record'] and r['record']['mode'] == 'all-row']
        if not rs:
            continue
        if e == 'node':
            node_rows = {x['id']: x for x in rs}
        fails = [{'id': x['id'], 'error': x.get('error') or x.get('thrown')} for x in rs if not x['ok']]
        packfails = [{'id': x['id'], 'error': x['packError']} for x in rs if x.get('packError')]
        S['all'][e] = {'presets': len(rs), 'built': sum(1 for x in rs if x['ok']), 'failures': fails, 'packFailures': packfails,
                       'totalBuildMs': round(sum(x['ms'] for x in rs), 1), 'totalBuildCpuMs': round(sum(x.get('cpuMs') or 0 for x in rs), 1),
                       'medianBuildMs': med([x['ms'] for x in rs]), 'totalSteps': sum(x.get('steps') or 0 for x in rs) if e != 'node' else None,
                       'slowest': sorted(({'id': x['id'], 'ms': x['ms'], 'steps': x.get('steps'), 'peakDelta': x['peakDelta'], 'pack0Ms': x.get('pack', {}).get('ms0')} for x in rs), key=lambda y: -y['ms'])[:12],
                       'largestPeakDelta': sorted(({'id': x['id'], 'peakDelta': x['peakDelta'], 'retained': x.get('retained')} for x in rs), key=lambda y: -(y['peakDelta'] or 0))[:12],
                       'stackMaxBytes': mx(x.get('stackBytes') for x in rs), 'stackOver56KB': [x['id'] for x in rs if (x.get('stackBytes') or 0) > 56 * 1024],
                       'largestStack': sorted(({'id': x['id'], 'stackBytes': x.get('stackBytes')} for x in rs), key=lambda y: -(y['stackBytes'] or 0))[:8],
                       'rows': {x['id']: {'ok': x['ok'], 'ms': x['ms'], 'cpuMs': x.get('cpuMs'), 'steps': x.get('steps'), 'stackBytes': x.get('stackBytes'), 'peakAbs': x.get('peakAbs'), 'peakDelta': x['peakDelta'], 'retained': x.get('retained'),
                                          'wgslBytes': x.get('wgslBytes'), 'wgslHash': x.get('wgslHash'), 'pack0Ms': x.get('pack', {}).get('ms0'),
                                          'diags': x.get('diags', {}).get('codes')} for x in rs}}
    for e in ('qjs64', 'qjs32'):
        if e in S['all'] and node_rows:
            q = S['all'][e]['rows']
            both = [k for k in q if q[k]['ok'] and node_rows.get(k, {}).get('ok')]
            S['all'][e]['vsNode'] = {
                'compared': len(both), 'wgslIdentical': sum(1 for k in both if q[k]['wgslHash'] == node_rows[k]['wgslHash']),
                'wgslDiffer': [k for k in both if q[k]['wgslHash'] != node_rows[k]['wgslHash']],
                'diagsIdentical': sum(1 for k in both if q[k]['diags'] == node_rows[k].get('diags', {}).get('codes')),
                'packDiffer': [k for k in both if any(node_rows[k]['pack']['arrays'][a]['hash0'] != (S_all_raw_pack(rows, e, k) or {}).get(a) for a in node_rows[k]['pack']['arrays'])],
            }

    # ---------- stack, limit ----------
    for e in ('qjs32', 'qjs64'):
        for r in by[('stack', e)]:
            rec = r['record']
            if not rec:
                S['stack56'].setdefault(e, {})[r['cmd'][-2]] = {'ok': False, 'rc': r['rc'], 'stderr': r['stderrTail'][-400:]}
                continue
            x = rec['runs'][0]
            S['stack56'].setdefault(e, {})[rec['id']] = {'ok': x['ok'], 'error': (x.get('error') or x.get('thrown') or {}).get('message')}
    for r in by[('limit', 'qjs32')]:
        rec = r['record']
        c = r['cmd']
        tail = c[c.index(next(x for x in c if x.endswith('driver.mjs'))) + 2:]
        label = f"limit {c[c.index('-m') + 1]} KB{' --memo-ggx' if '--memo-ggx' in c else ''}: {' '.join(tail)}"
        S['limit'].append({'cmd': label, 'rc': r['rc'], 'ok': bool(rec) and (rec.get('mode') == 'load' or all(x['ok'] for x in rec.get('runs', []))),
                           'stderr': r['stderrTail'][-300:] if not rec else '', 'heapAfterImport': rec['memAfterImportGc']['curAcct'] if rec and rec.get('memAfterImportGc') else None})

    # ---------- load averages ----------
    for (ph, e), rs in list(by.items()):
        if not rs:
            continue
        S['loadavg'][f'{ph}/{e}'] = {'min1': min(r['loadavgBefore'][0] for r in rs), 'max1': max(r['loadavgBefore'][0] for r in rs)}

    S['meta'] = {
        'question': "Cost of Candela's front end (scene build + compile + pack) in the PicoCalc's QuickJS, measured on the x86-64 host",
        'quickjs': 'picocalc-os/third_party/quickjs, VERSION 2026-06-04, with the three picocalc-os patches in its PATCHES file (interrupt counter init 1000, counter getters, ESP_PLATFORM timezone path)',
        'quickjsFlags': '-O2 -fwrapv -fno-strict-aliasing -w -D_GNU_SOURCE -DCONFIG_VERSION="2026-06-04" (the device: CONFIG_COMPILER_OPTIMIZATION_PERF, -fwrapv -fno-strict-aliasing)',
        'build32': '-m32 -msse2 -mfpmath=sse -fno-pie -fno-stack-protector, an empty gnu/stubs-32.h, crt-i386.S, linked by path against /usr/lib32/libc.so.6 libm.so.6 libgcc_s.so.1 (libc6-dev-i386 is not installed)',
        'hostCpu': sh("lscpu | sed -n 's/^Model name:[ ]*//p'"), 'kernel': sh('uname -sr'), 'gcc': sh('gcc --version | head -1'), 'node': sh('node --version'),
        'governor': sh('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor'),
        'shims': ['atob (native, in candela-qjs.c): WHATWG forgiving-base64 decode; QuickJS has none and preset K-09 calls it',
                  'performance.now() and console (candela-qjs.c)',
                  '--memo-ggx (optional, in candela-qjs.c\'s module loader): an in-memory rewrite of src/kernel.js so that ggxTableWGSL() keeps its first result; the file is not changed'],
        'definitions': __doc__.split('Definitions used below:')[1].strip(),
        'commands': [
            'sh scripts/quickjs/build.sh $REPO $S/qjs-build-v2 both',
            'python3 -I scripts/quickjs/run.py --build-dir $S/qjs-build-v2 --candela $S/candela-run --out RAW.jsonl --phases ...',
            'python3 -I scripts/quickjs/summarize.py various/03-quickjs-front-end.json various/03-quickjs-front-end.txt RAW.jsonl ...',
        ],
        'rawFiles': raws,
        'rawCopiesInTicket': ['various/03-quickjs-front-end-' + r.split('/')[-1].split(':')[0] + '.gz' for r in raws],
        'stackNote': 'stack56 = built once with candela-qjs -s 56 (JS_SetMaxStackSize, measured from the stack top JS_NewRuntime records); '
                     'all.*.stackMaxBytes = C stack high-water from main()\'s frame (host.stackPaint/stackUsed), unlimited stack. The two differ by under 1 KB.',
        # one real command line per (phase, engine), as run.py ran it (the binary is the first element)
        # (records written before run.py kept argv hold cmd without the binary; QJS_BUILD_DIR names it)
        'exactCommands': {f'{ph}/{e}': rs[0].get('argv') or [binary(e)] + rs[0]['cmd'] for (ph, e), rs in by.items() if rs},
    }
    with open(out_json, 'w') as f:
        json.dump(S, f, indent=1)
    with open(out_txt, 'w') as f:
        f.write(text(S))


_pack_cache = {}


def S_all_raw_pack(rows, e, pid):
    """hash0 per packed array for preset pid in engine e's `all` run (summaries drop the arrays)."""
    if (e, pid) not in _pack_cache:
        for r in rows:
            rec = r['record']
            if r['phase'] == 'all' and r['engine'] == e and rec and rec.get('mode') == 'all-row' and rec.get('pack'):
                _pack_cache[(e, rec['id'])] = {a: v['hash0'] for a, v in rec['pack']['arrays'].items()}
    return _pack_cache.get((e, pid))


def binary(e):
    import os
    bd = os.environ.get('QJS_BUILD_DIR', '$QJS_BUILD_DIR')
    return 'node' if e == 'node' else f'{bd}/{e}/candela-qjs'


def findings(S):
    """the short summary at the top of the text report, computed from the numbers below it"""
    F = ['Findings']
    g6, g3 = S['ggx'].get('qjs64'), S['ggx'].get('qjs32')
    b = S['presets'].get('B-01', {})
    if g6 and g3 and b:
        a = b['qjs64']['asShipped']
        F.append(f"- The GGX table dominates: {g6['tableCpuMsMedian']:,.0f} ms (64-bit) / {g3['tableCpuMsMedian']:,.0f} ms (32-bit) of CPU and {g6['tableSteps']:,} steps per compile, "
                 f"{a['tableShareOfColdSteps'] * 100:.2f}% of B-01's steps. With it computed once, B-01 builds in {b['qjs64']['memo']['coldCpuMsMedian']} / {b['qjs32']['memo']['coldCpuMsMedian']} ms.")
    small = [pid for pid in ('B-01', 'R-01', 'F-01', 'A-01', 'L-03', 'W-02', 'G-01') if pid in S['presets']]
    if small:
        ms = [S['presets'][p]['qjs32']['memo']['coldCpuMsMedian'] for p in small]
        pk = [S['presets'][p]['qjs32']['memo']['peakAbs'] for p in small]
        F.append(f"- Simple scenes ({', '.join(small)}), table memoized, 32-bit: {min(ms)}-{max(ms)} ms per cold build, pack under 1.5 ms, "
                 f"heap peak {kb(min(pk))}-{kb(max(pk))} KB with Candela loaded (about {kb(S['load']['qjs32']['heapAfterImport'])} KB of that is Candela's modules).")
    heavy = [(p, S['presets'][p]['qjs32']['memo']) for p in ('K-01', 'K-09', 'X-02') if p in S['presets']]
    if heavy:
        F.append('- Heavy scenes, 32-bit, memoized: ' + '; '.join(f"{p} {m['coldCpuMsMedian']:,.0f} ms cold, peak {kb(m['peakAbs'])} KB, kept {kb(m['retained'])} KB" for p, m in heavy)
                 + (f"; X-02's pack() alone {S['presets']['X-02']['qjs32']['memo']['packTMsMedian']:,.0f} ms per call (BVH rebuilt each pack)." if 'X-02' in S['presets'] else '.'))
    a3 = S['all'].get('qjs32')
    if a3:
        F.append(f"- All presets: {a3['built']}/{a3['presets']} build in QuickJS with one shim (atob, for K-09); generated WGSL and diagnostics are byte-identical to Node's for all of them.")
        F.append(f"- Limits a world would hit: Candela alone needs about {kb(S['load']['qjs32']['heapAfterImportAcct'])} KB charged (a world's default limit is 1,024 KB: import fails); "
                 f"C stack up to {kb(a3['stackMaxBytes'])} KB in 32-bit ({' '.join(a3['stackOver56KB']) or 'none'} over the P4's 56 KB), deeper in 64-bit.")
    F.append("- QuickJS-specific: no atob; `//# sourceURL` is ignored, so diag.js callSite() cannot see user frames (<input>:line:col) in a bundled build.")
    return F


def kb(x):
    return '-' if x is None else f'{x / 1024:,.0f}'


def text(S):
    L = []
    m = S['meta']
    L.append("Candela's front end in the PicoCalc's QuickJS, on the x86-64 host")
    L.append('=' * 66)
    L.append(f"QuickJS: {m['quickjs']}")
    L.append(f"flags: {m['quickjsFlags']}")
    L.append(f"32-bit: {m['build32']}")
    L.append(f"host: {m['hostCpu']}, {m['kernel']}, {m['gcc']}, Node {m['node']}, governor {m['governor']}")
    L.append('')
    L += findings(S)
    L.append('')
    L.append('Module load (import src/candela.js, 15 modules), median of 5 fresh processes')
    for e, x in S['load'].items():
        L.append(f"  {e:6} import {x['importMsMedian']} ms (cpu {x['importCpuMsMedian']}), of which compile {x['compileMsMedian'] if x['compileMsMedian'] is not None else '-'} ms; "
                 f"heap: empty runtime {kb(x['heapEmptyRuntime'])} KB, after import {kb(x['heapAfterImport'])} KB requested / {kb(x['heapAfterImportAcct'])} KB charged")
    L.append('')
    L.append('GGX albedo table (kernel.js ggxAlbedoTable, 16x16x512x16 samples), recomputed by every compile')
    for e, x in S['ggx'].items():
        cal = x['calibration']
        L.append(f"  {e:6} {x['tableMsMedian']} ms wall, {x['tableCpuMsMedian']} ms cpu (min {x['tableMsMin']}), {'-' if x['tableSteps'] is None else format(x['tableSteps'], ',')} steps; "
                 f"calibration loop100k {cal['loop100k']['cpuMs']} ms, fib20 {cal['fib20']['cpuMs']} ms")
    L.append('')
    L.append('Per preset. Times in ms (CPU time of the process; wall in the JSON). cold = first build in a fresh process, median of')
    L.append('3 processes; warm = later builds. "shipped" = Candela unchanged (each build recomputes the table); "memo" = table once.')
    hdr = f"{'id':5} {'eng':5} {'shipped cold':>12} {'warm':>8} {'memo cold':>9} {'warm':>7} {'steps(memo)':>12} {'pack0':>7} {'packT':>7} {'WGSL B':>7} {'lines':>5} {'peak KB':>8} {'+build':>7} {'kept':>6}"
    L.append(hdr)
    for pid, P in S['presets'].items():
        for e in ('qjs64', 'qjs32'):
            a, b = P[e]['asShipped'], P[e]['memo']
            if not b and not a:
                continue
            ref = b or a
            if not ref['ok']:
                L.append(f"{pid:5} {e[3:]:5} FAILED {ref.get('errors')}")
                continue
            L.append(f"{pid:5} {e[3:]:5} {str(a['coldCpuMsMedian']) if a else '-':>12} {str(a['warmCpuMsMedian']) if a else '-':>8} "
                     f"{str(b['coldCpuMsMedian']) if b else '-':>9} {str(b['warmCpuMsMedian']) if b else '-':>7} {(b or a)['coldSteps'] or 0:>12,} "
                     f"{str(ref['pack0FirstMsMedian']):>7} {str(ref['packTMsMedian']):>7} {ref['wgslBytes']:>7} {ref['wgslLines']:>5} "
                     f"{kb(ref['peakAbs']):>8} {kb(ref['peakDelta']):>7} {kb(ref['retained']):>6}")
        n = P.get('node')
        if n and n['ok']:
            L.append(f"{pid:5} {'node':5} {str(n['coldCpuMsMedian']):>12} {str(n['warmCpuMsMedian']):>8} {'':>9} {'':>7} {'':>12} {str(n['pack0FirstMsMedian']):>7} {str(n['packTMsMedian']):>7} {n['wgslBytes']:>7} {n['wgslLines']:>5}")
    L.append("  peak KB = largest heap during the cold build, Candela's modules included (requested bytes); +build = above the")
    L.append('  heap at the start of the build; kept = heap alive after the build and its packs. pack0 = first pack({time:0}) in the process,')
    L.append('  packT = pack({time:2.5}), median over all builds (ms wall).')
    L.append('')
    for e, x in S['all'].items():
        L.append(f"All presets, {e}: {x['built']}/{x['presets']} built; total {x['totalBuildMs']:,.0f} ms wall, median {x['medianBuildMs']} ms per preset"
                 + (' (memo)' if e != 'node' else ''))
        for fl in x['failures']:
            L.append(f"  FAILED {fl['id']}: {fl['error']}")
        if x.get('vsNode'):
            v = x['vsNode']
            L.append(f"  vs Node: WGSL identical {v['wgslIdentical']}/{v['compared']}, diagnostics identical {v['diagsIdentical']}/{v['compared']}, packed data differs in {len(v['packDiffer'])}: {' '.join(v['packDiffer'])}")
        L.append('  slowest: ' + ', '.join(f"{y['id']} {y['ms']:,.0f} ms" for y in x['slowest'][:8]))
        if e != 'node':
            L.append('  largest build heap (above the heap at build start): ' + ', '.join(f"{y['id']} {kb(y['peakDelta'])} KB" for y in x['largestPeakDelta'][:8]))
            if x.get('stackMaxBytes'):
                L.append(f"  C stack high-water: max {kb(x['stackMaxBytes'])} KB; over 56 KB: {' '.join(x['stackOver56KB']) or 'none'}; deepest: "
                         + ', '.join(f"{y['id']} {kb(y['stackBytes'])} KB" for y in x['largestStack'][:6]))
    L.append('')
    for e, d in S['stack56'].items():
        bad = {k: v for k, v in d.items() if not v['ok']}
        L.append(f"56 KB JS stack ({e}): {len(d) - len(bad)}/{len(d)} presets build" + (f"; failed: {bad}" if bad else ''))
    for x in S['limit']:
        err = [ln.strip() for ln in x['stderr'].splitlines() if 'Error' in ln][:1]
        L.append(f"memory {x['cmd']} -> {'ok' if x['ok'] else 'FAILED: ' + (err[0] if err else x['stderr'].strip()[:120])}")
    L.append('')
    g = S['ggx'].get('qjs32')
    if g:
        c = g['calibration']
        r1, r2 = 133.0 / c['loop100k']['cpuMs'], 31.0 / c['fib20']['cpuMs']
        L.append('For scale only, not a device measurement: the nucleus calibrates QuickJS on the ESP32-P4 at 133 ms for its')
        L.append(f"100k loop and 31 ms for fib(20) (nucleus/vm.c). In 32-bit QuickJS here they take {c['loop100k']['cpuMs']} and {c['fib20']['cpuMs']} ms of CPU,")
        L.append(f"ratios {r1:.0f}x and {r2:.0f}x. The GGX table ({g['tableCpuMsMedian']:,.0f} ms here) would scale to about {g['tableCpuMsMedian'] * r2 / 1000:,.0f}-{g['tableCpuMsMedian'] * r1 / 1000:,.0f} s;")
        b = S['presets'].get('B-01', {}).get('qjs32', {}).get('memo')
        if b:
            L.append(f"B-01 with the table memoized ({b['coldCpuMsMedian']} ms cold, {b['warmCpuMsMedian']} ms warm here) to about {b['coldCpuMsMedian'] * r2:,.0f}-{b['coldCpuMsMedian'] * r1:,.0f} ms cold.")
        L.append('The table is double-precision float work; the P4 has no double-precision FPU, so if anything it scales worse than both.')
        L.append('')
    L.append('Host load average (1 min) while measuring: ' + ', '.join(f"{k} {v['min1']}-{v['max1']}" for k, v in S['loadavg'].items()))
    return '\n'.join(L) + '\n'


if __name__ == '__main__':
    main()
