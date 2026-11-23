// What this service mounted, and which questions it can answer.
// trace-repl eval --session "$sid" < 01-orientation.js
(() => ({
  release: q.version,
  variants: a.variants().map(v => ({variant: v.variant, events: v.phases.map(p => p.phase + ":" + p.events).join(" ")})),
  functions: a.variant("checked").functions(),
  arms: profiles.arms().map(x => x.arm),
  // Statuses such as "available (opcode subset for operandIndex)" still count as available.
  limits: q.capabilities().filter(c => !c.status.startsWith("available")).map(c => c.capability + ": " + (c.reason ?? c.status)),
  device: hardware.help().available,
  simd: simd.help().available,
}))()
