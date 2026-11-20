// A generic dataflow solver: the book's analyze_dataflow, as a worklist algorithm.
//
// Each node of a graph gets a value, starting at `bottom`. A node's value is computed by
// `transfer` from the values of the nodes it depends on. Whenever a node's value changes,
// the nodes that depend on it are computed again, until nothing changes: a fixed point.
// For liveness the nodes are blocks, a block depends on the blocks it jumps to, and its
// value is the set of locations live at its start.
//
// The values only grow (a transfer function here is monotone, and sets of locations are
// finite), so the loop ends.

export function analyzeDataflow(nodes, { dependsOn, transfer, bottom, equal }) {
  const value = new Map(nodes.map((n) => [n, bottom()]));
  const dependents = new Map(nodes.map((n) => [n, []]));
  for (const n of nodes) for (const d of dependsOn(n)) dependents.get(d).push(n);

  // `nodes` should list a node after the nodes it depends on, so that most of them are
  // computed from final values the first time; the worklist pops from the end.
  const work = [...nodes].reverse();
  const queued = new Set(nodes);
  let rounds = 0;
  while (work.length) {
    const n = work.pop();
    queued.delete(n);
    rounds++;
    const v = transfer(n, (m) => value.get(m));
    if (!equal(v, value.get(n))) {
      value.set(n, v);
      for (const d of dependents.get(n)) if (!queued.has(d)) { queued.add(d); work.push(d); }
    }
  }
  return { value, rounds };
}
