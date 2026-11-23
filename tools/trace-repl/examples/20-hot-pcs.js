// The ten most executed instructions of one function, from per-PC counts of the opening frame.
(() => {
  const c = compiler.at("worktree");
  const program = c.typedRv32.compile(c.ray, [], 65536, {policy: "kernel"});
  const frame = c.native.rayBench.openingFrame(program);
  const fn = args.fn ?? "typedRayLitRow";
  const entries = Object.entries(program.entries).sort((x, y) => x[1] - y[1]);
  const owner = pc => entries.filter(([, start]) => start <= pc).at(-1)?.[0];
  const words = new DataView(program.image.buffer, program.image.byteOffset, program.image.byteLength);
  const word = i => 4 * i + 4 <= program.image.length ? words.getUint32(4 * i, true) : 0;
  const hot = [];
  // classify(word, next, after) needs the two following words to recognize bounds tests and capacity loads.
  for (let i = 0; i < frame.counts.length; i++)
    if (frame.counts[i] && owner(4 * i) === fn) hot.push({pc: (4 * i).toString(16), count: frame.counts[i],
      word: word(i).toString(16).padStart(8, "0"), kinds: rv32.classify(word(i), word(i + 1), word(i + 2))});
  return {fn, steps: frame.steps, top: hot.sort((x, y) => y.count - x.count).slice(0, 10)};
})()
