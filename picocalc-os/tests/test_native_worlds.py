#!/usr/bin/env python3
"""Native worlds through the real host binary: binaries in C and C++ that run as sandboxed processes and talk to
JavaScript worlds with the same messages, channels, claims, handles, timers and storage (PICOCALC-NATIVE).

Each test writes a manifest into a temporary directory under build/, copies the example binaries (make natives:
natives/echo.c, natives/probe.c, natives/battery.cc) next to the JavaScript worlds, runs build/picocalc-host on them
and reads the log. A JavaScript world drives each scenario and logs TEST <label> ok <json> | err <message> lines.
"""
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tempfile
import unittest

OS = Path(__file__).resolve().parents[1]
BINARY = OS / os.environ.get("PICOCALC_TEST_BINARY", "build/picocalc-host")
NATIVES = Path(os.environ.get("PICOCALC_NATIVES", OS / "build/natives"))
if not NATIVES.is_absolute():
    NATIVES = OS / NATIVES


class Scenario:
    def __init__(self):
        (OS / "build").mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="native-test-", dir=OS / "build")
        self.root = Path(self.temp.name)
        self.js = self.root / "js"
        self.js.mkdir()
        shutil.copyfile(OS / "js/prelude.js", self.js / "prelude.js")
        self.fs = self.root / "files"
        self.fs.mkdir()
        self.worlds = []

    def close(self):
        self.temp.cleanup()

    def world(self, name, source, claims=(), **extra):
        (self.js / (name + ".js")).write_text(source)
        self.worlds.append(dict(name=name, file=name + ".js", claims=list(claims), mem_kb=512, budget_ms=100, **extra))

    def native(self, name, binary, claims=(), mem_kb=1024, budget_ms=100, engine="native"):
        if not (self.js / binary).exists():
            src = NATIVES / binary
            if src.exists():
                shutil.copyfile(src, self.js / binary)
        self.worlds.append(dict(name=name, file=binary, engine=engine, claims=list(claims), mem_kb=mem_kb, budget_ms=budget_ms))

    def run(self, script="wait 1500\n", check=True):
        (self.js / "system.json").write_text(json.dumps(dict(worlds=self.worlds)))
        args = [str(BINARY), "-j", str(self.js), "-o", str(self.root / "out"), "-f", str(self.fs), "-"]
        done = subprocess.run(args, input=script, text=True, capture_output=True, cwd=OS, timeout=60)
        out = self.root / "out/uart.log"
        log = (out.read_text() if out.exists() else "") + done.stderr
        if check and done.returncode:
            raise AssertionError(f"host exited {done.returncode}: {log}\n{done.stdout}")
        return log if check else (done.returncode, log)


# A world that runs its steps in order and logs each result or error: TEST <label> ok <json> | TEST <label> err <message>
STEPS = """
const out = (label, p) => Promise.resolve().then(() => p()).then(
  (v) => log('TEST ' + label + ' ok ' + JSON.stringify(v)), (e) => log('TEST ' + label + ' err ' + e.message));
service('drv').onStart(async () => { await sleep(100); %s });
"""

PEER = """
service('peer')
  .on('hello', (s, p, msg) => ({ hi: p.n, from: msg.from }))
  .on('note', (s, p, msg) => log('TEST peer note ' + JSON.stringify(p) + ' from ' + msg.from));
"""


