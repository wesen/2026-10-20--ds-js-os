// Proposed API example 01. Count observations before interpreting them
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  return a.events().count();
}
