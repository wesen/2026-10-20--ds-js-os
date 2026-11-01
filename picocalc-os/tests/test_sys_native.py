#!/usr/bin/env python3
"""System services through the real host binary: guarded channels (keys, frames), the kernel log ring (sys.log), and
the simulated network and time zone that Settings uses. Uses the scenario harness of test_fs_native.py."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_fs_native import Scenario, STEPS  # noqa: E402

PRESS = """
service('kb').provides('keys').onStart(async () => {
  await sleep(200);
  publish('keys', { code: 97, key: 'a', ch: 'a', state: 'down' });
  log('TEST published');
});
"""
LISTEN = """
service('%s').needs('keys').on('keys', (s, e, msg) => log('TEST %s heard ' + e.key + ' from ' + msg.from));
"""


class ChannelTests(unittest.TestCase):
    def setUp(self):
        self.s = Scenario()

    def tearDown(self):
        self.s.close()

    def test_a_listener_needs_keys_raw(self):
        self.s.world("kb", PRESS, ["keys.raw"])
        self.s.world("ok", LISTEN % ("ok", "ok"), ["keys.raw"])
        self.s.world("spy", LISTEN % ("spy", "spy"))
        log = self.s.run()
        self.assertIn("TEST published", log)
        self.assertIn("TEST ok heard a from kb", log)
        self.assertNotIn("TEST spy heard", log)
        self.assertIn('spy crashed: the channel "keys" takes the claim keys.raw, which the manifest does not give spy', log)

    def test_a_provider_needs_keys_raw(self):
        self.s.world("kb", PRESS)
        self.s.world("ok", LISTEN % ("ok", "ok"), ["keys.raw"])
        log = self.s.run()
        self.assertIn('kb crashed: the channel "keys" takes the claim keys.raw', log)
        self.assertNotIn("TEST ok heard", log)

    def test_frames_need_frames_read(self):
        self.s.world("viewer", "service('viewer').needs('frames').on('frames', (s, f) => log('TEST frame ' + f.app));",
                     ["frames.read"])
        self.s.world("peek", "service('peek').needs('frames').on('frames', (s, f) => log('TEST peeked ' + f.app));")
        self.s.world("app", "app('app').state({ n: 0 }).every(300, (s) => { s.n++; }).screen((s) => ui.text('hello ' + s.n));")
        log = self.s.run()
        self.assertIn("TEST frame app", log)
        self.assertNotIn("TEST peeked", log)
        self.assertIn('peek crashed: the channel "frames" takes the claim frames.read', log)

    def test_open_channels_need_nothing(self):
        self.s.world("a", "service('a').provides('news').onStart(async () => { await sleep(100); publish('news', 1); });")
        self.s.world("b", "service('b').needs('news').on('news', (s, n) => log('TEST news ' + n));")
        self.assertIn("TEST news 1", self.s.run())



class LogTests(unittest.TestCase):
    def setUp(self):
        self.s = Scenario()

    def tearDown(self):
        self.s.close()

    def test_reading_the_ring(self):
        self.s.world("w", STEPS % """
          log('hello ring');
          log('naïve ' + 'é'.repeat(80));
          await sleep(10);
          const r = sys.log();
          await out('first', () => r.first);
          await out('mine', () => r.lines.filter((l) => l.s.startsWith('w: hello')).map((l) => [l.s, l.wall > 0, l.t >= 0]));
          const long = r.lines.find((l) => l.s.startsWith('w: naïve'));
          await out('cut', () => [long.s.length <= 120, /\uFFFD/.test(long.s), long.s.endsWith('é')]);
          const after = sys.log(r.next - 1);
          await out('after', () => after.lines.every((l) => l.n >= r.next - 1));
          await out('none', () => sys.log(r.next + 5).lines.length);
        """, ["sys.log"])
        log = self.s.run()
        self.assertIn('TEST first ok 1', log)
        self.assertIn('TEST mine ok [["w: hello ring",true,true]]', log)
        self.assertIn('TEST cut ok [true,false,true]', log)
        self.assertIn('TEST after ok true', log)
        self.assertIn('TEST none ok 0', log)

    def test_paging_and_loss(self):
        self.s.world("w", STEPS % """
          for (let i = 0; i < 300; i++) log('line ' + i);
          await sleep(10);
          const r = sys.log();
          await out('page', () => [r.lines.length, r.first > 1, r.lines[0].n === r.first, r.next - r.first]);
          let n = 0, after = 0, pages = 0;
          for (;;) { const p = sys.log(after); if (!p.lines.length) break; n += p.lines.length; after = p.lines[p.lines.length - 1].n; pages++; }
          await out('all', () => [n, pages]);
        """, ["sys.log"])
        log = self.s.run()
        self.assertIn('TEST page ok [64,true,true,256]', log)
        self.assertIn('TEST all ok [256,4]', log)

    def test_the_claim(self):
        self.s.world("w", STEPS % "await out('log', () => sys.log());", ["sys.read"])
        self.assertIn('TEST log err w has no claim on sys.log', self.s.run())


if __name__ == "__main__":
    unittest.main(verbosity=2)
