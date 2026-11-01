#!/usr/bin/env python3
"""Files through the real host binary: claims, paths, rights, narrowing, passing and revoking handles, crash safety.

Each test writes a small manifest and one or two worlds into a temporary directory under build/, runs
build/picocalc-host on them with a fresh filesystem root (-f), and reads the log the worlds wrote.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

OS = Path(__file__).resolve().parents[1]
BINARY = OS / os.environ.get("PICOCALC_TEST_BINARY", "build/picocalc-host")


class Scenario:
    def __init__(self):
        (OS / "build").mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="fs-test-", dir=OS / "build")
        self.root = Path(self.temp.name)
        self.js = self.root / "js"
        self.js.mkdir()
        shutil.copyfile(OS / "js/prelude.js", self.js / "prelude.js")
        self.fs = self.root / "files"
        self.fs.mkdir()
        self.worlds = []

    def close(self):
        self.temp.cleanup()

    def world(self, name, source, claims=()):
        (self.js / (name + ".js")).write_text(source)
        self.worlds.append(dict(name=name, file=name + ".js", claims=list(claims), mem_kb=512, budget_ms=100))

    def run(self, script="wait 1500\n"):
        (self.js / "system.json").write_text(json.dumps(dict(worlds=self.worlds)))
        args = [str(BINARY), "-j", str(self.js), "-o", str(self.root / "out"), "-f", str(self.fs), "-"]
        done = subprocess.run(args, input=script, text=True, capture_output=True, cwd=OS, timeout=20)
        log = (self.root / "out/uart.log").read_text() + done.stderr
        if done.returncode:
            raise AssertionError(f"host exited {done.returncode}: {log}\n{done.stdout}")
        return log


# A world that runs its steps in order and logs each result or error: TEST <label> ok <json> | TEST <label> err <message>
STEPS = """
const out = (label, p) => Promise.resolve().then(() => p()).then(
  (v) => log('TEST ' + label + ' ok ' + JSON.stringify(v)), (e) => log('TEST ' + label + ' err ' + e.message));
service('w').onStart(async () => { %s });
"""


class FsTests(unittest.TestCase):
    def setUp(self):
        self.scenarios = []

    def tearDown(self):
        for s in self.scenarios:
            s.close()

    def scenario(self):
        s = Scenario()
        self.scenarios.append(s)
        return s

    def steps(self, body, claims=("fs:/",)):
        s = self.scenario()
        s.world("w", STEPS % body, claims)
        return s, s.run()

    def test_write_read_list_stat_append(self):
        s, log = self.steps("""
          const d = hw.fs('fs:/');
          await out('write', () => d.write('a.txt', 'hello\\nwörld'));
          await out('read', () => d.read('a.txt'));
          await out('append', () => d.append('a.txt', '!'));
          await out('stat', () => d.stat('a.txt'));
          await out('mkdir', () => d.mkdir('sub'));
          await out('list', () => d.list());
          await out('info', () => d.info().then((i) => i.total > 0 && i.free > 0));
        """)
        self.assertIn('TEST write ok {"bytes":12}', log)
        self.assertIn('TEST read ok "hello\\nwörld"', log)
        self.assertIn('TEST append ok {"bytes":13}', log)
        self.assertIn('TEST stat ok {"dir":false,"size":13}', log)
        self.assertIn('TEST list ok [{"name":"a.txt","dir":false,"size":13},{"name":"sub","dir":true,"size":0}]', log)
        self.assertIn('TEST info ok true', log)
        self.assertEqual((s.fs / "a.txt").read_text(), "hello\nwörld!")

    def test_paths_are_checked_before_io(self):
        _, log = self.steps("""
          const d = hw.fs('fs:/');
          for (const p of ['../x', '/etc/passwd', 'a//b', '.hidden', 'a/./b', 'a/../b', 'trailing/'])
            await out('bad ' + p, () => d.read(p));
        """)
        for p in ['../x', '/etc/passwd', 'a//b', '.hidden', 'a/./b', 'a/../b', 'trailing/']:
            self.assertIn(f"TEST bad {p} err not a valid path", log)

    def test_claims(self):
        s = self.scenario()
        s.world("w", STEPS % """
          await out('root', () => hw.fs('fs:/'));
          await out('notes', () => hw.fs('fs:/notes').path);
          await out('other', () => hw.fs('fs:/other'));
          await out('bad', () => hw.fs('/notes'));
        """, claims=("fs:/notes",))
        log = s.run()
        self.assertIn("TEST root err w has no claim on fs:/", log)
        self.assertIn('TEST notes ok "notes"', log)
        self.assertIn("TEST other err w has no claim on fs:/other", log)
        self.assertIn("is not a file claim", log)
        self.assertTrue((s.fs / "notes").is_dir())

    def test_narrowing_rights_and_file_handles(self):
        s, log = self.steps("""
          const d = hw.fs('fs:/');
          await d.write('n.txt', 'one');
          const ro = d.at('n.txt', 'r');
          await out('ro read', () => ro.read());
          await out('ro write', () => ro.write('two'));
          const rw = d.at('n.txt', 'rw');
          await out('rw write', () => rw.write('two'));
          await out('file list', () => rw.list());
          await out('file path', () => rw.read('other.txt'));
          await out('file at', () => rw.at('x', 'r'));
          await d.mkdir('sub');
          const sub = d.at('sub', 'rw');
          await out('sub write', () => sub.write('in.txt', 'inside'));
          await out('sub escape', () => sub.read('../n.txt'));
          await out('new file', () => d.at('fresh.txt', 'rw').write('made'));
        """)
        self.assertIn('TEST ro read ok "one"', log)
        self.assertIn("TEST ro write err handle", log)
        self.assertIn("is read-only", log)
        self.assertIn('TEST rw write ok {"bytes":3}', log)
        self.assertIn("TEST file list err a file handle cannot do that", log)
        self.assertIn("TEST file path err a file handle takes no path", log)
        self.assertIn("TEST file at err", log)
        self.assertIn("TEST sub escape err not a valid path", log)
        self.assertEqual((s.fs / "sub/in.txt").read_text(), "inside")
        self.assertEqual((s.fs / "fresh.txt").read_text(), "made")

    def test_pass_and_revoke_a_file_handle(self):
        s = self.scenario()
        s.world("browser", """
