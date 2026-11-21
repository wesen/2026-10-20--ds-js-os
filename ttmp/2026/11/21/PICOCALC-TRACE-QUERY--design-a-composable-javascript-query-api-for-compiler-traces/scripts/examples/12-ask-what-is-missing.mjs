// Proposed API example 12. Ask what is missing
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  return run.initialModule().sourceLocations({ function: "row" });
}
