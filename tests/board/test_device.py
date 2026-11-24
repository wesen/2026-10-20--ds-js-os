"""bench/board/device.py against a fake serial port (tests/board/fakeboard.py), on a virtual clock.

PICOCALC-BOARD-HARNESS: the painter wait with the peripherals off (1), the console's absolute deadline while the
gallery prints (2), health after a long uptime (3), and the bus window in every health record (5).
"""
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fakeboard import Clock, FakeBoard, device  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "bench/board"))
import playable  # noqa: E402

HOURS = 3600.0


class BoardTest(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        patcher = mock.patch.object(device, "time", self.clock)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.log = io.BytesIO()

    def board(self, **settings):
        uptime = settings.pop("uptime_s", 20.0)
        board = FakeBoard(self.clock, uptime_s=uptime)
        for k, v in settings.items():
            setattr(board, k, v)
        return board

    def console(self, board, drain_s=13):
        return device.Console(board, self.log, drain_s=drain_s)


class PainterWait(BoardTest):
    """(1) With the keyboard and display off, Chess hands the painter its sources late; health waits for it."""

    def test_off_by_user_waits_for_the_painter(self):
        # Just flashed: the painter arrives 30 s into the boot, after the console drain (13 s) and the settle.
        board = self.board(uptime_s=0.5, painter_after_s=30.0, display_on=False, i2c_error_rate=50.0)
        record = device.health(self.console(board), "off-by-user")
        self.assertFalse(board.painter_answers[0]["installed"], "the first painter answer must predate the sources")
        self.assertTrue(record["painter"]["installed"])
        self.assertEqual(record["painter"]["compiles"], 1)
        self.assertEqual(record["painter"]["calls"], 0, "with the display off the painter is never called")
        self.assertEqual(board.reboots, 0)

    def test_off_by_user_gives_up_at_the_deadline(self):
        board = self.board(uptime_s=0.5, painter_after_s=10 * HOURS, display_on=False)
        with self.assertRaisesRegex(RuntimeError, "painter .*'installed': False"):
            device.health(self.console(board), "off-by-user")

    def test_on_waits_for_the_painter_to_be_called(self):
        board = self.board(uptime_s=0.5, painter_after_s=30.0)
        record = device.health(self.console(board), "on")
        self.assertGreater(record["painter"]["calls"], 0)


    def test_a_reply_inside_another_line_is_read(self):
        # PICOCALC-COMPILE-CACHE: on a cold boot the painter's compile printed its TYPEDCOMPILE record in pieces and
        # the painter reply landed inside it; health stopped with StopIteration.
        board = self.board(uptime_s=0.5, painter_after_s=0.0, glued={"painter": 1})
        record = device.health(self.console(board), "on")
        self.assertEqual(board.glued["painter"], 0, "the glued reply was the one health read")
        self.assertTrue(record["painter"]["installed"])

    def test_a_reply_that_cannot_be_read_is_polled_again(self):
        board = self.board(uptime_s=20.0)
        console = self.console(board, drain_s=0)
        lost = iter([True, True])   # the first two replies cannot be read
        real = device.painter
        with mock.patch.object(device, "painter", side_effect=lambda c: None if next(lost, False) else real(c)) as polled:
            self.assertTrue(device.wait_painter(console, calls=False)["installed"])
        self.assertEqual(polled.call_count, 3)


class ConsoleDeadline(BoardTest):
    """(2) A command's deadline is absolute, however many unrelated lines arrive."""

    def test_unanswered_command_times_out_while_the_gallery_prints(self):
        board = self.board(silent={"hold"})
        board.stream(.002)   # faster than 115200 baud carries them: a complete line is always waiting
        console = self.console(board, drain_s=0)
        start = self.clock.now
        with self.assertRaises(TimeoutError):
            console.command("hold", timeout=2)
        self.assertGreaterEqual(self.clock.now - start, 2)
        self.assertLess(self.clock.now - start, 2.1)
        self.assertGreater(board.stream_count, 500)

    def test_buffered_lines_do_not_outlive_the_deadline(self):
        console = self.console(self.board(), drain_s=0)
        console.pending = b'CGAL {"ev":"pass"}\n' * 1000
        with self.assertRaises(TimeoutError):
            console.line(self.clock.now)

    def test_answered_command_returns_among_cgal_records(self):
        board = self.board()
        board.stream(.01)
        console = self.console(board, drain_s=0)
        self.clock.sleep(.5)
        lines = console.command("gallery", timeout=3)
        self.assertTrue(any(line.startswith("CGAL {") for line in lines))
        self.assertIn("unknown command gallery (try help)", lines)

    def test_ok_after_another_tasks_partial_line(self):
        board = self.board(ok_prefix={"hold": 'CGAL {"ev":"pa'})
        console = self.console(board, drain_s=0)
        lines = console.command("hold", timeout=3)
        self.assertEqual(lines[-1], 'CGAL {"ev":"pa')
        self.assertIn("i2c0 held between transactions; reboot or flash now", lines)

    def test_hold(self):
        board = self.board()
        board.stream(.002)
        device.hold(self.console(board, drain_s=0))
        self.assertIn("hold", [c for _, c in board.commands])


class FreshBoot(BoardTest):
    """(3) Errors are judged only on a boot the check can account for."""

    def stale_board(self, **settings):
        # TYPED-FIRST step 13: hours up, a compositor overrun and an I2C error storm left from the keyboard wedge.
        return self.board(uptime_s=3 * HOURS, stale={"compositor": "ran past its turn budget of 80 ms"},
                          history={"i2c0": (440_692, 437_641)}, **settings)

    def test_a_long_uptime_is_rebooted_before_judging(self):
        board = self.stale_board()
        console = self.console(board)
        self.assertEqual(console.worlds()["compositor"]["last_error"], "ran past its turn budget of 80 ms")
        record = device.health(console, "on")
        self.assertEqual(board.reboots, 1)
        self.assertTrue(record["boot"]["rebooted"])
        self.assertGreater(record["boot"]["uptimeBeforeMs"], 2 * HOURS * 1000)
        self.assertLess(record["boot"]["uptimeMs"], device.FRESH_S * 1000)
        self.assertLess(record["buses"]["totals"]["i2c0"]["errors"], 1000)

    def test_a_fresh_boot_is_not_rebooted(self):
        board = self.board(uptime_s=2.0)
        record = device.health(self.console(board), "on")
        self.assertEqual(board.reboots, 0)
        self.assertEqual(record["boot"], {"uptimeMs": record["boot"]["uptimeMs"], "rebooted": False})
        self.assertNotIn("reboot", [c for _, c in board.commands])

    def test_an_error_of_the_fresh_boot_is_judged(self):
        board = self.stale_board(each_boot={"compositor": "ran past its turn budget of 80 ms"})
        with self.assertRaisesRegex(RuntimeError, "did not become healthy"):
            device.health(self.console(board), "on")
        self.assertEqual(board.reboots, 1)

    def test_a_firmware_that_does_not_reboot(self):
        board = self.stale_board(silent={"reboot"})
        with self.assertRaisesRegex(RuntimeError, "did not answer reboot"):
            device.health(self.console(board), "on")


class BusWindow(BoardTest):
    """(5) Every health record carries each bus's change over BUS_WINDOW_S; the keyboard is judged on it."""

    def test_on_judges_the_window_not_the_history(self):
        # Errors earlier in this boot (a wedge a person cleared) are history; the window shows a healthy bus.
        board = self.board(uptime_s=60.0, history={"i2c0": (5000, 5000)})
        record = device.health(self.console(board), "on")
        window = record["buses"]
        self.assertAlmostEqual(window["seconds"], device.BUS_WINDOW_S, delta=.5)
        self.assertEqual(window["deltas"]["i2c0"]["errors"], 0)
        self.assertGreater(window["deltas"]["i2c0"]["transfers"], 200)
        self.assertGreater(window["deltas"]["spi2"]["transfers"], 0)
        self.assertGreaterEqual(window["totals"]["i2c0"]["errors"], 5000)

    def test_on_fails_a_nacking_keyboard(self):
        board = self.board(uptime_s=2.0, i2c_error_rate=50.0)
        with self.assertRaisesRegex(ValueError, "did not qualify over 5"):
            device.health(self.console(board), "on")

    def test_off_by_user_records_without_judging(self):
        board = self.board(uptime_s=2.0, i2c_error_rate=50.0, display_on=False)
        record = device.health(self.console(board), "off-by-user")
        i2c = record["buses"]["deltas"]["i2c0"]
        self.assertGreater(i2c["errors"], 0)
        self.assertEqual(i2c["errors"], i2c["transfers"])

    def test_playable_record_keeps_the_i2c_window(self):
        board = self.board(uptime_s=2.0)
        after = {"sha256": "0" * 64, "health": device.health(self.console(board), "on")}
        with tempfile.TemporaryDirectory() as tmp:
            build = Path(tmp)
            for name in (device.PART, device.BOOT):
                (build / name).parent.mkdir(parents=True, exist_ok=True)
                (build / name).write_bytes(b"x")
            with mock.patch.object(playable, "RECORD", build / "PLAYABLE.json"):
                value = playable.record(build, "0" * 64, "on", after)
            self.assertEqual(json.loads((build / "PLAYABLE.json").read_text()), value)
        self.assertEqual(value["health"]["i2c0Window"]["errors"], 0)
        self.assertGreater(value["health"]["i2c0Window"]["transfers"], 0)


class InstallHold(BoardTest):
    """An install holds the firmware (i2c0 between transactions) before esptool resets it."""

    def install(self, board):
        writes = []
        real = device.Console
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(device, "Console", lambda port, log, drain_s=13: real(board, log, drain_s)), \
                mock.patch.object(device, "acquire", lambda: mock.MagicMock()), \
                mock.patch.object(device, "check_build", lambda build: "0" * 64), \
                mock.patch.object(device, "write_app", lambda *a: writes.append([c for _, c in board.commands])):
            record = device.install(Path(tmp), Path(tmp) / "out", "on")
        self.assertEqual(len(writes), 1)
        return record, writes[0]

    def test_hold_comes_before_the_write(self):
        record, before_write = self.install(self.board(uptime_s=2.0))
        self.assertEqual(before_write, ["hold"])
        self.assertTrue(record["heldBeforeFlash"])
        self.assertIn("health", record)

    def test_a_firmware_that_cannot_hold_is_still_flashed(self):
        record, before_write = self.install(self.board(uptime_s=2.0, silent={"hold"}))
        self.assertEqual(before_write, ["hold"])
        self.assertFalse(record["heldBeforeFlash"])


if __name__ == "__main__":
    unittest.main()
