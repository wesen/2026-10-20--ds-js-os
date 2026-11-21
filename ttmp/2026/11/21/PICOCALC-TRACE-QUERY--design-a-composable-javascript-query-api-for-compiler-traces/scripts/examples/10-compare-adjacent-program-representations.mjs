// Proposed API example 10. Compare adjacent program representations
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  const allocas = q.ir.instructions().opcode("alloca").count();
  return q.compare(allocas.at(middle.at(5).after),
                   allocas.at(middle.at(6).after));
}
