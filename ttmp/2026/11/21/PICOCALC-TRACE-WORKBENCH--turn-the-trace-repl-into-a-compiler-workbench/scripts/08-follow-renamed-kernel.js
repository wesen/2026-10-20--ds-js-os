// W6 on the PICOCALC-SHADOW-LLVM capture: follow the shadow kernel across GlobalOpt's rename.
// Field note N3: SROA promoted the kernel's locals while it was still called checked_shadow;
// GlobalOpt then renamed it kernel at middle ordinal 17, so kernel's own timeline shows no promotion.
//
//   trace-repl serve --addr ADDR --archive ttmp/2026/11/21/PICOCALC-SHADOW-LLVM--…
//   trace-repl eval --addr ADDR --session "$sid" < 08-follow-renamed-kernel.js
(() => {
  const run = a.variant('checked'), kernel = run.function('kernel');
  const allocas = q.ir.instructions().opcode('alloca').count();
  const drops = timeline => q.run(timeline.measure(allocas).changes().where(c => c.status === 'known' && c.delta < 0)).rows
    .map(c => ({ ordinal: c.ordinal, pass: c.pass, before: c.before, after: c.after, delta: c.delta, function: c.function || null }));
  const followed = kernel.timeline('middle', { follow: true });
  const around = q.run(followed.measure(allocas)).rows.filter(r => r.ordinal >= 15 && r.ordinal <= 18)
    .map(r => ({ ordinal: r.ordinal, pass: r.pass, function: r.function, status: r.status, value: r.value, rename: r.rename || null }));
  return {
    renames: run.renames().map(r => ({ phase: r.phase, ordinal: r.ordinal, pass: r.pass, from: r.from, to: r.to, method: r.method, aliasOrdinal: r.aliasOrdinal })),
    aliases: kernel.aliases().map(x => x.name),
    allocaDropsUnfollowed: drops(kernel.timeline('middle')),
    allocaDropsFollowed: drops(followed),
    aroundTheRename: around,
  };
})()
