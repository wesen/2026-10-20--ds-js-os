// Chapter 16: the world runtime, in the subset.
//
// A picocalc-os world is a script that describes itself with a builder,
//
//   service("flaky").state({ pings: 0 }).on("ping", (s) => { s.pings++; return "pong " + s.pings; });
//
// and is then driven by the kernel: messages arrive, a handler runs with the world's state,
// and its result (or, for an async handler, the value its promise settles with) is the
// answer. picocalc-os's prelude.js implements this in JavaScript for its own engine. Here
// WORLD_SOURCE implements the same API in the subset, compiled with the world: everything
// in it is dynamic, as it must be to hold any world's handlers.
//
// The kernel is replaced by a test harness: a driver (also in the subset) that sends
// messages and reports the answers, with time that is virtual: sleep(ms) is a timer that
// $runWorld fires in order, emptying the job queue between timers, as the kernel's turns do.

import { parse } from './parse.js';
import { LibCall, Prim } from './ast.js';

// Chapter 23: the system a test's world sees, the same in the compiled world (WORLD_SOURCE uses
// it) and in the oracle (tools/node-world.mjs evaluates this text): a few worlds, two handles,
// and statistics that grow with the virtual time t, so that a monitor has something to plot.
export const FAKE_SYSTEM = `
function $sysStats(t /*: Any */) /*: Any */ {
  const out /*: Any */ = { board: 'picocalc (test harness)', clock: 'virtual', step_ns: 125, slice: 20, t_ms: t,
    lane_busy_ms: Math.floor(t / 7), turns: Math.floor(t / 3), segments: Math.floor(t / 2), published: Math.floor(t / 50),
    delivered: Math.floor(t / 20), handles: 2, crashes: 1,
    buses: [{ name: 'i2c0', busy_ms: Math.floor(t / 40) }, { name: 'spi1', busy_ms: Math.floor(t / 11) }] };
  return out;
}
function $sysWorld(name /*: Any */, kind /*: Any */, title /*: Any */, key /*: Any */, user /*: Any */, state /*: Any */, share /*: Any */, t /*: Any */) /*: Any */ {
  const out /*: Any */ = { name: name, kind: kind, title: title, state: state, user: user, icon: null, about: title + ', in the test harness', key: key,
    cpu_ms: Math.floor(t * share), turns: Math.floor(t * share / 2), mem_kb: 40 + name.length * 3, limit_kb: 512, restarts: user ? 1 : 0,
    last_error: user ? 'Error: boom' : '', mbox: 0, mbox_peak: name.length % 4, budget_ms: 200, claims: kind === 'driver' ? ['i2c0:0x1f', 'keys.raw'] : [] };
  return out;
}
function $sysWorlds(t /*: Any */) /*: Any */ {
  return [$sysWorld('keyboard', 'driver', 'keyboard', null, false, 'running', 0.02, t), $sysWorld('compositor', 'service', 'compositor', null, false, 'running', 0.1, t),
    $sysWorld('snake', 'app', 'Snake', 's', false, 'running', 0.05, t), $sysWorld('u-hello', 'app', 'Hello', null, true, 'stopped', 0, t)];
}
function $sysHandles(t /*: Any */) /*: Any */ {
  return [{ id: 1, type: 'i2c', claim: 'i2c0:0x1f', rights: 'rw', holders: ['keyboard'], hz: 100000 },
    { id: 2, type: 'fb', claim: 'dma', rights: 'rw', holders: ['compositor'], kb: 150 }];
}
`;