service('browser').state({}).onStart(async (st) => {
  const d = hw.fs('fs:/');
  await d.write('doc.txt', 'shared');
  st.one = d.at('doc.txt', 'rw');
  send('editor', 'open', { file: st.one });
}).on('opened', async (st) => { st.one.revoke(); send('editor', 'again', {}); });
""", claims=("fs:/",))
        s.world("editor", """
service('editor').state({}).on('open', async (st, m) => {
  st.f = m.file;
  log('TEST editor read ' + await st.f.read());
  await st.f.write('edited');
  try { send('other', 'take', { file: st.f }); } catch (e) { log('TEST pass on err ' + e.message); }
  send('browser', 'opened', {});
}).on('again', async (st) => {
  try { await st.f.read(); } catch (e) { log('TEST after revoke err ' + e.message); }
});
""")
        s.world("other", "service('other').on('take', () => log('TEST other got it'));")
        log = s.run("wait 2000\n")
        self.assertIn("TEST editor read shared", log)
        self.assertEqual((s.fs / "doc.txt").read_text(), "edited")
        self.assertIn("TEST pass on err handle", log)
        self.assertIn("cannot be passed on by editor", log)
        self.assertNotIn("TEST other got it", log)
        self.assertIn("TEST after revoke err handle", log)
        self.assertIn("was revoked", log)

    def test_a_crashing_segment_writes_nothing(self):
        s = self.scenario()
        s.world("w", """
service('w').state({}).onStart(async () => {
  const d = hw.fs('fs:/');
  await d.write('keep.txt', 'before');
  log('TEST wrote before');
  d.write('keep.txt', 'after');
  throw new Error('crash after asking for a write');
});
""", claims=("fs:/",))
        log = s.run("wait 1500\n")
        self.assertIn("TEST wrote before", log)
        self.assertEqual((s.fs / "keep.txt").read_text(), "before")

    def test_sizes_and_text(self):
        s, log = self.steps("""
          const d = hw.fs('fs:/');
          await out('max', () => d.write('big.txt', 'x'.repeat(65536)));
          await out('max read', () => d.read('big.txt').then((t) => t.length));
          await out('over', () => d.write('big2.txt', 'x'.repeat(65537)));
          await out('append over', () => d.append('big.txt', 'y'));
          await out('binary', () => d.read('bin.dat'));
        """)
        self.assertIn('TEST max ok {"bytes":65536}', log)
        self.assertIn("TEST max read ok 65536", log)
        self.assertIn("TEST over err a file is at most 65536 bytes", log)
        self.assertIn("would be larger than 65536 bytes", log)
        self.assertIn("TEST binary err no file bin.dat", log)
        (s.fs / "bin.dat").write_bytes(b"\xff\xfe\x00")
        s2 = s
        s2.worlds.clear()
        s2.world("w", STEPS % "await out('binary', () => hw.fs('fs:/').read('bin.dat'));", ("fs:/",))
        self.assertIn("TEST binary err bin.dat is not text (UTF-8)", s2.run())

    def test_remove_rename_and_recovery(self):
        s = self.scenario()
        (s.fs / "dir").mkdir()
        (s.fs / "dir/x.txt").write_text("x")
        (s.fs / ".w-lost.txt").write_text("interrupted write")   # a write cut between unlink and rename
        s.world("w", STEPS % """
          const d = hw.fs('fs:/');
          await out('rmdir full', () => d.remove('dir'));
          await out('rename', () => d.rename('dir/x.txt', 'y.txt'));
          await out('rename onto', () => d.rename('y.txt', 'y.txt'));
          await out('rmdir', () => d.remove('dir'));
          await out('list', () => d.list().then((l) => l.map((e) => e.name)));
          await out('recovered', () => d.read('lost.txt'));
          await out('root', () => d.remove(''));
        """, ("fs:/",))
        log = s.run()
        self.assertIn("TEST rmdir full err dir is not empty", log)
        self.assertIn("TEST rename ok true", log)
        self.assertIn("TEST rename onto err y.txt already exists", log)
        self.assertIn("TEST rmdir ok true", log)
        self.assertIn('TEST recovered ok "interrupted write"', log)
        self.assertIn("TEST root err this operation needs a path", log)

    def test_restarted_world_does_not_get_old_results(self):
        s = self.scenario()
        s.world("w", """
service('w').state({}).onStart(async () => {
  const d = hw.fs('fs:/');
  const n = Number((await d.read('count.txt').catch(() => '0'))) + 1;
  await d.write('count.txt', String(n));
  log('TEST start ' + n);
  if (n === 1) { d.read('count.txt').then((t) => log('TEST stale ' + t)); throw new Error('crash with a read pending'); }
});
""", claims=("fs:/",))
        log = s.run("wait 3000\n")
        self.assertIn("TEST start 1", log)
        self.assertIn("TEST start 2", log)
        self.assertNotIn("TEST stale", log)


if __name__ == "__main__":
    unittest.main(verbosity=2)
