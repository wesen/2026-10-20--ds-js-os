#!/usr/bin/env python3
"""Archive scientific cells and the author's documents from the private room.

Run with the room's parent directory containing work/ and the two JSON execution
receipts. Only public cell inputs/outputs and a small allowlist of model metadata
are copied. The implementation and manuscript prompts are separate ticket files.
"""
import argparse
import json
from pathlib import Path


def public_receipt(path):
    messages = json.loads(path.read_text())
    result = next(msg for msg in reversed(messages) if msg.get('type') == 'result')
    if result['is_error'] or result['stop_reason'] != 'end_turn':
        raise ValueError(f'{path.name} ended before the researcher finished')
    return {
        'models': sorted(result['modelUsage']),
        'effortRequested': 'high',
        'turns': result['num_turns'],
        'durationMs': result['duration_ms'],
        'stopReason': result['stop_reason'],
    }


def archive(room, ticket):
    work = room / 'work'
    documents = [
        ('design.md', 'design-doc', '03-verifying-image-addresses-and-packet-evidence', 'Verifying image addresses and packet evidence'),
        ('diary.md', 'reference', '03-opus-high-evidence-researcher-diary', 'Opus High evidence researcher investigation diary'),
        ('report.md', 'analysis', '03-joining-simd-decisions-to-executed-instructions', 'Joining SIMD decisions to executed instructions on the ESP32-P4'),
    ]
    receipts = {phase: public_receipt(room / name) for phase, name in [
        ('implementation', 'commission-receipt.json'), ('report', 'publication-receipt.json')]}
    cells = []
    for request in sorted(work.glob('request-*.json')):
        name = request.name.replace('request-', 'reply-', 1)
        response = json.loads((work / name).read_text())
        if response.get('ok') is not True:
            raise ValueError(f'{name} did not return a valid outer session response')
        cells.append({'room': '3794' if 'candidate' in request.name else '3792',
                      'cell': request.stem, 'source': json.loads(request.read_text())['source'],
                      'value': response['value']})
    bundle = {'receipts': receipts, 'cells': cells}
    (ticket / 'various/evidence/opus-public-repl.json').write_text(json.dumps(bundle, indent=2) + '\n')
    for name, kind, slug, title in documents:
        body = (work / name).read_text().strip()
        if body.startswith('---\n'):
            body = body.split('\n---\n', 1)[1].lstrip()
        if not body.startswith('# '):
            raise ValueError(f'{name} is missing a heading')
        front = (f'---\nTitle: {title}\nTicket: PICOCALC-SIMD-LAB\nStatus: active\n'
                 f'Topics: [compiler, performance, picocalc]\nDocType: {kind}\nIntent: long-term\n'
                 'Owners: []\nRelatedFiles: []\nExternalSources: []\n'
                 f'Summary: {title}.\nLastUpdated: 2026-11-21\n---\n\n')
        (ticket / kind / (slug + '.md')).write_text(front + body + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('room', type=Path)
    parser.add_argument('--ticket', type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    archive(args.room, args.ticket)
