#!/usr/bin/env python3
"""Exercise the real QuickJS/native boundary and optional verified HTTPS worker.

  make && python3 tests/test_agent_native.py
  make AGENT_LIVE=1 && python3 tests/test_agent_native.py --live

Only the --live suite opens a network socket, on loopback with a generated CA-trusted certificate.
It makes no provider requests and needs no API credential. Temporary files stay under build/.
"""
import argparse
import http.server
import json
import os
from pathlib import Path
import shutil
import ssl
import subprocess
import tempfile
import threading
import time
import unittest

OS = Path(__file__).resolve().parents[1]
OPTIONS, REST = argparse.ArgumentParser().parse_known_args()
LIVE = "--live" in REST
if LIVE:
    REST.remove("--live")
BINARY = OS / os.environ.get("PICOCALC_TEST_BINARY", "build/picocalc-host")
LIVE_BINARY = OS / os.environ.get("PICOCALC_TEST_LIVE_BINARY", "build-agent/picocalc-host")


class Scenario:
    def __init__(self, *, fixtures=True, disk=True, broken_store=False):
        (OS / "build").mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="agent-test-", dir=OS / "build")
        self.root = Path(self.temp.name)
        self.js = self.root / "js"
        self.js.mkdir()
        shutil.copyfile(OS / "js/prelude.js", self.js / "prelude.js")
        self.fixtures = self.root / "fixtures"
        self.fixtures.mkdir()
        self.store = self.root / "store"
        if broken_store:
            self.store.write_text("a regular file cannot contain records")
        self.use_fixtures = fixtures
        self.disk = disk
        self.worlds = []
        self.env = {k: v for k, v in os.environ.items() if not k.startswith("PICOCALC_AGENT_")}
        if fixtures:
            self.env["PICOCALC_AGENT_FIXTURES"] = str(self.fixtures)

    def close(self):
        self.temp.cleanup()

    def world(self, name, source, claims=("net.agent",), store_kb=1):
        (self.js / (name + ".js")).write_text(source)
        self.worlds.append(dict(name=name, file=name + ".js", claims=list(claims), mem_kb=768,
                                budget_ms=100, store_kb=store_kb))

    def fixture(self, number, body, *, status=200, delay=120):
        stem = self.fixtures / f"{number:03d}"
        stem.with_suffix(".json").write_bytes(body if isinstance(body, bytes) else body.encode())
        stem.with_suffix(".status").write_text(str(status))
        stem.with_suffix(".delay_ms").write_text(str(delay))

    def run(self, script="wait 1000\n", *, live=False, extra_env=None):
        (self.js / "system.json").write_text(json.dumps(dict(worlds=self.worlds)))
        self.env.update(extra_env or {})
        args = [str(LIVE_BINARY if live else BINARY), "-j", str(self.js), "-o", str(self.root / "out"), "-"]
        if self.disk:
            args[-1:-1] = ["-s", str(self.store)]
        if live:
            args[-1:-1] = ["-r"]
        completed = subprocess.run(args, input=script, text=True, capture_output=True, env=self.env,
                                   cwd=OS, timeout=15)
        log = (self.root / "out/uart.log").read_text() + completed.stderr
        if completed.returncode:
            raise AssertionError(f"host exited {completed.returncode}: {log}\n{completed.stdout}")
        return log


POLL_WORLD = """
service('w').state({id:0,done:false,ticks:0})
  .onStart(s=>{s.id=agentNet.start({input:'hello'}); log('TEST pending', agentNet.poll(s.id));})
  .every(20,s=>{s.ticks++; if(s.done)return; const r=agentNet.poll(s.id); if(r){s.done=true;log('TEST result',JSON.stringify(r));
    try{agentNet.poll(s.id)}catch(e){log('TEST consumed',e.message)} }});
"""


