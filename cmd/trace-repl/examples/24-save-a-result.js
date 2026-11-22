// Keep a result beyond the session: save it with its provenance, then read the record back.
(() => {
  const c = compiler.at("worktree");
  const f = c.native.rayBench.frameProfile(c.typedRv32.compile(c.ray, [], 65536, {policy: "kernel"}));
  const saved = results.save("example-opening-frame", {steps: f.steps, digest: f.digest});
  const record = results.load("example-opening-frame");
  return {saved: {name: saved.name, bytes: saved.bytes}, provenance: {session: record.session, unit: record.unit, repoHead: record.repo.head,
          compilers: record.compilers.map(x => x.requested)}, value: record.value};
})()
