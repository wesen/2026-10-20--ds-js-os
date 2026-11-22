// world:program.js — split a compiled program at the seam the firmware renderer uses.
//
// compile.js assembles every program as
//   head + PRELUDE + SPECTRAL + ggxTableWGSL() + sdfCode + hfCode + densCode + CORE + metalAt + matCode + PATH
// The fixed parts are compiled into the firmware (PICOCALC-CANDELA-CPU-KERNEL); the generated parts go to the
// section translator (PICOCALC-CANDELA-SECTIONS). This is CPU-KERNEL's scripts/lib/candela.mjs splitProgram(),
// at the same pin, running in the world. Any other layout throws, so a Candela version that assembles its
// program differently is refused here, not rendered wrongly.
import { PRELUDE, SPECTRAL, CORE, PATH, ggxTableWGSL } from 'candela:kernel.js';

export const METAL_AT = 'fn metalAt(v: vec3f) -> vec3f {\n  if (SPECTRAL_ON) {\n    let t: f32 = clamp((gLam - 450.0) / 200.0, 0.0, 1.0);\n    let s: f32 = select(mix(v.z, v.y, t * 2.0), mix(v.y, v.x, t * 2.0 - 1.0), t > 0.5);\n    return vec3f(s, s, s);\n  }\n  return v;\n}\n';
export const HIT_ALBEDO = 'fn hitAlbedo(h: Hit, wo: vec3f) -> vec3f { let L: Lobe = evalMaterial(h, wo, 0.5); if (L.kind == 2 && (L.flags & 1) != 0) { return L.c1; } if (L.kind == 1 || L.kind == 4) { return L.c0; } return vec3f(0.8, 0.8, 0.8); }\n';
export const HIT_EMISSION = 'fn hitEmission(h: Hit, wo: vec3f) -> vec3f { let L: Lobe = evalMaterial(h, wo, 0.5); return L.Le; }\n';
export const DEFAULT_CUSTOM = 'fn customKernel(ro: vec3f, rd: vec3f) -> vec3f { return vec3f(1.0, 0.0, 1.0); }\n';

// The fixed WGSL in program order, as CPU-KERNEL's fixedParts(): what the firmware kernel is translated from.
export function fixedText() {
  return PRELUDE + SPECTRAL + ggxTableWGSL() + CORE + METAL_AT + HIT_ALBEDO + HIT_EMISSION + PATH;
}

export function splitProgram(shared) {
  const fail = (what) => { throw new Error('splitProgram: ' + what + ' (has Candela changed how compile.js assembles the program?)'); };
  const ggx = ggxTableWGSL();
  const iP = shared.indexOf(PRELUDE);
  if (iP < 0) fail('PRELUDE not found');
  const head = shared.slice(0, iP);
  const hm = head.match(/^const SPECTRAL_ON: bool = (true|false);\n$/);
  if (!hm) fail('unexpected head ' + JSON.stringify(head));
  let at = iP + PRELUDE.length;
  for (const [name, text] of [['SPECTRAL', SPECTRAL], ['ggxTableWGSL()', ggx]]) {
    if (shared.slice(at, at + text.length) !== text) fail(name + ' does not follow PRELUDE');
    at += text.length;
  }
  const iC = shared.indexOf(CORE, at);
  if (iC < 0) fail('CORE not found');
  const fieldCode = shared.slice(at, iC);
  at = iC + CORE.length;
  if (shared.slice(at, at + METAL_AT.length) !== METAL_AT) fail('metalAt does not follow CORE');
  at += METAL_AT.length;
  if (!shared.endsWith(PATH)) fail('the program does not end with PATH');
  let matCode = shared.slice(at, shared.length - PATH.length);
  for (const [name, text] of [['hitAlbedo', HIT_ALBEDO], ['hitEmission', HIT_EMISSION]]) {
    const n = matCode.split(text).length - 1;
    if (n !== 1) fail(`${name} appears ${n} times in the material section`);
    matCode = matCode.replace(text, '');
  }
  for (const fn of ['sdUser', 'heightAt', 'densityOf']) if (!new RegExp(`\\bfn ${fn}\\(`).test(fieldCode)) fail(fn + ' missing from the field section');
  for (const fn of ['evalMaterial', 'customKernel']) if (!new RegExp(`\\bfn ${fn}\\(`).test(matCode)) fail(fn + ' missing from the material section');
  return { spectral: hm[1] === 'true', fieldCode, matCode, customDefault: matCode.includes(DEFAULT_CUSTOM) };
}