class NativeTests(unittest.TestCase):
    def setUp(self):
        self.scenarios = []

    def scenario(self, **options):
        s = Scenario(**options)
        self.scenarios.append(s)
        return s

    def tearDown(self):
        for s in self.scenarios:
            s.close()

    def test_unconfigured_offline(self):
        s = self.scenario(fixtures=False)
        s.world("w", "service('w').onStart(()=>{log('TEST status',JSON.stringify(agentNet.status()));try{agentNet.start('{}')}catch(e){log('TEST error',e.message)}})")
        log = s.run()
        self.assertIn('"configured":false', log)
        self.assertIn('not configured', log)

    def test_claim_required(self):
        s = self.scenario()
        s.world("w", "service('w').onStart(()=>{for(const f of [()=>agentNet.status(),()=>agentNet.start('{}'),()=>agentNet.poll(1),()=>agentNet.cancel(1)])try{f()}catch(e){log('TEST denied',e.message)}})", claims=())
        self.assertEqual(s.run().count("TEST denied w has no claim on net.agent"), 4)

    def test_fixture_pending_complete_consumed_and_http_status(self):
        s = self.scenario()
        s.world("w", POLL_WORLD)
        s.fixture(1, '{"error":{"message":"rate limit"}}', status=429)
        log = s.run()
        self.assertIn("TEST pending null", log)
        self.assertIn('"status":429', log)
        self.assertIn("rate limit", log)
        self.assertIn("TEST consumed", log)

    def test_ticket_ownership(self):
        s = self.scenario()
        s.world("w", POLL_WORLD)
        s.world("other", "service('other').onStart(()=>{try{agentNet.poll(1)}catch(e){log('TEST other denied',e.message)}})")
        s.fixture(1, '{"ok":true}')
        log = s.run()
        self.assertIn("TEST other denied", log)
        self.assertIn('"status":200', log)

    def test_ticket_numeric_validation(self):
        s = self.scenario()
        s.world("w", "service('w').onStart(()=>{for(const id of [NaN,Infinity,-1,0,1.5,2147483648,'1'])for(const f of [agentNet.poll,agentNet.cancel])try{f(id)}catch(e){log('TEST invalid',e.message)}})")
        self.assertEqual(s.run().count("TEST invalid agent ticket must be a positive integer"), 14)

    def test_request_byte_quota(self):
        s = self.scenario()
        s.world("w", "service('w').onStart(()=>{for(const b of ['x'.repeat(49153),'é'.repeat(24577)])try{agentNet.start(b)}catch(e){log('TEST limited',e.message)};const id=agentNet.start('x'.repeat(49152));log('TEST accepted',id);agentNet.cancel(id)})")
        s.fixture(1, '{}')
        log = s.run()
        self.assertEqual(log.count("TEST limited agent request"), 2)
        self.assertIn("TEST accepted", log)

    def test_response_bound_and_nul(self):
        for body, expected in [(b"x" * 65537, "exceeds 65536"), (b'{"x":"a\0b"}', "not valid text"),
                               (b'{"x":"\xc0\xaf"}', "not valid UTF-8"), (b'{"x":"\xed\xa0\x80"}', "not valid UTF-8")]:
            with self.subTest(expected=expected):
                s = self.scenario()
                s.world("w", POLL_WORLD)
                s.fixture(1, body)
                self.assertIn(expected, s.run())

    def test_fixture_timeout(self):
        s = self.scenario()
        s.world("w", POLL_WORLD)
        s.fixture(1, '{}', delay=46000)
        self.assertIn("timed out after 45000 ms", s.run("wait 47000\n"))

    def test_cancel_and_reuse(self):
        s = self.scenario()
        s.world("w", """service('w').state({phase:0,id:0}).onStart(s=>s.id=agentNet.start('{}'))
          .every(20,s=>{if(s.phase===0){agentNet.cancel(s.id);s.phase=1;return}
          if(s.phase===1){s.id=agentNet.start('{}');s.phase=2;return}
          if(s.phase===2){const r=agentNet.poll(s.id);if(r){s.phase=3;log('TEST reply',r.body)}}});""")
        s.fixture(1, '"stale"', delay=5000)
        s.fixture(2, '"fresh"')
        log = s.run()
        self.assertIn('TEST reply "fresh"', log)
        self.assertNotIn('TEST reply "stale"', log)

    def test_restart_discards_old_request(self):
        s = self.scenario()
        s.world("w", POLL_WORLD)
        s.fixture(1, '"stale"', delay=5000)
        s.fixture(2, '"fresh"')
        log = s.run("wait 50\ncrash w\nwait 1000\n")
        self.assertIn("fresh", log)
        self.assertNotIn("stale", log)

    def test_failed_segment_does_not_start_network(self):
        s = self.scenario()
        s.world("w", """service('w').state({id:0,done:false}).on('fail',()=>{agentNet.start('{}');throw Error('rollback')})
          .on('start',s=>s.id=agentNet.start('{}')).every(20,s=>{if(s.id&&!s.done){const r=agentNet.poll(s.id);if(r){s.done=true;log('TEST reply',r.body)}}});""")
        s.fixture(1, '"first"')
        log = s.run("wait 50\nsend w fail null\nwait 300\nsend w start null\nwait 500\n")
        self.assertIn('TEST reply "first"', log)
        self.assertNotIn("fixture response is unavailable", log)

    def test_storage_quota_copies_and_status(self):
        s = self.scenario()
        s.world("w", """service('w').state({checked:false}).onStart(()=>{
          const v={n:7};store.set('item',v);v.n=9;log('TEST copied',store.get('item').n);
          log('TEST pending',store.status().pending);try{store.set('big','x'.repeat(1100))}catch(e){log('TEST quota',e.message)};
          store.set('__proto__',{safe:true});log('TEST proto',store.get('__proto__').safe);
          log('TEST fallback',store.get('missing','fallback'));})
          .every(20,s=>{if(!s.checked){s.checked=true;log('TEST storage',JSON.stringify(store.status()))}});""")
        log = s.run()
        self.assertIn("TEST copied 7", log)
        self.assertIn("TEST pending true", log)
        self.assertIn("TEST quota store quota exceeded (1024 bytes)", log)
        self.assertIn("TEST proto true", log)
        self.assertIn('TEST storage {"pending":false,"error":""}', log)
        saved = json.loads((s.store / "w/w").read_text())
        self.assertEqual(saved["item"], {"n": 7})
        self.assertNotIn("big", saved)

    def test_storage_survives_process_and_fault_write_is_discarded(self):
        s = self.scenario()
        s.world("w", """service('w').onStart(()=>{log('TEST saved',store.get('n',0));})
          .on('save',()=>store.set('n',1)).on('fail',()=>{store.set('n',2);throw Error('rollback')});""")
        log = s.run("wait 50\nsend w save null\nwait 50\nsend w fail null\nwait 400\n")
        self.assertIn("TEST saved 0", log)
        self.assertIn("TEST saved 1", log)
        self.assertNotIn("TEST saved 2", log)
        self.assertIn("TEST saved 1", s.run())

    def test_storage_io_failure_visible(self):
        s = self.scenario(broken_store=True)
        s.world("w", "service('w').state({done:false}).onStart(()=>store.set('n',1)).every(20,s=>{if(!s.done){s.done=true;log('TEST storage',JSON.stringify(store.status()))}})")
        self.assertIn('"error":"persistent storage write failed"', s.run())

    def test_corrupt_store_visible(self):
        s = self.scenario()
        (s.store / "w").mkdir(parents=True)
        (s.store / "w/w").write_text("{not json")
        s.world("w", "service('w').onStart(()=>{log('TEST fallback',store.get('n',3));log('TEST storage',JSON.stringify(store.status()))})")
        log = s.run()
        self.assertIn("TEST fallback 3", log)
        self.assertIn("saved record is invalid JSON", log)


