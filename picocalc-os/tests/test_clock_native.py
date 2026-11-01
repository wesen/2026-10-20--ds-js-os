#!/usr/bin/env python3
"""The wall clock through the real host binary: clock.wall/set/zone, Date on the wall clock, time zones (-z) and an
unknown time (-w unset). Uses the scenario harness of test_fs_native.py."""
import os
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_fs_native import BINARY, Scenario, STEPS  # noqa: E402

PROBE = STEPS % """
  await out('set', () => clock.set());
  await out('zone', () => clock.zone());
  await out('iso', () => new Date().toISOString().slice(0, 16));
  await out('local', () => { const d = new Date(); return [d.getHours(), d.getMinutes(), d.getTimezoneOffset()]; });
  await out('winter', () => new Date(2027, 0, 1, 12, 0).getTimezoneOffset());
  const t0 = Date.now();
  await sleep(60000);
  await out('advanced', () => Math.round((Date.now() - t0) / 1000));
"""


class ClockTests(unittest.TestCase):
    def probe(self, *extra):
        s = Scenario()
        try:
            s.world("w", PROBE)
            return s.run("wait 62000\n", extra)
        finally:
            s.close()

    def test_default_is_the_old_boot_time_in_utc(self):
        log = self.probe()
        self.assertIn('TEST set ok true', log)
        self.assertIn('TEST zone ok "UTC0"', log)
        self.assertIn('TEST iso ok "2026-10-22T09:41"', log)
        self.assertIn('TEST local ok [9,41,0]', log)
        self.assertIn('TEST advanced ok 60', log)

    def test_a_zone_with_daylight_saving_time(self):
        log = self.probe("-w", "2026-07-01T12:00", "-z", "EST5EDT,M3.2.0,M11.1.0")
        self.assertIn('TEST iso ok "2026-07-01T16:00"', log)   # 12:00 EDT is 16:00 UTC
        self.assertIn('TEST local ok [12,0,240]', log)
        self.assertIn('TEST winter ok 300', log)

    def test_an_unknown_time(self):
        log = self.probe("-w", "unset")
        self.assertIn('TEST set ok false', log)
        self.assertIn('TEST iso ok "2026-10-22T09:41"', log)   # Date falls back to the made-up time

    def test_a_bad_start_is_refused(self):
        done = subprocess.run([str(BINARY), "-w", "yesterday", "-"], input="", text=True, capture_output=True, timeout=10)
        self.assertEqual(done.returncode, 2)
        self.assertIn("expected YYYY-MM-DDTHH:MM", done.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
