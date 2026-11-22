// Node module hooks: resolve the world's specifiers as nucleus/candela_world.c does on the device.
//   candela:NAME  -> <candela>/src/NAME        world:NAME -> <world>/NAME
// Candela's own relative imports resolve as usual (so in Node, kernel.js is the real one: the reference).
// Registered by lib/register.mjs with { candela, world } directories.
import { pathToFileURL } from 'node:url';
let dirs = null;
export async function initialize(data) { dirs = data; }
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('candela:')) return { url: pathToFileURL(`${dirs.candela}/src/${specifier.slice(8)}`).href, shortCircuit: true };
  if (specifier.startsWith('world:')) return { url: pathToFileURL(`${dirs.world}/${specifier.slice(6)}`).href, shortCircuit: true };
  return next(specifier, context);
}
