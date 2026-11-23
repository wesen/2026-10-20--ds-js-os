#!/usr/bin/env python3
"""Apps from storage through the real host binary: sys.spawn and sys.stop, the worlds they make (u-<name>, no
claims, their name as title), what such a world cannot do, and the operations' own checks. Uses the scenario
harness of test_fs_native.py."""
import os
from pathlib import Path
import shutil
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_fs_native import OS, Scenario, STEPS  # noqa: E402

NATIVES = Path(os.environ.get("PICOCALC_NATIVES", OS / "build/natives"))
if not NATIVES.is_absolute():
    NATIVES = OS / NATIVES

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


@unittest.skipUnless(all((NATIVES / f).exists() for f in ("echo.wasm", "battery.wasm", "echo")),
                     "build the example modules first (make natives wasm)")
class WasmAppTests(unittest.TestCase):
    """WebAssembly apps from storage: sys.spawn(name, handle) has the kernel read the file the handle names."""
    def setUp(self):
        self.s = Scenario()
        apps = self.s.fs / "apps"
        apps.mkdir()
        shutil.copyfile(NATIVES / "echo.wasm", apps / "echo.wasm")
        shutil.copyfile(NATIVES / "battery.wasm", apps / "batt.wasm")
        (apps / "elf.wasm").write_bytes(b"\x7fELF\x02\x01\x01" + bytes(range(256)) * 4)   # machine code under a .wasm name
        shutil.copyfile(NATIVES / "echo", apps / "huge.wasm")   # a static binary, 800 KB
        (apps / "hello.js").write_text("service('hello').onStart(() => log('TEST hello as js ' + self));")
        (apps / "echo.js").write_text("service('echo').onStart(() => log('TEST echo as js'));")

    def tearDown(self):
        self.s.close()

    def test_a_module_from_storage_runs_without_claims(self):
        self.s.world("w", STEPS % """
          const d = hw.fs('fs:/apps');
          await out('spawn', async () => { const h = d.at('echo.wasm', 'r'); try { return await sys.spawn('echo', h); } finally { h.release(); } });
          await sleep(300);
          await out('ping', () => ask('u-echo', 'ping', { a: 1 }));
          await out('world', () => sys.worlds().filter((x) => x.name === 'u-echo').map((x) => [x.engine, x.state, x.file, x.claims, x.user, x.limit_kb]));
          await out('batt', () => sys.spawn('batt', d.at('batt.wasm', 'r')));
          await sleep(300);
          await out('as js', () => sys.spawn('echo', d.at('echo.js', 'r')));
          await sleep(300);
          await out('js world', () => sys.worlds().filter((x) => x.name === 'u-echo').map((x) => [x.engine, x.file]));
          await out('again', () => sys.spawn('echo', d.at('echo.wasm', 'r')));
          await sleep(300);
          await out('ping2', () => ask('u-echo', 'ping', 2));
        """, ["fs:/apps", "sys.spawn", "sys.read"])
        log = self.s.run()
        self.assertIn('TEST spawn ok {"world":"u-echo","engine":"wasm"}', log)
        self.assertIn("starting u-echo from storage (", log)
        self.assertIn('TEST ping ok {"pong":{"a":1},"from":"w","ask":1}', log)
        self.assertIn('TEST world ok [["wasm","idle","apps/echo.wasm",[],true,384]]', log)
        self.assertIn("u-batt: battery: open failed: u-batt has no claim on i2c0:0x1f", log)   # no claims from storage
        self.assertIn("TEST echo as js", log)
        self.assertIn('TEST js world ok [["js","apps/echo.js"]]', log)
        self.assertIn('TEST ping2 ok {"pong":2,"from":"w","ask":1}', log)
        self.assertNotIn("u-echo crashed", log)

    def test_what_cannot_be_started_from_a_file(self):
        self.s.world("w", STEPS % """
          const d = hw.fs('fs:/apps');
          await out('elf', () => sys.spawn('elf', d.at('elf.wasm', 'r')));
          await out('huge', () => sys.spawn('huge', d.at('huge.wasm', 'r')));
          await out('dir', () => sys.spawn('x', d));
          await out('missing', () => sys.spawn('x', d.at('none.wasm', 'r')));
          await out('name', () => sys.spawn('Bad', d.at('echo.wasm', 'r')));
          await out('system', () => sys.spawn('w', d.at('echo.wasm', 'r')).then(() => sys.worlds().filter((x) => x.name === 'w').map((x) => x.engine)));
          const h = d.at('echo.wasm', 'r'); h.release();
          await out('released', () => sys.spawn('x', h));
          await out('text', () => sys.spawn('hello', d.at('hello.js', 'r')));
          await sleep(300);
        """, ["fs:/apps", "sys.spawn", "sys.read"])
        self.s.world("other", STEPS % """
          await out('claim', () => sys.spawn('x', hw.fs('fs:/apps').at('echo.wasm', 'r')));
        """, ["fs:/apps"])
        log = self.s.run()
        self.assertIn("TEST elf err apps/elf.wasm is neither JavaScript (UTF-8 text, at most 64 KB) nor WebAssembly", log)
        self.assertIn("TEST huge err apps/huge.wasm is larger than 256 KB", log)
        self.assertIn("TEST dir err an app is started from a file handle, not a directory", log)
        self.assertIn("TEST missing err no file apps/none.wasm", log)
        self.assertIn("TEST name err an app's name is 1 to 12 characters: a-z, 0-9 and -", log)
        self.assertIn('TEST system ok ["js"]', log)   # u-w, not the system world w
        self.assertIn("TEST released err", log)
        self.assertIn("TEST hello as js u-hello", log)
        self.assertIn("TEST claim err other has no claim on sys.spawn", log)


if __name__ == "__main__":
    unittest.main(verbosity=2)
