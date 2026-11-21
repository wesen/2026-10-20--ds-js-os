// Proposed API example 17. Ask for a decision and its explanation separately
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  const vector = middle.where(e => e.pass === "LoopVectorizePass").first();
  return q.bundle({
    state: vector.after.excerpt({ contains: "define" }),
    reasons: run.remarks().forEvent(vector)
  });
}
