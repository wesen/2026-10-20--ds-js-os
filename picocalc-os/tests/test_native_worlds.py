#!/usr/bin/env python3
"""Native worlds through the real host binary: binaries in C and C++ that talk to JavaScript worlds with the same
messages, channels, claims, handles, timers and storage (PICOCALC-NATIVE). Each example runs twice: compiled for the
host as a process under seccomp (engine "native"), and compiled to WebAssembly in WAMR's interpreter (engine "wasm").

Each test writes a manifest into a temporary directory under build/, copies the example binaries (make natives wasm:
natives/echo.c, natives/battery.cc, and the escape probes natives/probe.c and natives/wprobe.c) next to the
JavaScript worlds, runs build/picocalc-host on them and reads the log. A JavaScript world drives each scenario and
logs TEST <label> ok <json> | err <message> lines.
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


class EngineTests:
    """The behaviour every engine shares: the same module source, the same JavaScript scenario, the same log."""
    ENGINE = ECHO = BATTERY = None
    FAULT = FAULT_WHY = OVERRUN = None
    BUILT = ()

    @classmethod
    def setUpClass(cls):
        missing = [b for b in cls.BUILT if not (NATIVES / b).exists()]
        if missing:
            raise unittest.SkipTest(f"build the example binaries first (make natives wasm); missing {missing} in {NATIVES}")

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
        s.native("echo", self.ECHO, echo_claims, engine=self.ENGINE)
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
        self.assertIn(f'TEST worlds ok [["{self.ENGINE}","idle","service"]]', log)

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
        s.native("echo", self.ECHO, engine=self.ENGINE)
        s.world("listen", "service('listen').needs('echo.out').on('echo.out', (s, p, m) => log('TEST heard ' + JSON.stringify(p) + ' from ' + m.from));")
        s.world("drv", STEPS % "send('echo', 'publish', { x: [1, 2] }); send('echo', 'late-declare', null);")
        log = s.run()
        self.assertIn('TEST heard {"x":[1,2]} from echo', log)
        self.assertIn("echo: TEST publish ok", log)
        self.assertIn('echo: TEST publish-undeclared err echo does not provide the channel "elsewhere"', log)
        self.assertIn("echo: TEST late-need err channels are declared only while a world starts", log)
        self.assertIn("echo: TEST late-every err timers are declared only while a world starts", log)

    def test_a_retained_post_reaches_a_listener_that_starts_later(self):
        s = self.scenario()
        s.native("echo", self.ECHO, engine=self.ENGINE)
        s.world("listen", "service('listen').needs('echo.out').on('echo.out', (s, p, m) => log('TEST heard ' + JSON.stringify(p) + ' from ' + m.from));")
        s.world("drv", STEPS % "send('echo', 'retain', { level: 3 });")
        log = s.run("wait 600\ncrash listen\nwait 900\n")
        self.assertIn("echo: TEST retain ok", log)
        self.assertEqual(log.count('TEST heard {"level":3} from echo'), 2, log)   # live, then replayed at the restart

    def test_a_screen_and_what_it_shows_on_the_launcher(self):
        s = self.scenario()
        s.native("echo", self.ECHO, engine=self.ENGINE)
        s.world("viewer", "service('viewer').needs('frames').on('frames', (s, f, m) => log('TEST frame ' + JSON.stringify(f) + ' from ' + m.from));",
                ["frames.read"])
        s.world("drv", STEPS % """
          send('echo', 'screen', { t: 'col', kids: [{ t: 'text', s: 'hello' }] });
          await sleep(100);
          await out('shown', () => sys.worlds('name,kind,title,icon,about,key').filter((x) => x.name === 'echo'));
          await out('default', () => Object.keys(sys.worlds().find((x) => x.name === 'echo')).filter((k) => ['icon', 'about', 'key'].includes(k)));
        """, ["sys.read"])
        log = s.run()
        for line in ("echo: TEST title ok", "echo: TEST icon ok", "echo: TEST about ok", "echo: TEST screen ok",
                     "echo: TEST icon-object err an icon is a JSON array of drawing operations, at most 1024 bytes",
                     "echo: TEST key-upper err a shortcut key is one of a-z and 0-9"):
            self.assertIn(line, log)
        self.assertIn('TEST frame {"app":"echo","title":"Echo","frame":{"tree":{"t":"col","kids":[{"t":"text","s":"hello"}]},"hints":"echo hints"}} from echo', log)
        self.assertIn('TEST shown ok [{"name":"echo","kind":"service","title":"Echo","icon":[["rect",2,2,36,26],["text",14,8,"E","m","accent"]],"about":"Answers the tests.","key":""}]', log)
        self.assertIn("TEST default ok []", log)

    def test_dial_a_native_app_with_a_screen(self):
        s = self.scenario()
        s.native("dial", self.DIAL, engine=self.ENGINE)
        # a summary of each frame: a log line holds at most about a kilobyte, and a whole frame is three
        s.world("viewer", """service('viewer').needs('frames').on('frames', (s, f) => {
          const k = f.frame.tree.kids;
          log('TEST frame ' + JSON.stringify({ level: k[0].kids[1].s, kinds: k.map((x) => x.t), v: k[1].v, ops: k[2].ops.length,
                                               pairs: k[3].pairs, hints: f.frame.hints }));
        });""", ["frames.read"])
        s.world("drv", STEPS % """
          await out('shown', () => sys.worlds('name,kind,title,about,key').filter((x) => x.name === 'dial'));
          for (const key of ['right', 'right', 'up', 'down', 'down', 'left']) send('dial', 'key', { key, ch: '', state: 'down' });
          await sleep(200);
          send('dial', 'key', { key: '0', ch: '0', state: 'down' });
        """, ["sys.read"])
        log = s.run("wait 2500\n")
        self.assertIn('TEST shown ok [{"name":"dial","kind":"app","title":"Dial","about":"A native app in C: one source, '
                      'run as WebAssembly, as machine code or as a process.","key":"n"}]', log)
        frames = [json.loads(l.split("TEST frame ", 1)[1]) for l in log.splitlines() if "TEST frame " in l]
        self.assertEqual(frames[0], {"level": "50", "kinds": ["row", "bar", "canvas", "kv"], "v": 0.5, "ops": 15,
                                     "pairs": [["keys", "0"], ["seconds", "0"], ["built as", self.DIAL_BUILT_AS]],
                                     "hints": "←→ 1  ↑↓ 10  0 zero"})
        self.assertIn("41", [f["level"] for f in frames])   # 50 + 1 + 1 + 10 - 10 - 10 - 1
        self.assertEqual(frames[-1]["level"], "0")
        self.assertEqual(dict(frames[-1]["pairs"])["keys"], "7")
        self.assertGreaterEqual(int(dict(frames[-1]["pairs"])["seconds"]), 1)
        self.assertNotIn("dial crashed", log)

    def test_screens_are_json_objects_and_presentation_is_declared_at_start(self):
        log = self.echo("send('echo', 'screen-bad', null);")
        for line in ("echo: TEST screen-text err a screen is a tree of ui nodes, a JSON object",
                     "echo: TEST screen-array err a screen is a tree of ui nodes, a JSON object",
                     "echo: TEST screen-hints err hints are at most 120 bytes of text",
                     "echo: TEST screen-big err a screen is at most 16384 bytes",
                     "echo: TEST present-late err what a world shows on the launcher is declared only while it starts"):
            self.assertIn(line, log)
        self.assertNotIn("echo crashed", log)

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
          send('echo', '%s', null);
          await sleep(1200);
          await out('after', () => ask('echo', 'ping', 2));
          await out('peer', () => ask('peer', 'hello', { n: 1 }));
        """ % self.FAULT, peer=True, script="wait 2500\n")
        self.assertIn(f"echo crashed handling {self.FAULT}: {self.FAULT_WHY}", log)
        self.assertEqual(log.count("echo: TEST init done"), 2)
        self.assertIn('TEST after ok {"pong":2,"from":"drv","ask":1}', log)
        self.assertIn('TEST peer ok {"hi":1,"from":"drv"}', log)

    def test_the_budget_is_enforced(self):
        log = self.echo("send('echo', 'spin', null);")
        self.assertIn(f"echo crashed handling spin: {self.OVERRUN}", log)

    def test_a_driver_in_cpp(self):
        s = self.scenario()
        s.native("battery", self.BATTERY, ["i2c0:0x1f"], engine=self.ENGINE)
        s.world("listen", "service('listen').needs('battery').on('battery', (s, p) => log('TEST battery ' + JSON.stringify(p)));")
        s.world("drv", STEPS % "await out('level', () => ask('battery', 'level', null));")
        log = s.run()
        self.assertIn('TEST battery {"pct":82,"charging":false}', log)
        self.assertIn('TEST level ok {"pct":82,"charging":false}', log)
        self.assertIn("battery: battery: 82%", log)
        self.assertNotIn("crashed", log)


