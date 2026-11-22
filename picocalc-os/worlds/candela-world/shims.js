// world:shims.js — what Candela's front end expects of its host and QuickJS does not have. Evaluated before
// any Candela module (world:runner.js imports it first), because candela.js probes `new Function` while it loads.
//
//   atob                  K-09 decodes base64 mesh data with it (the only browser API Candela's front end uses)
//   performance.now()     build() times itself with it
//   console               params.js reports listener errors with console.error
//   Function              Candela compiles every scene file with new Function(..., body + '//# sourceURL=' + path).
//                         QuickJS ignores sourceURL and names every such function "<input>", so Candela's
//                         callSite() could never find a user frame. This Function compiles a body that ends in a
//                         sourceURL through the host with that file name, so stack traces name scene.js.
//
// The host object (__candela, from nucleus/candela_world.c) is taken off the global object here, so scene code
// cannot reach the renderer or the clocks directly.
const H = globalThis.__candela;
if (!H) throw new Error('world:shims.js: this world has no Candela host object (manifest claim "candela")');
delete globalThis.__candela;
export const host = H;

// ---- atob: WHATWG forgiving-base64 decode, to a binary string ------------------------------------------------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const DEC = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) DEC[B64.charCodeAt(i)] = i;
function invalid() { const e = new Error('The string to be decoded is not correctly encoded.'); e.name = 'InvalidCharacterError'; return e; }
globalThis.atob = function atob(data) {
  let s = String(data).replace(/[\t\n\f\r ]+/g, '');
  if (s.length % 4 === 0) s = s.replace(/==?$/, '');
  if (s.length % 4 === 1) throw invalid();
  const out = [];
  let chunk = [], buf = 0, bits = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i), v = c < 128 ? DEC[c] : -1;
    if (v < 0) throw invalid();
    buf = (buf << 6 | v) & 0xffffff; bits += 6;
    if (bits >= 8) { bits -= 8; chunk.push(buf >> bits & 255); if (chunk.length === 8192) { out.push(String.fromCharCode.apply(null, chunk)); chunk = []; } }
  }
  out.push(String.fromCharCode.apply(null, chunk));
  return out.join('');
};

// ---- clocks and console --------------------------------------------------------------------------------------
globalThis.performance = { now: () => H.now() };
const say = (pre) => (...a) => log(pre + a.map((x) => (typeof x === 'string' ? x : show(x))).join(' '));
globalThis.console = { log: say(''), info: say(''), warn: say('warn: '), error: say('error: '), debug: () => {} };

// ---- Function with sourceURL ---------------------------------------------------------------------------------
// The source is laid out as V8 and QuickJS lay out a Function body (header on two lines, then the body), so
// candela.js's boot-time probe measures the same offset (2). Candela's runFiles prefixes every scene file with
// two more lines ('"use strict";' and 'return (async () => {'), which that offset does not cover: in V8 a
// throw on line 4 of scene.js is reported at line 6. Here those two lines are joined to the header's second
// line, so scene.js line L is source line L + 2 and Candela reports line L.
const NativeFunction = Function;
const SOURCE_URL = /\n\/\/# sourceURL=([\w.\/-]+)\s*$/;
const RUN_FILES_PREFIX = '"use strict";\nreturn (async () => {\n';
function NamedFunction(...args) {
  const body = args.length ? String(args[args.length - 1]) : '';
  const m = SOURCE_URL.exec(body);
  if (!m) return Reflect.apply(NativeFunction, undefined, args);
  const params = args.slice(0, -1).map(String).join(',');
  const source = body.startsWith(RUN_FILES_PREFIX)
    ? `(function anonymous(${params}\n) { "use strict"; return (async () => {\n${body.slice(RUN_FILES_PREFIX.length)}\n})`
    : `(function anonymous(${params}\n) {\n${body}\n})`;
  return H.evalScript(source, m[1]);
}
NamedFunction.prototype = NativeFunction.prototype;
globalThis.Function = NamedFunction;
export const shimsInstalled = true;
