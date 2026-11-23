// Run the opening frame on the native RV32 interpreter: steps, output digest, hottest functions.
(() => {
  const c = compiler.at("worktree");
  const program = c.typedRv32.compile(c.ray, [], 65536, {policy: args.policy ?? "kernel"});
  const f = c.native.rayBench.frameProfile(program);
  return {policy: args.policy ?? "kernel", steps: f.steps, digest: f.digest,
          hottest: f.rows.slice().sort((x, y) => y.steps - x.steps).slice(0, 3).map(r => ({name: r.name, steps: r.steps}))};
})()
