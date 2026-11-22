// The most executed native instructions of the opening frame, disassembled, as one job.
// Replaces the scratch hot.mjs and left.mjs.
//   (echo 'globalThis.args = {options: {...}, fn: "typedRayLitRow", min: 20000};'; cat hot-code.js) |
//       trace-repl eval --addr ... --session "$sid" --job --job-timeout 300
// Lines are "pc  count  function  instruction", in address order, for instructions executed at
// least args.min times (default 20,000), optionally limited to function args.fn. Also returns the
// checked accesses that still rebuild their address (bltu followed by slli), by count.
// Parameters arrive in globalThis.args, which each invocation replaces whole: session globals
// persist between cells, so a parameter left by an earlier script must not leak into this one.
(() => {
  const c = compiler.at(args.rev ?? "worktree");
  const program = c.typedRv32.compile(c.ray, [], 65536, args.options ?? {});
  const counts = c.rayBench.openingFrame(program).counts;
  const v = new DataView(program.image.buffer, program.image.byteOffset, program.image.byteLength);
  const w = i => v.getUint32(4 * i, true);
  const R = ["zero","ra","sp","gp","tp","t0","t1","t2","s0","s1","a0","a1","a2","a3","a4","a5","a6","a7","s2","s3","s4","s5","s6","s7","s8","s9","s10","s11","t3","t4","t5","t6"];
  const entries = Object.entries(program.entries).sort((a, b) => a[1] - b[1]);
  const fnAt = pc => entries.filter(([, s]) => s <= pc).at(-1)?.[0];
  function dis(x, pc) {
    const op = x & 0x7f, rd = R[(x >>> 7) & 31], f3 = (x >>> 12) & 7, a = R[(x >>> 15) & 31], b = R[(x >>> 20) & 31], f7 = x >>> 25, imm = x >> 20;
    if (op === 0x13) return ["addi","slli","slti","sltiu","xori",f7 ? "srai" : "srli","ori","andi"][f3] + ` ${rd},${a},${f3 === 1 || f3 === 5 ? imm & 31 : imm}`;
    if (op === 0x33) return (f7 === 1 ? ["mul","mulh","mulhsu","mulhu","div","divu","rem","remu"] : ["add","sll","slt","sltu","xor","srl","or","and"])[f3].replace(/^add$/, f7 ? "sub" : "add").replace(/^srl$/, f7 ? "sra" : "srl") + ` ${rd},${a},${b}`;
    if (op === 0x03) return ["lb","lh","lw","?","lbu","lhu"][f3] + ` ${rd},${imm}(${a})`;
    if (op === 0x23) return ["sb","sh","sw"][f3] + ` ${b},${((x >> 25) << 5) | ((x >>> 7) & 31)}(${a})`;
    if (op === 0x63) { const o = ((x >> 31) << 12) | (((x >>> 7) & 1) << 11) | (((x >>> 25) & 63) << 5) | (((x >>> 8) & 15) << 1); return ["beq","bne","?","?","blt","bge","bltu","bgeu"][f3] + ` ${a},${b},${(pc + o).toString(16)}`; }
    if (op === 0x6f) return `jal ${rd}`;
    if (op === 0x67) return `jalr ${rd},${imm}(${a})`;
    if (op === 0x37) return `lui ${rd},0x${(x >>> 12).toString(16)}`;
    if (x === 0x00100073) return "ebreak";
    return "op" + op.toString(16);
  }
  const min = args.min ?? 20000, lines = [], rebuilt = [];
  for (let i = 0; i < counts.length; i++) {
    const pc = 4 * i, fn = fnAt(pc);
    if (counts[i] >= min && (!args.fn || fn === args.fn)) lines.push(pc.toString(16).padStart(5) + " " + String(counts[i]).padStart(7) + "  " + dis(w(i), pc));
    const x = w(i);
    if ((x & 0x7f) === 0x63 && ((x >>> 12) & 7) === 6 && i + 2 < counts.length && (w(i + 2) & 0x707f) === 0x1013 && counts[i])
      rebuilt.push({pc: pc.toString(16), count: counts[i], fn});
  }
  rebuilt.sort((p, q) => q.count - p.count);
  return {imageBytes: program.image.length, lines, rebuiltAddresses: rebuilt.slice(0, 20),
    rebuiltTotal: rebuilt.reduce((s, r) => s + r.count, 0)};
})()
