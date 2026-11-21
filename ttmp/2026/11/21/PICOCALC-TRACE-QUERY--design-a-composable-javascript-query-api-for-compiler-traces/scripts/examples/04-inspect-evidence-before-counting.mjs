// Proposed API example 04. Inspect evidence before counting
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  return middle.at(74).after.excerpt({ contains: "load i32, ptr %work" });
}
