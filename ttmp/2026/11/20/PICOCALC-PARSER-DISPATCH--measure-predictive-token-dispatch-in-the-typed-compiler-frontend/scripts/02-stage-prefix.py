"""Replace the successive prefix spelling tests in a detached compiler."""
import argparse
from pathlib import Path
import re


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    args = parser.parse_args()
    source = args.file.read_text()
    start = source.index('        if (lex.accept("(")) {', source.index("    prefix() {"))
    end = source.index("        const name = lex.ident();", start)
    original = source[start:end]
    groups = list(re.finditer(r'^        if \(([^\n]+)\) \{\n([\s\S]*?)^        \}\n', original, re.M))
    if "".join(m.group(0) for m in groups) != original:
        raise ValueError("prefix grammar changed")
    cases = []
    integer = ""
    spellings = []
    for group in groups:
        cond, body = group.groups()
        if cond == 'lex.token.kind === "int"':
            integer = group.group(0)
            continue
        spelling = re.fullmatch(r'lex\.accept\(("[^"]+")\)', cond).group(1)
        spellings.append(spelling)
        cases.extend([f"        case {spelling}: {{\n", "            lex.next();\n", body, "        }\n"])
    if spellings != ['"("','"!"','"-"','"true"','"false"','"Math"','"i32"'] or not integer:
        raise ValueError("unexpected prefix decision set")
    replacement = "        switch (lex.token.value) {\n" + "".join(cases) + "        }\n" + integer
    args.file.write_text(source[:start] + replacement + source[end:])


if __name__ == "__main__":
    main()
