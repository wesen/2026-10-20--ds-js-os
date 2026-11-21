// Proposed API example 25. Branch a shared query into an interactive result
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  const changes = middle.measure(header).changes();
  const plan = q.bundle({
    timeline: changes.table("ordinal", "before", "after", "delta"),
    first: changes.where(r => r.status === "known" && r.delta < 0).first()
  });
  return q.explain(plan);
}