@unittest.skipUnless(platform.machine() == "x86_64", "the host sandbox's seccomp filter is written for x86-64")
class ProcessWorldTests(EngineTests, unittest.TestCase):
    """Engine "native" on the host: a static binary in a child process under seccomp and rlimits."""
    ENGINE, ECHO, BATTERY = "native", "echo", "battery"
    DIAL, DIAL_BUILT_AS = "dial", "a host process"
    FAULT, FAULT_WHY = "segv", "segmentation fault"
    OVERRUN = "ran past its turn budget of 100 ms"   # a process runs in real time
    BUILT = ("echo", "probe", "battery", "dial")

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
        self.assertIn("wasm crashed: echo is not a WebAssembly module (no \\0asm header)", log)
        s.worlds[-1]["engine"] = "python"
        code, log = s.run("wait 100\n", check=False)
        self.assertNotEqual(code, 0)
        self.assertIn('wasm: there is no engine "python" (js, wasm, native)', log)


class WasmWorldTests(EngineTests, unittest.TestCase):
    """Engine "wasm": the same sources compiled to WebAssembly, in WAMR's interpreter inside picocalc-host."""
    ENGINE, ECHO, BATTERY = "wasm", "echo.wasm", "battery.wasm"
    DIAL, DIAL_BUILT_AS = "dial.wasm", "WebAssembly"
    FAULT, FAULT_WHY = "oob", "it trapped: out of bounds memory access"   # address 0 is ordinary memory in WebAssembly
    OVERRUN = "ran past its turn budget of 100 virtual ms"   # counted in instructions, on the virtual clock
    BUILT = ("echo.wasm", "battery.wasm", "wprobe.wasm", "wimport.wasm", "dial.wasm")

    def test_the_sandbox_stops_escapes(self):
        s = self.scenario()
        stopped = {
            "oob": "it trapped: out of bounds memory access",
            "badptr": "it trapped: out of bounds memory access",
            "badlen": "it trapped: out of bounds memory access",
            "badout": "it trapped: out of bounds memory access",
            "stack": "it trapped: ",
            "trap": "it trapped: unreachable",
            "exit": "it exited with status 3",
            "spin": "ran past its turn budget of 100 virtual ms",
        }
        for p in list(stopped) + ["alloc", "stdio"]:
            s.native("wprobe_" + p, "wprobe.wasm", engine="wasm")
        log = s.run("wait 3000\n")
        for p, why in stopped.items():
            self.assertIn(f"wprobe_{p}: TEST probe {p}", log)
            self.assertIn(f"wprobe_{p} crashed handling start: {why}", log)
            self.assertNotIn(f"wprobe_{p}: TEST probe survived", log)
            self.assertIn(f"wprobe_{p} crashed 5 times in ten seconds; it stays stopped", log)
        self.assertIn("wprobe_alloc: TEST alloc failed", log)   # memory grows only to mem_kb, 1 MB
        self.assertNotIn("wprobe_alloc crashed", log)
        self.assertIn("wprobe_stdio: TEST stdio fputs=-1", log)   # EBADF from the stubs: there are no files
        self.assertNotIn("wprobe_stdio crashed", log)

    def test_modules_that_cannot_run(self):
        s = self.scenario()
        s.native("imports", "wimport.wasm", engine="wasm")
        (s.js / "short.wasm").write_bytes(b"\0asm\1\0\0\0\1\5")
        s.native("short", "short.wasm", engine="wasm")
        s.native("big", "echo.wasm", engine="wasm", mem_kb=32)
        log = s.run("wait 500\n")
        self.assertIn("imports crashed: it imports the function wasi_snapshot_preview1.path_open, which picocalc-os does not provide", log)
        self.assertNotIn("TEST wimport ran", log)
        self.assertIn("short crashed: short.wasm is not a valid WebAssembly module:", log)
        self.assertIn("big crashed: it starts with 64 KB of memory, more than the 32 KB its manifest entry gives it", log)

    def test_a_module_answers_while_the_javascript_worlds_run(self):
        log = self.echo("""
          for (let i = 0; i < 20; i++) await ask('echo', 'ping', i);
          await out('twenty', () => ask('echo', 'ping', 'done'));
        """)
        self.assertIn('TEST twenty ok {"pong":"done","from":"drv","ask":1}', log)
        self.assertNotIn("crashed", log)


