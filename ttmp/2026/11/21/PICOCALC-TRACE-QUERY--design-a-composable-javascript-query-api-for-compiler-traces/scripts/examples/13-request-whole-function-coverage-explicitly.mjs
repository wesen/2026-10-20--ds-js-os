// Proposed API example 13. Request whole-function coverage explicitly
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  const loopPrint = run.events("middle")
    .where(e => e.scope.kind === "loop").first();
  return header.at(loopPrint.after).requireCoverage("function");
}
