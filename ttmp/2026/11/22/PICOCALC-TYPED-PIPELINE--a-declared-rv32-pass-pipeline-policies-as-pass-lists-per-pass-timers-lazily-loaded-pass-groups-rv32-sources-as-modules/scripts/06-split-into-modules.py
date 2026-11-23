#!/usr/bin/env python3
"""Move compiler/typed/rv32/NN-*.js into ES modules in directories (PICOCALC-TYPED-PIPELINE Step 3).

usage: 06-split-into-modules.py [--apply]

Every line of the moved files (00..50) goes, unchanged, into exactly one module; the script asserts it. It adds
to each module a header line, `import {...} from "..."` lines computed from the identifiers the module's code
uses (comments and strings stripped) and defined at top level by another module, and `export` before each
top-level declaration another module imports. FunctionCode's method groups become classes that function-code.js
mixes into FunctionCode (emit/mixin.js). The driver files (60-policies.js, 65-passes.js, 70-compile.js) are
rewritten by hand as policy.js, passes/registry.js, the group entries, compile.js and link.js; this script
deletes them after checking that the hand-written replacements exist. Without --apply it prints the plan.
"""
import argparse, re, sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
RV32 = HERE.parents[5] / "compiler" / "typed" / "rv32"

# module -> (header, [(source, first, last)], wrapper class or None). Lines are 1-based and inclusive.
F, L = "10-function-code.js", "11-leaf-code.js"
MODULES = {
    "encoding/tape.js": ("The tape's opcodes, block types, effects and walkers (compiler/typed/tape.js, loaded first).",
                         [("00-encoding.js", 2, 6)], None),
    "encoding/registers.js": ("RV32 registers and the instruction encoders.", [("00-encoding.js", 8, 18)], None),
    "encoding/selection.js": ("Instruction-selection tables: ALU operations, fused predicates, immediate forms, constantForm.",
                              [("00-encoding.js", 20, 55), ("00-encoding.js", 75, 91)], None),
    "encoding/division.js": ("Division by a constant without a divide.", [("00-encoding.js", 57, 73)], None),
    "emit/function-code.js": ("FunctionCode, the streaming emitter: one pass over a function's tape that writes RV32 words.",
                              [(F, 1, 20), (F, 460, 613), (F, 620, 658)], None),
    "emit/stack.js": ("FunctionCode's operand stack: loads, stores, constants, result destinations, spills.",
                      [(F, 21, 63), (F, 203, 233)], "StackMethods"),
    "emit/homes.js": ("FunctionCode's register homes: local reads and writes, direct reads, pointer homes.",
                      [(F, 64, 154)], "HomeMethods"),
    "emit/addresses.js": ("FunctionCode's checked and unchecked buffer addresses.", [(F, 155, 202)], "AddressMethods"),
    "emit/branches.js": ("FunctionCode's branches, labels and structured control.",
                         [(L, 53, 53), (F, 234, 269), (F, 389, 443)], "BranchMethods"),
    "emit/arithmetic.js": ("FunctionCode's binary operations, constant selection and division by constants.",
                           [(F, 270, 388)], "ArithmeticMethods"),
    "emit/calls.js": ("FunctionCode's calls and the callee-saved registers its prologue saves.",
                      [(F, 444, 459), (F, 614, 619)], "CallMethods"),
    "emit/guarded-return.js": ("Guarded scalar returns: a tiny unary helper's body, applied at the call site.",
                               [(L, 1, 44)], None),
    "emit/leaf-code.js": ("LeafCode: frameless leaves.", [(L, 46, 52), (L, 55, 77), (L, 139, 165)], None),
    "emit/inspection.js": ("The native inspection view: per-operation word ranges for typed-inspect and the workbench.",
                           [(L, 79, 137)], None),
    "passes/inline.js": ("The inline pass and the inliner's library candidates.",
                         [("20-inline-and-commute.js", 1, 145), ("43-inline-candidate.js", 1, 16)], None),
    "passes/commute.js": ("The commute pass.", [("20-inline-and-commute.js", 147, 196)], None),
    "passes/conjunctions.js": ("The conjunctions pass.", [("42-conjunctions-and-rotation.js", 1, 50)], None),
    "passes/rotate.js": ("The rotate pass.", [("30-version-loops.js", 1, 8), ("42-conjunctions-and-rotation.js", 52, 101)], None),
    "passes/version-loops.js": ("The version pass, with induction variables.", [("30-version-loops.js", 9, 248)], None),
    "passes/hoist.js": ("The hoist option of the version pass: loop invariants and subexpressions into the guard block.",
                        [("30-version-loops.js", 250, 510)], None),
    "passes/split-locals.js": ("The split pass.", [("31-split-locals.js", 1, 50)], None),
    "passes/value-sets.js": ("The sets pass.", [("41-value-sets.js", 1, 367)], None),
    "analysis/ranges.js": ("Local value ranges and division facts (the ranges and facts passes).", [("40-ranges.js", 1, 166)], None),
    "plan/locations.js": ("planLocations: operand homes, pointer groups and pointer-only skips.", [("50-planner.js", 1, 260)], None),
    "plan/saved-homes.js": ("Callee-saved homes.", [("50-planner.js", 262, 319)], None),
    "link.js": ("linkSlot: place a compiled program in a native world's reactor.", [("70-compile.js", 186, 249)], None),
}
# Lines that are not moved: the old file's header, which encoding/tape.js's header repeats.
DROPPED = {("00-encoding.js", 1)}
MIXINS = ["StackMethods", "HomeMethods", "AddressMethods", "BranchMethods", "ArithmeticMethods", "CallMethods"]
DRIVERS = ["60-policies.js", "65-passes.js", "70-compile.js"]
HANDWRITTEN = ["policy.js", "compile.js", "index.js", "passes/registry.js", "analysis/storeless.js",
               "emit/mixin.js"]
