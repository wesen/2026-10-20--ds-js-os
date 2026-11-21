// Proposed API example 14. Make repeated machine passes visible
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  return row.timeline("backend")
    .where(e => e.passId === "virtregrewriter")
    .select("ordinal", "passId", "scope", "ref");
}
