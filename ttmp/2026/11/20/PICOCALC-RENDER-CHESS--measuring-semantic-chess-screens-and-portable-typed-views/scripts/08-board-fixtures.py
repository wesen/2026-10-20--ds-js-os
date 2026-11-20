"""Export real guest position inputs and independent control checksums for P4 WAMR."""
import argparse
import json
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('replay_directory', type=Path)
p.add_argument('header', type=Path)
args = p.parse_args()
states = [json.loads(line) for line in (args.replay_directory/'states.ndjson').read_text().splitlines()]
controls = [json.loads(line) for line in (args.replay_directory/'control.ndjson').read_text().splitlines()]
receipt = json.loads((args.replay_directory/'replay.json').read_text())
def fnv(data):
    value = 2166136261
    for byte in data:
        value = ((value ^ byte) * 16777619) & 0xffffffff
    return value
def array(items):
    return '{'+','.join(map(str,items))+'}'
with args.header.open('w') as out:
    out.write('/* Generated from independent guest instances. rank 0 is a8..h8. */\n')
    out.write('#include <stdint.h>\n')
    out.write('static const struct { uint8_t board[72]; int32_t fields[9]; uint16_t tree_n, hint_n; uint32_t fnv1a; } chess_fixtures[] = {\n')
    for record,state,control in zip(receipt['rows'],states,controls,strict=True):
        tree = json.dumps(control['tree'],ensure_ascii=False,separators=(',',':')).encode('ascii')
        hints = control['hints'].encode('ascii')
        pieces = [int(c,16) for c in state['b']]
        mask = list(bytes.fromhex(state['m']))
        out.write('    {'+array(pieces+mask)+', '+array(state['f'])+', '+str(len(tree))+', '+str(len(hints))+', 0x%08xu'%fnv(tree+hints)+'}, /* '+record['id']+' */\n')
    out.write('};\n')
