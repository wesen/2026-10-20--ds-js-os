// Proposed API example 24. Bind a slider without reading the archive again
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  const minimum = q.param.int("minimum", { min: 1, max: 16, default: 1 });
  const drops = middle.measure(header).changes()
    .where((r, ctx) => r.status === "known" && -r.delta >= ctx.param(minimum),
           { dependsOn: [minimum] });
  return q.run(drops, { bindings: { minimum: 5 } });
}
