// Proposed API example 11. Follow definitions instead of matching printed names
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  const state = middle.at(74).after;
  return state.instructions().opcode("load").resultType("i32")
    .pointer(row.argument(0)).uses().select("userOpcode", "operandIndex", "ref");
}
