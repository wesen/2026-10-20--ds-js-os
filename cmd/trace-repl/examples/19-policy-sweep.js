// Every named policy on the same frame, sent as a background job: this sweep takes about a second,
// but the same script over more revisions or workloads outgrows a cell's 15-second deadline.
// trace-repl eval --session "$sid" --job --job-timeout 300 < 19-policy-sweep.js
(() => {
  const c = compiler.at(args.rev ?? "worktree");
  const names = args.policies ?? Object.keys(c.typedRv32.policies);
  return names.map(policy => {
    const t0 = performance.now();
    const program = c.typedRv32.compile(c.ray, [], 65536, {policy});
    const compileMs = performance.now() - t0;
    const f = c.native.rayBench.frameProfile(program);
    return {policy, steps: f.steps, imageBytes: program.image.length, hostCompileMs: Math.round(compileMs), digest: f.digest};
  });
})()