# Names defined outside the moved code that it uses (globals of the realm and of hand-written modules).
GLOBALS = {"typedTape"}


def strip(code):
    """Code with comments, strings and template literals replaced by spaces (offsets kept)."""
    out, i, n = [], 0, len(code)
    while i < n:
        c = code[i]
        if code.startswith("//", i):
            j = code.find("\n", i)
            j = n if j < 0 else j
            out.append(" " * (j - i)); i = j
        elif code.startswith("/*", i):
            j = code.index("*/", i) + 2
            out.append(re.sub(r"[^\n]", " ", code[i:j])); i = j
        elif c in "\"'`":
            j = i + 1
            while code[j] != c:
                j += 2 if code[j] == "\\" else 1
            out.append(" " * (j + 1 - i)); i = j + 1
        else:
            out.append(c); i += 1
    return "".join(out)


def top_names(code):
    """Names a module declares at top level (column 0)."""
    names = []
    for m in re.finditer(r"^(?:const|let|function|class) ([A-Za-z_$][\w$]*)", code, re.M):
        names.append(m.group(1))
    for m in re.finditer(r"^const ([A-Za-z_$][\w$]* = [^;\n]*(?:, [A-Za-z_$][\w$]* = [^;\n]*)+);", code, re.M):
        names += re.findall(r"(?:^|, )([A-Za-z_$][\w$]*) = ", m.group(1))
    m = re.search(r"^const \{([^}]*)\} = typedTape;", code, re.M)
    if m:
        names += [part.split(":")[-1].strip() for part in m.group(1).split(",") if part.strip()]
    return list(dict.fromkeys(names))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--apply", action="store_true")
    a = p.parse_args()
    sources = {name: (RV32 / name).read_text().split("\n") for name in
               sorted({s for _, chunks, _ in MODULES.values() for s, _, _ in chunks})}
    # Every source line is moved once; the lines not moved must be blank (separators between chunks).
    used = defaultdict(set)
    for module, (_, chunks, _) in MODULES.items():
        for src, first, last in chunks:
            for line in range(first, last + 1):
                assert line not in used[src], f"{src}:{line} moved twice"
                used[src].add(line)
    for src, lines in sources.items():
        if src in DRIVERS:
            continue
        count = len(lines) - (1 if lines[-1] == "" else 0)
        for line in range(1, count + 1):
            if line not in used[src] and (src, line) not in DROPPED:
                assert lines[line - 1].strip() == "", f"{src}:{line} is not moved: {lines[line - 1]!r}"
    bodies = {}
    for module, (header, chunks, wrapper) in MODULES.items():
        parts = ["\n".join(sources[src][first - 1:last]) for src, first, last in chunks]
        bodies[module] = parts
    # Top-level names: in a wrapper module, the lines before `class` stay top level; the class body's
    # methods are the wrapper's.
    defined = {}
    for module, parts in bodies.items():
        names = top_names("\n".join(parts))
        if MODULES[module][2]:
            names = [n for n in names if n not in ("FunctionCode",)]
            names.append(MODULES[module][2])
        for name in names:
            assert name not in defined, f"{name} defined in {defined.get(name)} and {module}"
            defined[name] = module
    imports, exported = {}, defaultdict(set)
    for module, parts in bodies.items():
        code = strip("\n".join(parts))
        own = set(top_names("\n".join(parts)))
        want = defaultdict(list)
        for name in dict.fromkeys(re.findall(r"(?<![\w$])(?<![^.]\.)([A-Za-z_$][\w$]*)(?![\w$])", code)):
            home = defined.get(name)
            if home and home != module and name not in own:
                want[home].append(name)
                exported[home].add(name)
        imports[module] = want
    if "emit/function-code.js" in imports:
        for mixin in MIXINS:
            imports["emit/function-code.js"][defined[mixin]].append(mixin)
            exported[defined[mixin]].add(mixin)
        imports["emit/function-code.js"]["emit/mixin.js"] = ["mixin"]
    # The module graph must be acyclic: a bundle evaluates each module after the modules it imports.
    state = {}
    def visit(m, path):
        if state.get(m) == "done":
            return
        assert state.get(m) != "open", "import cycle: " + " -> ".join(path + [m])
        state[m] = "open"
        for dep in imports.get(m, {}):
            visit(dep, path + [m])
        state[m] = "done"
    for m in MODULES:
        visit(m, [])
    texts = {}
    for module, parts in bodies.items():
        header, chunks, wrapper = MODULES[module]
        lines = ["// " + header]
        for dep, names in sorted(imports[module].items()):
            rel = Path(dep).relative_to(Path(module).parent) if dep.startswith(str(Path(module).parent) + "/") \
                else Path("..") / dep if "/" in module else Path(dep)
            rel = str(rel) if str(rel).startswith("..") else "./" + str(rel)
            lines.append("import {" + ", ".join(dict.fromkeys(names)) + "} from \"" + rel + "\";")
        lines.append("")
        body = "\n\n".join(parts)
        if wrapper:
            # Top-level lines (before the first indented method) stay outside the class.
            out, inside = [], False
            for line in body.split("\n"):
                if not inside and line.startswith("    "):
                    out.append("export class " + wrapper + " {")
                    inside = True
                out.append(line)
            out.append("}")
            body = "\n".join(out)
        if module == "emit/function-code.js":
            body += "\nmixin(FunctionCode, " + ", ".join(MIXINS) + ");"
        def mark(match):
            name = match.group(2)
            return ("export " if name in exported[module] else "") + match.group(0)
        body = re.sub(r"^(const|let|function|class) ([A-Za-z_$][\w$]*)", mark, body, flags=re.M)
        body = re.sub(r"^const \{", "export const {" if any(n in exported[module] for n in top_names(body)) else "const {",
                      body, flags=re.M)
        texts[module] = "\n".join(lines) + body + "\n"
        not_exported = [n for n in top_names(body) if n in exported[module] and not re.search(
            r"^export (?:const|let|function|class) (?:\{[^}]*\b" + re.escape(n) + r"\b|" + re.escape(n) + r"\b)", body, re.M)]
        multi = [n for n in not_exported if re.search(r"^export const [^;\n]*\b" + re.escape(n) + r" = ", body, re.M)]
        assert set(not_exported) <= set(multi), f"{module}: not exported {not_exported}"
    for module, text in texts.items():
        print(f"{module}: {text.count(chr(10))} lines; imports " +
              "; ".join(f"{d}: {', '.join(n)}" for d, n in sorted(imports[module].items())))
    moved = sum(len(lines) for lines in sources.values())
    print(f"{len(MODULES)} modules from {len(sources)} files ({moved} lines); drivers to delete: {', '.join(DRIVERS)}")
    if not a.apply:
        print("dry run; pass --apply to write the modules and delete the numbered files")
        return
    missing = [h for h in HANDWRITTEN if not (RV32 / h).exists()]
    assert not missing, f"write the hand-written modules first: {missing}"
    for module, text in texts.items():
        path = RV32 / module
        assert not path.exists(), f"{path} exists"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    deleted = sorted(set(sources) | set(DRIVERS))
    for name in deleted:
        (RV32 / name).unlink()
    print(f"wrote {len(texts)} modules, deleted {len(deleted)} files")


if __name__ == "__main__":
    sys.exit(main())