export const WORLD_SOURCE = `
${FAKE_SYSTEM}
let $def /*: Any */ = { kind: 'world', name: '', title: '', initial: undefined, types: [], handlers: [], every: [], start: undefined, screen: undefined, hints: undefined };
let $S /*: Any */ = undefined;
let $now = 0;
let $timers /*: Any[] */ = [];
let $next /*: Any[] */ = [];   // chapter 23: when each every(ms) handler runs next
// chapter 23: the virtual wall clock, SPJ's boot time plus the virtual time (Date.now, new Date())
const $BOOT = 1792662060000;
let self /*: Any */ = 'world';   // (chapter 23: the world's name, as the manifest gives it to the prelude)
const $builder /*: Any */ = {
  title: (t /*: Any */) => { $def.title = t; return $builder; },
  icon: (ops /*: Any */) => $builder,
  about: (t /*: Any */) => $builder,
  key: (k /*: Any */) => $builder,
  state: (s /*: Any */) => { $def.initial = s; return $builder; },
  needs: (cs /*: Any */) => $builder,
  provides: (cs /*: Any */) => $builder,
  on: (type /*: Any */, fn /*: Any */) => { const n = $def.types.length; $def.types.length = n + 1; $def.types[n] = type; $def.handlers.length = n + 1; $def.handlers[n] = fn; return $builder; },
  every: (ms /*: Any */, fn /*: Any */) => { const n = $def.every.length; $def.every.length = n + 1; $def.every[n] = { ms: ms, fn: fn }; return $builder; },
  onStart: (fn /*: Any */) => { $def.start = fn; return $builder; },
  screen: (fn /*: Any */) => { $def.screen = fn; return $builder; },
  hints: (h /*: Any */) => { $def.hints = h; return $builder; },
};
function driver(name /*: Any */) /*: Any */ { $def.kind = 'driver'; $def.name = name; self = name; return $builder; }
function service(name /*: Any */) /*: Any */ { $def.kind = 'service'; $def.name = name; self = name; return $builder; }
function app(name /*: Any */) /*: Any */ { $def.kind = 'app'; $def.name = name; self = name; return $builder; }
function now() /*: Any */ { return $now; }
// chapter 23: show and log as the prelude writes them (an Error as its text, strings quoted
// inside arrays and objects, 20 elements and 12 keys at most, three levels)
function $isError(v /*: Any */) /*: Bool */ { return typeof v === 'object' && v !== null && !Array.isArray(v) && typeof v.message === 'string' && typeof v.name === 'string'; }
function $showv(v /*: Any */, depth /*: Int */, seen /*: Any[] */) /*: String */ {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') return depth > 0 ? JSON.stringify(v) : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'function') return '[function anonymous]';
  if ($isError(v)) return errText(v);
  for (let i = 0; i < seen.length; i++) if (seen[i] === v) return '[circular]';
  if (depth > 2) return Array.isArray(v) ? '[…]' : '{…}';
  { const n = seen.length; seen.length = n + 1; seen[n] = v; }
  let out = '';
  if (Array.isArray(v)) {
    out = '[';
    for (let i = 0; i < v.length && i < 20; i++) out += (i > 0 ? ', ' : '') + $showv(v[i], depth + 1, seen);
    out += (v.length > 20 ? ', …' : '') + ']';
  } else {
    const ks = Object.keys(v);
    out = '{';
    for (let i = 0; i < ks.length && i < 12; i++)
      out += (i > 0 ? ', ' : '') + (/^[A-Za-z_$][\\w$]*$/.test(ks[i]) ? ks[i] : JSON.stringify(ks[i])) + ': ' + $showv(v[ks[i]], depth + 1, seen);
    out += (ks.length > 12 ? ', …' : '') + '}';
  }
  seen.length = seen.length - 1;
  return out;
}
function show(v /*: Any */) /*: Any */ { return $showv(v, 1, []); }
function log(...a) { console.log('[' + $def.name + '] ' + a.map((x /*: Any */) => (typeof x === 'string' ? x : $showv(x, 0, []))).join(' ')); }
function print(...a) { console.log('[' + $def.name + '] ' + a.map((x /*: Any */) => (typeof x === 'string' ? x : $showv(x, 0, []))).join(' ')); }
// Math.random, seeded as the prelude seeds it (xorshift32, seed 1)
let $seed = 1;
function Math$random() /*: Any */ {
  $seed = ($seed ^ ($seed << 13)) >>> 0;
  $seed = ($seed ^ ($seed >>> 17)) >>> 0;
  $seed = ($seed ^ ($seed << 5)) >>> 0;
  return $seed / 4294967296;
}
// ---- messages, the host's services: what a test needs, answered at once ----
function send(to /*: Any */, type /*: Any */, payload /*: Any */) { console.log('send ' + to + ' ' + type); }
function publish(ch /*: Any */, payload /*: Any */, opts /*: Any */) { console.log('publish ' + ch); }
function ask(to /*: Any */, type /*: Any */, payload /*: Any */, opts /*: Any */) /*: Any */ {
  return Promise.reject(new Error(to + ' is not running'));
}
// (chapter 23: no hardware in a test: no handles)
const hw /*: Any */ = { i2c: (c /*: Any */, hz /*: Any */) => null, spi: (c /*: Any */, hz /*: Any */) => null, fs: (c /*: Any */) => null };
const dma /*: Any */ = { alloc: (w /*: Any */, h /*: Any */) => null };
const gfx /*: Any */ = { fonts: () => [] };
const sys /*: Any */ = { worlds: (f /*: Any */) => $sysWorlds($now), handles: () => $sysHandles($now), stats: () => $sysStats($now), fault: (n /*: Any */) => undefined,
  restart: (n /*: Any */) => undefined, log: (a /*: Any */) => ({ first: 0, next: 0, lines: [] }), spawn: (n /*: Any */, s /*: Any */) => undefined,
  stop: (w /*: Any */) => undefined };
const agentNet /*: Any */ = { status: () => 'idle', start: (b /*: Any */) => 0, poll: (t /*: Any */) => undefined, cancel: (t /*: Any */) => undefined };
const net /*: Any */ = { info: () => ({}), scan: () => undefined, scanResult: () => null, join: (s /*: Any */, p /*: Any */) => undefined };
const clock /*: Any */ = { wall: () => null, set: () => false, zone: () => 'UTC', setZone: (z /*: Any */) => undefined };
const $store /*: Any */ = {};
const store /*: Any */ = { get: (k /*: Any */, d /*: Any */) => d, set: (k /*: Any */, v /*: Any */) => undefined,
  remove: (k /*: Any */) => undefined, all: () => ({}), status: () => ({ ok: true }) };
// ---- the ui vocabulary: plain objects, made as the prelude makes them (chapter 23: options
// first, children flattened, null, undefined and false dropped; col, row and box take their
// children as one array, which lower_rest packs for them)
function $isOpts(x /*: Any */) /*: Bool */ { return x !== null && x !== undefined && x !== false && typeof x === 'object' && !Array.isArray(x) && !x.t; }
function $flat(xs /*: Any */, out /*: Any[] */, depth /*: Int */) {
  for (let i = 0; i < xs.length; i++) {
    const x /*: Any */ = xs[i];
    if (Array.isArray(x) && depth < 10) $flat(x, out, depth + 1);
    else if (x !== null && x !== undefined && x !== false) { const n = out.length; out.length = n + 1; out[n] = x; }
  }
}
function $node(t /*: Any */, kids /*: Any */) /*: Any */ {
  let o /*: Any */ = {};
  let ks /*: Any */ = kids;
  if (kids.length > 0 && $isOpts(kids[0])) { o = kids[0]; ks = kids.slice(1); }
  const flat /*: Any[] */ = [];
  $flat(ks, flat, 1);
  return Object.assign({ t: t }, o, { kids: flat });
}
const ui /*: Any */ = {
  col: (kids /*: Any */) => $node('col', kids), row: (kids /*: Any */) => $node('row', kids), box: (kids /*: Any */) => $node('box', kids),
  text: (s /*: Any */, o /*: Any */) => Object.assign({ t: 'text', s: String(s) }, o),
  title: (s /*: Any */, o /*: Any */) => Object.assign({ t: 'text', s: String(s), font: 'l' }, o),
  gap: (h /*: Any */) => ({ t: 'gap', h: h === null || h === undefined ? 8 : h }),
  sep: (o /*: Any */) => Object.assign({ t: 'sep' }, o),
  bar: (f /*: Any */, o /*: Any */) => Object.assign({ t: 'bar', v: Math.max(0, Math.min(1, f * 1 || 0)) }, o),
  list: (items /*: Any */, sel /*: Any */, o /*: Any */) => Object.assign({ t: 'list', items: items, sel: sel === null || sel === undefined ? -1 : sel }, o),
  table: (cols /*: Any */, rows /*: Any */, o /*: Any */) => Object.assign({ t: 'table', cols: cols, rows: rows }, o),
  lines: (items /*: Any */, o /*: Any */) => Object.assign({ t: 'lines', items: items }, o),
  textarea: (rows /*: Any */, o /*: Any */) => Object.assign({ t: 'textarea', rows: rows }, o),
  spark: (v /*: Any */, o /*: Any */) => Object.assign({ t: 'spark', values: v }, o),
  canvas: (w /*: Any */, h /*: Any */, ops /*: Any */, o /*: Any */) => Object.assign({ t: 'canvas', w: w, h: h, ops: ops }, o),
  input: (v /*: Any */, o /*: Any */) => Object.assign({ t: 'input', value: String(v) }, o),
  grid: (items /*: Any */, sel /*: Any */, o /*: Any */) => Object.assign({ t: 'grid', items: items, sel: sel === null || sel === undefined ? -1 : sel }, o),
  kv: (pairs /*: Any */, o /*: Any */) => Object.assign({ t: 'kv', pairs: pairs }, o),
};
function sleep(ms /*: Any */) /*: Any */ {
  return new Promise((resolve /*: Any */) => {
    const n = $timers.length;
    $timers.length = n + 1;
    $timers[n] = { at: $now + ms, seq: n, fire: resolve };
  });
}
function errText(e /*: Any */) /*: Any */ {
  if (typeof e === 'object' && e !== null && e.message !== undefined) return (e.name !== 'Error' ? e.name + ': ' : '') + e.message;
  return String(e);
}
// calls f with the arguments it names, of (a, b, c)
function $call3(f /*: Any */, a /*: Any */, b /*: Any */, c /*: Any */) /*: Any */ {
  const n = $arity(f);
  if (n === 0) return f();
  if (n === 1) return f(a);
  if (n === 2) return f(a, b);
  return f(a, b, c);
}
// ---- the harness: the kernel's part ----
// (chapter 23: an answer as JSON, a string quoted, as the oracle prints it)
function $show(v /*: Any */) /*: Any */ { return v === undefined ? 'undefined' : typeof v === 'string' ? '"' + v + '"' : JSON.stringify(v); }
// (chapter 23: what crosses between worlds is JSON: the state starts as a copy of the initial
// state, and a payload arrives as a copy)
function $copy(v /*: Any */) /*: Any */ { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function $init() {
  $S = $copy($def.initial === undefined ? {} : $def.initial);
  Math.$clock($BOOT);
  for (let i = 0; i < $def.every.length; i++) { const n = $next.length; $next.length = n + 1; $next[n] = $def.every[i].ms; }
}
function $handler(type /*: Any */) /*: Any */ {
  let fn /*: Any */ = undefined;
  for (let i = 0; i < $def.types.length; i++) if ($def.types[i] === type) fn = $def.handlers[i];
  return fn;
}
function $ask(type /*: Any */, payload /*: Any */) {
  const fn /*: Any */ = $handler(type);
  if (fn === undefined) { console.log(type + ' -> rejected: no handler'); return; }
  const at = $now;
  try {
    const r /*: Any */ = $call3(fn, $S, $copy(payload), { from: 'harness', type: type, ask: true });
    if (typeof r === 'object' && r !== null && r.$promise === true)
      r.then((v /*: Any */) => console.log(type + ' -> ' + $show(v) + ' (after ' + ($now - at) + ' ms)'),
        (e /*: Any */) => console.log(type + ' -> failed: ' + errText(e) + ' (after ' + ($now - at) + ' ms)'));
    else console.log(type + ' -> ' + $show($copy(r)));
  } catch (e) {
    console.log(type + ' -> failed: ' + errText(e));
  }
  $drain();
}
// chapter 23: a message without an answer (a failure is reported as the oracle reports it)
function $dispatch(what /*: Any */, fn /*: Any */, type /*: Any */, payload /*: Any */, from /*: Any */) {
  if (fn === undefined) return;
  const at = $now;
  try {
    const r /*: Any */ = $call3(fn, $S, $copy(payload), { from: from, type: type, ask: false });
    // (chapter 23: an async handler's failure is the turn's, reported when it comes)
    if (typeof r === 'object' && r !== null && r.$promise === true)
      r.then((v /*: Any */) => undefined, (e /*: Any */) => console.log(what + ' -> failed: ' + errText(e) + ' (after ' + ($now - at) + ' ms)'));
  } catch (e) {
    console.log(what + ' -> failed: ' + errText(e));
  }
  $drain();
}
function $send(type /*: Any */, payload /*: Any */, from /*: Any */) { $dispatch('send', $handler(type), type, payload, from === undefined ? 'harness' : from); }
function $key(key /*: Any */) {
  const one = key.length === 1;
  $dispatch('key', $handler('key'), 'key', { code: one ? key.charCodeAt(0) : 0, key: key, ch: one ? key : '', state: 'down', caps: false }, 'compositor');
}
function $start() { $dispatch('start', $def.start, 'start', undefined, 'kernel'); }
function $frame() {
  if ($def.screen === undefined) { console.log(null); return; }
  try {
    const tree /*: Any */ = $def.screen($S);
    const hints /*: Any */ = typeof $def.hints === 'function' ? $def.hints($S) : $def.hints;
    console.log(JSON.stringify({ tree: tree, hints: hints || '' }));
  } catch (e) {
    console.log('frame -> failed: ' + errText(e));
  }
}
// the next sleep (index into $timers), or -1
function $soonest() /*: Int */ {
  let k = -1;
  for (let i = 0; i < $timers.length; i++) {
    const a /*: Any */ = $timers[i];
    if (k < 0) k = i;
    else { const b /*: Any */ = $timers[k]; if (a.at < b.at || (a.at === b.at && a.seq < b.seq)) k = i; }
  }
  return k;
}
function $fire(k /*: Int */) {
  const t /*: Any */ = $timers[k];
  for (let i = k + 1; i < $timers.length; i++) $timers[i - 1] = $timers[i];
  $timers.length = $timers.length - 1;
  $now = t.at;
  Math.$clock($BOOT + $now);
  t.fire(undefined);
  $drain();
}
// chapter 23: the virtual clock runs ms: sleeps and every(ms) handlers in order of time (a
// sleep first on a tie), each followed by the jobs it queued
function $run(ms /*: Any */) {
  const end = $now + ms;
  for (;;) {
    const k = $soonest();
    let e = -1;
    for (let i = 0; i < $next.length; i++) if (e < 0 || $next[i] < $next[e]) e = i;
    const tAt = k < 0 ? Infinity : $timers[k].at, eAt = e < 0 ? Infinity : $next[e];
    if (Math.min(tAt, eAt) > end) break;
    if (tAt <= eAt) $fire(k);
    else {
      $now = eAt;
      Math.$clock($BOOT + $now);
      $next[e] = $next[e] + $def.every[e].ms;
      $dispatch('every', $def.every[e].fn, e, undefined, 'kernel');
    }
  }
  $now = end;
  Math.$clock($BOOT + $now);
}
// runs the jobs, then the sleeps left in order of time, until nothing is left
function $runWorld() {
  $drain();
  while ($timers.length > 0) $fire($soonest());
}
`;

