// Proposed API example 08. Demonstrate an unsafe query rewrite
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  const onlyCSE = middle.where(e => e.pass === "EarlyCSEPass");
  return onlyCSE.measure(header).changes();
}
