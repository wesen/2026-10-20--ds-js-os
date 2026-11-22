// Where loop passes ran in the checked variant's middle-end stream, with stable references.
(() => {
  const middle = a.variant("checked").events("middle");
  return {
    firstVectorize: q.run(middle.where(e => e.pass === "LoopVectorizePass").select("ordinal", "pass", "scope", "ref").first()),
    loopScoped: q.run(middle.where(e => e.scope.kind === "loop").select("ordinal", "pass", "ref").limit(5)),
  };
})()
