#!/usr/bin/env python3
"""The Typed apps of a firmware profile, from their manifests (apps/typed/NAME/app.json), for the P4 build.

    typed_apps.py REPO OUT --apps "chess;agenda" --manifest BASE.json [--append ENTRY.json ...]

Run by cmake/typed-apps.cmake at configure time. Reads each named app's app.json and writes into OUT:

    typed/NAME/...           the assembled sources the firmware bundles (each source followed by a newline)
    typed_apps.c             the table typed_p4.c compiles from (typed_apps.h): limits, policy, linker, entry
    system.typed.json        BASE with every world app's entry pointed at NAME/compiled.bin (engine native), a
                             "fallback" to the replaced entry's JavaScript file where the manifest asks for one,
                             appended entries, then each --append entry
    typed-apps.cmake         bundle entries, reactor ELFs to build, host sources and defines, configure inputs

A file is rewritten only when its content changes, so a reconfigure rebuilds nothing that did not change. The
manifest format is described in firmware/port/esp32p4/README.md ("Typed apps").
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

KINDS = ("world", "module")
COMPILER = {"typed/async.js": "compiler/typed/typed-async.js", "typed/world.js": "compiler/typed/typed-world.js"}


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or path.read_text() != text:
        path.write_text(text)


def cstr(s):
    return "NULL" if s is None else json.dumps(s)


def cmake_list(items):
    return " ".join('"' + str(i).replace('"', '\\"') + '"' for i in items)


class Build:
    def __init__(self, repo, out):
        self.repo, self.out = repo, out
        self.bundle = {}        # published path -> file
        self.reactors = []      # (published path, sources, defines)
        self.hosts = {"sources": [], "defines": [], "includes": []}
        self.inputs = set()     # files that make CMake reconfigure
        self.rows = []          # typed_apps.c rows

    def repo_path(self, rel):
        p = self.repo / rel
        assert p.is_file(), f"{rel}: no such file"
        self.inputs.add(p)
        return p

    def publish(self, name, path):
        assert self.bundle.get(name, path) == path, f"{name} is published twice"
        self.bundle[name] = path

    def link(self, unit, rel):
        """The bundle path of a linker: the compiler's own modules keep their typed/ names, an app's is UNIT/link.js."""
        path = self.repo_path(rel)
        for published, source in COMPILER.items():
            if rel == source:
                self.publish(published, path)
                return published
        self.publish(unit + "/link.js", path)
        return unit + "/link.js"

    def reactor(self, unit, spec):
        sources = [str(self.repo_path(s)) for s in spec["sources"]]
        defines = list(spec.get("defines", []))
        published = unit + "/reactor.elf"
        self.reactors.append((published, sources, defines))
        return published

    def host(self, spec):
        for key in ("sources", "includes"):
            for rel in spec.get(key, []):
                p = self.repo / rel
                assert p.exists(), f"{rel}: no such file"
                if str(p) not in self.hosts[key]:
                    self.hosts[key].append(str(p))
        for d in spec.get("defines", []):
            if d not in self.hosts["defines"]:
                self.hosts["defines"].append(d)

    def source(self, published, text):
        path = self.out / "typed" / published
        write(path, text)
        self.publish(published, path)
        return published

    def row(self, **fields):
        self.rows.append(fields)


def assemble(build, app_dir, names, replace=()):
    """The sources in order, each followed by a newline, with the manifest's textual replacements applied."""
    text = ""
    for name in names:
        part = build.repo_path(app_dir / name).read_text()
        for file, old, new in replace:
            if file == name:
                assert old in part, f"{name}: no {old!r} to replace"
                part = part.replace(old, new)
        text += part + "\n"
    return text


def limits(spec):
    return {"policy": spec.get("policy"), "heap": int(spec["heapBytes"]), "deadline": int(spec["deadlineMs"]) * 1000}


