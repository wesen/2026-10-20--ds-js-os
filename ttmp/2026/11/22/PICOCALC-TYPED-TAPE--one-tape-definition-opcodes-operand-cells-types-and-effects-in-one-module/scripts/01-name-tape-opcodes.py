#!/usr/bin/env python3
"""Replace raw tape opcode literals (0x20, 0xf1, ...) with compiler/typed/tape.js's constant names.

A replacement keeps every value: each name is a constant equal to the literal it replaces, so the
compiler's output cannot change; the gates check that anyway. What can go wrong is a wrong name on a
literal that is not a tape opcode (an RV32 opcode such as 0x13 or 0x03, a funct7 0x20), so the caller
selects the lines: --lines limits the rewrite to line ranges, --skip leaves lines matching a regular
expression alone, and the script prints every changed line for review. --dry-run writes nothing.

    01-name-tape-opcodes.py FILE [--lines 1-100,200-300] [--skip REGEX] [--types] [--dry-run]
"""
import argparse
import re
from pathlib import Path

OPCODES = {
    0x00: "UNREACHABLE", 0x02: "BLOCK", 0x03: "LOOP", 0x04: "IF", 0x05: "ELSE", 0x0B: "END", 0x0C: "BR",
    0x0D: "BR_IF", 0x0F: "RETURN", 0x10: "CALL", 0x1A: "DROP", 0x20: "LOCAL_GET", 0x21: "LOCAL_SET",
    0x28: "I32_LOAD", 0x2F: "I32_LOAD16_U", 0x36: "I32_STORE", 0x3B: "I32_STORE16", 0x41: "I32_CONST",
    0x45: "I32_EQZ", 0x46: "I32_EQ", 0x47: "I32_NE", 0x48: "I32_LT_S", 0x4A: "I32_GT_S", 0x4C: "I32_LE_S",
    0x4E: "I32_GE_S", 0x4F: "I32_GE_U", 0x6A: "I32_ADD", 0x6B: "I32_SUB", 0x6C: "I32_MUL", 0x6D: "I32_DIV_S",
    0x6F: "I32_REM_S", 0x74: "I32_SHL", 0x75: "I32_SHR_S", 0xF1: "CHECKED_ADDRESS", 0xF2: "LITERAL_STORES",
    0xF3: "UNCHECKED_ADDRESS",
}
TYPES = {0x7F: "I32", 0x40: "VOID"}
HEX = re.compile(r"\b0x[0-9a-fA-F]+\b")


def ranges(spec, count):
    if not spec:
        return set(range(1, count + 1))
    lines = set()
    for part in spec.split(","):
        a, _, b = part.partition("-")
        lines.update(range(int(a), int(b or a) + 1))
    return lines


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file", type=Path)
    parser.add_argument("--lines")
    parser.add_argument("--skip")
    parser.add_argument("--types", action="store_true", help="also name block types 0x7f (I32) and 0x40 (VOID)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    names = {**OPCODES, **(TYPES if args.types else {})}
    text = args.file.read_text()
    lines = text.split("\n")
    selected = ranges(args.lines, len(lines))
    skip = re.compile(args.skip) if args.skip else None
    changed = 0
    for number, line in enumerate(lines, 1):
        if number not in selected or (skip and skip.search(line)):
            continue
        code = line.split("//", 1)  # leave comments alone
        replaced = HEX.sub(lambda m: names.get(int(m.group(0), 16), m.group(0)), code[0])
        if replaced != code[0]:
            changed += len([m for m in HEX.finditer(code[0]) if int(m.group(0), 16) in names])
            lines[number - 1] = replaced + ("//" + code[1] if len(code) > 1 else "")
            print(f"{args.file}:{number}: {lines[number - 1].strip()}")
    print(f"{changed} literals named in {args.file}")
    if not args.dry_run:
        args.file.write_text("\n".join(lines))


if __name__ == "__main__":
    main()
