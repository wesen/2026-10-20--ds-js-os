// The GNU as text of an instruction-table row (instructions.js), for tests and tools. Not part of a bundle: no
// module of the compiler imports it.
// The register names GNU as accepts (ABI names), by register number.
export const REGISTER_NAMES = ["zero", "ra", "sp", "gp", "tp", "t0", "t1", "t2", "s0", "s1",
    "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11",
    "t3", "t4", "t5", "t6",
    "ft0", "ft1", "ft2", "ft3", "ft4", "ft5", "ft6", "ft7", "fs0", "fs1",
    "fa0", "fa1", "fa2", "fa3", "fa4", "fa5", "fa6", "fa7", "fs2", "fs3", "fs4", "fs5", "fs6", "fs7", "fs8", "fs9",
    "fs10", "fs11", "ft8", "ft9", "ft10", "ft11"];

export const ROUNDING = ["rne", "rtz", "rdn", "rup", "rmm", , , "dyn"];

// The GNU as text of a row with the given encoder arguments (registers by number, q registers as 0-7, rm by
// number or undefined for the default; a branch or jump offset relative to the instruction): for tests and tools.
export function assembly(row, args) {
    let k = 0;
    const text = row.operands.replace(/[a-z]+\d*/g, field => {
        const v = args[k++];
        if (field === "rm") return v === undefined ? "" : ROUNDING[v];
        if (/^[xf][d123]$|^e[rd]$/.test(field)) return REGISTER_NAMES[v];
        if (field[0] === "q") return "q" + v;
        if (field === "b13" || field === "j21") return (v < 0 ? ".-" : ".+") + Math.abs(v);
        return String(v);
    });
    return (row.mnemonic + " " + text.replace(/, $/, "")).trim();
}
