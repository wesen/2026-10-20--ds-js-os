// Proposed API example 07. Find the first observed reduction
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  return middle.measure(header).changes()
    .where(c => c.status === "known" && c.delta < 0).first();
}
