"""Compare every RGB565 byte and use the shared QuickJS allocator meter."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import statistics
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('capsule', type=Path)
parser.add_argument('verification', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
here = Path(__file__).resolve().parent
base = here.parents[5]
os_root = base / 'picocalc-os'
lab, = here.parents[1].glob('PICOCALC-RENDER-LAB--*/scripts')
sysmon, = here.parents[1].glob('PICOCALC-RENDER-SYSTEM--*/scripts')
cc = ['cc', '-O2']
state = json.loads((args.verification / 'host-checks.json').read_text())
capsule_info = json.loads(args.capsule.with_suffix('.js.json').read_text())
pixels = 320 * 320 * 2
codec = here / '02-binary-screen.js'
apps = ['sysmon', 'chess', 'snake', 'editor']


def sha(buf):
    return hashlib.sha256(buf).hexdigest()


def rasterize(raster, app, arm, target):
    with (args.verification / f'{app}.{arm}.ops').open('rb') as commands, target.open('wb') as out:
        subprocess.run([raster], stdin=commands, stdout=out, check=True)


def compare_raster(raster, work, app):
    g, b = work / 'reference.rgb565', work / 'binary.rgb565'
    rasterize(raster, app, 'G', g)
    rasterize(raster, app, 'B', b)
    checked = []
    records = state['receipts'][app]['evidence']
    with g.open('rb') as reference, b.open('rb') as candidate:
        for row in records:
            if row['skippedFlushRetried']:
                skipped = reference.read(pixels)
                assert len(skipped) == pixels and skipped == candidate.read(pixels)
            expected, actual = reference.read(pixels), candidate.read(pixels)
            assert len(expected) == pixels and expected == actual, row['id']
            checked.append(sha(expected))
        assert not reference.read(1) and not candidate.read(1)
    totals = {}
    for key in ('jsonBytes', 'rawBinaryBytes', 'dictionaryBytes', 'dictionaryEntries', 'base64Bytes', 'jsonEnvelopeBytes'):
        values = [r[key] for r in records]
        totals[key] = {'total': sum(values), 'median': statistics.median(values), 'max': max(values)}
    return {'frames': len(checked), 'equalRGB565Bytes': len(checked) * pixels, 'pixelSha256': checked, 'wire': totals}


def build_meter(work):
    meter_src = work / 'host-heap.c'
    source = (sysmon / '14-host-heap.c').read_text()
    start = source.index('      printf("{\\"resident\\"')
    end = source.index('      JS_FreeCString(ctx,v);', start)
    source = source[:start] + '''      JS_RunGC(rt);
      printf("{\\"resident\\":%zu,\\"peakAbove\\":%zu,\\"liveAbove\\":%zu,\\"result\\":%s}",
             start,m.peak-start,m.used>=start?m.used-start:0,v);
''' + source[end:]
    meter_src.write_text(source)
    engine = os_root / 'third_party/quickjs'
    objects = [os_root / f'build/eng/{name}.o' for name in ('quickjs', 'libregexp', 'libunicode', 'dtoa', 'cutils')]
    options = []
    if not all(path.is_file() for path in objects):
        objects = [engine / f'{p.stem}.c' for p in objects]
        options = ['-D_GNU_SOURCE', '-DCONFIG_VERSION="2026-06-04"']
    binary = work / 'meter'
    subprocess.run([*cc, *options, f'-I{engine}', meter_src, *objects, '-lm', '-lpthread', '-ldl', '-o', binary], check=True)
    return binary


def measure(binary, work):
    def call(script, arm):
        return json.loads(subprocess.check_output([binary, script, arm]))
    hold = work / 'hold.js'
    hold.write_text(args.capsule.read_text() + '''
let retained = [];
renderLabRun = function(spec) {
    const [app, arm, count] = spec.split('-');
    const fixture = binaryFixtures[app];
    const keepTransportCopies = !arm.endsWith('o');
    for (let i = 0; i < Number(count); i++) {
        const wire = arm.startsWith('B') ? binaryScreen.encode(fixture.payload) : JSON.stringify(fixture.payload);
        const root = arm.startsWith('B') ? createBinaryView(wire, app).root :
            arm.startsWith('G') ? admitJSON(wire, app) : parseProductionJSON(wire, app);
        retained.push({root, wire: keepTransportCopies ? wire : undefined});
    }
    return JSON.stringify({count: retained.length, walkHash: retained.reduce((sum, item) => (sum + fullWeight(item.root)) | 0, 0)});
};
''')
    # Full measurement once per fresh realm. The bytecode and immutable fixtures are loaded before the baseline.
    trials = {app: {arm: [call(args.capsule, f'{app}-{arm}') for _ in range(5)] for arm in ['P', 'G', 'B']} for app in apps}
    retained = {}
    for app in apps:
        retained[app] = {}
        for generations in [1, 2, 3]:
            retained[app][generations] = {
                arm: call(hold, f'{app}-{arm}-{generations}') for arm in ['P', 'G', 'B', 'Po', 'Go', 'Bo']
            }
            assert len({v['result']['walkHash'] for v in retained[app][generations].values()}) == 1
    footprint = {'rawCapsule': call(args.capsule, 'compile'), 'codecOnly': call(codec, 'compile'),
                 'residentCatalogBytes': 0, 'residentTemplateBytes': 0}
    return {'x86QuickJS': trials, 'retained': retained, 'footprint': footprint}


with tempfile.TemporaryDirectory(prefix='pico-binary-host-') as temporary:
    work = Path(temporary)
    driver = work / 'raster'
    nucleus = os_root / 'nucleus'
    subprocess.run([*cc, f'-I{nucleus}', '-ffunction-sections', '-fdata-sections', lab / '03-raster-driver.c',
        nucleus / 'gfx.c', nucleus / 'util.c', '-Wl,--gc-sections', '-o', driver], check=True)
    raster = {app: compare_raster(driver, work, app) for app in apps}
    metrics = measure(build_meter(work), work)
receipt = {'machine': platform.machine(), 'capsule': capsule_info, 'raster': raster, 'metrics': metrics}
args.output.write_text(json.dumps(receipt, indent=2) + '\n')
for app in apps:
    r = raster[app]
    print(app, 'frames', r['frames'], 'JSON and binary bytes', r['wire']['jsonBytes']['total'], r['wire']['rawBinaryBytes']['total'])
