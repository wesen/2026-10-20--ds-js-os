// world:kernel-memo.js — Candela's kernel.js with its constant GGX table computed when the firmware was built.
//
// ggxTableWGSL() recomputes a 256-entry albedo table by Monte Carlo on every compile: 26.7 million QuickJS
// steps, minutes on the ESP32-P4. The table does not depend on the scene. tools/candela-bc evaluates
// kernel.js once on the build machine and writes both results into this module in place of the two tokens.
// The world's module loader (nucleus/candela_world.c) resolves every import of candela:kernel.js to this
// module, except this module's own; kernel.js itself is unchanged. A local export takes precedence over
// `export *`, so these two names replace kernel.js's and every other name passes through.
export * from 'candela:kernel.js';
import { ggxAlbedoTable as computeAlbedoTable } from 'candela:kernel.js';

const TABLE = /*@GGX_TABLE@*/;
const WGSL = /*@GGX_WGSL@*/;

export function ggxAlbedoTable(N = 16, S = 512) {
  return N === 16 && S === 512 ? TABLE.slice() : computeAlbedoTable(N, S);
}
export function ggxTableWGSL() { return WGSL; }
