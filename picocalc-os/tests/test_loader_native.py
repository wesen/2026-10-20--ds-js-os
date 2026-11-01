#!/usr/bin/env python3
"""Apps from storage through the real host binary: sys.spawn and sys.stop, the worlds they make (u-<name>, no
claims, their name as title), what such a world cannot do, and the operations' own checks. Uses the scenario
harness of test_fs_native.py."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_fs_native import Scenario, STEPS  # noqa: E402

HELLO = "app('hello').title('Settings').state({ n: 0 }).onStart(() => log('TEST hello v%d ' + self)).screen((s) => ui.text('hi'));"
PROBE = """service('probe').onStart(async () => {
  const t = (label, f) => { try { log('TEST probe ' + label + ' ok ' + JSON.stringify(f())); } catch (e) { log('TEST probe ' + label + ' err ' + e.message); } };
  t('fs', () => hw.fs('fs:/'));
  t('net', () => net.info());
  t('worlds', () => sys.worlds());
  t('spawn', () => sys.spawn('x', 'log(1)'));
  t('log', () => sys.log());
  t('zone', () => clock.setZone('UTC0'));
  t('agent', () => agentNet.status());
});"""


class LoaderTests(unittest.TestCase):
    def setUp(self):
        self.s = Scenario()

    def tearDown(self):
        self.s.close()

    def test_spawn_respawn_and_stop(self):
        self.s.world("w", STEPS % ("""
          await out('spawn', () => sys.spawn('hello', %r));
          await sleep(300);
          const me = () => sys.worlds().filter((x) => x.name === 'u-hello').map((x) => [x.state, x.title, x.claims, x.user, x.file, x.limit_kb]);
          await out('running', me);
          const count = sys.worlds().length;
          await out('again', () => sys.spawn('hello', %r));
          await sleep(300);
          await out('same slot', () => sys.worlds().length === count);
          await out('ask', () => ask('u-hello', 'nothing', {}).catch((e) => 'refused: ' + e.message));
          await out('stop', () => sys.stop('u-hello'));
          await sleep(100);
          await out('stopped', () => sys.worlds().filter((x) => x.name === 'u-hello').map((x) => [x.state, x.last_error]));
          await out('send', () => ask('u-hello', 'nothing', {}).catch((e) => 'refused: ' + e.message));
          await out('restart', () => sys.spawn('hello', %r));
          await sleep(300);
          await out('back', () => sys.worlds().filter((x) => x.name === 'u-hello').map((x) => x.state));
        """ % (HELLO % 1, HELLO % 2, HELLO % 3)), ["sys.spawn", "sys.read"])
        log = self.s.run()
        self.assertIn('TEST spawn ok {"world":"u-hello"}', log)
        self.assertIn("TEST hello v1 u-hello", log)
        self.assertIn('TEST running ok [["idle","u-hello",[],true,"apps/hello.js",384]]', log)
        self.assertIn("TEST hello v2 u-hello", log)
        self.assertIn("TEST same slot ok true", log)
        self.assertIn('TEST ask ok "refused: u-hello has no handler for \\"nothing\\""', log)
        self.assertIn('TEST stopped ok [["stopped","stopped by w"]]', log)
        self.assertIn('TEST send ok "refused: u-hello is stopped"', log)
        self.assertIn("TEST hello v3 u-hello", log)
        self.assertIn('TEST back ok ["idle"]', log)
        self.assertNotIn("declares itself", log)

    def test_a_world_without_claims(self):
        self.s.world("w", STEPS % ("await out('spawn', () => sys.spawn('probe', %r));" % PROBE), ["sys.spawn"])
        log = self.s.run()
        for label, claim in [("fs", "fs:/"), ("net", "net.admin"), ("worlds", "sys.read"), ("spawn", "sys.spawn"),
                             ("log", "sys.log"), ("zone", "sys.clock"), ("agent", "net.agent")]:
            self.assertIn("TEST probe %s err u-probe has no claim on %s" % (label, claim), log)

    def test_a_listener_from_storage_cannot_hear_keys(self):
        self.s.world("w", STEPS % "await out('spawn', () => sys.spawn('spy', \"service('spy').needs('keys').on('keys', () => {});\"));",
                     ["sys.spawn"])
        self.assertIn('u-spy crashed: the channel "keys" takes the claim keys.raw, which the manifest does not give u-spy', self.s.run())

    def test_the_operations_checks(self):
        self.s.world("w", STEPS % """
          await out('upper', () => sys.spawn('Hello', 'log(1)'));
          await out('long', () => sys.spawn('a'.repeat(13), 'log(1)'));
          await out('slash', () => sys.spawn('../x', 'log(1)'));
          await out('empty', () => sys.spawn('x', ''));
          await out('big', () => sys.spawn('x', '//' + 'x'.repeat(65536)));
          await out('system', () => sys.stop('w'));
          await out('nobody', () => sys.stop('u-nobody'));
          let n = 0;
          try { for (; n < 40; n++) sys.spawn('a' + n, 'log(1)'); } catch (e) { log('TEST full after ' + n + ': ' + e.message); }
        """, ["sys.spawn"])
        self.s.world("other", STEPS % "await out('claim', () => sys.spawn('x', 'log(1)'));")
        log = self.s.run()
        bad = "err an app's name is 1 to 12 characters: a-z, 0-9 and -"
        for label in ("upper", "long", "slash"):
            self.assertIn("TEST %s %s" % (label, bad), log)
        self.assertIn("TEST empty err an app needs its source", log)
        self.assertIn("TEST big err an app's source is at most 64 KB", log)
        self.assertIn("TEST system err only an app from storage can be stopped this way", log)
        self.assertIn("TEST nobody err only an app from storage can be stopped this way", log)
        self.assertIn("TEST claim err other has no claim on sys.spawn", log)
        self.assertIn("cannot start u-a30: no room for another world (32 at most)", log)


if __name__ == "__main__":
    unittest.main(verbosity=2)
