// A function's operation tape after one compiler phase, as an indented listing. Replaces the
// hacked compiler copy (globalThis.__tapes) used in Step 13.
//   (echo 'globalThis.args = {fn: "typedRayLitRow", phase: "version", options: {...}, from: 0, to: 400};'; cat tape.js) | trace-repl eval --addr ... --session "$sid"
// args.phase: inline | commute | rotate | version | split (compiler options.observeTape). Each line is
// "offset  indent op operands", with checked accesses as CHK and unchecked ones as UNCHK.
// Parameters arrive in globalThis.args, which each invocation replaces whole: session globals
// persist between cells, so a parameter left by an earlier script must not leak into this one.
(() => {
  const c = compiler.at(args.rev ?? "worktree");
  const seen = {};
  c.typedRv32.compile(c.ray, [], 65536, {...(args.options ?? {}),
    observeTape: (name, phase, code, nlocals) => { if (name === args.fn) seen[phase] = {code, nlocals}; }});
  const t = seen[args.phase];
  if (!t) return {error: "no tape for " + args.fn + " at phase " + args.phase, phases: Object.keys(seen)};
  const names = {0x02: "block", 0x03: "loop", 0x04: "if", 0x05: "else", 0x0b: "end", 0x0c: "br", 0x0d: "br_if", 0x0f: "return",
    0x10: "call", 0x1a: "drop", 0x20: "get", 0x21: "set", 0x28: "load32", 0x2f: "load16u", 0x36: "store32", 0x3b: "store16",
    0x41: "const", 0x45: "eqz", 0x46: "eq", 0x47: "ne", 0x48: "lt", 0x4a: "gt", 0x4c: "le", 0x4e: "ge", 0x6a: "add", 0x6b: "sub",
    0x6c: "mul", 0x6d: "div", 0x6f: "rem", 0x71: "and", 0x72: "or", 0x74: "shl", 0x75: "shr", 0xf1: "CHK", 0xf2: "lit", 0xf3: "UNCHK"};
  // Operand cells per opcode: the compiler's table is internal, so it is restated here.
  const cells = {0x02: 1, 0x03: 1, 0x04: 1, 0x0c: 1, 0x0d: 1, 0x10: 1, 0x20: 1, 0x21: 1, 0x28: 2, 0x2f: 2, 0x36: 2, 0x3b: 2, 0x41: 1, 0xf1: 2, 0xf2: 2, 0xf3: 3};
  const lines = [], from = args.from ?? 0, to = args.to ?? t.code.length;
  const counts = {};
  for (let at = 0, depth = 0; at < t.code.length;) {
    const op = t.code[at], n = cells[op] ?? 0, args = t.code.slice(at + 1, at + 1 + n);
    if (op === 0x0b || op === 0x05) depth--;
    if (at >= from && at < to) lines.push(String(at).padStart(5) + "  " + "  ".repeat(Math.max(0, depth)) + (names[op] ?? "op" + op.toString(16)) + (n ? " " + args.join(" ") : ""));
    counts[names[op] ?? op] = (counts[names[op] ?? op] ?? 0) + 1;
    if (op >= 0x02 && op <= 0x05) depth++;
    at += 1 + n;
  }
  return {fn: args.fn, phase: args.phase, cells: t.code.length, nlocals: t.nlocals, phases: Object.keys(seen), checked: counts.CHK ?? 0, unchecked: counts.UNCHK ?? 0, lines};
})()
