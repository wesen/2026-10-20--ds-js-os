#!/usr/bin/env node
// regenerate.mjs: regenerate the firmware's generated Candela sources in picocalc-os/third_party/candela.
// usage: node tools/gen/candela/regenerate.mjs [--check] [--verbose]
//
// The firmware's Candela renderer lives in picocalc-os/third_party/candela:
//   kernel/   the fixed path-tracing kernel and post pass, C++ generated from Candela's WGSL (kernel.mjs), the
//             fixed-kernel digest (cdl_fixed_kernel.c), and the hand-written parts the generated code includes
//   vm/       the section-bytecode interpreter: hand-written C, and its opcode table generated from
//             translator/isa.js (isa.mjs)
//   gallery/  the gallery's scene table: packed buffers and section bytecode per scene (scenes.mjs, gallery.json)
// Every input is read from the repository: the vendored Candela (src/, content/presets/; every file checked
// against PIN.json before anything is loaded) and the files of this directory. Nothing is read from a ticket.
//
// Writes the generated files that differ and VENDOR.json, which names, for every file in kernel/, vm/ and
// gallery/, its generator and its inputs with their digests, or marks it hand-written (edit those in place).
// With --check nothing is written: the exit status is 1 if any generated file or VENDOR.json differs from what
// this run produces, if a listed file is missing, or if kernel/, vm/ or gallery/ holds a file VENDOR.json does not list.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { generateKernel } from './kernel.mjs';
import { generateIsa } from './isa.mjs';
import { prepareScenes } from './scenes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const CDL = join(REPO, 'picocalc-os/third_party/candela');
const GEN = relative(REPO, HERE);                   // tools/gen/candela
const CDL_REL = relative(REPO, CDL);                // picocalc-os/third_party/candela
const sha = (b) => createHash('sha256').update(b).digest('hex');

// The hand-written sources: the primary copies, edited in place. Generated code includes the kernel/ ones.
const HAND_WRITTEN = ['kernel/cdl_api.h', 'kernel/cdl_math.h', 'kernel/cdl_overrides.inc', 'kernel/cdl_post.inc', 'kernel/cdl_switches.h',
  'vm/cdl_vm.c', 'vm/cdl_vm.h', 'vm/cdl_vm_ck_math.h'];

const argv = process.argv.slice(2);
const check = argv.includes('--check'), verbose = argv.includes('--verbose');
for (const a of argv) if (a !== '--check' && a !== '--verbose') { console.error('usage: node tools/gen/candela/regenerate.mjs [--check] [--verbose]'); process.exit(2); }

// ---- the vendored Candela, checked against PIN.json before any of it is loaded ----
const pin = JSON.parse(readFileSync(join(CDL, 'PIN.json'), 'utf8'));
const pinned = {};   // path under third_party/candela -> SHA-256
for (const [mod, h] of Object.entries(pin.modules)) pinned['src/' + mod] = h;
for (const p of Object.values(pin.presets)) pinned['presets/' + p.file] = p.sha256;
for (const [rel, h] of Object.entries(pin.generator.files)) pinned[rel] = h;
const pinErrors = [];
for (const [rel, h] of Object.entries(pinned)) {
  const p = join(CDL, rel);
  if (!existsSync(p)) pinErrors.push(`${rel}: missing`);
  else if (sha(readFileSync(p)) !== h) pinErrors.push(`${rel}: ${sha(readFileSync(p))}, PIN.json ${h}`);
}
// lib/candela.mjs loadPresets() reads every preset in content/presets, so it must hold exactly the pinned ones
for (const f of readdirSync(join(CDL, 'content/presets'))) if (!(('content/presets/' + f) in pinned)) pinErrors.push(`content/presets/${f}: not in PIN.json`);
if (pinErrors.length) { console.error(`${CDL_REL} differs from its PIN.json:\n  ` + pinErrors.join('\n  ')); process.exit(1); }

const inputDigests = {};   // repository path -> SHA-256, for VENDOR.json
const input = (rel) => { inputDigests[rel] = sha(readFileSync(join(REPO, rel))); return rel; };
const cdl = (rel) => input(`${CDL_REL}/${rel}`);
const gen = (rel) => input(`${GEN}/${rel}`);

const gallery = JSON.parse(readFileSync(join(HERE, 'gallery.json'), 'utf8'));
const outputs = new Map();   // path under third_party/candela -> { text, generator, inputs }

// ---- kernel/: the fixed kernel and post pass ----
const k = await generateKernel(CDL);
const kernelInputs = [cdl('src/kernel.js'), cdl('src/render.js'), cdl('src/wgsl2glsl.js'), gen('translator/isa.js')];
for (const [name, text] of Object.entries(k.files)) outputs.set('kernel/' + name, { text, generator: `${GEN}/kernel.mjs`, inputs: kernelInputs });
if (verbose) console.log(k.summary);

// ---- vm/: the interpreter's opcode table ----
outputs.set('vm/cdl_vm_isa.h', { text: generateIsa(), generator: `${GEN}/isa.mjs`, inputs: [gen('translator/isa.js')] });

