#!/usr/bin/env python3
"""Run real QuickJS, kernel, compositor and persistent store through recorded API replies."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def run(binary, work, name, script, fixture=None, store=None):
    out = work / name
    out.mkdir()
    cmd = [str(binary), '-o', str(out)]
    if store:
        store.mkdir(exist_ok=True)
        cmd += ['-s', str(store)]
    cmd += ['-']
    env = dict(os.environ)
    env.pop('PICOCALC_AGENT_FIXTURES', None)
    if fixture:
        env['PICOCALC_AGENT_FIXTURES'] = str(fixture)
    result = subprocess.run(cmd, cwd=ROOT, env=env, input=script, text=True, capture_output=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
    log = (out / 'uart.log').read_text()
    assert '#OCT1' not in log, log
    return out, log, result.stdout


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--binary', default=os.environ.get('PICOCALC_TEST_BINARY', 'build/picocalc-host'))
    p.add_argument('--output', help='Keep screenshots and store under this fresh directory')
    a = p.parse_args()
    binary = (ROOT / a.binary).resolve()
    temporary = None
    if a.output:
        work = Path(a.output).resolve()
        work.mkdir(parents=True, exist_ok=True)
    else:
        temporary = tempfile.TemporaryDirectory(prefix='picocalc-agent-')
        work = Path(temporary.name)
    fixture = ROOT / 'tests/fixtures/agent'
    state = work / 'store'
    out, log, stats = run(binary, work, 'tour', (ROOT / 'scripts-agent/tour.txt').read_text(), fixture, state)
    record = json.loads((state / 'w/agent').read_text())['session']
    assert record['notes'] == [{'name': 'next', 'text': 'study groups'}], record
    assert len(record['history']) == 6 and record['pending'] is False, record
    assert 'rational numbers' in record['history'][-1]['content']
    assert len(list(out.glob('agent-*.png'))) == 5
    assert len((state / 'w/agent').read_bytes()) <= 16384
    print('PASS: QuickJS chat -> native transport -> calculator -> answer -> approval -> durable note -> read')

    before = (state / 'w/agent').read_bytes()
    run(binary, work, 'reboot', 'wait 1800\nkey c\nwait 300\ncapture reboot.png\nstats\n', None, state)
    assert (state / 'w/agent').read_bytes() == before
    print('PASS: a cold process restores session/notes without starting a network request')

    slow = work / 'slow-fixture'
    slow.mkdir()
    (slow / '001.json').write_text((fixture / '002.json').read_text())
    (slow / '001.delay_ms').write_text('40000')
    cancel_store = work / 'cancel-store'
    run(binary, work, 'cancel', 'wait 1600\nkey c\nwait 250\ntype slow\nkey enter\nwait 500\nkey esc\nwait 800\ncapture cancelled.png\nstats\n', slow, cancel_store)
    saved = json.loads((cancel_store / 'w/agent').read_text())['session']
    assert saved['pending'] is False and saved['history'] == [] and saved['notes'] == []
    print('PASS: cancellation remains responsive during a 40-second virtual network delay')

    # Large, valid JSON is a concrete worst-case for parsing, UTF-8 clipping and UI layout budgets.
    large = work / 'large-fixture'
    large.mkdir()
    response = {'id': 'large', 'status': 'completed', 'output': [{'type': 'message', 'role': 'assistant',
        'content': [{'type': 'output_text', 'text': 'A long answer. ' * 3800, 'annotations': []}]}]}
    (large / '001.json').write_text(json.dumps(response))
    large_store = work / 'large-store'
    run(binary, work, 'large', 'wait 1600\nkey c\nwait 250\ntype Long answer\nkey enter\nwait 1800\ncapture large.png\nstats\n', large, large_store)
    saved = json.loads((large_store / 'w/agent').read_text())['session']
    assert saved['pending'] is False and len(saved['history']) == 2
    assert len(saved['history'][-1]['content'].encode()) <= 6000
    print('PASS: a 53 KiB provider reply stays within world budgets and bounded display/history')
    print(stats)
    if a.output:
        print('Captures and records:', work)
    if temporary:
        temporary.cleanup()


if __name__ == '__main__':
    main()