@unittest.skipUnless(LIVE, "pass --live after make AGENT_LIVE=1 for verified HTTPS tests")
class LiveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="agent-tls-", dir=OS / "build")
        cls.root = Path(cls.temp.name)
        cls.cert, cls.key = cls.root / "cert.pem", cls.root / "key.pem"
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(cls.key),
                        "-out", str(cls.cert), "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.received = []

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def do_POST(self):
                data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
                cls.received.append((self.path, self.headers.get("Authorization"), data))
                status, body = 200, '{"reply":"hello ✓"}'.encode()
                if self.path == "/large":
                    body = b"x" * 65537
                elif self.path == "/nul":
                    body = b'{"reply":"hello\0wrong"}'
                elif self.path == "/redirect":
                    status, body = 302, b"{}"
                elif self.path == "/wait":
                    time.sleep(0.7)
                self.send_response(status)
                if status == 302:
                    self.send_header("Location", cls.url + "/redirected")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                try:
                    self.wfile.write(body)
                except (BrokenPipeError, ssl.SSLError):
                    pass

        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cls.cert, cls.key)
        cls.server.socket = context.wrap_socket(cls.server.socket, server_side=True)
        cls.url = f"https://localhost:{cls.server.server_port}"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def request(self, path, *, trust=True, hostname=True, source=POLL_WORLD):
        s = Scenario(fixtures=False)
        try:
            s.world("w", source)
            url = self.url if hostname else self.url.replace("localhost", "127.0.0.1")
            env = {"PICOCALC_AGENT_URL": url + path, "PICOCALC_AGENT_TOKEN": "test-token",
                   "NO_PROXY": "localhost,127.0.0.1", "no_proxy": "localhost,127.0.0.1"}
            if trust:
                env["PICOCALC_AGENT_CA_FILE"] = str(self.cert)
            return s.run("wait 1100\n", live=True, extra_env=env)
        finally:
            s.close()

    def test_verified_post_and_authorization(self):
        log = self.request("/ok")
        self.assertIn('"status":200', log)
        self.assertIn("hello ✓", log)
        self.assertIn(("/ok", "Bearer test-token", b'{"input":"hello"}'), self.received)
        self.assertNotIn("test-token", log)

    def test_untrusted_certificate_rejected(self):
        self.assertIn("HTTPS request failed", self.request("/ok", trust=False))

    def test_hostname_mismatch_rejected(self):
        self.assertIn("HTTPS request failed", self.request("/ok", hostname=False))

    def test_redirect_not_followed(self):
        log = self.request("/redirect")
        self.assertIn('"status":302', log)
        self.assertFalse(any(path == "/redirected" for path, _, _ in self.received))

    def test_response_limit(self):
        self.assertIn("agent response exceeds 65536 bytes", self.request("/large"))

    def test_nul_rejected(self):
        self.assertIn("agent response contains a NUL byte", self.request("/nul"))

    def test_cancel_does_not_block_world(self):
        source = """service('w').state({id:0,ticks:0}).onStart(s=>s.id=agentNet.start('{}'))
          .every(20,s=>{s.ticks++;if(s.ticks===3){agentNet.cancel(s.id);log('TEST cancelled')}
          if(s.ticks===20)log('TEST responsive',s.ticks)});"""
        log = self.request("/wait", source=source)
        self.assertIn("TEST cancelled", log)
        self.assertIn("TEST responsive 20", log)


if __name__ == "__main__":
    unittest.main(argv=[__file__] + REST, verbosity=2)