// ---- gallery/: the scene table, and kernel/cdl_fixed_kernel.c ----
const g = await prepareScenes(CDL, gallery, verbose ? (s) => console.log(s) : undefined);
const kernelPin = JSON.parse(k.files['manifest.json']).pin['src/kernel.js'];
if (g.kernelJsSha256 !== kernelPin) throw new Error(`scenes prepared with kernel.js ${g.kernelJsSha256}, the kernel was generated from ${kernelPin}`);
const presetFiles = Object.keys(pin.generator.files).filter((rel) => rel.startsWith('content/presets/')).sort().map(cdl);
const sceneInputs = [...Object.keys(pin.modules).sort().map((m) => cdl('src/' + m)), ...presetFiles, gen('gallery.json')];
outputs.set('gallery/candela_gallery_scenes.c', { text: g.c, generator: `${GEN}/scenes.mjs`, inputs: sceneInputs });
// The firmware kernel's identity: the SHA-256 of fixedText() of the kernel.js it was generated from. The scenes were
// prepared from the same kernel.js, so the digest scenes.mjs computed is the kernel's too; candela_gallery_p4.c
// refuses a scene table compiled against another one.
const fixedC = '/* cdl_fixed_kernel.c: written by tools/gen/candela/regenerate.mjs. The SHA-256 of Candela\'s fixedText()\n' +
  ' * (PRELUDE + SPECTRAL + ggxTableWGSL() + CORE + metalAt + hitAlbedo + hitEmission + PATH) of the kernel.js this\n' +
  ` * kernel was generated from (manifest.json pin src/kernel.js ${kernelPin}). */\n` +
  `const char cg_kernel_fixed_sha256[] = "${g.fixedKernelSha256}";\n`;
outputs.set('kernel/cdl_fixed_kernel.c', { text: fixedC, generator: `${GEN}/regenerate.mjs`, inputs: [cdl('src/kernel.js'), gen('gallery.json')] });
if (verbose) console.log(`${g.scenes.length} scenes; fixed kernel ${g.fixedKernelSha256}`);

// ---- VENDOR.json ----
const files = {};
for (const rel of [...outputs.keys(), ...HAND_WRITTEN].sort()) {
  const o = outputs.get(rel);
  files[rel] = o ? { kind: 'generated', generator: o.generator, inputs: o.inputs, sha256: sha(o.text) } : { kind: 'hand-written' };
}
const vendor = {
  note: `Written by ${GEN}/regenerate.mjs. kernel/, vm/ and gallery/ are the firmware's Candela renderer. Files of kind ` +
    `"hand-written" are the primary copies: edit them here. Files of kind "generated" are written by their generator from ` +
    `the inputs listed (digests below); do not edit them: change the generator or an input and run ` +
    `\`node ${GEN}/regenerate.mjs\` (\`--check\` compares without writing). src/, presets/ and content/ are Candela's own ` +
    `files, copied from the archive that PIN.json names and pinned there.`,
  generator: `${GEN}/regenerate.mjs`,
  candela: { pin: `${CDL_REL}/PIN.json`, archiveSha256: pin.archiveSha256 },
  fixedKernelSha256: g.fixedKernelSha256,
  inputs: Object.fromEntries(Object.keys(inputDigests).sort().map((rel) => [rel, inputDigests[rel]])),
  files,
};
outputs.set('VENDOR.json', { text: JSON.stringify(vendor, null, 1) + '\n' });

// ---- compare, write ----
const different = [], problems = [];
for (const [rel, o] of outputs) {
  const p = join(CDL, rel);
  if (!existsSync(p) || readFileSync(p, 'utf8') !== o.text) different.push(rel);
}
for (const rel of HAND_WRITTEN) if (!existsSync(join(CDL, rel))) problems.push(`${rel}: hand-written file missing`);
for (const dir of ['kernel', 'vm', 'gallery']) {
  for (const f of readdirSync(join(CDL, dir))) {
    const rel = `${dir}/${f}`;
    if (!statSync(join(CDL, rel)).isFile() || !(rel in files)) problems.push(`${rel}: not listed in VENDOR.json`);
  }
}
if (check) {
  if (different.length) console.error(`${CDL_REL}: differs from what ${GEN}/regenerate.mjs generates: ${different.join(', ')}`);
  for (const p of problems) console.error(`${CDL_REL}/${p}`);
  if (different.length || problems.length) process.exit(1);
  console.log(`${CDL_REL}: ${outputs.size - 1} generated files and VENDOR.json current; ${HAND_WRITTEN.length} hand-written files listed`);
} else {
  for (const rel of different) writeFileSync(join(CDL, rel), outputs.get(rel).text);
  for (const p of problems) console.error(`${CDL_REL}/${p}`);
  console.log(`${CDL_REL}: ${different.length} of ${outputs.size} files written${different.length ? ': ' + different.join(', ') : ' (all current)'}`);
  if (problems.length) process.exit(1);
}