def add_app(build, name, worlds, fallbacks):
    rel = Path("apps/typed") / name
    manifest = json.loads(build.repo_path(rel / "app.json").read_text())
    assert manifest["name"] == name, f"{rel}/app.json names {manifest['name']}"
    kind = manifest["kind"]
    assert kind in KINDS, f"{name}: kind {kind} is not one of {KINDS}"
    compiler = manifest.get("compiler", [])
    for module in compiler:
        build.publish(module, build.repo_path(COMPILER[module]))
    painter = manifest.get("painter")
    variants = []
    if "variants" in manifest:
        for variant, command in manifest["variants"].items():
            script = build.repo_path(rel / command[0])
            for dep in sorted((build.repo / rel).glob("*.typed")):
                build.inputs.add(dep)
            target = build.out / "typed" / name / (variant + ".typed")
            target.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run([sys.executable, str(script), str(target), *command[1:]], check=True)
            build.publish(f"{name}/{variant}.typed", target)
            variants.append((variant, f"{name}/{variant}.typed"))
        source = None
    else:
        text = assemble(build, rel, manifest["sources"], painter["embed"]["replace"] if painter else ())
        if painter:
            pieces = []
            for piece in painter["embed"]["append"]:
                pieces.append(build.repo_path(rel / piece).read_text())
            tool = build.repo_path(painter["embed"]["tool"])
            embedded = build.out / "typed" / name / "painter-function.typed"
            embedded.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run([sys.executable, str(tool), str(build.repo_path(rel / painter["source"])), str(embedded)],
                           check=True)
            text += "\n" + "\n".join([embedded.read_text()] + pieces) + "\n"
        source = build.source(f"{name}/source.typed", text)
    edit = manifest.get("editable")
    head = tail = None
    if edit:
        # The editable source may follow others (Agenda's parser follows its records): head, the file, tail.
        sources = manifest["sources"]
        assert sources.count(edit["source"]) == 1, f"{name}: the editable source must be listed once"
        at = sources.index(edit["source"])
        head = build.source(f"{name}/head.typed", assemble(build, rel, sources[:at]))
        tail = build.source(f"{name}/tail.typed", assemble(build, rel, sources[at + 1:]))
    build.row(name=name, world=kind == "world", source=source, link=build.link(name, manifest["link"]),
              entry=manifest["entry"], compiler=compiler, reactor=build.reactor(name, manifest["reactor"]),
              variants=variants, edit=edit, head=head, tail=tail, **limits(manifest))
    if "host" in manifest:
        build.host(manifest["host"])
    if painter:
        unit = name + "/painter"
        build.row(name=unit, world=False, source=build.source(unit + "/source.typed",
                                                              build.repo_path(rel / painter["source"]).read_text()),
                  link=build.link(unit, painter["link"]), entry=painter["entry"], compiler=[],
                  reactor=build.reactor(unit, painter["reactor"]), variants=[], edit=None, head=None, tail=None, **limits(painter))
        build.host(painter["host"])
    if kind == "world":
        spec = manifest["world"]
        if "replaces" in spec:
            found = [w for w in worlds if w["name"] == spec["replaces"]]
            assert len(found) == 1, f"{name}: the manifest has no world {spec['replaces']}"
            entry = found[0]
            if manifest.get("fallback"):
                assert entry.get("engine", "js") == "js" and entry["file"].endswith(".js"), \
                    f"{name}: the replaced entry {entry} is not a JavaScript world"
                entry["fallback"] = entry["file"]
                fallbacks.append(name)
            entry.update({k: v for k, v in spec.items() if k != "replaces"})
        else:
            assert not manifest.get("fallback"), f"{name}: an appended world has no JavaScript entry to fall back to"
            entry = dict(spec["append"])
            worlds.append(entry)
        entry["file"] = f"{name}/compiled.bin"
        entry["engine"] = "native"


def c_table(rows):
    lines = ['// Generated by firmware/port/esp32p4/typed_apps.py from apps/typed/*/app.json; do not edit.',
             '#include "typed_apps.h"', '']
    for i, r in enumerate(rows):
        lines.append(f"static const char *const compiler_{i}[] = {{{''.join(cstr(m) + ', ' for m in r['compiler'])}NULL}};")
        if r["variants"]:
            items = ", ".join(f"{{{cstr(v)}, {cstr(p)}}}" for v, p in r["variants"])
            lines.append(f"static const p4_typed_variant variants_{i}[] = {{{items}}};")
    lines += ["", "const p4_typed_app p4_typed_apps[] = {"]
    for i, r in enumerate(rows):
        edit = r["edit"] or {}
        lines.append(
            f"  {{.name = {cstr(r['name'])}, .world = {'true' if r['world'] else 'false'}, .source = {cstr(r['source'])},"
            f" .link = {cstr(r['link'])}, .entry = {cstr(r['entry'])}, .compiler = compiler_{i},"
            f" .reactor = {cstr(r['reactor'])}, .policy = {cstr(r['policy'])}, .heap_bytes = {r['heap']},"
            f" .deadline_us = {r['deadline']},"
            f" .variants = {f'variants_{i}' if r['variants'] else 'NULL'}, .n_variants = {len(r['variants'])},"
            f" .edit_file = {cstr(edit.get('file'))}, .edit_head = {cstr(r['head'])}, .edit_tail = {cstr(r['tail'])},"
            f" .edit_limit = {int(edit.get('limitBytes', 0))}}},")
    lines += ["};", f"const size_t p4_typed_app_count = {len(rows)};", ""]
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("repo", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--apps", required=True, help="the profile's apps, separated by semicolons")
    ap.add_argument("--manifest", type=Path, required=True, help="the boot manifest the world apps change")
    ap.add_argument("--append", type=Path, action="append", default=[], help="a world entry to append")
    a = ap.parse_args()
    build = Build(a.repo.resolve(), a.out.resolve())
    system = json.loads(a.manifest.read_text())
    apps = [n for n in a.apps.split(";") if n]
    assert len(set(apps)) == len(apps), f"an app is listed twice: {apps}"
    fallbacks = []
    for name in apps:
        add_app(build, name, system["worlds"], fallbacks)
    for extra in a.append:
        build.inputs.add(extra.resolve())
        system["worlds"].append(json.loads(extra.read_text()))
    write(build.out / "system.typed.json", json.dumps(system, indent=1) + "\n")
    write(build.out / "typed_apps.c", c_table(build.rows))
    cm = ["# Generated by firmware/port/esp32p4/typed_apps.py; do not edit."]
    cm.append(f"set(TYPED_APPS_BUNDLE {cmake_list(f'{k}={v}' for k, v in sorted(build.bundle.items()))})")
    for published, sources, defines in build.reactors:
        cm.append(f"typed_reactor(\"{published}\" DEFINES {cmake_list(defines)} SOURCES {cmake_list(sources)})")
    for key in ("sources", "defines", "includes"):
        cm.append(f"set(TYPED_APPS_HOST_{key.upper()} {cmake_list(build.hosts[key])})")
    cm.append(f"set(TYPED_APPS_INPUTS {cmake_list(sorted(map(str, build.inputs | {Path(__file__).resolve()})))})")
    write(build.out / "typed-apps.cmake", "\n".join(cm) + "\n")
    print(f"typed apps: {' '.join(r['name'] for r in build.rows)}; fallback to JavaScript: {' '.join(fallbacks) or 'none'}")


if __name__ == "__main__":
    main()
