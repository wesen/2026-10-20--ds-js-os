// The ray tracer compiled by two revisions of the Typed compiler, side by side in one cell.
// 04b0854 is the Step 19 compiler; the working tree adds induction variables and argument-register reuse.
// trace-repl eval --session "$sid" --arg base='"04b0854"' < 17-compile-at-revisions.js
(() => {
  const revisions = [args.base ?? "04b0854", "worktree"];
  return revisions.map(rev => {
    const c = compiler.at(rev);
    const program = c.typedRv32.compile(c.ray, [], 65536, {policy: "kernel"});
    const frame = c.native.rayBench.frameProfile(program);
    return {rev, revision: c.revision, imageBytes: program.image.length, functions: Object.keys(program.entries).length,
            frameSteps: frame.steps, digest: frame.digest};
  });
})()
