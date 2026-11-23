#!/usr/bin/env python3
"""The compiled-module cache's portable core (firmware/port/esp32p4/main/typed_cache.c, PICOCALC-COMPILE-CACHE) on the
host, through tests/native/typed_cache_host.c: which inputs change the key and which do not, the key's byte layout
against an independent model in Python, and the entry format: round trips, torn and corrupt files, the atomic store
and the eviction.

PICOCALC_TYPED_CACHE_HOST names the driver binary (firmware/Makefile test-typed-cache builds it)."""
import hashlib
import os
import struct
import subprocess
import tempfile
import unittest
from pathlib import Path

DRIVER = os.environ.get("PICOCALC_TYPED_CACHE_HOST", "firmware/build/typed-cache-host")
FORMAT = 1
HEADER = 160
BIG = str(1 << 40)


def run(*args):
    out = subprocess.run([DRIVER, *map(str, args)], capture_output=True, text=True)
    if out.returncode:
        raise AssertionError(f"{args}: exit {out.returncode} {out.stderr}")
    return out.stdout.strip()


def model_key(native, bundles, modules, backend, backend_file, linker, entry, reactor, source, policy):
    """The key as typed_cache.h specifies it, from the files' bytes."""
    sha = lambda p: hashlib.sha256(Path(p).read_bytes()).digest()
    pre = bytearray(b"PCTC-key\0" + struct.pack("<I", FORMAT))

    def item(tag, data):
        pre.extend(tag.encode() + b"\0" + struct.pack("<I", len(data)) + data)

    item("native", native.encode())
    for path, file in bundles:
        item("bundle", path.encode())
        item("digest", sha(file))
    for m in modules:
        item("module", m.encode())
    item("backend", backend.encode())
    if backend_file:
        item("backend-digest", sha(backend_file))
    item("linker", sha(linker))
    item("entry", entry.encode())
    item("reactor", sha(reactor))
    item("source", sha(source))
    if policy is None:
        item("default-policy", b"")
    else:
        item("policy", policy.encode())
    return hashlib.sha256(bytes(pre)).hexdigest()


class Inputs:
    """A compile's inputs as files in a directory, with the arguments of the driver's key command."""

    def __init__(self, root):
        self.root = Path(root)
        self.files = {}
        for name, text in [("tape.js", "tape"), ("wasm.js", "front end"), ("rv32.js", "back end"),
                           ("rv32-loops.js", "loops"), ("rv32-inline.js", "inline"), ("async.js", "async"),
                           ("link.js", "linker"), ("reactor.elf", "\x7fELF reactor"), ("source.typed", "function f() {}")]:
            self.put(name, text)
        self.native = "lex 0123 quickjs 2026-06-04"
        self.bundles = ["tape.js", "wasm.js", "rv32.js", "rv32-loops.js", "rv32-inline.js", "async.js"]
        self.modules = ["typed/async.js"]
        self.backend, self.backend_file = "typed/rv32.js", None
        self.entry, self.policy = "compileTypedWorldRv32", "interactive"

    def put(self, name, text):
        path = self.root / name
        path.write_bytes(text.encode() if isinstance(text, str) else text)
        self.files[name] = path

    def args(self):
        a = [f"native={self.native}"] + [f"bundle=typed/{b}:{self.files[b]}" for b in self.bundles]
        a += [f"module={m}" for m in self.modules] + [f"backend={self.backend}"]
        if self.backend_file:
            a.append(f"backend-file={self.backend_file}")
        a += [f"linker={self.files['link.js']}", f"entry={self.entry}", f"reactor={self.files['reactor.elf']}",
              f"source={self.files['source.typed']}"]
        if self.policy is not None:
            a.append(f"policy={self.policy}")
        return a

    def key(self):
        out = run("key", *self.args()).split()
        self.check_model(out[0])
        assert out[1] == out[0][:32]
        return out[0]

    def check_model(self, key):
        expected = model_key(self.native, [(f"typed/{b}", self.files[b]) for b in self.bundles], self.modules,
                             self.backend, self.backend_file, self.files["link.js"], self.entry,
                             self.files["reactor.elf"], self.files["source.typed"], self.policy)
        assert key == expected, (key, expected)


class KeyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.inputs = Inputs(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_the_driver_hashes_like_hashlib(self):
        for size in (0, 1, 55, 56, 63, 64, 65, 1000, 70001):
            path = Path(self.tmp.name) / f"blob{size}"
            path.write_bytes(bytes((i * 7 + size) & 255 for i in range(size)))
            self.assertEqual(run("sha256", path), hashlib.sha256(path.read_bytes()).hexdigest())

    def test_the_same_inputs_give_the_same_key(self):
        self.assertEqual(self.inputs.key(), self.inputs.key())

    def test_every_input_changes_the_key(self):
        base = self.inputs.key()
        changes = {
            "source": lambda i: i.put("source.typed", "function f() { return 1; }"),
            "reactor": lambda i: i.put("reactor.elf", "\x7fELF reactor 2"),
            "linker": lambda i: i.put("link.js", "linker 2"),
            "front end": lambda i: i.put("wasm.js", "front end 2"),
            "tape": lambda i: i.put("tape.js", "tape 2"),
            "a pass group the policy loads lazily": lambda i: i.put("rv32-loops.js", "loops 2"),
            "another pass group": lambda i: i.put("rv32-inline.js", "inline 2"),
            "a compiler module": lambda i: i.put("async.js", "async 2"),
            "a new bundle under typed/": lambda i: (i.put("rv32-more.js", "more"), i.bundles.append("rv32-more.js")),
            "the module list": lambda i: setattr(i, "modules", []),
            "the back end": lambda i: setattr(i, "backend", "typed/rv32-bench.js"),
            "an outside back end's bytes": lambda i: (i.put("bench.js", "bench"), setattr(i, "backend_file", i.files["bench.js"])),
            "the entry": lambda i: setattr(i, "entry", "linkCandela"),
            "the policy": lambda i: setattr(i, "policy", "kernel"),
            "no policy": lambda i: setattr(i, "policy", None),
            "an empty policy name": lambda i: setattr(i, "policy", ""),
            "the native compiler code": lambda i: setattr(i, "native", "lex 4567 quickjs 2026-06-04"),
        }
        seen = {base}
        for what, change in changes.items():
            with self.subTest(what):
                inputs = Inputs(tempfile.mkdtemp(dir=self.tmp.name))
                change(inputs)
                key = inputs.key()
                self.assertNotEqual(key, base, what)
                seen.add(key)
        self.assertEqual(len(seen), len(changes) + 1, "two different changes gave the same key")

    def test_file_names_and_unused_files_do_not_change_the_key(self):
        base = self.inputs.key()
        inputs = Inputs(tempfile.mkdtemp(dir=self.tmp.name))
        inputs.put("notes.txt", "a file no compile reads")
        inputs.files["source.typed"].rename(inputs.root / "elsewhere.typed")
        inputs.files["source.typed"] = inputs.root / "elsewhere.typed"
        self.assertEqual(inputs.key(), base)

    def test_framing_keeps_adjacent_items_apart(self):
        a = Inputs(tempfile.mkdtemp(dir=self.tmp.name))
        a.modules = ["typed/a", "sync.js"]
        b = Inputs(tempfile.mkdtemp(dir=self.tmp.name))
        b.modules = ["typed/as", "ync.js"]
        self.assertNotEqual(a.key(), b.key())


class EntryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name) / "files/.cache/typed"   # created by the first store
        self.n = 0

    def tearDown(self):
        self.tmp.cleanup()

    def module(self, size=5000, seed=1):
        self.n += 1
        path = Path(self.tmp.name) / f"module{self.n}.elf"
        path.write_bytes(bytes((i * seed + i // 251) & 255 for i in range(size)))
        return path

    def key(self, tag):
        return hashlib.sha256(tag.encode()).hexdigest()

    def store(self, key, app="chess", label="bundle", module=None, free=BIG, per_label=2, budget=BIG, reserve=0):
        return run("store", self.dir, key, app, label, module or self.module(), free, per_label, budget, reserve)

    def read(self, key):
        out = Path(self.tmp.name) / "read.out"
        return run("read", self.dir, key, out), out

    def entry(self, key):
        return self.dir / (key[:32] + ".cache")

    def listing(self):
        rows = [line.split() for line in run("list", self.dir).splitlines()]
        return {r[0]: r[1:] for r in rows}

    def test_a_store_then_a_read_round_trips(self):
        k, m = self.key("a"), self.module(70001)
        self.assertEqual(self.store(k, module=m), "stored 1")
        self.assertEqual(self.entry(k).stat().st_size, HEADER + 70001)
        result, out = self.read(k)
        self.assertEqual(result, "hit 1 chess bundle 70001")
        self.assertEqual(out.read_bytes(), m.read_bytes())
        self.assertEqual(sorted(p.name for p in self.dir.iterdir()), [k[:32] + ".cache"])

    def test_an_absent_entry_is_a_miss(self):
        self.assertEqual(self.read(self.key("a"))[0], "miss")
        self.store(self.key("a"))
        self.assertEqual(self.read(self.key("b"))[0], "miss")

    def test_a_flipped_module_byte_is_corrupt_and_deleted(self):
        k = self.key("a")
        self.store(k)
        raw = bytearray(self.entry(k).read_bytes())
        raw[HEADER + 1234] ^= 0x40
        self.entry(k).write_bytes(raw)
        result, _ = self.read(k)
        self.assertTrue(result.startswith("corrupt module checksum"), result)
        self.assertFalse(self.entry(k).exists())
        self.assertEqual(self.read(k)[0], "miss")

    def test_a_flipped_header_byte_is_corrupt(self):
        for offset, reason in [(0, "not an entry"), (5, "another format"), (90, "header check"), (157, "header check")]:
            with self.subTest(offset=offset):
                k = self.key(f"h{offset}")
                self.store(k)
                raw = bytearray(self.entry(k).read_bytes())
                raw[offset] ^= 1
                self.entry(k).write_bytes(raw)
                result, _ = self.read(k)
                self.assertTrue(result.startswith("corrupt " + reason), result)
                self.assertFalse(self.entry(k).exists())

    def test_a_torn_entry_is_corrupt(self):
        for cut in (0, 10, HEADER - 1, HEADER, HEADER + 4999):
            with self.subTest(cut=cut):
                k = self.key(f"t{cut}")
                self.store(k)
                self.entry(k).write_bytes(self.entry(k).read_bytes()[:cut])
                result, _ = self.read(k)
                self.assertTrue(result.startswith("corrupt"), result)
                self.assertFalse(self.entry(k).exists())

    def test_an_entry_under_another_key_name_is_corrupt(self):
        a, b = self.key("a"), self.key("b")
        self.store(a)
        self.entry(a).rename(self.entry(b))   # the right format, the wrong key for its name
        result, _ = self.read(b)
        self.assertTrue(result.startswith("corrupt another key"), result)
        self.assertFalse(self.entry(b).exists())

    def test_a_store_cut_before_its_rename_leaves_no_entry_and_is_cleaned(self):
        k = self.key("a")
        self.store(self.key("other"))
        run("tmp", self.dir, k, "chess", "bundle", self.module())
        self.assertTrue((self.dir / (k[:32] + ".tmp")).exists())
        self.assertEqual(self.read(k)[0], "miss")   # a reader never opens a .tmp
        self.store(self.key("next"))
        self.assertEqual(sorted(p.suffix for p in self.dir.iterdir()), [".cache", ".cache"])

    def test_a_store_replaces_an_entry_of_the_same_key(self):
        k = self.key("a")
        self.store(k, module=self.module(100, seed=3))
        m = self.module(200, seed=5)
        self.assertEqual(self.store(k, module=m), "stored 2")
        self.assertEqual(self.read(k)[0], "hit 2 chess bundle 200")
        self.assertEqual(len(list(self.dir.iterdir())), 1)

    def test_two_entries_per_app_and_label_stay(self):
        keys = [self.key(f"fw{i}") for i in range(4)]
        for i, k in enumerate(keys):
            self.assertEqual(self.store(k), f"stored {i + 1}")
        self.assertEqual(sorted(self.listing()), sorted(k[:32] + ".cache" for k in keys[2:]))

    def test_another_label_or_app_does_not_evict(self):
        bundle, edit1, edit2 = self.key("bundle"), self.key("edit1"), self.key("edit2")
        self.store(bundle, app="agenda", label="bundle")
        self.store(edit1, app="agenda", label="edit")
        self.store(edit2, app="agenda", label="edit")
        self.store(self.key("files"), app="files", label="bundle")
        self.store(self.key("edit3"), app="agenda", label="edit")   # evicts edit1 only
        names = self.listing()
        self.assertIn(bundle[:32] + ".cache", names)
        self.assertNotIn(edit1[:32] + ".cache", names)
        self.assertIn(edit2[:32] + ".cache", names)
        self.assertEqual(len(names), 4)

    def test_the_budget_evicts_the_oldest_first(self):
        keys = [self.key(f"app{i}") for i in range(5)]
        for i, k in enumerate(keys):   # 5000 + 160 bytes: two 4 KB clusters each
            self.store(k, app=f"app{i}", budget=3 * 8192)
        self.assertEqual(sorted(self.listing()), sorted(k[:32] + ".cache" for k in keys[2:]))

    def test_the_reserve_keeps_free_space_for_the_user(self):
        a, b = self.key("a"), self.key("b")
        self.store(a, app="a")
        # 8 KB free, 8 KB needed, 4 KB to keep free: the old entry goes
        self.assertEqual(self.store(b, app="b", free=8192, reserve=4096), "stored 2")
        self.assertEqual(sorted(self.listing()), [b[:32] + ".cache"])
        # too little room even with every entry evicted: refused, and nothing is deleted or written
        result = self.store(self.key("c"), app="c", free=0, reserve=4096)
        self.assertTrue(result.startswith("refused no room"), result)
        self.assertEqual(sorted(self.listing()), [b[:32] + ".cache"])
        result = self.store(self.key("d"), app="d", budget=4096)
        self.assertTrue(result.startswith("refused no room"), result)
        self.assertEqual(sorted(self.listing()), [b[:32] + ".cache"])

    def test_invalid_files_are_removed_by_the_next_store(self):
        self.dir.mkdir(parents=True)
        (self.dir / "junk.cache").write_bytes(b"not an entry")
        (self.dir / "older.cache").write_bytes(b"PCTC" + struct.pack("<I", 0) + bytes(HEADER))
        self.store(self.key("a"))
        self.assertEqual(sorted(self.listing()), [self.key("a")[:32] + ".cache"])

    def test_the_sequence_survives_eviction(self):
        for i in range(3):
            self.store(self.key(f"x{i}"))
        self.assertEqual(self.store(self.key("y"), app="other"), "stored 4")

    def test_clear_removes_every_entry(self):
        for i in range(3):
            self.store(self.key(f"x{i}"), app=f"a{i}")
        self.assertEqual(run("clear", self.dir), "3")
        self.assertEqual(self.listing(), {})


if __name__ == "__main__":
    unittest.main()
