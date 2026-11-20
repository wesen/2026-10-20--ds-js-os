// Small helpers shared by the passes.

// A program outside the language, found before it runs (an undeclared name, a declaration
// read too early). The harness reports it like a failed test.
export class CompileError extends Error {}

// Fresh names. Every pass that invents a name asks gensym, so no two names collide.
// The driver resets the counter per program, which keeps dumps reproducible.
let counter = 0;
export function gensym(base) {
  counter += 1;
  return `${base}.${counter}`;
}
// A new program: fresh names, and (chapter 19) what other modules remember per program
export const programResets = [];
// (CJI-3: the test runner runs interpreters between passes, and the source interpreter lowers
// async functions itself; it keeps the counter as it was, so the passes number names as a build does)
export const gensymCounter = () => counter;
export function setGensymCounter(n) { counter = n; }
export function keepingGensym(f) {
  const saved = counter;
  try { return f(); } finally { counter = saved; }
}
export function resetGensym() {
  counter = 0;
  for (const f of programResets) f();
}
