#!/usr/bin/env python3
"""A manifest entry's "fallback" through the real host binary: a world whose file cannot be read (on the P4, a Typed
app whose compile failed or missed its deadline) runs its JavaScript fallback instead; without one the boot fails.
Uses the scenario harness of test_fs_native.py."""
import json
import os
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_fs_native import BINARY, OS, Scenario, STEPS  # noqa: E402

PROBE = STEPS % "await out('engine', () => 'js');"


class FallbackTests(unittest.TestCase):
    def setUp(self):
        self.s = Scenario()

    def tearDown(self):
        self.s.close()

    def test_an_unreadable_world_runs_its_fallback(self):
        self.s.world("w", PROBE)
        self.s.worlds[0].update(file="w/compiled.bin", engine="native", fallback="w.js")
        log = self.s.run()
        self.assertIn("w: w/compiled.bin is unavailable; running w.js", log)
        self.assertIn('TEST engine ok "js"', log)

    def test_a_readable_world_ignores_its_fallback(self):
        self.s.world("w", PROBE)
        self.s.worlds[0].update(fallback="missing.js")
        log = self.s.run()
        self.assertNotIn("unavailable", log)
        self.assertIn('TEST engine ok "js"', log)

    def test_without_a_fallback_the_boot_fails(self):
        self.s.world("w", PROBE)
        self.s.worlds[0].update(file="w/compiled.bin", engine="native")
        (self.s.js / "system.json").write_text(json.dumps(dict(worlds=self.s.worlds)))
        done = subprocess.run([str(BINARY), "-j", str(self.s.js), "-o", str(self.s.root / "out"), "-"], input="",
                              text=True, capture_output=True, cwd=OS, timeout=20)
        self.assertNotEqual(done.returncode, 0)
        self.assertIn("cannot read", done.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
