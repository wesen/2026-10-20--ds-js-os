// Watch the tape of one function after every compiler pass (observeTape), and the planner's homes (observePlan).
(() => {
  const c = compiler.at("worktree"), fn = args.fn ?? "typedRayInShadow";
  const phases = [], plan = {};
  c.typedRv32.compile(c.ray, [], 65536, {policy: "kernel",
    observeTape: (name, phase, code) => { if (name === fn) phases.push({phase, cells: code.length}); },
    observePlan: (name, p) => { if (name === fn) Object.assign(plan, {homes: p.homes.size, scored: p.scores.size, skips: p.skips?.size ?? 0}); }});
  return {fn, phases, plan};
})()
