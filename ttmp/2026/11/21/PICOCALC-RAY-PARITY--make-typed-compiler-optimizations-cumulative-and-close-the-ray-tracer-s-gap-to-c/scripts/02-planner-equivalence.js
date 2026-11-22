// Definitions for a session opened with --baseline. equivalence(name) compares typedRv32Base with
// typedRv32 on one input under each operand-location option set. One input per cell keeps each
// cell under the REPL's 15 s deadline; 02-planner-equivalence.py drives all inputs.
globalThis.equivalenceOptionSets = {
  stock: undefined,
  forward: {operandLocations: {forward: true}},
  capacity: {operandLocations: {capacity: true}},
  homes: {operandLocations: {homes: true}},
  all: {operandLocations: {forward: true, capacity: true, homes: true}},
  allGuarded: {inlineGuardedReturns: true, operandLocations: {forward: true, capacity: true, homes: true}},
  allBuffered: {streamFunctions: false, inlineGuardedReturns: true, operandLocations: {forward: true, capacity: true, homes: true}},
};
globalThis.equivalenceInputs = () => [["ray", raySource, []],
  ...Object.entries(worlds).map(([k, v]) => ["world:" + k, v, typedWorld.imports]),
  ...Object.entries(sources).map(([k, v]) => [k, v, []])];
globalThis.equivalence = index => {
  const [name, src, imports] = equivalenceInputs()[index];
  const same = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
  const out = {name, identical: 0, errorsIdentical: 0, mismatches: []};
  for (const [arm, opts] of Object.entries(equivalenceOptionSets)) {
    const run = c => { try { return {ok: true, image: c.compile(src, imports, 96 * 1024, opts).image}; }
                       catch (e) { return {ok: false, error: String(e.message)}; } };
    const a = run(typedRv32Base), b = run(typedRv32);
    if (a.ok && b.ok && same(a.image, b.image)) out.identical++;
    else if (!a.ok && !b.ok && a.error === b.error) out.errorsIdentical++;
    else out.mismatches.push({arm, base: a.ok ? a.image.length : a.error, candidate: b.ok ? b.image.length : b.error});
  }
  return out;
};
undefined