@unittest.skipUnless(platform.machine() == "x86_64", "the host sandbox's seccomp filter is written for x86-64")
class NativeWorldTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        missing = [b for b in ("echo", "probe", "battery") if not (NATIVES / b).exists()]
        if missing:
            raise unittest.SkipTest(f"build the example binaries first (make natives); missing {missing} in {NATIVES}")

    def setUp(self):
        self.scenarios = []

    def tearDown(self):
        for s in self.scenarios:
            s.close()

    def scenario(self):
        s = Scenario()
        self.scenarios.append(s)
        return s

    def echo(self, body, echo_claims=(), drv_claims=(), script="wait 1500\n", peer=False):
        s = self.scenario()
        s.native("echo", "echo", echo_claims)
        if peer:
            s.world("peer", PEER)
        s.world("drv", STEPS % body, drv_claims)
        return s.run(script)

    def test_init_declarations_start_and_timers(self):
        log = self.echo("")
        for line in ("echo: TEST kind ok", "echo: TEST provide ok", "echo: TEST every ok", "echo: TEST init done",
                     "echo: TEST start self=echo clock=running", "echo: TEST ticks 3 timer=0"):
            self.assertIn(line, log)
        self.assertNotIn("crashed", log)

    def test_asks_replies_rejections_and_later_answers(self):
        log = self.echo("""
          await out('ping', () => ask('echo', 'ping', { a: 1 }));
          await out('later', () => ask('echo', 'later', null));
          await out('refuse', () => ask('echo', 'refuse', null));
          await out('unhandled', () => ask('echo', 'nothing', null));
          await out('worlds', () => sys.worlds().filter((x) => x.name === 'echo').map((x) => [x.engine, x.state, x.kind]));
        """, drv_claims=["sys.read"])
        self.assertIn('TEST ping ok {"pong":{"a":1},"from":"drv","ask":1}', log)
        self.assertIn('TEST later ok "slept"', log)
        self.assertIn("TEST refuse err echo refuses", log)
        self.assertIn("TEST unhandled ok null", log)
        self.assertIn('TEST worlds ok [["native","idle","service"]]', log)

    def test_payloads_must_be_strict_json_without_handles(self):
        log = self.echo("""
          await out('bad', () => ask('echo', 'bad-json', null));
        """, peer=True)
        self.assertIn('TEST bad ok "fixed"', log)
        for label in ("bad-reply", "handle-forgery", "bad-send"):
            self.assertIn(f"echo: TEST {label} err the payload is not strict JSON", log)
        self.assertNotIn("peer crashed", log)

    def test_channels_publish_and_declarations_only_at_init(self):
        s = self.scenario()
        s.native("echo", "echo")
        s.world("listen", "service('listen').needs('echo.out').on('echo.out', (s, p, m) => log('TEST heard ' + JSON.stringify(p) + ' from ' + m.from));")
        s.world("drv", STEPS % "send('echo', 'publish', { x: [1, 2] }); send('echo', 'late-declare', null);")
        log = s.run()
        self.assertIn('TEST heard {"x":[1,2]} from echo', log)
        self.assertIn("echo: TEST publish ok", log)
        self.assertIn('echo: TEST publish-undeclared err echo does not provide the channel "elsewhere"', log)
        self.assertIn("echo: TEST late-need err channels are declared only while a world starts", log)
        self.assertIn("echo: TEST late-every err timers are declared only while a world starts", log)

    def test_storage(self):
        log = self.echo("""
          await out('empty', () => ask('echo', 'load', null));
          send('echo', 'save', { n: 5, s: 'é' });
          await sleep(50);
          await out('load', () => ask('echo', 'load', null));
        """)
        self.assertIn("TEST empty ok null", log)
        self.assertIn("echo: TEST save ok", log)
        self.assertIn('TEST load ok {"n":5,"s":"é"}', log)

    def test_messages_to_and_from_javascript(self):
        log = self.echo("""
          await out('ask-peer', () => ask('echo', 'ask-peer', null));
          send('echo', 'send-peer', null);
          send('echo', 'ask-self', null);
        """, peer=True)
        self.assertIn('TEST ask-peer ok {"ok":true,"answer":{"hi":7,"from":"echo"}}', log)
        self.assertIn('TEST peer note {"text":"from a binary"} from echo', log)
        self.assertIn('echo: TEST send-nobody err there is no world called "nobody"', log)
        self.assertIn("echo: TEST ask-self err a world cannot ask itself", log)

    def test_i2c_takes_a_claim_and_a_handle(self):
        log = self.echo("await out('i2c', () => ask('echo', 'i2c', null));")
        self.assertIn("echo: TEST i2c-open err echo has no claim on i2c0:0x1f", log)
        log = self.echo("""
          await out('i2c', () => ask('echo', 'i2c', null));
          send('echo', 'i2c-other', null);
        """, echo_claims=["i2c0:0x1f"])
        self.assertIn('TEST i2c ok {"n":2,"reg":11,"value":82}', log)   # the simulated battery: 82 %, not charging
        self.assertIn("echo: TEST i2c-other err echo has no claim on i2c0:0x50", log)
        self.assertIn("echo: TEST i2c-forged err", log)

    def test_a_fault_crashes_only_the_native_world_and_it_restarts(self):
        log = self.echo("""
          send('echo', 'segv', null);
          await sleep(1200);
          await out('after', () => ask('echo', 'ping', 2));
          await out('peer', () => ask('peer', 'hello', { n: 1 }));
        """, peer=True, script="wait 2500\n")
        self.assertIn("echo crashed handling segv: segmentation fault", log)
        self.assertEqual(log.count("echo: TEST init done"), 2)
        self.assertIn('TEST after ok {"pong":2,"from":"drv","ask":1}', log)
        self.assertIn('TEST peer ok {"hi":1,"from":"drv"}', log)

    def test_the_budget_is_enforced_in_real_time(self):
        log = self.echo("send('echo', 'spin', null);")
        self.assertIn("echo crashed handling spin: ran past its turn budget of 100 ms", log)

    def test_the_sandbox_stops_escapes(self):
        s = self.scenario()
        probes = ["open", "socket", "fork", "exec", "execat", "kill", "prlimit"]
        for p in probes + ["alloc", "stdio"]:
            s.native("probe_" + p, "probe")
        log = s.run("wait 3000\n")
        for p in probes:
            self.assertIn(f"probe_{p}: TEST probe {p}", log)
            self.assertIn(f"probe_{p} crashed handling start: the sandbox stopped it", log)
            self.assertNotIn(f"probe_{p}: TEST probe survived", log)
            self.assertIn(f"probe_{p} crashed 5 times in ten seconds; it stays stopped", log)
        self.assertIn("probe_alloc: TEST alloc failed", log)   # the data limit is mem_kb, 1 MB
        self.assertNotIn("probe_alloc crashed", log)
        self.assertIn("probe_stdio: TEST stdio write=-1", log)   # EBADF: only descriptor 3 is open to it
        self.assertNotIn("probe_stdio crashed", log)

    def test_files_and_engines_that_cannot_run(self):
        s = self.scenario()
        (s.js / "notelf").write_text("not a binary")
        s.native("text", "notelf")
        s.native("wasm", "echo", engine="wasm")
        log = s.run("wait 500\n")
        self.assertIn("text crashed: notelf is not an executable (no ELF header)", log)
        self.assertIn("wasm crashed: this board cannot run wasm worlds", log)
        s.worlds[-1]["engine"] = "python"
        code, log = s.run("wait 100\n", check=False)
        self.assertNotEqual(code, 0)
        self.assertIn('wasm: there is no engine "python" (js, wasm, native)', log)

    def test_a_driver_in_cpp(self):
        s = self.scenario()
        s.native("battery", "battery", ["i2c0:0x1f"])
        s.world("listen", "service('listen').needs('battery').on('battery', (s, p) => log('TEST battery ' + JSON.stringify(p)));")
        s.world("drv", STEPS % "await out('level', () => ask('battery', 'level', null));")
        log = s.run()
        self.assertIn('TEST battery {"pct":82,"charging":false}', log)
        self.assertIn('TEST level ok {"pct":82,"charging":false}', log)
        self.assertIn("battery: battery: 82%", log)
        self.assertNotIn("crashed", log)


if __name__ == "__main__":
    unittest.main(verbosity=2)