// The prelude's statements, with its intrinsics: $arity (a function value's number of
// parameters) and $drain (empty the job queue now).
export function worldPrelude() {
  const fix = (x) => {
    if (x === null || typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map(fix);
    if (x.kind === 'Call' && x.fn.kind === 'Var' && x.fn.name === '$arity') return Prim('fn_arity', x.args.map(fix));
    if (x.kind === 'Call' && x.fn.kind === 'Var' && x.fn.name === '$drain') return LibCall('Promise.$drain', []);
    const out = {};
    for (const [k, v] of Object.entries(x)) out[k] = fix(v);
    return out;
  };
  return fix(parse(WORLD_SOURCE).body);
}

// A world program: the prelude, the world's file, then the driver's statements (a script of
// $ask calls; the harness starts the world first and runs it to the end after).
export function worldProgram(worldSrc, driverSrc = '') {
  const world = parse(worldSrc).body;
  const driver = parse(`$init();\n${driverSrc}\n$runWorld();`).body;
  // (chapter 23: each part brings the library functions it uses, Object$assign among them;
  // they are the same functions, so the first copy of each stays)
  const seen = new Set();
  const once = (d) => !(d.kind === 'FunDef' && d.name.includes('$') && seen.has(d.name)) && (d.kind !== 'FunDef' || !seen.add(d.name) || true);
  return { kind: 'Program', body: [...worldPrelude(), ...world, ...driver].filter(once) };
}
