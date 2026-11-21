// Proposed API example 02. Select a run and phase
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  return run.events("middle").count();
}
