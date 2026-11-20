"""Collect the PicoCalc's actual camera commits, validate SPI/host pixels and preserve their native colors."""
import base64
import hashlib
import json
import re
import struct
import time
import zlib
from array import array
from pathlib import Path
from statistics import median
import sys

from PIL import Image

SCREEN = 320 * 320 * 2
BODY_OFFSET = 22 * 320 * 2
BASE64_LINE = re.compile(rb'^[A-Za-z0-9+/]+=*$')
RGB565 = tuple(bytes(((v >> 11) * 255 // 31, ((v >> 5) & 63) * 255 // 63, (v & 31) * 255 // 31))
               for v in range(65536))


def start(console):
    # A previous endpoint check may have coincided with a status-bar repaint.
    deadline = time.monotonic() + 4
    while True:
        result = console.command('camobs start', timeout=5)
        if 'camera capture active' in result:
            return
        if 'camobs: initial SPI pixels differ' not in result or time.monotonic() >= deadline:
            raise ValueError(f'Unable to arm animation capture: {result}')
        time.sleep(.08)


def status(console):
    lines = console.command('camobs status', timeout=8)
    state = next(line for line in lines if line.startswith('CAMSTATE '))
    count, faults, spi_faults, active = map(int, state.split()[1:])
    if faults or spi_faults:
        raise ValueError(f'Camera phase sequence, handle or SPI comparison failed: {state}')
    rows = []
    for line in lines:
        if not line.startswith('CAMFRAME '):
            continue
        seq, phase, owner, epoch, handle, begin, commit, panel = map(int, line.split()[1:])
        if seq != len(rows) or phase != seq % 32 or begin > commit:
            raise ValueError(f'Invalid physical camera sequence: {line}')
        rows.append({'sequence': seq, 'phase': phase, 'world': owner, 'epoch': epoch, 'handle': handle,
                     'painterBeginUs': begin, 'commitUs': commit, 'panelUs': panel})
    if count != len(rows) or (count == 33 and active):
        raise ValueError(f'Inconsistent camera observer state: {state}')
    return rows


def shot(console, seq):
    console.send(f'camobs shot {seq}')
    deadline = time.monotonic() + 45
    size = end = None
    ack = False
    payload = []
    while not (end and ack):
        line = console.line(deadline)
        if line == b'#OK camobs':
            ack = True
        elif line.startswith(b'camobs:'):
            raise ValueError(line.decode())
        elif line.startswith(b'#SHOT '):
            size = tuple(map(int, line.split()[1:]))
        elif line.startswith(b'#END '):
            end = line.split()
        elif size and not end and BASE64_LINE.fullmatch(line):
            payload.append(line)
    if size != (320, 320):
        raise ValueError(f'Invalid frame dimensions for phase {seq}: {size}')
    packed = base64.b64decode(b''.join(payload), validate=True)
    if len(packed) != 4 * int(end[2]):
        raise ValueError(f'RLE run count differs for phase {seq}')
    frame = bytearray()
    for count, value in struct.iter_unpack('<HH', packed):
        if not count or len(frame) + 2 * count > SCREEN:
            raise ValueError(f'Invalid RLE extent for phase {seq}')
        frame.extend(struct.pack('<H', value) * count)
    if len(frame) != SCREEN or zlib.crc32(frame) != int(end[1], 16):
        raise ValueError(f'Invalid framebuffer length or CRC for phase {seq}')
    return bytes(frame)


def rgb(frame):
    words = array('H')
    words.frombytes(frame)
    if sys.byteorder != 'little':
        words.byteswap()
    return Image.frombytes('RGB', (320, 320), b''.join(RGB565[word] for word in words))


def physical_gif(images, rows, path):
    # SPI-complete inter-phase intervals in each eight-step real turn. Endpoint holds
    # include host UART verification between keys; replace those pauses with one
    # measured within-quarter interval in the looping presentation.
    durations = []
    for i in range(32):
        if i % 8 == 0:
            delta = median(rows[j+1]['panelUs'] - rows[j]['panelUs'] for j in range(i+1, i+8))
        else:
            delta = rows[i+1]['panelUs'] - rows[i]['panelUs']
        durations.append(max(10, round(delta / 10000) * 10))
    paletted, max_colors = [], 0
    for im in images:
        colors = im.getcolors(320*320)
        max_colors = max(max_colors, len(colors))
        paletted.append(im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
    paletted[0].save(path, save_all=True, append_images=paletted[1:], duration=durations,
                     loop=0, disposal=2, optimize=False)
    exact = []
    with Image.open(path) as gif:
        if gif.n_frames != 32 or gif.size != (320,320) or gif.info.get('loop') != 0:
            raise ValueError('GIF sequence did not retain the 32 physical frames')
        for i, im in enumerate(images):
            gif.seek(i)
            exact.append(gif.convert('RGB').tobytes() == im.tobytes())
            if gif.info.get('duration') != durations[i]:
                raise ValueError(f'GIF delay differs at phase {i}')
    return {'durationMs': durations, 'fullColorExactFrames': sum(exact),
            'maxPhysicalColorsPerFrame': max_colors, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'endpointDwell':'The operator waits between keys; GIF substitutes the median within-turn interval.'}


def collect(console, reference, output):
    reference, output = Path(reference), Path(output)
    deadline = time.monotonic() + 8
    while True:
        rows = status(console)
        if len(rows) == 33 and all(row['panelUs'] for row in rows):
            break
        if time.monotonic() >= deadline:
            raise ValueError(f'Expected 33 SPI-verified camera states; received {rows}')
        time.sleep(.1)
    if len({(r['world'],r['epoch'],r['handle']) for r in rows}) != 1:
        raise ValueError('Compositor world, epoch or framebuffer changed during orbit')
    for i, r in enumerate(rows):
        if r['panelUs'] < r['commitUs'] or (i and r['panelUs'] <= rows[i-1]['panelUs']):
            raise ValueError(f'Invalid panel timing for phase {i}')
    images = []
    for r in rows:
        phase, seq = r['phase'], r['sequence']
        frame = shot(console, seq)
        expected = (reference / f'phase-{phase:02d}.ref').read_bytes()
        if frame[BODY_OFFSET:] != expected:
            raise ValueError(f'Physical application pixels differ at sequence {seq}, phase {phase}')
        name = f'phase-{phase:02d}' if seq < 32 else 'phase-32-wrap'
        (output / (name + '.rgb565')).write_bytes(frame)
        im = rgb(frame)
        im.save(output / (name + '.png'))
        if seq < 32:
            images.append(im)
        r.update({'file': name+'.png', 'fullSha256': hashlib.sha256(frame).hexdigest(),
                  'appSha256': hashlib.sha256(expected).hexdigest(),
                  'fullCRC32': f'{zlib.crc32(frame):08x}'})
        print(f'physical phase {seq:02d} RGB565 and completed SPI verified', flush=True)
    if len({r['appSha256'] for r in rows[:32]}) != 32:
        raise ValueError('Expected 32 distinct physical application images')
    quarters = []
    for first in (1,9,17,25):
        part = rows[first:first+8]
        quarters.append({'fromPhase': (first-1)%32, 'toPhase': part[-1]['phase'],
                         'firstPainterToLastSPI_ms': (part[-1]['panelUs']-part[0]['painterBeginUs'])/1000,
                         'firstCommitToLastCommit_ms': (part[-1]['commitUs']-part[0]['commitUs'])/1000,
                         'sevenSPIIntervalsMs': [(b['panelUs']-a['panelUs'])/1000 for a,b in zip(part,part[1:])]})
    result = {'frames': rows, 'quarters': quarters, 'gif': physical_gif(images,rows,output/'smooth-rotation.gif'),
              'timingOrigin':'Microseconds since kernel startup. Painter begins at accepted compositor paintView call; '
                             'commit follows gfx_commit; panel follows completion of the last rectangle on SPI2. '
                             'Initial phase zero SPI time records observer arming against an already-completed image.',
              'frameSource':'Unmodified 320x320 compositor front pixels after commit. Every full image compared against '
                            'reconstructed completed SPI2 payloads; independent host RGB565 reference covers rows 22–319.'}
    (output/'smooth-rotation.json').write_text(json.dumps(result,indent=2)+'\n')
    return result