class NativeAppOnTheSystemTests(unittest.TestCase):
    """The whole system (js/) with Dial as WebAssembly twice: a system app from the manifest, and apps/dial.wasm started by
    the Loader as u-dial. A viewer logs the launcher's tiles and Dial's level from the frames."""

    VIEWER = """service('viewer').needs('frames').on('frames', (s, f) => {
      if (f.app === 'launcher') log('TEST tiles ' + JSON.stringify(f.frame.tree.kids[1].items.map((t) => [t.label, t.key, !!t.mark])));
      else if (f.app.endsWith('dial')) log('TEST level ' + f.app + ' ' + f.frame.tree.kids[0].kids[1].s);
    });"""

    def test_dial_on_the_launcher_from_the_manifest_and_from_storage(self):
        if not (NATIVES / "dial.wasm").exists():
            self.skipTest(f"build the example binaries first (make wasm); no dial.wasm in {NATIVES}")
        with tempfile.TemporaryDirectory(prefix="appui-dial-", dir=OS / "build") as d:
            root = Path(d)
            shutil.copytree(OS / "js", root / "js")
            shutil.copytree(OS / "fs-seed", root / "fs")
            (root / "fs/apps").mkdir(exist_ok=True)
            shutil.copyfile(NATIVES / "dial.wasm", root / "js/dial.wasm")
            shutil.copyfile(NATIVES / "dial.wasm", root / "fs/apps/dial.wasm")
            (root / "js/viewer.js").write_text(self.VIEWER)
            manifest = json.loads((root / "js/system.json").read_text())
            manifest["worlds"] += [dict(name="dial", file="dial.wasm", engine="wasm", mem_kb=256, budget_ms=50),
                                   dict(name="viewer", file="viewer.js", claims=["frames.read"], mem_kb=512)]
            (root / "js/system.json").write_text(json.dumps(manifest))
            script = ("wait 1500\nkey n\nwait 500\nkey right\nkey up\nwait 500\nkey f1\nwait 300\n"   # Dial by its letter
                      "key u\nwait 800\nkey enter\nwait 1500\nkey f1\nwait 800\n")             # the Loader starts u-dial
            done = subprocess.run([str(BINARY), "-j", str(root / "js"), "-o", str(root / "out"), "-f", str(root / "fs"), "-"],
                                  input=script, text=True, capture_output=True, cwd=OS, timeout=60)
            log = (root / "out/uart.log").read_text() + done.stderr
        self.assertEqual(done.returncode, 0, log)
        self.assertNotIn("crashed", log)
        tiles = [json.loads(l.split("TEST tiles ", 1)[1]) for l in log.splitlines() if "TEST tiles " in l]
        self.assertTrue(any(["Dial", "n", False] in t for t in tiles), tiles)   # the grid shows three rows of the 15
        self.assertEqual(tiles[-1][-1], ["u-dial", "", True])   # last, marked, no letter
        levels = [l.split("TEST level ", 1)[1].split() for l in log.splitlines() if "TEST level " in l]
        dial = [v for i, (app, v) in enumerate(levels) if app == "dial" and v not in [w for a, w in levels[:i] if a == "dial"]]
        self.assertEqual(dial, ["50", "51", "61"])   # a new frame every second too: its seconds counter
        self.assertIn(["u-dial", "50"], levels)


if __name__ == "__main__":
    unittest.main(verbosity=2)
