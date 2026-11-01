#!/usr/bin/env python3
"""System services through the real host binary: guarded channels (keys, frames), the kernel log ring (sys.log), and
the simulated network and time zone that Settings uses. Uses the scenario harness of test_fs_native.py."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_fs_native import BINARY, OS, Scenario, STEPS  # noqa: E402

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


# PICOCALC-FRAMES: a post marked { retain: true } is state; the kernel keeps the latest per publisher and channel and
# gives it to a world that starts later, after its start message. A world's frame is its retained post on "frames".
HEAR = "service('%s').needs('%s').on('%s', (s, p, m) => log('TEST %s heard ' + JSON.stringify(p) + ' from ' + m.from));"
LEVEL = """
service('pub').provides('level')
  .on('post', (s, p) => publish('level', p.v, p.retain ? { retain: true } : undefined))
  .on('try', (s, p) => { try { p.big ? publish('level', 'x'.repeat(p.big), { retain: true }) : publish('level', hw.fs('fs:/'), { retain: true }); log('TEST try ok'); }
                         catch (e) { log('TEST try err ' + e.message); } });
"""


class RetainTests(unittest.TestCase):
    def setUp(self):
        self.s = Scenario()

    def tearDown(self):
        self.s.close()

    def test_a_restarted_viewer_gets_every_frame_without_the_apps_taking_a_turn(self):
        self.s.world("viewer", "service('viewer').needs('frames').on('frames', (s, f, m) => log('TEST frame ' + f.app + ' ' + f.title + ' ' + f.frame.tree.s + ' from ' + m.from));",
                     ["frames.read"])
        self.s.world("app", "app('app').title('The App').state({ n: 0 }).onStart(() => {}).on('poke', (s) => { s.n++; log('TEST app turn'); }).screen((s) => ui.text('n=' + s.n));")
        log = self.s.run("wait 500\nsend app poke\nwait 300\ncrash viewer\nwait 800\n")
        self.assertEqual(log.count("TEST frame app The App n=0 from app"), 1, log)   # live, at the start
        self.assertEqual(log.count("TEST frame app The App n=1 from app"), 2, log)   # live after the poke, then replayed
        self.assertEqual(log.count("TEST app turn"), 1, log)

    def test_the_latest_retained_post_is_replayed_and_plain_posts_are_not(self):
        self.s.world("pub", LEVEL)
        self.s.world("sub", HEAR % ("sub", "level", "level", "sub"))
        log = self.s.run("wait 300\nsend pub post {\"v\":1,\"retain\":true}\nsend pub post {\"v\":2,\"retain\":true}\n"
                         "send pub post {\"v\":3}\nwait 300\ncrash sub\nwait 800\n")
        self.assertEqual(log.count("TEST sub heard 1 from pub"), 1, log)
        self.assertEqual(log.count("TEST sub heard 2 from pub"), 2, log)   # live, then replayed: the latest retained
        self.assertEqual(log.count("TEST sub heard 3 from pub"), 1, log)   # not retained: never replayed

    def test_retained_posts_go_with_their_publisher(self):
        self.s.world("pub", LEVEL)
        self.s.world("sub", HEAR % ("sub", "level", "level", "sub"))
        log = self.s.run("wait 300\nsend pub post {\"v\":5,\"retain\":true}\nwait 300\ncrash pub\nwait 800\ncrash sub\nwait 800\n")
        self.assertEqual(log.count("TEST sub heard 5 from pub"), 1, log)

    def test_a_retained_post_carries_no_handles_and_is_bounded(self):
        self.s.world("pub", LEVEL, ["fs:/"])
        self.s.world("sub", HEAR % ("sub", "level", "level", "sub"))
        log = self.s.run("wait 300\nsend pub try {}\nsend pub try {\"big\":5000}\nsend pub try {\"big\":4000}\nwait 300\n")
        self.assertIn("TEST try err a retained post cannot carry handles", log)
        self.assertIn("TEST try err a world's retained posts are at most 4096 bytes", log)
        self.assertEqual(log.count("TEST try ok"), 1, log)
        self.assertNotIn("TEST sub heard {", log)

    def test_only_listeners_with_the_claim_get_replays(self):
        self.s.world("kb", "service('kb').provides('keys').on('press', () => publish('keys', { key: 'a' }, { retain: true }));", ["keys.raw"])
        self.s.world("ok", HEAR % ("ok", "keys", "keys", "ok"), ["keys.raw"])
        log = self.s.run("wait 300\nsend kb press\nwait 300\ncrash ok\nwait 800\n")
        self.assertEqual(log.count('TEST ok heard {"key":"a"} from kb'), 2, log)


class CompositorRestartTests(unittest.TestCase):
    """The whole system, as on the device: after the compositor restarts, Calc and the battery come back."""

    def test_calc_and_the_battery_after_a_compositor_restart(self):
        with tempfile.TemporaryDirectory(prefix="frames-test-", dir=OS / "build") as d:
            root = Path(d)
            shutil.copytree(OS / "fs-seed", root / "fs")
            script = ("wait 1500\nkey x\nwait 800\ncapture before.png\nkey f1\nwait 400\ncrash compositor\nwait 1500\n"
                      "key x\nwait 1500\ncapture after.png\n")
            done = subprocess.run([str(BINARY), "-j", "js", "-o", str(root / "out"), "-f", str(root / "fs"), "-vv", "-"],
                                  input=script, text=True, capture_output=True, cwd=OS, timeout=60)
            log = (root / "out/uart.log").read_text() + done.stderr
            self.assertEqual(done.returncode, 0, log)
            after = log[log.index("starting compositor", log.index("compositor crashed")):]
            self.assertIn("compositor <- frames from calc", after)
            self.assertIn("compositor <- power from power", after)
            self.assertEqual((root / "out/before.png").read_bytes(), (root / "out/after.png").read_bytes())



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



class NetTests(unittest.TestCase):
    def setUp(self):
        self.s = Scenario()

    def tearDown(self):
        self.s.close()

    def test_scan_join_and_info(self):
        self.s.world("w", STEPS % """
          const pick = (i) => [i.wifi, i.ssid, i.ip, i.rssi, i.state];
          await out('before', () => pick(net.info()));
          await out('scan', () => net.scan());
          await out('again', () => net.scan());
          await out('pending', () => net.scanResult());
          await sleep(1600);
          await out('result', () => net.scanResult());
          await out('wrong', () => net.join('picocalc-lab', 'not the password'));
          await sleep(200);
          await out('trying', () => pick(net.info()));
          await sleep(2000);
          await out('failed', () => pick(net.info()));
          await out('right', () => net.join('picocalc-lab', 'correct horse battery'));
          await sleep(1300);
          await out('up', () => pick(net.info()));
          await out('open', () => net.join('cafe-guest'));
          await sleep(1300);
          await out('cafe', () => pick(net.info()));
          await out('keys', () => Object.keys(net.info()).sort());
        """, ["net.admin"])
        log = self.s.run("wait 9000\n")
        self.assertIn('TEST before ok ["off","","",0,"Wi-Fi not set up"]', log)
        self.assertIn('TEST scan ok true', log)
        self.assertIn('TEST again err a scan is running', log)
        self.assertIn('TEST pending ok null', log)
        self.assertIn('TEST result ok [{"ssid":"picocalc-lab","rssi":-48,"secure":true},'
                      '{"ssid":"cafe-guest","rssi":-71,"secure":false},{"ssid":"neighbour-5G","rssi":-83,"secure":true}]', log)
        self.assertIn('TEST trying ok ["connecting","picocalc-lab","",0,"connecting"]', log)
        self.assertIn('TEST failed ok ["failed","picocalc-lab","",0,"wrong password"]', log)
        self.assertIn('TEST up ok ["up","picocalc-lab","192.168.4.23",-48,"Wi-Fi connected"]', log)
        self.assertIn('TEST cafe ok ["up","cafe-guest","10.0.0.57",-71,"Wi-Fi connected"]', log)
        self.assertIn('TEST keys ok ["api","clock","ip","key","mode","model","provider","rssi","ssid","state","wifi"]', log)
        self.assertNotIn("correct horse", log)
        self.assertNotIn("not the password", log)

    def test_validation(self):
        self.s.world("w", STEPS % """
          await out('short', () => net.join('lab', 'seven77'));
          await out('long', () => net.join('lab', 'x'.repeat(64)));
          await out('hex', () => net.join('lab', 'ab'.repeat(32)));
          await out('control', () => net.join('lab', 'password\\n1'));
          await out('noname', () => net.join('', 'password1'));
          await out('bigname', () => net.join('n'.repeat(33), 'password1'));
        """, ["net.admin"])
        log = self.s.run()
        bad = "err a Wi-Fi password is 8 to 63 characters, or 64 hexadecimal digits"
        self.assertIn('TEST short ' + bad, log)
        self.assertIn('TEST long ' + bad, log)
        self.assertIn('TEST hex ok true', log)
        self.assertIn('TEST control ' + bad, log)
        self.assertIn('TEST noname err a network name is 1 to 32 bytes', log)
        self.assertIn('TEST bigname err a network name is 1 to 32 bytes', log)

    def test_claims(self):
        self.s.world("w", STEPS % """
          await out('info', () => net.info().mode);
          await out('scan', () => net.scan());
          await out('join', () => net.join('cafe-guest'));
          await out('zone', () => clock.setZone('UTC0'));
        """, ["sys.read"])
        log = self.s.run()
        self.assertIn('TEST info ok "simulated"', log)
        self.assertIn('TEST scan err w has no claim on net.admin', log)
        self.assertIn('TEST join err w has no claim on net.admin', log)
        self.assertIn('TEST zone err w has no claim on sys.clock', log)

    def test_setting_the_zone(self):
        self.s.world("w", STEPS % """
          await out('before', () => [clock.zone(), new Date(2026, 6, 1).getTimezoneOffset()]);
          await out('set', () => clock.setZone('EST5EDT,M3.2.0,M11.1.0'));
          await out('after', () => [clock.zone(), new Date(2026, 6, 1).getTimezoneOffset(), new Date(2026, 11, 1).getTimezoneOffset()]);
          await out('bad', () => clock.setZone('New York'));
        """, ["sys.clock"])
        log = self.s.run()
        self.assertIn('TEST before ok ["UTC0",0]', log)
        self.assertIn('TEST set ok {"zone":"EST5EDT,M3.2.0,M11.1.0","saved":false}', log)
        self.assertIn('TEST after ok ["EST5EDT,M3.2.0,M11.1.0",240,300]', log)
        self.assertIn('TEST bad err expected a POSIX time zone like EST5EDT,M3.2.0,M11.1.0', log)


if __name__ == "__main__":
    unittest.main(verbosity=2)
