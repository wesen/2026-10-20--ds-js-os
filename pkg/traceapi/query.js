/* query.js — compiler-evidence query library for the PicoCalc LLVM row archive.
 * Runs inside the Goja trace REPL. The host injects one bridge object, __trace.
 * Public globals: q (query language), a (the archive), profiles (execution summaries).
 * Evaluation is synchronous: q.run(plan) or plan.run(). Nothing here prints to stdout.
 */
(function (root, bridge) {
  'use strict';
  const VERSION = '0.1.0';

  // ───────────────────────── errors and names ─────────────────────────
  function QueryError(code, message, extra) {
    const fix = extra && extra.fix;
    const e = new Error('[' + code + '] ' + message + (fix ? '\n  fix: ' + fix : ''));
    e.name = 'QueryError';
    e.code = code;
    if (extra) Object.keys(extra).forEach(k => { e[k] = extra[k]; });
    return e;
  }
  function editDistance(x, y) {
    const d = [];
    for (let i = 0; i <= x.length; i++) d.push([i]);
    for (let j = 1; j <= y.length; j++) d[0][j] = j;
    for (let i = 1; i <= x.length; i++)
      for (let j = 1; j <= y.length; j++)
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1,
          d[i - 1][j - 1] + (x[i - 1].toLowerCase() === y[j - 1].toLowerCase() ? 0 : 1));
    return d[x.length][y.length];
  }
  function closest(name, valid) {
    let best = null, bestD = Infinity;
    valid.forEach(v => { const dd = editDistance(String(name), String(v)); if (dd < bestD) { best = v; bestD = dd; } });
    return best !== null && bestD <= Math.max(2, Math.floor(String(name).length / 3)) ? best : null;
  }
  function unknownName(code, what, name, valid, fix) {
    const s = closest(name, valid);
    return QueryError(code, what + ' ' + JSON.stringify(name) + ' is unknown.' +
      (s !== null ? ' Did you mean ' + JSON.stringify(s) + '?' : '') + ' Valid: ' + valid.join(', '),
      { fix: fix || (s !== null ? 'use ' + JSON.stringify(s) : undefined), valid: valid.slice() });
  }
  function requireString(value, what, fix) {
    if (typeof value !== 'string' || value === '')
      throw QueryError('badArgument', what + ' must be a non-empty string; got ' + JSON.stringify(value), { fix });
    return value;
  }

  // ───────────────────────── bridge ─────────────────────────
  function callBridge(method, args) {
    if (!bridge || typeof bridge[method] !== 'function')
      throw QueryError('noBridge', '__trace.' + method + ' is not available in this session',
        { fix: 'run inside the trace REPL, which injects the __trace bridge' });
    try { return bridge[method].apply(bridge, args); }
    catch (err) {
      throw QueryError('bridge', '__trace.' + method + '(' + args.map(x => JSON.stringify(x)).join(', ') +
        ') failed: ' + (err && err.message ? err.message : String(err)));
    }
  }

  // ───────────────────────── session caches (bounded) ─────────────────────────
  // Keys are derived from declarative plan parts only (stream, ordinal, function, metric
  // definition). Lambdas never enter a cache key, so mutating a closure cannot poison a cache.
  class LRU {
    constructor(name, maxEntries, maxBytes) {
      this.name = name; this.maxEntries = maxEntries; this.maxBytes = maxBytes;
      this.map = new Map(); this.bytes = 0; this.hits = 0; this.misses = 0; this.evictions = 0;
    }
    get(key) {
      if (!this.map.has(key)) { this.misses++; return undefined; }
      const slot = this.map.get(key);
      this.map.delete(key); this.map.set(key, slot); this.hits++;
      return slot.value;
    }
    set(key, value, bytes) {
      const size = bytes || 0;
      if (this.map.has(key)) { this.bytes -= this.map.get(key).bytes; this.map.delete(key); }
      this.map.set(key, { value, bytes: size }); this.bytes += size;
      while (this.map.size > this.maxEntries || (this.maxBytes && this.bytes > this.maxBytes && this.map.size > 1)) {
        const oldest = this.map.keys().next().value;
        this.bytes -= this.map.get(oldest).bytes; this.map.delete(oldest); this.evictions++;
      }
      return value;
    }
    clear() { this.map.clear(); this.bytes = 0; }
    stats() {
      return { name: this.name, entries: this.map.size, maxEntries: this.maxEntries, approxBytes: this.bytes,
        maxBytes: this.maxBytes || null, hits: this.hits, misses: this.misses, evictions: this.evictions };
    }
  }
  const cache = {
    texts: new LRU('texts', 96, 24 * 1024 * 1024),       // raw prints from __trace.text
    snapshots: new LRU('snapshots', 512, 32 * 1024 * 1024), // parsed function snapshots
    values: new LRU('values', 8192, 0),                     // metric values per (snapshot, metric)
  };

  // ───────────────────────── plans and the synchronous terminal ─────────────────────────
  class Plan {
    constructor(kind, label) { this._kind = kind; this._label = label; }
    describe() { return this._label; }
    run(options) { return runPlan(this, options); }
    help() { return helpText(this._kind); }
    toString() { return '[plan ' + this._label + '] (evaluate with q.run(plan) or plan.run())'; }
    toJSON() { return { plan: this._label, kind: this._kind, note: 'not evaluated yet: q.run(plan) or plan.run()' }; }
    _evaluate(ctx) {
      if (ctx.memo.has(this)) return ctx.memo.get(this);
      const value = this._eval(ctx);
      ctx.memo.set(this, value);
      return value;
    }
    _eval() { throw QueryError('internal', 'plan kind ' + this._kind + ' has no evaluator'); }
  }
  function newContext(options) {
    const opts = options || {};
    return { memo: new Map(), aux: new Map(), bindings: opts.bindings || {}, maxRows: opts.maxRows || 200, started: Date.now() };
  }
  function runPlan(plan, options) {
    if (plan instanceof Plan) return plan._evaluate(newContext(options));
    if (plan && typeof plan === 'object' && !Array.isArray(plan) && Object.keys(plan).length &&
        Object.keys(plan).every(k => plan[k] instanceof Plan))
      return bundle(plan)._evaluate(newContext(options));     // q.run({ a: p1, b: p2 }) means a bundle
    throw QueryError('notAPlan', 'q.run expects a plan (from a.events(), q.ir…, profiles…, q.bundle…); got ' +
      (plan === null ? 'null' : typeof plan), { fix: 'q.run(a.events().count())' });
  }

  // ───────────────────────── event headers and scopes ─────────────────────────
  function unquote(s) { const t = String(s).trim(); return /^".*"$/.test(t) ? t.slice(1, -1) : t; }
  function parseScopeName(text) {
    const t = text.trim();
    if (t === '[module]') return { kind: 'module' };
    let m = /^\((.*)\)$/.exec(t);
    if (m) return { kind: 'cgscc', functions: m[1].split(/,\s*/).map(unquote) };
    m = /^loop %(\S+) in function (.+)$/.exec(t);
    if (m) return { kind: 'loop', loop: m[1], function: unquote(m[2]) };
    return { kind: 'function', function: unquote(t) };
  }
  // New pass manager: "*** IR Dump After EarlyCSEPass on row ***".
  // Legacy (llc):     "*** IR Dump After Virtual Register Rewriter (virtregrewriter) ***:" — the IR unit
  // is not in the header; it is resolved from the print (see resolveScope).
  // The archive index normalizes headers: middle-end "IR Dump After EarlyCSEPass on row" has no
  // trailing stars, backend keeps "… (virtregrewriter) ***:" or has none. Accept all three forms.
  function parseHeader(header, pass, phase) {
    const h = String(header || '');
    const legacy = /IR Dump (After|Before) (.+?) \(([^()\s]+)\)(?: \*\*\*:?)?\s*$/.exec(h);
    if (legacy && (legacy[3] === pass || phase === 'backend') && !/ on \(/.test(h))
      return { when: legacy[1].toLowerCase(), passName: legacy[2], scope: { kind: 'unresolved' } };
    const m = /IR Dump (After|Before) (\S+) on (.+?)( omitted because no change)?(?: \*\*\*)?\s*$/.exec(h);
    if (m) {
      const scope = parseScopeName(m[3]);
      if (m[4]) scope.omitted = 'no change';
      return { when: m[1].toLowerCase(), passName: m[2], scope };
    }
    return { when: null, passName: null, scope: { kind: 'unknown' } };
  }
  const EVENT_FIELDS = ['variant', 'phase', 'ordinal', 'header', 'pass', 'passId', 'passName', 'when', 'scope', 'function', 'ref'];
  function decorateEvent(raw) {
    const parsed = parseHeader(raw.header, raw.pass, raw.phase);
    const e = { variant: raw.variant, phase: raw.phase, ordinal: raw.ordinal, header: raw.header,
      pass: raw.pass, passId: raw.pass, passName: parsed.passName, when: parsed.when,
      scope: parsed.scope, function: parsed.scope.function || null, ref: raw.ref };
    Object.keys(raw).forEach(k => { if (!(k in e)) e[k] = raw[k]; });   // keep host fields we do not interpret
    return e;
  }
  function streamKey(variant, phase) { return variant + '|' + phase; }

  let archiveIdx = null;
  function index() {
    if (archiveIdx) return archiveIdx;
    const raw = callBridge('events', ['', '']);
    if (!Array.isArray(raw)) throw QueryError('bridge', '__trace.events("", "") did not return an array');
    const streams = new Map();
    const all = raw.map(decorateEvent);
    all.forEach(e => {
      const key = streamKey(e.variant, e.phase);
      if (!streams.has(key)) streams.set(key, { variant: e.variant, phase: e.phase, events: [], byOrdinal: new Map() });
      const s = streams.get(key);
      s.events.push(e); s.byOrdinal.set(e.ordinal, e);
    });
    streams.forEach(s => s.events.sort((x, y) => x.ordinal - y.ordinal));
    const variants = [], phases = [];
    streams.forEach(s => { if (variants.indexOf(s.variant) < 0) variants.push(s.variant); if (phases.indexOf(s.phase) < 0) phases.push(s.phase); });
    archiveIdx = { all, streams, variants: variants.sort(), phases: phases.sort() };
    return archiveIdx;
  }
  function stream(variant, phase) {
    const s = index().streams.get(streamKey(variant, phase));
    if (!s) throw unknownName('unknownPhase', 'phase', phase, phasesOf(variant), 'a.variant(' + JSON.stringify(variant) + ').events("middle")');
    return s;
  }
  function phasesOf(variant) {
    const out = []; index().streams.forEach(s => { if (s.variant === variant) out.push(s.phase); }); return out.sort();
  }
  const PHASE_ALIASES = { 'middle-end': 'middle', mid: 'middle', opt: 'middle', ir: 'middle',
    codegen: 'backend', llc: 'backend', machine: 'backend', 'back-end': 'backend' };
  function normalizePhase(variant, phase) {
    const valid = phasesOf(variant);
    if (valid.indexOf(phase) >= 0) return phase;
    if (PHASE_ALIASES[phase] && valid.indexOf(PHASE_ALIASES[phase]) >= 0) return PHASE_ALIASES[phase];
    throw unknownName('unknownPhase', 'phase', phase, valid);
  }

  // Strict view of a record for lambdas: reading a field that does not exist throws.
  function strictView(record, what, fields) {
    if (typeof Proxy !== 'function') return record;
    return new Proxy(record, {
      get(t, k) {
        if (typeof k === 'symbol' || k in t) return t[k];
        if (k === 'toJSON' || k === 'then' || k === 'inspect') return undefined;
        throw unknownName('unknownField', what + ' field', k, fields || Object.keys(t));
      },
    });
  }
  function project(record, fields, what) {
    const out = {};
    fields.forEach(f => {
      if (!(f in record)) throw unknownName('unknownField', what + ' field', f, Object.keys(record));
      out[f] = record[f];
    });
    return out;
  }
  function shortFn(fn) {
    const s = String(fn).replace(/\s+/g, ' ');
    return s.length > 60 ? s.slice(0, 57) + '...' : s;
  }

  // ───────────────────────── row plans (lazy, early-stopping) ─────────────────────────
  // A Rows plan yields records through each(ctx, visit); visit returns true to stop early, which
  // makes first() lazy: only the prefix needed for the answer is evaluated.
  class Rows extends Plan {
    constructor(kind, label, each, opts) {
      super(kind, label);
      this._each = each; this._opts = opts || {};
    }
    _unit() { return this._opts.unit || 'rows'; }
    _what() { return this._opts.what || 'row'; }
    _view(r) { return this._opts.view ? this._opts.view(r) : strictView(r, this._what()); }
    _derive(kind, label, each, extra) {
      return new Rows(kind, label, each, Object.assign({}, this._opts, extra || {}, { parent: this }));
    }
    _collect(ctx, limit) {
      const out = [];
      this._each(ctx, r => { out.push(r); return limit !== undefined && out.length >= limit; });
      return out;
    }
    where(pred, options) {
      if (typeof pred !== 'function')
        throw QueryError('badArgument', 'where(pred) takes a function of one ' + this._what(), { fix: '.where(e => e.pass === "EarlyCSEPass")' });
      const self = this, deps = (options && options.dependsOn) || [];
      return this._derive(this._kind, this._label + '.where(' + shortFn(pred) + ')', (ctx, visit) =>
        self._each(ctx, r => (pred(self._view(r), paramReader(ctx, deps)) ? visit(r) : false)), { filtered: true });
    }
    limit(n) {
      if (!(n >= 0)) throw QueryError('badArgument', 'limit(n) needs a non-negative number', { fix: '.limit(10)' });
      const self = this;
      return this._derive(this._kind, this._label + '.limit(' + n + ')', (ctx, visit) => {
        let k = 0;
        if (n === 0) return;
        self._each(ctx, r => { k++; return visit(r) || k >= n; });
      });
    }
    select() {
      const fields = Array.prototype.slice.call(arguments);
      const self = this;
      if (!fields.length) throw QueryError('badArgument', 'select needs field names', { fix: '.select("ordinal", "pass")' });
      // A projection is a plain row set: its records are no longer events, measurements or changes.
      return new Rows('rows', this._label + '.select(' + fields.join(', ') + ')',
        (ctx, visit) => self._each(ctx, r => visit(project(self._plain(r, fields), fields, self._what()))),
        { unit: this._unit(), what: this._what() + ' projection', parent: this });
    }
    table() { return this.select.apply(this, arguments); }
    // Guidance for shapes that belong to other plan kinds (they throw with the right chain).
    at() { throw QueryError('badArgument', 'at(ordinal) addresses events of a stream or timeline, not ' + this._label, { fix: 'run.events("middle").at(74) or row.timeline("middle").at(74)' }); }
    measure() { throw QueryError('badArgument', 'measure(metric) applies to an event selection or function timeline', { fix: 'row.timeline("middle").measure(metric)' }); }
    changes() { throw QueryError('badArgument', 'changes() follows timeline.measure(metric); filter events before measure() or filter change rows after changes()', { fix: 'row.timeline("middle").measure(metric).changes().where(c => …)' }); }
    _plain(r, fields) { return this._opts.plain ? this._opts.plain(r, fields) : r; }
    count() { return new CountPlan(this); }
    first() { return this._pick('first'); }
    last() { return this._pick('last'); }
    one() { return this._pick('one'); }
    _pick(mode) { return new PickPlan(this, mode); }
    list(options) { return runPlan(this, options).rows; }
    _eval(ctx) {
      const all = this._collect(ctx), shown = all.slice(0, ctx.maxRows).map(r => this._plain(r));
      const out = { kind: 'rows', of: this._label, unit: this._unit(), count: all.length, rows: shown };
      if (all.length > shown.length) { out.truncated = true; out.note = 'showing ' + shown.length + ' of ' + all.length + '; q.run(plan, { maxRows: n }) shows more'; }
      return out;
    }
  }
  class PickPlan extends Plan {
    constructor(rows, mode) { super('pick', rows._label + '.' + mode + '()'); this._rows = rows; this._mode = mode; }
    _resolve(ctx) {
      const rows = this._mode === 'first' ? this._rows._collect(ctx, 1)
        : this._mode === 'one' ? this._rows._collect(ctx, 2) : this._rows._collect(ctx);
      if (!rows.length) return { status: 'none', record: null };
      if (this._mode === 'one' && rows.length > 1) return { status: 'ambiguous', record: null, matches: this._rows._collect(ctx) };
      return { status: 'found', record: this._mode === 'last' ? rows[rows.length - 1] : rows[0] };
    }
    _eval(ctx) {
      const r = this._resolve(ctx);
      if (r.status === 'found') return this._rows._plain(r.record);
      if (r.status === 'ambiguous')
        return { kind: 'pick', status: 'ambiguous', of: this._label, count: r.matches.length,
          matches: r.matches.map(m => (m.ordinal !== undefined ? { ordinal: m.ordinal, header: m.header } : this._rows._plain(m))) };
      return { kind: 'pick', status: 'none', of: this._label, count: 0 };
    }
  }
  class CountPlan extends Plan {
    constructor(rows) { super('count', rows._label + '.count()'); this._rows = rows; }
    _eval(ctx) {
      const rows = this._rows._collect(ctx);
      const out = { kind: 'count', value: rows.length, unit: this._rows._unit(), of: this._rows._label };
      if (this._rows instanceof EventSelection && rows.length) {
        const by = new Map();
        rows.forEach(e => {
          const k = streamKey(e.variant, e.phase);
          if (!by.has(k)) by.set(k, { variant: e.variant, phase: e.phase, streamSHA: e.ref && e.ref.streamSHA, events: 0 });
          by.get(k).events++;
        });
        out.streams = by.size; out.byStream = Array.from(by.values());
      }
      return out;
    }
  }
  // ───────────────────────── prints (text) and lazily resolved scopes ─────────────────────────
  function eventKey(e) { return streamKey(e.variant, e.phase) + '|' + e.ordinal; }
  function printOf(e) {
    const key = eventKey(e);
    let t = cache.texts.get(key);
    if (t === undefined) {
      const raw = callBridge('text', [e.variant, e.phase, e.ordinal]);
      const print = typeof raw === 'string' ? raw : raw && (typeof raw.print === 'string' ? raw.print : raw.text);
      if (typeof print !== 'string')
        throw QueryError('bridge', '__trace.text(' + [e.variant, e.phase, e.ordinal].map(x => JSON.stringify(x)).join(', ') + ') returned no print');
      t = { header: raw && typeof raw.header === 'string' ? raw.header : e.header, print };
      cache.texts.set(key, t, (print.length + t.header.length) * 2);
    }
    return t;
  }
  const FN_NAME = '("(?:[^"\\\\]|\\\\.)*"|[-a-zA-Z$._0-9]+)';
  const DEFINE_RE = new RegExp('^define\\b[^@\\n]*@' + FN_NAME + '\\(', 'gm');
  function definedFunctions(print) {
    const out = []; let m;
    DEFINE_RE.lastIndex = 0;
    while ((m = DEFINE_RE.exec(print)) !== null) out.push(unquote(m[1]));
    return out;
  }
  const MACHINE_LINE_RE = /^# Machine code for function (.*?):(?: (.*))?$/m;
  function scopeFromPrint(print) {
    const mf = MACHINE_LINE_RE.exec(print);
    if (mf) return { kind: 'machineFunction', function: unquote(mf[1]), resolvedFrom: 'print' };
    const defs = definedFunctions(print);
    if (/^; ModuleID = /m.test(print) || defs.length > 1) return { kind: 'module', functions: defs, resolvedFrom: 'print' };
    if (defs.length === 1) return { kind: 'function', function: defs[0], resolvedFrom: 'print' };
    return { kind: 'unknown', resolvedFrom: 'print' };
  }
  const resolvedScopes = new Map();   // small: one entry per backend event whose header names no IR unit
  function resolveScope(e) {
    if (e.scope.kind !== 'unresolved') return e.scope;
    const key = eventKey(e);
    if (!resolvedScopes.has(key)) resolvedScopes.set(key, scopeFromPrint(printOf(e).print));
    return resolvedScopes.get(key);
  }
  function covers(e, fn) {
    const s = resolveScope(e);
    if (s.kind === 'function' || s.kind === 'machineFunction' || s.kind === 'loop') return s.function === fn;
    if (s.kind === 'cgscc') return s.functions.indexOf(fn) >= 0;
    if (s.kind === 'module') return true;            // whether the module defines fn is decided by the print
    return false;
  }
  // fields === true or a field list naming scope/function resolves a backend scope from its print;
  // bulk listings do not, so listing every event never reads every print.
  function plainEvent(e, fields) {
    const want = fields === true || (Array.isArray(fields) && (fields.indexOf('scope') >= 0 || fields.indexOf('function') >= 0));
    const scope = want ? resolveScope(e) : (resolvedScopes.get(eventKey(e)) || e.scope);
    const out = Object.assign({}, e, { scope: Object.assign({}, scope) });
    if (scope.kind === 'unresolved') out.scope.note = 'the header names no IR unit; select("scope") or a function timeline resolves it from the print';
    out.function = scope.function || null;
    return out;
  }
  function eventView(e) {
    if (typeof Proxy !== 'function') return plainEvent(e);
    return new Proxy(e, {
      get(t, k) {
        if (k === 'scope') return resolveScope(t);
        if (k === 'function') return resolveScope(t).function || null;
        if (typeof k === 'symbol' || k in t) return t[k];
        if (k === 'toJSON' || k === 'then' || k === 'inspect') return undefined;
        throw unknownName('unknownField', 'event field', k, Object.keys(t));
      },
    });
  }

  // ───────────────────────── event selections and timelines ─────────────────────────
  // domain = { variant, phase, fn } (null = wildcard). A function timeline keeps the original
  // stream ordinals; filtering never renumbers. `base` is the unfiltered selection, used for
  // adjacency (changes) and for explaining why an ordinal is not in a filtered selection.
  class EventSelection extends Rows {
    constructor(domain, label, each, base) {
      super('events', label, each || ((ctx, visit) => eachDomainEvent(domain, visit)),
        { unit: 'events', what: 'event', view: eventView, plain: plainEvent });
      this._domain = domain;
      this._base = base || this;
    }
    _derive(kind, label, each) { return new EventSelection(this._domain, label, each, this._base); }
    at(ordinal) { return new EventPick(this, 'at', ordinal); }
    _pick(mode) { return new EventPick(this, mode); }
    measure(metric) { return measureTimeline(this, metric); }
    ordinals() { return new OrdinalsPlan(this); }
  }
  function eachDomainEvent(d, visit) {
    const idx = index();
    const keys = [];
    idx.streams.forEach((s, k) => { if ((d.variant === null || s.variant === d.variant) && (d.phase === null || s.phase === d.phase)) keys.push(k); });
    keys.sort();
    for (let i = 0; i < keys.length; i++) {
      const events = idx.streams.get(keys[i]).events;
      for (let j = 0; j < events.length; j++) {
        if (d.fn !== null && !covers(events[j], d.fn)) continue;
        if (visit(events[j])) return;
      }
    }
  }
  class OrdinalsPlan extends Plan {
    constructor(sel) { super('ordinals', sel._label + '.ordinals()'); this._sel = sel; }
    _eval(ctx) { const o = this._sel._collect(ctx).map(e => e.ordinal); return { kind: 'ordinals', of: this._sel._label, count: o.length, ordinals: o }; }
  }
  class EventPick extends PickPlan {
    constructor(sel, mode, ordinal) {
      super(sel, mode);
      if (mode === 'at') {
        if (typeof ordinal !== 'number' || ordinal % 1 !== 0)
          throw QueryError('badArgument', 'at(ordinal) takes an integer stream ordinal; got ' + JSON.stringify(ordinal), { fix: '.at(74)' });
        this._label = sel._label + '.at(' + ordinal + ')';
      }
      this._ordinal = ordinal;
    }
    get after() { return new StatePlan(this, 'after'); }
    get before() { return new StatePlan(this, 'before'); }
    _function() { return this._rows._domain.fn; }
    _eval(ctx) {
      const r = this._resolve(ctx);
      return r.status === 'found' ? plainEvent(r.record, true) : super._eval(ctx);
    }
    _resolve(ctx) {
      if (this._mode !== 'at') return super._resolve(ctx);
      const d = this._rows._domain;
      if (d.variant === null || d.phase === null)
        throw QueryError('ambiguousStream', 'at(' + this._ordinal + ') needs one stream; ordinals restart at 0 in every variant and phase',
          { fix: 'a.variant("' + (index().variants[0] || 'checked') + '").events("middle").at(' + this._ordinal + ')' });
      const s = stream(d.variant, d.phase);
      const e = s.byOrdinal.get(this._ordinal);
      if (!e) {
        const first = s.events.length ? s.events[0].ordinal : null, last = s.events.length ? s.events[s.events.length - 1].ordinal : null;
        throw QueryError('ordinalOutOfRange', 'no event with ordinal ' + this._ordinal + ' in ' + d.variant + '/' + d.phase +
          ' (ordinals ' + first + '..' + last + ', ' + s.events.length + ' events)', { valid: [first, last] });
      }
      let inSelection = d.fn === null || covers(e, d.fn);
      if (inSelection && this._rows !== this._rows._base) {
        inSelection = false;
        this._rows._each(ctx, r => { if (r.ordinal === this._ordinal) inSelection = true; return r.ordinal >= this._ordinal; });
      }
      if (!inSelection)
        throw QueryError('notInSelection', 'ordinal ' + this._ordinal + ' exists in ' + d.variant + '/' + d.phase + ' (' + e.header +
          ') but is not in ' + this._rows._label, { fix: 'a.variant("' + d.variant + '").events("' + d.phase + '").at(' + this._ordinal + ') addresses the whole stream' });
      return { status: 'found', record: e };
    }
    _event(ctx) {
      const r = this._resolve(ctx);
      if (r.status === 'found') return r.record;
      if (r.status === 'ambiguous')
        throw QueryError('ambiguous', this._label + ' matched ' + r.matches.length + ' events (ordinals ' + r.matches.map(m => m.ordinal).join(', ') + ')',
          { fix: 'choose one with .at(ordinal) or .first()' });
      throw QueryError('noEvent', this._label + ' matched no event', { fix: 'inspect the selection with .select("ordinal", "pass", "scope")' });
    }
    select() {
      const fields = Array.prototype.slice.call(arguments), self = this;
      return new FnPlan('event', this._label + '.select(' + fields.join(', ') + ')',
        ctx => project(plainEvent(self._event(ctx), fields), fields, 'event'));
    }
    text() {
      const self = this;
      return new FnPlan('text', this._label + '.text()', ctx => {
        const e = self._event(ctx), t = printOf(e);
        return { kind: 'text', ordinal: e.ordinal, variant: e.variant, phase: e.phase, header: t.header, print: t.print, ref: e.ref };
      });
    }
  }
  class FnPlan extends Plan {
    constructor(kind, label, fn) { super(kind, label); this._fn = fn; }
    _eval(ctx) { return this._fn(ctx); }
  }

  // ───────────────────────── archive, runs, functions ─────────────────────────
  // Names come from headers; `deep` also resolves llc headers (which name no IR unit) from their prints.
  function knownFunctions(variant, deep) {
    const names = [];
    index().all.forEach(e => {
      if (e.variant !== variant) return;
      const s = deep ? resolveScope(e) : e.scope;
      (s.kind === 'cgscc' ? s.functions : s.function ? [s.function] : []).forEach(n => { if (names.indexOf(n) < 0) names.push(n); });
    });
    return names.sort();
  }
  class FunctionHandle {
    constructor(variant, name) { this.variant = variant; this.name = name; }
    timeline(phase) {
      const p = normalizePhase(this.variant, requireString(phase, 'timeline(phase)', 'row.timeline("middle")'));
      return new EventSelection({ variant: this.variant, phase: p, fn: this.name },
        'a.variant("' + this.variant + '").function("' + this.name + '").timeline("' + p + '")');
    }
    events(phase) { return this.timeline(phase); }
    argument(i) { return new ArgumentRef(this, i); }
    initialState() { return new InitialModule(this.variant).state(this.name); }
    help() { return helpText('function'); }
    toJSON() { return { function: this.name, variant: this.variant, use: 'row.timeline("middle"), row.argument(0)' }; }
  }
  class Run {
    constructor(name) { this.name = name; }
    phases() { return phasesOf(this.name).map(p => { const s = stream(this.name, p); return { phase: p, events: s.events.length, streamSHA: s.events.length && s.events[0].ref ? s.events[0].ref.streamSHA : null }; }); }
    events(phase) {
      if (phase === undefined) return new EventSelection({ variant: this.name, phase: null, fn: null }, 'a.variant("' + this.name + '").events()');
      const p = normalizePhase(this.name, requireString(phase, 'events(phase)'));
      return new EventSelection({ variant: this.name, phase: p, fn: null }, 'a.variant("' + this.name + '").events("' + p + '")');
    }
    functions() { return knownFunctions(this.name); }
    function(name) {
      requireString(name, 'function(name)', 'run.function("row")');
      let known = knownFunctions(this.name, false);
      if (known.indexOf(name) < 0) known = knownFunctions(this.name, true);
      if (known.indexOf(name) < 0) throw unknownName('unknownFunction', 'function in variant ' + this.name + ' (named by its event scopes)', name, known);
      return new FunctionHandle(this.name, name);
    }
    initialModule() { return new InitialModule(this.name); }
    remarks() { return new Remarks(this.name); }
    finalImage() { return new ImageRef(this.name); }
    help() { return helpText('run'); }
    toJSON() { return { variant: this.name, phases: this.phases() }; }
  }
  const archive = {
    events(phase) {
      if (phase === undefined) return new EventSelection({ variant: null, phase: null, fn: null }, 'a.events()');
      const p = requireString(phase, 'a.events(phase)');
      if (index().phases.indexOf(p) < 0) throw unknownName('unknownPhase', 'phase', p, index().phases);
      return new EventSelection({ variant: null, phase: p, fn: null }, 'a.events("' + p + '")');
    },
    variants() { return index().variants.map(v => ({ variant: v, phases: new Run(v).phases() })); },
    variant(name) {
      if (name === undefined) throw QueryError('badArgument', 'variant(name) needs a name; variants: ' + index().variants.join(', '), { fix: 'a.variant("' + index().variants[0] + '")' });
      if (index().variants.indexOf(name) < 0) throw unknownName('unknownVariant', 'variant', name, index().variants);
      return new Run(name);
    },
    streams() {
      const out = [];
      index().streams.forEach(s => out.push({ variant: s.variant, phase: s.phase, events: s.events.length,
        streamSHA: s.events.length && s.events[0].ref ? s.events[0].ref.streamSHA : null }));
      return out;
    },
    stats() { return callBridge('stats', []); },
    help() { return helpText('archive'); },
    toJSON() { return { archive: 'PicoCalc LLVM row archive', variants: index().variants, use: 'a.help()' }; },
  };

  // ───────────────────────── LLVM IR subset parser ─────────────────────────
  // Recognized: one `define … @f(…) … {` line, body lines up to a line that is exactly `}`,
  // block labels, `#dbg_*` debug records, and instruction lines whose opcode is in OPCODES
  // (with switch case lists and landingpad clauses as continuation lines). Anything else in a
  // function body is reported as unsupported, which makes every IR metric on it unsupported.
  const OPCODES = ['ret', 'br', 'switch', 'indirectbr', 'invoke', 'callbr', 'resume', 'unreachable', 'cleanupret',
    'catchret', 'catchswitch', 'fneg', 'add', 'fadd', 'sub', 'fsub', 'mul', 'fmul', 'udiv', 'sdiv', 'fdiv', 'urem',
    'srem', 'frem', 'shl', 'lshr', 'ashr', 'and', 'or', 'xor', 'extractelement', 'insertelement', 'shufflevector',
    'extractvalue', 'insertvalue', 'alloca', 'load', 'store', 'fence', 'cmpxchg', 'atomicrmw', 'getelementptr',
    'trunc', 'zext', 'sext', 'fptrunc', 'fpext', 'fptoui', 'fptosi', 'uitofp', 'sitofp', 'ptrtoint', 'inttoptr',
    'bitcast', 'addrspacecast', 'icmp', 'fcmp', 'phi', 'select', 'freeze', 'call', 'va_arg', 'landingpad',
    'catchpad', 'cleanuppad'];
  const BINOPS = ['add', 'fadd', 'sub', 'fsub', 'mul', 'fmul', 'udiv', 'sdiv', 'fdiv', 'urem', 'srem', 'frem',
    'shl', 'lshr', 'ashr', 'and', 'or', 'xor'];
  const CASTS = ['trunc', 'zext', 'sext', 'fptrunc', 'fpext', 'fptoui', 'fptosi', 'uitofp', 'sitofp', 'ptrtoint',
    'inttoptr', 'bitcast', 'addrspacecast'];
  const MEMORY_OPS = ['load', 'store', 'atomicrmw', 'cmpxchg'];

  function stripComment(line) {
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') quoted = !quoted;
      else if (c === ';' && !quoted) return line.slice(0, i);
    }
    return line;
  }
  const OPEN = '([{<', CLOSE = ')]}>';
  function matchBracket(s, i) {
    let depth = 0, quoted = false;
    for (let k = i; k < s.length; k++) {
      const c = s[k];
      if (c === '"') { quoted = !quoted; continue; }
      if (quoted) continue;
      if (OPEN.indexOf(c) >= 0) depth++;
      else if (CLOSE.indexOf(c) >= 0 && --depth === 0) return k;
    }
    return -1;
  }
  function splitTopLevel(s) {
    const parts = []; let depth = 0, quoted = false, start = 0;
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (c === '"') { quoted = !quoted; continue; }
      if (quoted) continue;
      if (OPEN.indexOf(c) >= 0) depth++;
      else if (CLOSE.indexOf(c) >= 0) depth--;
      else if (c === ',' && depth === 0) { parts.push(s.slice(start, k).trim()); start = k + 1; }
    }
    parts.push(s.slice(start).trim());
    return parts;
  }
  const PRIMITIVE_TYPE = /^(i\d+|half|bfloat|float|double|fp128|x86_fp80|ppc_fp128|x86_amx|void|label|token|metadata)(?![\w.])/;
  // Reads one type at s[pos…]; returns { type, end, typedPointer } or null.
  function readType(s, pos) {
    let k = pos;
    while (s[k] === ' ') k++;
    const rest = s.slice(k);
    let type = null, end = k, m;
    if ((m = /^ptr(?: addrspace\(\d+\))?(?![\w.])/.exec(rest))) { type = m[0]; end = k + m[0].length; }
    else if ((m = PRIMITIVE_TYPE.exec(rest))) { type = m[0]; end = k + m[0].length; }
    else if ('<[{'.indexOf(rest[0]) >= 0) {
      const close = matchBracket(s, k);
      if (close < 0) return null;
      type = s.slice(k, close + 1).replace(/\s+/g, ' '); end = close + 1;
    } else if ((m = /^%(?:"[^"]*"|[-a-zA-Z$._][-a-zA-Z$._0-9]*)/.exec(rest))) { type = m[0]; end = k + m[0].length; }
    else return null;
    let typedPointer = false;
    while (s[end] === '*') { type += '*'; end++; typedPointer = true; }
    return { type, end, typedPointer };
  }
  function typedOperand(part) {
    const t = readType(part, 0);
    if (!t) return null;
    return { type: t.type, value: part.slice(t.end).trim(), typedPointer: t.typedPointer };
  }
  const FLAG_WORDS = /^(nuw|nsw|exact|disjoint|nneg|samesign|inbounds|nusw|fast|nnan|ninf|nsz|arcp|contract|afn|reassoc)\s+/;
  function skipFlags(s) { let m, t = s; while ((m = FLAG_WORDS.exec(t))) t = t.slice(m[0].length); return t; }

  const RESULT_RE = /^(%(?:"[^"]*"|[-a-zA-Z$._0-9]+))\s*=\s*/;
  function parseInstruction(code) {
    let rest = code, result = null, prefix = null;
    const m = RESULT_RE.exec(rest);
    if (m) { result = m[1]; rest = rest.slice(m[0].length); }
    let tok = /^\S+/.exec(rest);
    if (!tok) return null;
    if (tok[0] === 'tail' || tok[0] === 'musttail' || tok[0] === 'notail') {
      prefix = tok[0]; rest = rest.slice(tok[0].length).trim(); tok = /^\S+/.exec(rest);
      if (!tok || tok[0] !== 'call') return null;
    }
    if (OPCODES.indexOf(tok[0]) < 0) return null;
    return { opcode: tok[0], result, prefix, operands: rest.slice(tok[0].length).trim() };
  }
  function findDefine(lines, fn) {
    const re = new RegExp('^define\\b[^@]*@' + FN_NAME + '\\(');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].lastIndexOf('define', 0) !== 0) continue;
      const m = re.exec(lines[i]);
      if (m && unquote(m[1]) === fn) return i;
    }
    return -1;
  }
  function parseParams(defineLine) {
    const at = defineLine.indexOf('@');
    const open = defineLine.indexOf('(', at);
    const close = open < 0 ? -1 : matchBracket(defineLine, open);
    if (close < 0) return null;
    const inner = defineLine.slice(open + 1, close).trim();
    if (!inner) return [];
    return splitTopLevel(inner).map((p, i) => {
      if (p === '...') return { index: i, varargs: true, type: null, name: null };
      const t = readType(p, 0);
      const words = p.split(/\s+/);
      const last = words[words.length - 1];
      return { index: i, type: t ? t.type : null, name: /^%/.test(last) ? last : null,
        attributes: t ? p.slice(t.end).trim().split(/\s+/).filter(w => w && !/^%/.test(w)) : [] };
    });
  }
  // Function body → { instructions, blocks, unsupported, debugRecords }. Line numbers are 1-based in the print.
  function parseBody(lines, firstLineNo) {
    const instructions = [], blocks = [], unsupported = [];
    let debugRecords = 0, block = null, continuation = null;
    for (let i = 0; i < lines.length; i++) {
      const lineNo = firstLineNo + i;
      const code = stripComment(lines[i]).trim();
      if (!code) continue;
      const last = instructions[instructions.length - 1];
      if (continuation === 'switch') { last.text += ' ' + code; if (code.indexOf(']') >= 0) continuation = null; continue; }
      if (continuation === 'landingpad') {
        if (/^(catch|filter|cleanup)\b/.test(code)) { last.text += ' ' + code; continue; }
        continuation = null;
      }
      let m;
      if ((m = /^("[^"]*"|[-a-zA-Z$._0-9]+):$/.exec(code))) { block = unquote(m[1]); blocks.push({ name: block, line: lineNo }); continue; }
      if (/^#dbg_\w+\(/.test(code)) { debugRecords++; continue; }
      const inst = parseInstruction(code);
      if (!inst) { unsupported.push({ line: lineNo, text: code, reason: 'not a recognized instruction, label or debug record' }); continue; }
      if (block === null) { block = '<entry>'; blocks.push({ name: block, line: lineNo, implicit: true }); }
      inst.text = code; inst.line = lineNo; inst.block = block; inst.index = instructions.length;
      instructions.push(inst);
      if (inst.opcode === 'switch' && code.indexOf(']') < 0) continuation = 'switch';
      if (inst.opcode === 'landingpad') continuation = 'landingpad';
    }
    if (continuation === 'switch') unsupported.push({ line: firstLineNo + lines.length - 1, text: '', reason: 'unterminated switch case list' });
    return { instructions, blocks, unsupported, debugRecords };
  }

  // Operand facts derived from one instruction (only for the forms recognized here).
  function memoryAccess(inst) {
    if (MEMORY_OPS.indexOf(inst.opcode) < 0) return null;
    let s = inst.operands, m;
    while ((m = /^(atomic|volatile|weak)\s+/.exec(s))) s = s.slice(m[0].length);
    const parts = splitTopLevel(s);
    let ptrPart, valueType = null;
    if (inst.opcode === 'load') {
      const t = readType(parts[0] || '', 0);
      if (!t || t.end !== parts[0].length) return { error: 'load value type not recognized' };
      valueType = t.type; ptrPart = parts[1];
    } else if (inst.opcode === 'store') {
      const v = typedOperand(parts[0] || '');
      if (!v) return { error: 'store value operand not recognized' };
      valueType = v.type; ptrPart = parts[1];
    } else if (inst.opcode === 'atomicrmw') {
      ptrPart = (parts[0] || '').replace(/^\S+\s+/, '');
      const v = typedOperand(parts[1] || '');
      valueType = v ? v.type : null;
    } else {
      ptrPart = parts[0];
      const v = typedOperand(parts[1] || '');
      valueType = v ? v.type : null;
    }
    const p = typedOperand(ptrPart || '');
    if (!p) return { error: inst.opcode + ' pointer operand not recognized' };
    if (p.typedPointer || !/^ptr\b/.test(p.type)) return { error: 'typed pointers (' + p.type + ') are not supported; this release reads opaque `ptr` IR' };
    return { valueType, pointerType: p.type, pointer: p.value.split(/\s+/)[0] };
  }
  function lastTopLevelTo(s) {
    let depth = 0, found = -1;
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (OPEN.indexOf(c) >= 0) depth++;
      else if (CLOSE.indexOf(c) >= 0) depth--;
      else if (depth === 0 && s.substr(k, 4) === ' to ') found = k;
    }
    return found;
  }
  const CALL_PREFIX = /^(fast|nnan|ninf|nsz|arcp|contract|afn|reassoc|ccc|fastcc|coldcc|tailcc|swiftcc|swifttailcc|cc \d+|cc\d+|\w+_cc|\w+cc|noundef|zeroext|signext|inreg|noalias|nonnull|dereferenceable(?:_or_null)?\(\d+\)|align \d+|range\([^)]*\)|nofpclass\([^)]*\)|addrspace\(\d+\))\s+/;
  function callReturnType(s) {
    let t = s, m;
    while ((m = CALL_PREFIX.exec(t)) && !PRIMITIVE_TYPE.test(t) && !/^ptr\b/.test(t)) t = t.slice(m[0].length);
    const ty = readType(t, 0);
    if (!ty) return { error: 'call return type not recognized' };
    let k = ty.end;
    while (t[k] === ' ') k++;
    if (t[k] === '(') { const close = matchBracket(t, k); if (close < 0) return { error: 'call function type not recognized' }; k = close + 1; }
    while (t[k] === ' ') k++;
    if ('@%'.indexOf(t[k]) < 0 && t.substr(k, 3) !== 'asm') return { error: 'call callee not recognized' };
    return { type: ty.type };
  }
  // Result type of an instruction's value: { type } (null when it defines no value) or { error }.
  function resultTypeOf(inst) {
    if (!inst.result) return { type: null };
    const op = inst.opcode, s = inst.operands;
    if (op === 'load') { const acc = memoryAccess(inst); return acc.error ? acc : { type: acc.valueType }; }
    if (BINOPS.indexOf(op) >= 0 || op === 'fneg' || op === 'phi' || op === 'freeze') {
      const t = readType(skipFlags(s), 0); return t ? { type: t.type } : { error: op + ' type not recognized' };
    }
    if (op === 'icmp' || op === 'fcmp') {
      const t = readType(skipFlags(s).replace(/^\S+\s+/, ''), 0);
      if (!t) return { error: op + ' operand type not recognized' };
      const v = /^<(vscale x )?(\d+) x /.exec(t.type);
      return { type: v ? '<' + (v[1] || '') + v[2] + ' x i1>' : 'i1' };
    }
    if (op === 'select') {
      const parts = splitTopLevel(skipFlags(s)); const t = parts[1] ? readType(parts[1], 0) : null;
      return t ? { type: t.type } : { error: 'select operand type not recognized' };
    }
    if (CASTS.indexOf(op) >= 0) {
      const k = lastTopLevelTo(s); const t = k >= 0 ? readType(s, k + 4) : null;
      return t ? { type: t.type } : { error: op + ' destination type not recognized' };
    }
    if (op === 'alloca') { const a = /addrspace\((\d+)\)/.exec(s); return { type: a ? 'ptr addrspace(' + a[1] + ')' : 'ptr' }; }
    if (op === 'getelementptr') {
      const parts = splitTopLevel(skipFlags(s)); const base = typedOperand(parts[1] || '');
      if (!base || !/^ptr\b/.test(base.type) || parts.some(p => /^</.test(p))) return { error: 'getelementptr form not recognized (vector GEPs are unsupported)' };
      return { type: base.type };
    }
    if (op === 'call' || op === 'invoke') return callReturnType(s);
    return { error: 'the result type of ' + op + ' is not derived by this release' };
  }

  // ───────────────────────── snapshots: one function in one print ─────────────────────────
  // status: 'available' | 'absent' (a complete module print does not define the function) |
  //         'unavailable' (the capture does not contain it in full) | 'unsupported' (parser limit).
  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function printKind(print) {
    if (MACHINE_LINE_RE.test(print)) return 'machine';
    if (/^; ModuleID = /m.test(print)) return 'module';
    if (/^; (Preheader|Loop):\s*$/m.test(print)) return 'loop';
    return definedFunctions(print).length ? 'functions' : 'fragment';
  }
  function sourceWitness(e) {
    return { variant: e.variant, phase: e.phase, ordinal: e.ordinal, pass: e.pass, header: e.header, ref: e.ref };
  }
  const UNAVAILABLE_WHY = {
    loopFragment: 'the print is a loop fragment; whole-function metrics need a function or module print',
    machineCodePrint: 'the print is machine code (MIR); IR metrics do not apply — use q.machine…',
    functionNotInPrint: 'the print shows other functions only',
    noFunctionInPrint: 'the print contains no function definition',
    functionNotClosed: 'the define line has no closing "}" line in this print',
    notDefinedInModule: 'a complete module print does not define the function (absent, not missing)',
    declaredNotDefined: 'the module only declares the function (absent body, not missing capture)',
    noEarlierPrint: 'no earlier print of this function exists in the stream',
    irPrintNotMachineCode: 'the backend print is LLVM IR, not machine code; machine properties need a MIR print',
    otherMachineFunction: 'the print is the machine code of another function',
  };
  function cacheSnapshot(key, build) {
    const hit = cache.snapshots.get(key);
    if (hit !== undefined) return hit;
    const snap = build();
    snap.key = key;
    return cache.snapshots.set(key, snap, snap.approxBytes || 512);
  }
  function irSnapshot(e, fn) {
    return cacheSnapshot(eventKey(e) + '|ir|' + fn, () => buildIrSnapshot(sourceWitness(e), fn, printOf(e).print));
  }
  function buildIrSnapshot(source, fn, print) {
    const base = { fn, level: 'ir', source };
    const kind = printKind(print);
    const lines = print.split('\n');
    const at = kind === 'machine' ? -1 : findDefine(lines, fn);
    if (at < 0) {
      if (kind === 'module') {
        const declared = new RegExp('^declare\\b[^@\\n]*@"?' + escapeRe(fn) + '"?\\(', 'm').test(print);
        const reason = declared ? 'declaredNotDefined' : 'notDefinedInModule';
        return Object.assign(base, { status: 'absent', coverage: 'module', reason, why: UNAVAILABLE_WHY[reason] });
      }
      const reason = kind === 'machine' ? 'machineCodePrint' : kind === 'loop' ? 'loopFragment'
        : kind === 'functions' ? 'functionNotInPrint' : 'noFunctionInPrint';
      return Object.assign(base, { status: 'unavailable', coverage: kind, reason, why: UNAVAILABLE_WHY[reason] });
    }
    let end = -1;
    for (let i = at + 1; i < lines.length; i++) {
      if (lines[i].replace(/\s+$/, '') === '}') { end = i; break; }
      if (lines[i].lastIndexOf('define', 0) === 0) break;
    }
    if (end < 0 || !/\{\s*$/.test(stripComment(lines[at])))
      return Object.assign(base, { status: 'unavailable', coverage: 'truncated', reason: 'functionNotClosed', why: UNAVAILABLE_WHY.functionNotClosed });
    const params = parseParams(lines[at]);
    const body = parseBody(lines.slice(at + 1, end), at + 2);
    let bytes = 0;
    for (let i = at; i <= end; i++) bytes += lines[i].length * 2 + 64;
    return Object.assign(base, {
      status: body.unsupported.length || !params ? 'unsupported' : 'available',
      reason: body.unsupported.length ? 'unrecognizedLines' : !params ? 'unrecognizedDefine' : null,
      coverage: kind === 'module' ? 'module' : 'function',
      define: { line: at + 1, text: lines[at].trim() }, lineRange: [at + 1, end + 1], params: params || [],
      blocks: body.blocks, instructions: body.instructions, debugRecords: body.debugRecords,
      unsupportedLines: body.unsupported, functionText: lines.slice(at, end + 1).join('\n'), approxBytes: bytes * 2,
    });
  }
  function machineSnapshot(e, fn) {
    return cacheSnapshot(eventKey(e) + '|mir|' + fn, () => {
      const base = { fn, level: 'machine', source: sourceWitness(e) };
      const lines = printOf(e).print.split('\n');
      let other = null;
      for (let i = 0; i < lines.length; i++) {
        const m = /^# Machine code for function (.*?):(?: (.*))?$/.exec(lines[i]);
        if (!m) continue;
        if (unquote(m[1]) !== fn) { other = other || unquote(m[1]); continue; }
        const properties = (m[2] || '').split(',').map(x => x.trim()).filter(x => x);
        const complete = lines.some(l => l.trim() === '# End machine code for function ' + m[1] + '.');
        return Object.assign(base, { status: 'available', coverage: complete ? 'machineFunction' : 'machineHeader',
          properties, propertyLine: { line: i + 1, text: lines[i] }, complete });
      }
      const reason = other ? 'otherMachineFunction' : definedFunctions(lines.join('\n')).length ? 'irPrintNotMachineCode' : 'noFunctionInPrint';
      return Object.assign(base, { status: 'unavailable', coverage: other ? 'machine' : 'ir', reason, why: UNAVAILABLE_WHY[reason], otherFunction: other });
    });
  }
  function stateWitness(snap) {
    const w = Object.assign({}, snap.source || {}, { function: snap.fn, side: snap.side || 'after', coverage: snap.coverage || null });
    if (snap.derivedFrom !== undefined) { w.derivedFrom = snap.derivedFrom; w.of = snap.of; }
    if (snap.lineRange) w.lineRange = snap.lineRange;
    return w;
  }

  // ───────────────────────── states (the program after / before an event) ─────────────────────────
  function chooseFunction(domainFn, hintFn, scope, label, optional) {
    if (domainFn && hintFn && domainFn !== hintFn)
      throw QueryError('functionMismatch', label + ' belongs to function ' + domainFn + ' but the metric is about ' + hintFn,
        { fix: 'measure ' + hintFn + ' on its own timeline: run.function("' + hintFn + '").timeline(…)' });
    if (domainFn || hintFn) return domainFn || hintFn;
    if (scope && scope.function) return scope.function;
    if (optional) return null;
    throw QueryError('needFunction', label + ' is not tied to one function (event scope: ' + (scope ? scope.kind : 'unknown') + ')',
      { fix: 'start from a function timeline: a.variant("…").function("row").timeline("middle").at(n).after' });
  }
  class StatePlan extends Plan {
    constructor(pick, side) {
      super('state', pick._label + '.' + side);
      this._pick = pick; this._side = side;
    }
    _target(ctx, fnHint, optionalFn) {
      const e = this._pick._event(ctx);
      const fn = chooseFunction(this._pick._function(), fnHint, resolveScope(e), this._label, optionalFn);
      if (this._side === 'after' || fn === null) return { event: e, fn, of: e };
      const events = stream(e.variant, e.phase).events;
      let prev = null;
      for (let i = 0; i < events.length && events[i].ordinal < e.ordinal; i++) if (covers(events[i], fn)) prev = events[i];
      return { event: prev, fn, of: e, derived: true };
    }
    _snapshot(ctx, fnHint, level) {
      const t = this._target(ctx, fnHint);
      if (!t.event)
        return { status: 'unavailable', reason: 'noEarlierPrint', why: UNAVAILABLE_WHY.noEarlierPrint, fn: t.fn, level,
          side: 'before', of: t.of.ordinal, source: sourceWitness(t.of), fix: 'a.variant("' + t.of.variant + '").initialModule() is the module given to the pipeline' };
      const snap = level === 'machine' ? machineSnapshot(t.event, t.fn) : irSnapshot(t.event, t.fn);
      return t.derived ? Object.assign({}, snap, { side: 'before', derivedFrom: t.event.ordinal, of: t.of.ordinal }) : snap;
    }
    _eval(ctx) {
      const snap = this._snapshot(ctx, null, 'ir');
      const out = { kind: 'state', status: snap.status, reason: snap.reason || null, state: stateWitness(snap) };
      if (snap.why) out.why = snap.why;
      if (snap.instructions) { out.instructions = snap.instructions.length; out.blocks = snap.blocks.length; out.arguments = snap.params.map(p => ({ index: p.index, type: p.type, name: p.name })); }
      if (snap.unsupportedLines && snap.unsupportedLines.length) out.unsupportedLines = snap.unsupportedLines.slice(0, 10);
      return out;
    }
    excerpt(options) { return new ExcerptPlan(this, options || {}); }
    text(options) {
      const self = this, maxLines = (options && options.maxLines) || 400;
      return new FnPlan('text', this._label + '.text()', ctx => {
        const t = self._target(ctx, null, true);
        if (!t.event) return { kind: 'text', status: 'unavailable', reason: 'noEarlierPrint' };
        const snap = t.fn ? irSnapshot(t.event, t.fn) : null;
        const text = snap && snap.functionText ? snap.functionText : printOf(t.event).print;
        const lines = text.split('\n');
        return { kind: 'text', scope: snap && snap.functionText ? 'function' : 'print', function: t.fn, source: sourceWitness(t.event),
          lineRange: snap && snap.lineRange ? snap.lineRange : [1, lines.length], truncated: lines.length > maxLines,
          text: lines.slice(0, maxLines).join('\n') };
      });
    }
    instructions() { return new InstructionQuery([], this); }
  }
  function utf8Length(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) n += 1; else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; } else n += 3;
    }
    return n;
  }
  // Stream byte offset of the print's first byte, only when ref.start/end make it certain.
  function printBase(e, t) {
    const r = e.ref;
    if (!r || typeof r.start !== 'number' || typeof r.end !== 'number') return null;
    const span = r.end - r.start;
    if (utf8Length(t.print) === span) return { offset: r.start, basis: 'ref span equals print bytes' };
    const head = t.header + '\n';
    if (utf8Length(head + t.print) === span) return { offset: r.start + utf8Length(head), basis: 'ref span equals header line + print bytes' };
    return null;
  }
  class ExcerptPlan extends Plan {
    constructor(state, opts) {
      if (typeof opts.contains !== 'string' && !(opts.matches instanceof RegExp))
        throw QueryError('badArgument', 'excerpt needs { contains: "text" } or { matches: /re/ }', { fix: '.excerpt({ contains: "load i32, ptr %work" })' });
      super('excerpt', state._label + '.excerpt(' + JSON.stringify(opts.contains !== undefined ? opts.contains : String(opts.matches)) + ')');
      this._state = state; this._opts = opts;
    }
    _eval(ctx) {
      const o = this._opts, t = this._state._target(ctx, null, true);
      if (!t.event) return { kind: 'excerpt', status: 'unavailable', reason: 'noEarlierPrint' };
      const text = printOf(t.event), lines = text.print.split('\n');
      const snap = t.fn ? irSnapshot(t.event, t.fn) : null;
      const useFn = o.scope !== 'print' && snap && snap.lineRange;
      const from = useFn ? snap.lineRange[0] : 1, to = useFn ? snap.lineRange[1] : lines.length;
      const base = printBase(t.event, text), ctxLines = o.context || 0, max = o.max || 50;
      const hits = []; let total = 0, offset = 0;
      for (let i = 0; i < lines.length; i++) {
        const n = i + 1, line = lines[i];
        if (n >= from && n <= to) {
          const col = o.contains !== undefined ? line.indexOf(o.contains) : line.search(o.matches);
          if (col >= 0) {
            total++;
            if (hits.length < max) {
              const inPrint = offset + utf8Length(line.slice(0, col));
              const hit = { line: n, column: col + 1, text: line, offsetInPrint: inPrint, streamOffset: base ? base.offset + inPrint : null };
              if (ctxLines) hit.context = lines.slice(Math.max(0, i - ctxLines), i + ctxLines + 1);
              hits.push(hit);
            }
          }
        }
        offset += utf8Length(line) + 1;
      }
      return { kind: 'excerpt', status: 'available', query: o.contains !== undefined ? { contains: o.contains } : { matches: String(o.matches) },
        scope: useFn ? 'function ' + t.fn : 'whole print', searchedLines: [from, to], hitCount: total, hits, truncated: total > hits.length,
        source: sourceWitness(t.event), offsetBasis: base ? base.basis : 'stream offset not derivable from ref; offsets are within the print',
        note: 'a text search over printed IR; printed local names are not operand identities' };
    }
  }

  // ───────────────────────── value references and metrics ─────────────────────────
  class ArgumentRef {
    constructor(fnHandle, i) {
      if (typeof i !== 'number' || i < 0 || i % 1 !== 0) throw QueryError('badArgument', 'argument(i) takes a 0-based integer', { fix: 'row.argument(0)' });
      this.fn = fnHandle.name; this.variant = fnHandle.variant; this.index = i;
    }
    key() { return 'arg(' + this.fn + ',' + this.index + ')'; }
    describe() { return this.fn + '.argument(' + this.index + ')'; }
    toJSON() { return { argument: this.index, function: this.fn }; }
    resolve(snap) {
      if (snap.fn !== this.fn) throw QueryError('functionMismatch', this.describe() + ' cannot be resolved in a snapshot of ' + snap.fn);
      const p = snap.params[this.index];
      if (!p) throw QueryError('noSuchArgument', this.fn + ' has ' + snap.params.length + ' parameters in this snapshot: ' + snap.params.map(x => x.name).join(', '));
      if (!p.name) throw QueryError('unsupported', 'parameter ' + this.index + ' of ' + this.fn + ' has no printed name in ' + snap.define.text);
      return p.name;
    }
  }
  class Metric {
    // spec: { key, label, unit, valueType: 'count'|'boolean'|'set'|'sites', level: 'ir'|'machine', fn, compute(snap) }
    constructor(spec) { this._spec = spec; }
    at(state) {
      if (state instanceof EventPick) state = state.after;      // an event's print is the state after it
      if (!(state instanceof StatePlan))
        throw QueryError('badArgument', 'metric.at(state) takes a state such as middle.at(74).after; got ' + describeValue(state), { fix: 'metric.at(row.timeline("middle").at(74).after)' });
      return new MetricAt(this, state, null);
    }
    label(text) { return new Metric(Object.assign({}, this._spec, { label: String(text) })); }
    describe() { return this._spec.label; }
    help() { return helpText('metrics'); }
    toJSON() { return { metric: this._spec.label, unit: this._spec.unit, valueType: this._spec.valueType, use: 'metric.at(state) or timeline.measure(metric)' }; }
    toString() { return '[metric ' + this._spec.label + ']'; }
  }
  function describeValue(v) {
    if (v instanceof Plan) return 'a plan (' + v._kind + ': ' + v._label + ')';
    if (v === null) return 'null';
    return typeof v === 'object' ? 'an object with keys ' + Object.keys(v).slice(0, 6).join(', ') : typeof v + ' ' + JSON.stringify(v);
  }
  function computeMetric(metric, snap) {
    const k = snap.key + '#' + metric._spec.key;
    const hit = cache.values.get(k);
    if (hit !== undefined) return hit;
    return cache.values.set(k, metric._spec.compute(snap));
  }
  class MetricAt extends Plan {
    constructor(metric, state, requirement) {
      super('measurement', metric._spec.label + '.at(' + state._label + ')' + (requirement ? '.requireCoverage("' + requirement + '")' : ''));
      this._metric = metric; this._state = state; this._req = requirement;
    }
    requireCoverage(kind) {
      const valid = this._metric._spec.level === 'machine' ? ['machineFunction'] : ['function', 'module'];
      if (valid.indexOf(kind) < 0) throw unknownName('unknownCoverage', 'coverage', kind, valid);
      return new MetricAt(this._metric, this._state, kind);
    }
    _eval(ctx) {
      const m = this._metric._spec;
      const snap = this._state._snapshot(ctx, m.fn, m.level);
      const out = { kind: 'measurement', metric: m.label, definition: m.key, unit: m.unit, valueType: m.valueType, state: stateWitness(snap) };
      if (snap.status !== 'available') {
        Object.assign(out, { status: snap.status, value: null, reason: snap.reason, why: snap.why || null });
        if (snap.unsupportedLines) out.unsupportedLines = snap.unsupportedLines.slice(0, 10);
        if (snap.fix) out.fix = snap.fix;
        return out;
      }
      if (this._req === 'module' && snap.coverage !== 'module')
        return Object.assign(out, { status: 'unavailable', value: null, reason: 'coverageNotModule', why: 'the print covers the function only, not the module' });
      if (this._req === 'machineFunction' && snap.coverage !== 'machineFunction')
        return Object.assign(out, { status: 'unavailable', value: null, reason: 'machineFunctionIncomplete', why: 'the print has the property line but no "# End machine code" line' });
      const v = computeMetric(this._metric, snap);
      return Object.assign(out, v, { coverageRequired: this._req || (m.level === 'ir' ? 'function' : 'machine property line') });
    }
  }
  function witnessOf(inst) { return { line: inst.line, block: inst.block, text: inst.text }; }
  const MAX_WITNESSES = 64;
  // Filters are declarative records; their `key` is the cache identity of the metric definition.
  function instructionMetric(filters, valueType) {
    const key = 'ir.instructions(' + filters.map(f => f.key).join(',') + ').' + valueType;
    const label = 'q.ir.instructions()' + filters.map(f => f.label).join('') + (valueType === 'count' ? '.count()' : '.sites()');
    const fns = filters.filter(f => f.ref).map(f => f.ref.fn);
    if (fns.some(f => f !== fns[0])) throw QueryError('functionMismatch', 'one metric refers to arguments of different functions: ' + fns.join(', '));
    return new Metric({ key, label, unit: 'static instruction sites', valueType, level: 'ir', fn: fns[0] || null, filters,
      compute: snap => {
        if (snap.unsupportedLines.length)
          return { status: 'unsupported', value: null, reason: 'unrecognizedLines', unsupportedLines: snap.unsupportedLines.slice(0, 10) };
        const matches = [], unsupported = [], resolved = {};
        snap.instructions.forEach(inst => {
          for (let i = 0; i < filters.length; i++) {
            const r = filters[i].test(inst, snap, resolved);
            if (r !== true) { if (r && r.error) unsupported.push(Object.assign(witnessOf(inst), { reason: r.error })); return; }
          }
          matches.push(inst);
        });
        if (unsupported.length)
          return { status: 'unsupported', value: null, reason: 'unrecognizedOperands', unsupported: unsupported.slice(0, 10), recognizedMatches: matches.length };
        const witnesses = matches.slice(0, MAX_WITNESSES).map(witnessOf);
        return { status: 'available', value: valueType === 'count' ? matches.length : witnesses, count: matches.length,
          resolved, witnesses: valueType === 'count' ? witnesses : undefined, witnessesTruncated: matches.length > MAX_WITNESSES };
      } });
  }
  class InstructionQuery {
    constructor(filters, state) { this._filters = filters; this._state = state || null; }
    _with(f) { return new InstructionQuery(this._filters.concat([f]), this._state); }
    opcode() {
      const ops = Array.prototype.concat.apply([], Array.prototype.slice.call(arguments));
      if (!ops.length) throw QueryError('badArgument', 'opcode(name, …) needs at least one LLVM opcode', { fix: '.opcode("load")' });
      ops.forEach(op => { if (OPCODES.indexOf(op) < 0) throw unknownName('unknownOpcode', 'LLVM opcode', op, OPCODES); });
      return this._with({ key: 'opcode=' + ops.join('|'), label: '.opcode(' + ops.map(o => JSON.stringify(o)).join(', ') + ')',
        test: inst => ops.indexOf(inst.opcode) >= 0 });
    }
    resultType(type) {
      const t = typeof type === 'string' ? readType(type.trim(), 0) : null;
      if (!t || t.end !== type.trim().length) throw QueryError('badType', 'resultType takes one LLVM type such as "i32" or "ptr"; got ' + JSON.stringify(type));
      return this._with({ key: 'resultType=' + t.type, label: '.resultType(' + JSON.stringify(t.type) + ')',
        test: inst => { const r = resultTypeOf(inst); return r.error ? r : r.type === t.type; } });
    }
    pointer(ref) {
      if (!(ref instanceof ArgumentRef)) {
        if (typeof ref === 'string' && /^@/.test(ref))
          return this._with({ key: 'pointer=' + ref, label: '.pointer(' + JSON.stringify(ref) + ')',
            test: inst => { const acc = memoryAccess(inst); return !acc ? false : acc.error ? acc : acc.pointer === ref; } });
        throw QueryError('badArgument', 'pointer(v) takes a resolved value such as row.argument(0) or a global name "@g"; printed local names like "%work" are not identities',
          { fix: '.pointer(a.variant("checked").function("row").argument(0))' });
      }
      return this._with({ key: 'pointer=' + ref.key(), label: '.pointer(' + ref.describe() + ')', ref,
        test: (inst, snap, resolved) => {
          const acc = memoryAccess(inst);
          if (!acc) return false;
          if (acc.error) return acc;
          const name = ref.resolve(snap);
          resolved[ref.describe()] = name;
          return acc.pointer === name;
        } });
    }
    count() { return this._bind(instructionMetric(this._filters, 'count')); }
    sites() { return this._bind(instructionMetric(this._filters, 'sites')); }
    at(state) { return this.sites().at(state); }
    _bind(metric) { return this._state ? metric.at(this._state) : metric; }
    help() { return helpText('metrics'); }
    toJSON() { return { query: 'q.ir.instructions()' + this._filters.map(f => f.label).join(''), use: '.count() then .at(state)' }; }
  }

  // ───────────────────────── measuring timelines, lazy changes ─────────────────────────
  function measureTimeline(sel, metric) {
    if (!(metric instanceof Metric))
      throw QueryError('badArgument', 'measure(metric) takes a metric such as q.ir.instructions().opcode("load").count(); got ' + describeValue(metric));
    const fn = chooseFunction(sel._domain.fn, metric._spec.fn, null, sel._label);
    return new MeasureRows(sel, metric, fn);
  }
  function measureEvent(e, metric, fn) {
    const m = metric._spec;
    const snap = m.level === 'machine' ? machineSnapshot(e, fn) : irSnapshot(e, fn);
    const v = snap.status === 'available' ? computeMetric(metric, snap) : { status: snap.status, value: null, reason: snap.reason };
    return { variant: e.variant, phase: e.phase, ordinal: e.ordinal, pass: e.pass, header: e.header, function: fn,
      status: v.status, value: v.value, reason: v.reason || null, coverage: snap.coverage || null, unit: m.unit, ref: e.ref };
  }
  class MeasureRows extends Rows {
    constructor(sel, metric, fn) {
      super('measurements', sel._label + '.measure(' + metric._spec.label + ')',
        (ctx, visit) => sel._each(ctx, e => visit(measureEvent(e, metric, fn))),
        { unit: metric._spec.unit, what: 'measurement' });
      this._sel = sel; this._metric = metric; this._fn = fn;
    }
    changes() { return new ChangeRows(this); }
  }
  // Adjacency is judged against the unfiltered timeline (`base`) of the same function and stream:
  // after a where() that skips events, a pair of rows is a 'gap', never a 'known' change.
  class ChangeRows extends Rows {
    constructor(measure) {
      const sel = measure._sel, valueType = measure._metric._spec.valueType;
      super('changes', measure._label + '.changes()', (ctx, visit) => {
        const positions = basePositions(sel, ctx);
        let prev = null;
        measure._each(ctx, row => { const c = changeRow(prev, row, positions, valueType); prev = row; return visit(c); });
      }, { unit: measure._metric._spec.unit, what: 'change' });
      this._measure = measure;
    }
  }
  function basePositions(sel, ctx) {
    if (ctx.aux.has(sel._base)) return ctx.aux.get(sel._base);
    const order = new Map(), list = [];
    sel._base._each(ctx, e => { order.set(streamKey(e.variant, e.phase) + '|' + e.ordinal, list.length); list.push(e.ordinal); return false; });
    const positions = { order, list };
    ctx.aux.set(sel._base, positions);
    return positions;
  }
  function changeRow(prev, cur, positions, valueType) {
    const out = { ordinal: cur.ordinal, pass: cur.pass, header: cur.header, from: prev ? prev.ordinal : null,
      fromPass: prev ? prev.pass : null, before: prev ? prev.value : null, after: cur.value, delta: null,
      changed: null, transition: null, status: null, reason: null, skipped: null, endpointDelta: null,
      unit: cur.unit, ref: cur.ref };
    if (cur.status !== 'available') { out.status = 'unavailable'; out.reason = cur.reason || cur.status; return out; }
    if (!prev) { out.status = 'first'; out.reason = 'no earlier row in this selection'; return out; }
    if (prev.status !== 'available') { out.status = 'unknown'; out.reason = 'previous row ' + prev.ordinal + ' is ' + prev.status + ' (' + prev.reason + ')'; out.before = null; return out; }
    const pk = streamKey(prev.variant, prev.phase) + '|' + prev.ordinal, ck = streamKey(cur.variant, cur.phase) + '|' + cur.ordinal;
    const pp = positions.order.get(pk), cp = positions.order.get(ck);
    if (pp === undefined || cp === undefined || cp - pp !== 1) {
      out.status = 'gap';
      out.skipped = pp !== undefined && cp !== undefined ? positions.list.slice(pp + 1, cp) : null;
      out.reason = 'rows are not adjacent in the function timeline; intervening events may have changed the value';
      if (valueType === 'count') out.endpointDelta = cur.value - prev.value;
      return out;
    }
    out.status = 'known';
    if (valueType === 'count') { out.delta = cur.value - prev.value; out.changed = out.delta !== 0; }
    else { out.changed = JSON.stringify(prev.value) !== JSON.stringify(cur.value); if (valueType === 'boolean') out.transition = prev.value + '→' + cur.value; }
    return out;
  }

  // ───────────────────────── machine-function properties ─────────────────────────
  // From the MIR print line "# Machine code for function row: NoPHIs, TracksLiveness, NoVRegs".
  // LLVM prints only the properties that are set, so an absent token means false.
  const MACHINE_PROPERTIES = ['IsSSA', 'NoPHIs', 'TracksLiveness', 'NoVRegs', 'FailedISel', 'Legalized',
    'RegBankSelected', 'Selected', 'TiedOpsRewritten', 'FailsVerification', 'FailedRegAlloc', 'TracksDebugUserValues'];
  const machine = {
    property(name) {
      requireString(name, 'q.machine.property(name)', 'q.machine.property("NoVRegs")');
      if (MACHINE_PROPERTIES.indexOf(name) < 0) throw unknownName('unknownProperty', 'machine-function property', name, MACHINE_PROPERTIES);
      return new Metric({ key: 'machine.property(' + name + ')', label: 'q.machine.property("' + name + '")', unit: 'machine-function property',
        valueType: 'boolean', level: 'machine', fn: null,
        compute: snap => ({ status: 'available', value: snap.properties.indexOf(name) >= 0, witnesses: [snap.propertyLine],
          note: 'LLVM prints the set properties only; a missing name means the property is not set' }) });
    },
    properties() {
      return new Metric({ key: 'machine.properties', label: 'q.machine.properties()', unit: 'machine-function property set',
        valueType: 'set', level: 'machine', fn: null,
        compute: snap => ({ status: 'available', value: snap.properties.slice(), witnesses: [snap.propertyLine] }) });
    },
    names() { return MACHINE_PROPERTIES.slice(); },
    help() { return helpText('machine'); },
  };

  // ───────────────────────── execution summaries (profiles) ─────────────────────────
  // execution: { "<arm>": { totals: { instructions, stackLoads, stackStores }, rowsVerified, rowBytes, samples } }
  // typed:     { stock|scalar|pie: { …, totals: { …, packets } } }  → arms "typed-stock", "typed-scalar", "typed-pie"
  const PROFILE_SOURCES = ['execution', 'typed', 'metrics'];
  const TOTAL_UNITS = {
    instructions: { unit: 'executed guest instructions', dimension: 'executed guest instructions' },
    stackLoads: { unit: 'executed direct stack loads', dimension: 'executed direct stack accesses', category: 'loads' },
    stackStores: { unit: 'executed direct stack stores', dimension: 'executed direct stack accesses', category: 'stores' },
    packets: { unit: 'executed packets', dimension: 'executed packets' },
  };
  const WORKLOADS = { 'opening-160-rows': { rows: 160, description: 'the 160 rows of the opening fixture; verified by rowsVerified === 160' } };
  const REGIONS = { row: 'the measured row symbol (summary totals are collected inside it)' };
  const profileData = new Map();
  function profileSource(name) {
    if (PROFILE_SOURCES.indexOf(name) < 0) throw unknownName('unknownProfile', 'profile source', name, PROFILE_SOURCES);
    if (!profileData.has(name)) {
      let data = null, error = null, digest = null;
      try { data = callBridge('profile', [name]); } catch (err) { error = err.message; }
      if (bridge && typeof bridge.profileSHA === 'function') { try { digest = bridge.profileSHA(name); } catch (err) { digest = null; } }
      profileData.set(name, { name, data, error, digest });
    }
    return profileData.get(name);
  }
  function armTable() {
    const arms = new Map();
    [['execution', ''], ['typed', 'typed-']].forEach(pair => {
      const src = profileSource(pair[0]);
      if (!src.data || typeof src.data !== 'object') return;
      Object.keys(src.data).forEach(k => {
        const entry = src.data[k];
        if (entry && typeof entry === 'object' && entry.totals && typeof entry.totals === 'object')
          arms.set(pair[1] + k, { arm: pair[1] + k, source: pair[0], key: k, entry, digest: src.digest });
      });
    });
    return arms;
  }
  function findArm(name) {
    const arms = armTable(), names = Array.from(arms.keys()).sort();
    if (!arms.has(name)) {
      if (arms.has('typed-' + name)) throw QueryError('unknownArm', 'arm ' + JSON.stringify(name) + ' is unknown; typed-summary arms carry the prefix "typed-"', { fix: 'profiles.arm("typed-' + name + '")', valid: names });
      throw unknownName('unknownArm', 'arm', name, names);
    }
    return arms.get(name);
  }
  function contractOf(arm) {
    const e = arm.entry;
    if (typeof e.contract === 'string') return { value: e.contract, evidence: arm.source + '["' + arm.key + '"].contract' };
    const m = /^(checked|unchecked)-/.exec(arm.arm);
    if (m) return { value: m[1], evidence: 'arm name prefix "' + m[1] + '-"' };
    return { value: null, evidence: 'the summary does not state a checked/unchecked contract for this arm' };
  }
  function workloadOf(arm, label) {
    const rv = arm.entry.rowsVerified;
    if (label === null) return { label: null, rowsVerified: rv === undefined ? null : rv, verified: false, evidence: 'no workload requested; add .workload("opening-160-rows")' };
    const w = WORKLOADS[label];
    if (rv === undefined) return { label, rowsVerified: null, verified: false, evidence: 'the ' + arm.source + ' entry has no rowsVerified field; the label is an adapter assertion only' };
    return { label, rowsVerified: rv, verified: rv === w.rows, evidence: 'rowsVerified=' + rv + (rv === w.rows ? '' : ' (expected ' + w.rows + ')') };
  }
  function resolveArmSpec(spec, ctx) {
    if (spec instanceof Param) {
      const v = readParam(ctx, spec);
      if (spec.choices && spec.choices.indexOf(v) < 0) throw unknownName('badBinding', 'binding for ' + spec.name, v, spec.choices);
      return findArm(v);
    }
    return findArm(spec);
  }
  class ProfileSelection {
    constructor(armSpec, region, workload) {
      this._armSpec = armSpec; this._region = region || null; this._workload = workload || null;
      if (armSpec instanceof Param) (armSpec.choices || []).forEach(findArm); else findArm(armSpec);
    }
    get name() { return this._armSpec instanceof Param ? '<param ' + this._armSpec.name + '>' : this._armSpec; }
    region(name) {
      if (!REGIONS[name]) throw unknownName('unknownRegion', 'region', name, Object.keys(REGIONS), 'profiles.arm(…).region("row")');
      return new ProfileSelection(this._armSpec, name, this._workload);
    }
    workload(label) {
      if (!WORKLOADS[label]) throw unknownName('unknownWorkload', 'workload', label, Object.keys(WORKLOADS), '.workload("opening-160-rows")');
      return new ProfileSelection(this._armSpec, this._region, label);
    }
    total(metric) {
      if (!(this._armSpec instanceof Param)) {
        const arm = findArm(this._armSpec), names = Object.keys(arm.entry.totals);
        if (names.indexOf(metric) < 0) throw unknownName('unknownTotal', 'total of ' + arm.arm, metric, names);
      }
      return new TotalPlan(this, metric);
    }
    totals() { const arm = findArm(this.name); return Object.keys(arm.entry.totals).map(k => ({ metric: k, value: arm.entry.totals[k], unit: unitOf(k).unit })); }
    describe() {
      const arm = findArm(this.name), e = arm.entry;
      return { arm: arm.arm, source: { profile: arm.source, entry: arm.key, digest: arm.digest }, totals: e.totals,
        rowsVerified: e.rowsVerified === undefined ? null : e.rowsVerified, rowBytes: e.rowBytes === undefined ? null : e.rowBytes,
        sampleKeys: e.samples && typeof e.samples === 'object' ? Object.keys(e.samples).slice(0, 40) : null,
        contract: contractOf(arm), otherFields: Object.keys(e).filter(k => ['totals', 'rowsVerified', 'rowBytes', 'samples'].indexOf(k) < 0) };
    }
    samples() { const arm = findArm(this.name); return arm.entry.samples === undefined ? null : arm.entry.samples; }
    help() { return helpText('profiles'); }
    toJSON() { return { arm: this.name, region: this._region, workload: this._workload, use: '.total("instructions")' }; }
  }
  function unitOf(metric) {
    return TOTAL_UNITS[metric] || { unit: 'executed ' + metric + ' (unit not described by this adapter)', dimension: 'executed ' + metric };
  }
  class TotalPlan extends Plan {
    constructor(sel, metric) {
      super('total', 'profiles.arm(' + JSON.stringify(sel.name) + ')' + (sel._region ? '.region("' + sel._region + '")' : '') +
        (sel._workload ? '.workload("' + sel._workload + '")' : '') + '.total("' + metric + '")');
      this._sel = sel; this._metric = metric;
    }
    _eval(ctx) {
      const arm = resolveArmSpec(this._sel._armSpec, ctx), u = unitOf(this._metric);
      const names = Object.keys(arm.entry.totals);
      if (names.indexOf(this._metric) < 0) throw unknownName('unknownTotal', 'total of ' + arm.arm, this._metric, names);
      const value = arm.entry.totals[this._metric];
      const region = this._sel._region || 'row';
      return { kind: 'total', status: typeof value === 'number' ? 'available' : 'unavailable', arm: arm.arm, metric: this._metric,
        value: typeof value === 'number' ? value : null, unit: u.unit, dimension: u.dimension, category: u.category || null,
        scope: 'dynamic (executed work, summed over the workload)',
        region: { name: region, requested: !!this._sel._region, evidence: REGIONS[region] },
        workload: workloadOf(arm, this._sel._workload), contract: contractOf(arm),
        source: { profile: arm.source, entry: arm.key, digest: arm.digest, path: arm.source + '["' + arm.key + '"].totals.' + this._metric } };
    }
  }
  function isPlan(x) { return x instanceof Plan; }
  class BundlePlan extends Plan {
    constructor(parts) {
      super('bundle', 'q.bundle({ ' + Object.keys(parts).join(', ') + ' })');
      Object.keys(parts).forEach(k => {
        if (!isPlan(parts[k])) throw QueryError('notAPlan', 'bundle output ' + JSON.stringify(k) + ' is ' + describeValue(parts[k]) + ', not a plan',
          { fix: parts[k] instanceof Metric ? 'bind the metric to a state: metric.at(timeline.at(n).after)' : 'q.bundle({ ' + k + ': somePlan })' });
      });
      this._parts = parts;
    }
    _eval(ctx) {
      const outputs = {};
      Object.keys(this._parts).forEach(k => { outputs[k] = this._parts[k]._evaluate(ctx); });
      return { kind: 'bundle', outputs, keys: Object.keys(outputs) };
    }
  }
  function bundle(parts) {
    if (!parts || typeof parts !== 'object' || Array.isArray(parts) || isPlan(parts))
      throw QueryError('badArgument', 'q.bundle takes an object of named plans', { fix: 'q.bundle({ earlier: p1, later: p2 })' });
    return new BundlePlan(parts);
  }

  // ───────────────────────── add and compare ─────────────────────────
  function numericOf(r) { return r && (r.valueType === 'count' || r.kind === 'total' || r.kind === 'sum'); }
  class AddPlan extends Plan {
    constructor(parts, label) {
      super('sum', 'q.add(' + parts.map(p => p._label).join(', ') + ')' + (label ? '.label(' + JSON.stringify(label) + ')' : ''));
      parts.forEach((p, i) => { if (!isPlan(p)) throw QueryError('notAPlan', 'q.add argument ' + i + ' is ' + describeValue(p), { fix: 'q.add(stock.total("stackLoads"), stock.total("stackStores"))' }); });
      if (parts.length < 2) throw QueryError('badArgument', 'q.add needs at least two plans');
      this._parts = parts; this._name = label || null;
    }
    label(text) { return new AddPlan(this._parts, String(text)); }
    _eval(ctx) {
      const rs = this._parts.map(p => p._evaluate(ctx));
      const out = { kind: 'sum', label: this._name, parts: rs, value: null, unit: null, status: 'available' };
      const bad = rs.filter(r => r.status !== 'available');
      if (bad.length) return Object.assign(out, { status: 'unavailable', reason: 'an input is ' + bad[0].status + ' (' + (bad[0].reason || '') + ')' });
      if (!rs.every(numericOf)) throw QueryError('typeError', 'q.add sums counts and totals only; got ' + rs.map(r => r.valueType || r.kind).join(', '));
      const dims = rs.map(r => r.dimension || r.unit);
      if (dims.some(d => d !== dims[0]))
        throw QueryError('incompatibleUnits', 'cannot add ' + rs.map(r => r.unit).join(' + ') + '; the quantities measure different things', { fix: 'compare them with q.compare or show both with q.bundle' });
      const ids = rs.map(r => r.kind === 'total' ? r.arm + '|' + r.metric : r.definition + '|' + JSON.stringify(r.state));
      if (ids.some((x, i) => ids.indexOf(x) !== i)) throw QueryError('doubleCount', 'the same quantity appears twice in q.add');
      if (rs[0].kind === 'total') {
        ['arm', 'region', 'workload'].forEach(k => {
          const vals = rs.map(r => JSON.stringify(k === 'arm' ? r.arm : k === 'region' ? r.region.name : r.workload.label));
          if (vals.some(v => v !== vals[0])) throw QueryError('incompatibleScope', 'q.add over different ' + k + 's (' + vals.join(', ') + ') does not describe one execution');
        });
        if (rs.some(r => !r.category) || rs.some((r, i) => rs.findIndex(x => x.category === r.category) !== i))
          throw QueryError('doubleCount', 'q.add needs disjoint categories of one dimension (e.g. stackLoads + stackStores)');
      }
      out.value = rs.reduce((s, r) => s + r.value, 0);
      out.unit = rs[0].kind === 'total' ? rs[0].dimension : rs[0].unit;
      out.formula = rs.map(r => (r.metric || r.metric) + '=' + r.value).join(' + ') + ' = ' + out.value;
      return out;
    }
  }
  const MATCH_KEYS = ['workload', 'region', 'checkedContract', 'unit', 'metric', 'function', 'phase', 'variant', 'stream'];
  function matchValue(r, key) {
    const st = r.state || {};
    switch (key) {
      case 'workload': return r.workload ? (r.workload.verified ? r.workload.label : 'unverified:' + r.workload.label) : null;
      case 'region': return r.region ? r.region.name : null;
      case 'checkedContract': return r.contract ? r.contract.value : null;
      case 'unit': return r.unit || null;
      case 'metric': return r.definition || r.metric || null;
      case 'function': return st.function || null;
      case 'phase': return st.phase || null;
      case 'variant': return st.variant || null;
      case 'stream': return st.ref ? st.ref.streamSHA : null;
    }
    return null;
  }
  class ComparePlan extends Plan {
    constructor(before, after, opts) {
      super('comparison', 'q.compare(' + (before && before._label) + ', ' + (after && after._label) + ')');
      [before, after].forEach((p, i) => { if (!isPlan(p)) throw QueryError('notAPlan', 'q.compare argument ' + i + ' is ' + describeValue(p), { fix: p instanceof Metric ? 'bind the metric: metric.at(state)' : 'q.compare(planBefore, planAfter)' }); });
      this._before = before; this._after = after; this._o = opts || {};
    }
    _with(o) { return new ComparePlan(this._before, this._after, Object.assign({}, this._o, o)); }
    matchOn() {
      const keys = Array.prototype.slice.call(arguments);
      keys.forEach(k => { if (MATCH_KEYS.indexOf(k) < 0) throw unknownName('unknownMatchKey', 'match key', k, MATCH_KEYS); });
      return this._with({ match: keys });
    }
    percentChange(options) {
      const d = options && options.denominator;
      if (d !== 'before' && d !== 'after')
        throw QueryError('percentBaselineRequired', 'percentChange needs an explicit baseline', { fix: '.percentChange({ denominator: "before" })', valid: ['before', 'after'] });
      return this._with({ percent: d });
    }
    asEndpoints() { return this._with({ endpoints: true }); }
    _eval(ctx) {
      const b = this._before._evaluate(ctx), a = this._after._evaluate(ctx);
      const vt = b.valueType || (numericOf(b) ? 'count' : null);
      const out = { kind: this._o.endpoints ? 'endpoints' : 'comparison', status: 'available', before: b, after: a,
        valueType: vt, unit: b.unit, delta: null };
      if (this._o.percent && vt !== 'count')
        throw QueryError('typeError', 'percentChange needs numeric values; this comparison is ' + (vt || 'not numeric') + ' (' + b.metric + ')', { fix: 'drop .percentChange; a boolean comparison reports equality and a transition' });
      if (b.status !== 'available' || a.status !== 'available')
        return Object.assign(out, { status: 'unavailable', reason: (b.status !== 'available' ? 'before' : 'after') + ' is ' + (b.status !== 'available' ? b.status + ' (' + b.reason + ')' : a.status + ' (' + a.reason + ')') });
      const keys = this._o.match || ['unit', 'metric'];
      const matched = {}, mismatches = [];
      keys.forEach(k => {
        const x = matchValue(b, k), y = matchValue(a, k);
        matched[k] = { before: x, after: y, equal: x !== null && x === y && !/^unverified:/.test(String(x)) };
        if (!matched[k].equal) mismatches.push(k);
      });
      out.matchedOn = matched;
      if (!this._o.match) out.note = 'matched on unit and metric only; use .matchOn("workload", "region", "checkedContract", "unit") for cross-run work';
      if (mismatches.length) return Object.assign(out, { status: 'incomparable', reason: 'mismatch on ' + mismatches.join(', ') });
      if (vt === 'count') {
        out.delta = a.value - b.value;
        if (this._o.percent) {
          const den = this._o.percent === 'before' ? b.value : a.value;
          out.percent = den === 0 ? null : 100 * out.delta / den;
          out.denominator = { side: this._o.percent, value: den };
          if (den === 0) out.percentReason = 'zero denominator';
        }
      } else {
        out.equal = JSON.stringify(b.value) === JSON.stringify(a.value);
        if (vt === 'boolean') out.transition = b.value + '→' + a.value;
      }
      if (this._o.endpoints) out.interval = intervalBetween(b, a);
      return out;
    }
  }
  function intervalBetween(b, a) {
    const s = b.state, t = a.state;
    if (!s || !t || s.variant !== t.variant || s.phase !== t.phase || !s.function || s.function !== t.function)
      return { status: 'unknown', note: 'endpoints are not in one function timeline' };
    const lo = Math.min(s.ordinal, t.ordinal), hi = Math.max(s.ordinal, t.ordinal);
    const between = stream(s.variant, s.phase).events.filter(e => e.ordinal > lo && e.ordinal < hi && covers(e, s.function));
    return { status: 'known', from: s.ordinal, to: t.ordinal, intervening: between.map(e => ({ ordinal: e.ordinal, pass: e.pass })),
      note: 'the difference belongs to the whole interval (' + (between.length + 1) + ' events after ' + lo + '); it cannot be assigned to the final event alone' };
  }

  // ───────────────────────── parameters ─────────────────────────
  class Param {
    constructor(kind, name, spec) {
      this.kind = kind; this.name = requireString(name, 'param name');
      this.min = spec.min; this.max = spec.max; this.choices = spec.choices || null;
      this.hasDefault = spec.default !== undefined; this.default = spec.default;
    }
    check(v) {
      if (this.kind === 'int' && (typeof v !== 'number' || v % 1 !== 0 || (this.min !== undefined && v < this.min) || (this.max !== undefined && v > this.max)))
        throw QueryError('badBinding', 'binding ' + this.name + '=' + JSON.stringify(v) + ' must be an integer in ' + this.min + '..' + this.max);
      if (this.kind === 'choice' && this.choices.indexOf(v) < 0) throw unknownName('badBinding', 'binding for ' + this.name, v, this.choices);
      return v;
    }
    toJSON() { return { param: this.name, kind: this.kind, min: this.min, max: this.max, choices: this.choices, default: this.default }; }
  }
  const param = {
    int(name, spec) { return new Param('int', name, spec || {}); },
    choice(name, choices, spec) {
      if (!Array.isArray(choices) || !choices.length) throw QueryError('badArgument', 'q.param.choice(name, [values]) needs a non-empty array');
      return new Param('choice', name, Object.assign({}, spec || {}, { choices }));
    },
  };
  function readParam(ctx, p) {
    const name = typeof p === 'string' ? p : p && p.name;
    if (!(name in ctx.bindings)) {
      if (p instanceof Param && p.hasDefault) return p.default;
      throw QueryError('unboundParam', 'parameter ' + JSON.stringify(name) + ' has no binding', { fix: 'q.run(plan, { bindings: { ' + name + ': … } })' });
    }
    return p instanceof Param ? p.check(ctx.bindings[name]) : ctx.bindings[name];
  }
  function paramReader(ctx, deps) {
    return {
      param(p) {
        const name = typeof p === 'string' ? p : p && p.name;
        if (!deps.some(d => d === p || (d && d.name === name)))
          throw QueryError('undeclaredParam', 'a lambda read parameter ' + JSON.stringify(name) + ' that its where() did not declare',
            { fix: '.where((r, ctx) => …, { dependsOn: [' + name + '] })' });
        return readParam(ctx, p);
      },
    };
  }

  // ───────────────────────── initial module and source locations ─────────────────────────
  const initialModules = new Map();
  function initialModuleOf(variant) {
    if (!initialModules.has(variant)) {
      const r = callBridge('initialModule', [variant]);
      const text = typeof r === 'string' ? r : r && r.text;
      if (typeof text !== 'string') throw QueryError('bridge', '__trace.initialModule("' + variant + '") returned no text');
      initialModules.set(variant, { text, digest: (r && r.digest) || null });
    }
    return initialModules.get(variant);
  }
  function debugFacts(text, fn) {
    const lines = text.split('\n'), at = fn ? findDefine(lines, fn) : -1;
    let inFn = 0;
    if (at >= 0) for (let i = at + 1; i < lines.length && lines[i].replace(/\s+$/, '') !== '}'; i++) if (/!dbg !\d+/.test(lines[i])) inFn++;
    return { functionDefined: at >= 0, dbgAttachmentsInFunction: at >= 0 ? inFn : null,
      compileUnits: (text.match(/!DICompileUnit\(/g) || []).length, diLocations: (text.match(/!DILocation\(/g) || []).length,
      debugRecords: (text.match(/#dbg_\w+\(/g) || []).length };
  }
  class InitialModule {
    constructor(variant) { this.variant = variant; }
    digest() { return initialModuleOf(this.variant).digest; }
    functions() { return definedFunctions(initialModuleOf(this.variant).text); }
    describe() {
      const m = initialModuleOf(this.variant);
      return { kind: 'initialModule', variant: this.variant, digest: m.digest, bytes: utf8Length(m.text), functions: definedFunctions(m.text), debug: debugFacts(m.text, null) };
    }
    state(fn) { return new InitialStatePlan(this.variant, fn ? requireString(fn, 'state(function)') : null); }
    sourceLocations(options) {
      const fn = options && options.function ? options.function : null, v = this.variant;
      return new FnPlan('sourceLocations', 'a.variant("' + v + '").initialModule().sourceLocations(' + (fn ? '{ function: "' + fn + '" }' : '') + ')', () => {
        const m = initialModuleOf(v), facts = debugFacts(m.text, fn);
        const checked = Object.assign({ variant: v, function: fn, moduleDigest: m.digest }, facts);
        if (fn && !facts.functionDefined) return { kind: 'sourceLocations', status: 'absent', reason: 'functionNotDefined', checked };
        if (!facts.compileUnits || (fn ? !facts.dbgAttachmentsInFunction : !facts.diLocations))
          return { kind: 'sourceLocations', status: 'unavailable', reason: 'missingDebugLocations', checked,
            why: 'the module carries no debug locations/compile unit, so source lines cannot be derived; this is not an empty set of lines' };
        return { kind: 'sourceLocations', status: 'unsupported', reason: 'debugLocationDecodingNotImplemented', checked,
          why: 'debug locations exist, but this release does not decode DILocation metadata' };
      });
    }
    help() { return helpText('capabilities'); }
    toJSON() { return { initialModule: this.variant, use: '.describe(), .sourceLocations({ function: "row" }), .state("row")' }; }
  }
  class InitialStatePlan extends StatePlan {
    constructor(variant, fn) {
      super({ _label: 'a.variant("' + variant + '").initialModule()' }, 'state(' + (fn ? JSON.stringify(fn) : '') + ')');
      this._variant = variant; this._fn = fn;
      this._label = 'a.variant("' + variant + '").initialModule().state(' + (fn ? JSON.stringify(fn) : '') + ')';
    }
    _snapshot(ctx, fnHint, level) {
      const fn = chooseFunction(this._fn, fnHint, null, this._label);
      const m = initialModuleOf(this._variant);
      if (level === 'machine') return { status: 'unavailable', reason: 'irPrintNotMachineCode', why: UNAVAILABLE_WHY.irPrintNotMachineCode, fn, level };
      return cacheSnapshot('initial|' + this._variant + '|' + fn, () =>
        buildIrSnapshot({ variant: this._variant, phase: 'initialModule', ordinal: null, pass: null, header: null, digest: m.digest }, fn, m.text));
    }
    _target() { throw QueryError('unsupported', 'excerpt/text are not available on the initial module state in this release', { fix: 'a.variant("…").initialModule().describe()' }); }
  }

  // ───────────────────────── remarks, final image, PC join (explicitly missing) ─────────────────────────
  class Remarks {
    constructor(variant) { this.variant = variant; }
    _plan(label, eventPick) {
      const v = this.variant;
      return new FnPlan('remarks', label, ctx => {
        const out = { kind: 'remarks', status: 'unavailable', reason: 'missingRemarksArtifact', variant: v,
          why: 'no LLVM optimization-remarks artifact was captured for this archive; that is different from an imported artifact with zero matching remarks',
          note: 'remarks from another compiler (e.g. GCC) carry their own provenance and are never attributed to LLVM' };
        if (eventPick) { const r = eventPick._resolve(ctx); out.event = r.status === 'found' ? sourceWitness(r.record) : { status: r.status }; }
        return out;
      });
    }
    forEvent(ev) {
      if (!(ev instanceof EventPick)) throw QueryError('badArgument', 'forEvent takes an event such as middle.where(e => e.pass === "LoopVectorizePass").first()');
      return this._plan('a.variant("' + this.variant + '").remarks().forEvent(' + ev._label + ')', ev);
    }
    forFunction(fn) { return this._plan('a.variant("' + this.variant + '").remarks().forFunction("' + fn + '")', null); }
    all() { return this._plan('a.variant("' + this.variant + '").remarks().all()', null); }
    help() { return helpText('capabilities'); }
  }
  class ImageRef {
    constructor(variant) { this.variant = variant; this.registered = false; }
    toJSON() { return { image: 'final', variant: this.variant, registered: false, why: 'no final image (bytes with an imageSHA) is registered with this archive' }; }
  }
  const JOIN_KEYS = ['imageSHA', 'addressSpace', 'symbol'];
  class JoinPlan extends Plan {
    constructor(summary, image, required) {
      super('join', 'q.joinPCs(' + (summary && summary.name ? 'profiles.arm("' + summary.name + '")' : describeValue(summary)) + ', ' + (image instanceof ImageRef ? 'finalImage' : describeValue(image)) + ')');
      this._summary = summary; this._image = image; this._required = required || [];
    }
    requireMatch() {
      const keys = Array.prototype.slice.call(arguments);
      keys.forEach(k => { if (JOIN_KEYS.indexOf(k) < 0) throw unknownName('unknownMatchKey', 'join key', k, JOIN_KEYS); });
      return new JoinPlan(this._summary, this._image, keys);
    }
    _eval() {
      const reasons = [];
      if (this._summary instanceof ProfileSelection) {
        const arm = findArm(this._summary.name), s = arm.entry.samples;
        const pcLike = x => x && typeof x === 'object' && ('pc' in x || 'address' in x);
        const hasPC = !!s && (Array.isArray(s) ? s.some(pcLike) : Object.keys(s).some(k => /^(pcs?|address(es)?)$/i.test(k) || /^0x[0-9a-f]+$/i.test(k)));
        if (!hasPC) reasons.push({ reason: 'missingPCSamples', arm: arm.arm,
          detail: 'the summary holds aggregate totals' + (s && typeof s === 'object' ? ' and samples keyed by ' + Object.keys(s).slice(0, 6).join(', ') : '') + ', not per-PC samples' });
      } else reasons.push({ reason: 'missingInput', input: 'summary', detail: 'pass profiles.arm(name)' });
      if (!(this._image instanceof ImageRef) || !this._image.registered)
        reasons.push({ reason: 'missingInput', input: 'finalImage', detail: 'no final image with an imageSHA and address map is registered for this archive' });
      return { kind: 'join', status: 'unavailable', reasons, required: this._required,
        note: 'a PC join needs PC samples, a known image identity, address normalization and symbol bounds; a matching function name alone is not a join' };
    }
  }

  // ───────────────────────── def-use edges inside one snapshot ─────────────────────────
  function valueToken(part) { const t = typedOperand(part); const v = t ? t.value : part; const w = v.split(/\s+/); return w[w.length - 1]; }
  // Operand values in LLVM operand order for the forms recognized here; null when not derived.
  function operandsOf(inst) {
    const op = inst.opcode;
    let s = skipFlags(inst.operands);
    if (op === 'icmp' || op === 'fcmp') s = s.replace(/^\S+\s+/, '');
    const parts = splitTopLevel(s);
    if (BINOPS.indexOf(op) >= 0 || op === 'icmp' || op === 'fcmp') return [valueToken(parts[0]), parts[1]];
    if (op === 'fneg' || op === 'freeze') return [valueToken(parts[0])];
    if (op === 'load') { const acc = memoryAccess(inst); return acc && !acc.error ? [acc.pointer] : null; }
    if (op === 'store') { const acc = memoryAccess(inst); return acc && !acc.error ? [valueToken(parts[0].replace(/^((atomic|volatile)\s+)+/, '')), acc.pointer] : null; }
    if (op === 'select') return parts.slice(0, 3).map(valueToken);
    if (CASTS.indexOf(op) >= 0) { const k = lastTopLevelTo(s); return k >= 0 ? [valueToken(s.slice(0, k))] : null; }
    if (op === 'getelementptr') return parts.slice(1).map(valueToken);
    if (op === 'ret') return /^void\b/.test(s) ? [] : [valueToken(parts[0])];
    if (op === 'br') return /^i1\b/.test(s) ? [valueToken(parts[0])] : [];
    if (op === 'switch') return [valueToken(parts[0])];
    if (op === 'phi') { const t = readType(s, 0); return t ? splitTopLevel(s.slice(t.end)).map(p => p.replace(/^\[\s*/, '').split(',')[0].trim()) : null; }
    return null;
  }
  class UsesPlan extends Rows {
    constructor(query) {
      const label = query._state._label + '.instructions()' + query._filters.map(f => f.label).join('') + '.uses()';
      super('uses', label, (ctx, visit) => {
        const snap = query._state._snapshot(ctx, instructionMetric(query._filters, 'sites')._spec.fn, 'ir');
        if (snap.status !== 'available') throw QueryError(snap.status === 'absent' ? 'absent' : 'unavailable', 'uses() needs an available function snapshot; ' + snap.fn + ' is ' + snap.status + ' (' + snap.reason + ')');
        const defs = computeMetric(instructionMetric(query._filters, 'sites'), snap);
        if (defs.status !== 'available') throw QueryError('unsupported', 'the definitions could not be selected: ' + defs.reason);
        const byLine = new Map(); snap.instructions.forEach(i => byLine.set(i.line, i));
        let stop = false;
        defs.value.some(w => {
          const def = byLine.get(w.line);
          if (!def.result) return false;
          const tokenRe = new RegExp('(^|[^-a-zA-Z$._0-9%"])' + escapeRe(def.result) + '(?![-a-zA-Z$._0-9])');
          return snap.instructions.some(user => {
            if (user === def || !tokenRe.test(user.operands)) return false;
            const ops = operandsOf(user);
            const idx = ops ? ops.map((o, k) => (o === def.result ? k : -1)).filter(k => k >= 0) : [null];
            return idx.some(k => (stop = visit({ def: witnessOf(def), defValue: def.result, user: witnessOf(user), userOpcode: user.opcode,
              operandIndex: k, operandIndexNote: k === null ? 'operand positions are not derived for ' + user.opcode : undefined,
              ref: Object.assign({}, snap.source, { line: user.line }) })));
          }) || stop;
        });
      }, { unit: 'use edges', what: 'use edge' });
    }
  }
  InstructionQuery.prototype.uses = function () {
    if (!this._state) throw QueryError('needState', 'uses() follows def-use edges inside one snapshot; start from a state', { fix: 'middle.at(74).after.instructions().opcode("load")….uses()' });
    return new UsesPlan(this);
  };

  // ───────────────────────── fragments (scoped extensions) ─────────────────────────
  class Fragment {
    constructor(name, target, members) {
      this.name = name; this.target = target; this.members = members;
      const m = /\.v(\d+)$/.exec(name); this.version = m ? Number(m[1]) : null;
    }
    toJSON() { return { fragment: this.name, version: this.version, on: this.target, members: Object.keys(this.members) }; }
  }
  function fragment(name) {
    requireString(name, 'q.fragment(name)', 'q.fragment("picocalc.row.v1")');
    return {
      on(target, members) {
        if (target !== 'irFunction') throw unknownName('unknownTarget', 'fragment target', target, ['irFunction']);
        if (!members || typeof members !== 'object') throw QueryError('badArgument', 'on(target, { name: fn => metric }) needs members');
        Object.keys(members).forEach(k => { if (typeof members[k] !== 'function') throw QueryError('badArgument', 'fragment member ' + k + ' must be a function of the function handle'); });
        return new Fragment(name, target, members);
      },
    };
  }
  FunctionHandle.prototype.with = function (frag) {
    if (!(frag instanceof Fragment)) throw QueryError('badArgument', 'with(fragment) takes q.fragment(name).on("irFunction", {…})');
    const self = this, out = { fragment: frag.toJSON() };
    Object.keys(frag.members).forEach(k => {
      let built = null;
      out[k] = function () {
        if (built === null) {                       // the expansion callback runs once per handle
          built = frag.members[k](self);
          if (built instanceof Metric) built = new Metric(Object.assign({}, built._spec, { label: built._spec.label + ' /* ' + frag.name + '.' + k + ' */' }));
        }
        return built;
      };
    });
    return out;
  };

  // ───────────────────────── explain, session pins ─────────────────────────
  function planChildren(p) {
    const out = [];
    const add = v => { if (v instanceof Plan && v !== p && out.indexOf(v) < 0) out.push(v); };
    ['_rows', '_sel', '_measure', '_state', '_pick', '_before', '_after'].forEach(k => add(p[k]));
    if (p._opts && p._opts.parent) add(p._opts.parent);
    if (p._parts) (Array.isArray(p._parts) ? p._parts : Object.keys(p._parts).map(k => p._parts[k])).forEach(add);
    if (p instanceof EventSelection && p._base !== p) add(p._base);
    return out;
  }
  function explain(plan) {
    if (!isPlan(plan)) throw QueryError('notAPlan', 'q.explain takes a plan; got ' + describeValue(plan));
    const ids = new Map(), nodes = [];
    (function visit(p) {
      if (ids.has(p)) return;
      ids.set(p, nodes.length + 1);
      const node = { id: nodes.length + 1, kind: p._kind, label: p._label, inputs: [], consumers: 0 };
      nodes.push(node);
      planChildren(p).forEach(c => { visit(c); node.inputs.push(ids.get(c)); });
    })(plan);
    nodes.forEach(n => n.inputs.forEach(i => { nodes[i - 1].consumers++; }));
    const sources = nodes.filter(n => n.kind === 'events' && !n.inputs.length).map(n => n.label)
      .concat(nodes.filter(n => n.kind === 'total').map(n => n.label));
    return { kind: 'explain', root: 1, nodes, shared: nodes.filter(n => n.consumers > 1).map(n => n.id), sources,
      evaluation: 'synchronous; a shared terminal plan is evaluated once per q.run; shared row sources may be re-iterated, but prints, snapshots and metric values come from bounded session caches' };
  }
  const pins = [];
  const session = {
    pin(result, note) {
      if (isPlan(result)) throw QueryError('badArgument', 'pin an evaluated result, not a plan', { fix: 'const r = q.run(plan); q.session.pin(r.outputs.first)' });
      pins.push({ id: pins.length + 1, note: note || null, result }); return { pinned: pins.length };
    },
    pins() { return pins.slice(); },
    clear() { const n = pins.length; pins.length = 0; return { cleared: n }; },
  };

  // ───────────────────────── profiles facade ─────────────────────────
  const profilesApi = {
    arms() {
      return Array.from(armTable().values()).map(x => ({ arm: x.arm, source: x.source, entry: x.key, digest: x.digest,
        totals: Object.keys(x.entry.totals), rowsVerified: x.entry.rowsVerified === undefined ? null : x.entry.rowsVerified,
        contract: contractOf(x).value }));
    },
    arm(name) {
      if (!(name instanceof Param)) requireString(name, 'profiles.arm(name)', 'profiles.arm("checked-llvm")');
      return new ProfileSelection(name, null, null);
    },
    sources() {
      return PROFILE_SOURCES.map(n => { const s = profileSource(n);
        return { name: n, digest: s.digest, status: s.error ? 'unavailable' : 'available', error: s.error,
          entries: s.data && typeof s.data === 'object' ? Object.keys(s.data) : [] }; });
    },
    source(name) {
      const s = profileSource(name);
      if (s.error) throw QueryError('unavailable', 'profile source ' + name + ' could not be read: ' + s.error);
      return { name, digest: s.digest, data: JSON.parse(JSON.stringify(s.data)) };
    },
    workloads() { return Object.keys(WORKLOADS).map(k => ({ workload: k, description: WORKLOADS[k].description })); },
    regions() { return Object.keys(REGIONS).map(k => ({ region: k, description: REGIONS[k] })); },
    help() { return helpText('profiles'); },
    toJSON() { return { profiles: 'execution summaries', use: 'profiles.arms(), profiles.arm(name).region("row").workload("opening-160-rows").total("instructions")' }; },
  };

  // ───────────────────────── help ─────────────────────────
  function liveList(fn) { try { return fn(); } catch (err) { return '(unavailable: ' + err.message.split('\n')[0] + ')'; } }
  const TOPICS = {
    index: () => [
      'q — compiler-evidence queries over the PicoCalc LLVM row archive (release ' + VERSION + '). Globals: q, a (archive), profiles.',
      'Plans are lazy; evaluate synchronously with q.run(plan) or plan.run(). Results are plain objects with status, unit and witnesses.',
      '  q.run(a.events().count())                                  // all header records, with byStream',
      '  run = a.variant("checked"); row = run.function("row"); middle = row.timeline("middle")',
      '  q.run(run.events("middle").at(74).select("ordinal", "header", "ref"))',
      '  hdr = q.ir.instructions().opcode("load").resultType("i32").pointer(row.argument(0)).count()',
      '  q.run(hdr.at(middle.at(74).after))                         // static sites, with witnesses',
      '  q.run(middle.measure(hdr).changes().where(c => c.status === "known" && c.delta < 0).first())',
      '  q.run(profiles.arm("checked-gcc").region("row").workload("opening-160-rows").total("instructions"))',
      'Topics: q.help("events" | "timeline" | "states" | "metrics" | "changes" | "machine" | "profiles" | "compare" | "capabilities" | "params" | "results" | "errors" | "cache").',
      'Every object answers .help(). Statuses: available · absent (module print lacks the function) · unavailable (capture lacks it) · unsupported (parser limit).',
    ].join('\n'),
    events: () => [
      'Events = header records of print-after-all streams; one stream per (variant, phase); ordinals restart at 0 per stream.',
      '  a.variants()  a.streams()  a.events().count()  a.variant("checked").events("middle").count()',
      '  run.events("backend").at(78)            // absolute ordinal in its original stream; out of range → [ordinalOutOfRange]',
      '  run.events("middle").where(e => e.pass === "LoopVectorizePass").first()   // .first() .last() .one() (.one() reports ambiguous)',
      '  .select("ordinal", "pass", "scope", "ref")  .limit(10)  .count()  .ordinals()  .text()',
      'Event fields: ' + EVENT_FIELDS.join(', ') + ' (+ host fields). pass = new-PM class (EarlyCSEPass) or llc pass ID (virtregrewriter); passId = pass.',
      'scope.kind: function · module · cgscc (functions) · loop (loop, function) · machineFunction · unresolved (llc header; resolved from the print).',
      'Variants now: ' + liveList(() => index().variants.join(', ')) + '. Phases: ' + liveList(() => index().phases.join(', ')) + '.',
    ].join('\n'),
    timeline: () => [
      'A function timeline = the events of one stream whose print can contain the function (its function/loop/cgscc events and module prints).',
      '  row = a.variant("checked").function("row"); middle = row.timeline("middle"); machine = row.timeline("backend")',
      '  middle.at(74)   // same original ordinal as run.events("middle").at(74); an ordinal of another function → [notInSelection]',
      '  machine.where(e => e.passId === "virtregrewriter").select("ordinal", "passId", "scope", "ref")',
      '  run.functions()   row.argument(0)   row.initialState()   row.with(q.fragment("name.v1").on("irFunction", { m: fn => metric }))',
      'Filtering never renumbers. Measuring a filtered timeline marks non-adjacent pairs as gaps (see q.help("changes")).',
    ].join('\n'),
    states: () => [
      'A state is the program after an event (its print) or before it (= after the previous print of the same function, derivedFrom).',
      '  middle.at(74).after   middle.at(74).before   run.initialModule().state("row")',
      '  q.run(middle.at(74).after)                                   // status, coverage, arguments, instruction/block counts',
      '  q.run(middle.at(74).after.excerpt({ contains: "load i32, ptr %work", context: 1 }))   // text hits with line, offsets',
      '  q.run(middle.at(74).after.text({ maxLines: 80 }))',
      'Coverage: function or module prints permit metrics; a loop fragment is unavailable (loopFragment); MIR prints are for q.machine.',
      'An excerpt is a text search; printed local names are not identities. Use q.ir selectors for counts.',
    ].join('\n'),
    metrics: () => [
      'Static IR metrics (unit: static instruction sites) evaluated on one function snapshot.',
      '  m = q.ir.instructions().opcode("load").resultType("i32").pointer(row.argument(0)).count()',
      '  q.run(m.at(middle.at(74).after))      q.run(m.at(loopPrint.after).requireCoverage("function"))',
      '  q.run(q.ir.instructions().opcode("alloca", "phi").sites().at(state))     // the matching lines themselves',
      '  q.run(state.instructions().opcode("load").pointer(row.argument(0)).uses().select("userOpcode", "operandIndex", "ref"))',
      'pointer(v): row.argument(i) (resolved per snapshot from the define line) or a global "@g". Printed "%x" names are refused.',
      'resultType: derived for load, binary ops, casts, cmp (i1), phi, select, freeze, alloca, gep, call; other forms → unsupported.',
      'Recognized body lines: labels, #dbg_* records, instructions. Opcodes: ' + OPCODES.join(' '),
      'Opaque-pointer IR only; an unrecognized line makes the snapshot unsupported (never a silent zero).',
    ].join('\n'),
    changes: () => [
      'timeline.measure(metric) → one row per event: ordinal, pass, status, value, reason, coverage, unit, ref.',
      '.changes() → lazy rows: ordinal, pass, from, fromPass, before, after, delta, changed, status, reason, unit, ref (+ skipped, endpointDelta for gaps).',
      'status: known (adjacent full prints) · first · unavailable (this print) · unknown (previous print unavailable; predecessor reset) · gap (rows not adjacent in the function timeline).',
      '  q.run(middle.measure(hdr).changes().where(c => c.status === "known" && c.delta < 0).first())',
      '  q.run(middle.measure(hdr).changes().table("ordinal", "pass", "before", "after", "delta", "status"))',
      'Filtering before differencing changes the question: middle.where(e => e.pass === "EarlyCSEPass").measure(hdr).changes() yields gaps.',
    ].join('\n'),
    machine: () => [
      'Machine-function properties from "# Machine code for function f: …" (LLVM prints only set properties).',
      '  np = q.machine.property("NoVRegs"); q.run(np.at(row.timeline("backend").at(78).after))   // boolean, witness line',
      '  q.run(q.machine.properties().at(state))        q.machine.names()',
      'Names: ' + MACHINE_PROPERTIES.join(', ') + '. IR prints in the backend stream → unavailable (irPrintNotMachineCode).',
      'Unsupported in this release: MIR instruction metrics (spills, copies, opcodes). Boolean metrics have no percentages.',
    ].join('\n'),
    profiles: () => [
      'Execution summaries: dynamic totals of executed work (not static sites). Sources: execution, typed, metrics (q: profiles.sources()).',
      '  profiles.arms()      profiles.arm("checked-gcc").describe()      profiles.workloads()      profiles.regions()',
      '  q.run(profiles.arm("checked-gcc").region("row").workload("opening-160-rows").total("instructions"))',
      '  stock = profiles.arm("typed-stock").region("row").workload("opening-160-rows")',
      '  q.run(q.add(stock.total("stackLoads"), stock.total("stackStores")).label("direct stack accesses"))',
      'Typed-summary entries are arms with the prefix "typed-" (typed-stock = typed["stock"]). Workload "opening-160-rows" is verified by rowsVerified === 160.',
      'Arms now: ' + liveList(() => profilesApi.arms().map(x => x.arm).join(', ')),
    ].join('\n'),
    compare: () => [
      'q.bundle({ name: plan, … }) keeps outputs separate. q.add(t1, t2) sums disjoint categories of one dimension and scope.',
      'q.compare(before, after) → delta (counts), equal/transition (booleans), matchedOn; .matchOn(keys…), .percentChange({ denominator: "before"|"after" }), .asEndpoints().',
      '  q.run(q.compare(total("checked-llc-nolsr"), total("checked-llc")).matchOn("workload", "region", "checkedContract", "unit").percentChange({ denominator: "before" }))',
      '  q.run(q.compare(np.at(machine.at(74).after), np.at(machine.at(78).after)).asEndpoints())   // interval + intervening events',
      'Match keys: ' + MATCH_KEYS.join(', ') + '. A mismatch → status incomparable, delta null. percentChange on booleans → [typeError].',
      'q.explain(plan) lists plan nodes, inputs and shared consumers.',
    ].join('\n'),
    capabilities: () => [
      'What this archive cannot answer is returned as status unavailable with a reason — never as an empty or zero result.',
      '  q.run(run.initialModule().sourceLocations({ function: "row" }))    // missingDebugLocations + module digest',
      '  q.run(run.remarks().forEvent(vectorEvent))                         // missingRemarksArtifact (not "zero remarks")',
      '  q.run(q.joinPCs(profiles.arm("checked-llvm"), run.finalImage()).requireMatch("imageSHA", "addressSpace"))   // missingPCSamples, missingInput',
      '  q.capabilities()   lists every capability with status and the call to use',
    ].join('\n'),
    params: () => [
      '  min = q.param.int("minimum", { min: 1, max: 16, default: 1 })',
      '  drops = middle.measure(hdr).changes().where((r, ctx) => r.status === "known" && -r.delta >= ctx.param(min), { dependsOn: [min] })',
      '  q.run(drops, { bindings: { minimum: 5 } })',
      '  arm = q.param.choice("arm", ["checked-llc", "checked-llc-nolsr"]); profiles.arm(arm)… ; q.run(plan, { bindings: { arm: "checked-llc" } })',
      'Reading an undeclared parameter → [undeclaredParam]. Metric values are cached by definition, so rebinding reuses them.',
    ].join('\n'),
    results: () => [
      'count: { kind, value, unit, of, streams?, byStream? }      rows: { kind, of, unit, count, rows, truncated? }',
      'measurement: { kind, status, metric, definition, unit, valueType, value, count, witnesses, resolved, state, reason?, why? }',
      'state witness: { variant, phase, ordinal, pass, header, ref, function, side, coverage, lineRange, derivedFrom? }',
      'total: { kind, status, arm, metric, value, unit, dimension, category, scope, region, workload, contract, source{profile, entry, digest, path} }',
      'comparison: { kind, status, before, after, valueType, unit, delta, percent?, denominator?, equal?, transition?, matchedOn, interval? }',
      'sum: { kind, label, status, value, unit, parts, formula }      bundle: { kind, outputs, keys }',
      'Units are kept apart: events (records) · rows (result rows) · static instruction sites · executed … (dynamic work).',
    ].join('\n'),
    errors: () => [
      'Errors are thrown as "[code] message\\n  fix: …". Codes: unknownVariant unknownPhase unknownFunction unknownOpcode unknownProperty',
      'unknownArm unknownRegion unknownWorkload unknownTotal unknownMatchKey unknownField unknownTopic ordinalOutOfRange notInSelection',
      'ambiguousStream ambiguous noEvent needFunction functionMismatch notAPlan badArgument badType typeError incompatibleUnits',
      'incompatibleScope doubleCount percentBaselineRequired undeclaredParam unboundParam badBinding unsupported noBridge bridge.',
      'Scientific gaps are NOT errors: they come back as results with status absent / unavailable / unsupported and a reason.',
    ].join('\n'),
    cache: () => 'q.cache() → bounded session caches (texts, snapshots, values) with hits/misses/evictions. Keys use declarative plan parts only; lambdas never enter a key. q.cache({ clear: true }) empties them.',
  };
  const TOPIC_ALIASES = { event: 'events', archive: 'events', rows: 'events', select: 'events', run: 'timeline', function: 'timeline',
    timelines: 'timeline', state: 'states', excerpt: 'states', text: 'states', ir: 'metrics', metric: 'metrics', count: 'metrics',
    uses: 'metrics', change: 'changes', measure: 'changes', property: 'machine', backend: 'machine', profile: 'profiles',
    arms: 'profiles', arm: 'profiles', totals: 'profiles', typed: 'profiles', add: 'compare', bundle: 'compare', explain: 'compare',
    percent: 'compare', unsupported: 'capabilities', missing: 'capabilities', remarks: 'capabilities', pc: 'capabilities',
    joinPCs: 'capabilities', source: 'capabilities', sourceLocations: 'capabilities', param: 'params', bindings: 'params',
    result: 'results', shapes: 'results', error: 'errors' };
  const KIND_TOPICS = { events: 'events', pick: 'events', ordinals: 'events', count: 'results', state: 'states', excerpt: 'states',
    text: 'states', measurement: 'metrics', measurements: 'changes', changes: 'changes', uses: 'metrics', total: 'profiles',
    comparison: 'compare', endpoints: 'compare', sum: 'compare', bundle: 'compare', join: 'capabilities', remarks: 'capabilities',
    sourceLocations: 'capabilities', rows: 'events', archive: 'events', run: 'timeline', 'function': 'timeline' };
  function helpText(topic) {
    if (topic === undefined || topic === null || topic === '') return TOPICS.index();
    const t = TOPICS[topic] ? topic : TOPIC_ALIASES[topic] || KIND_TOPICS[topic];
    if (!t) throw unknownName('unknownTopic', 'help topic', topic, Object.keys(TOPICS));
    return TOPICS[t]();
  }

  // ───────────────────────── capabilities, status, cache ─────────────────────────
  function capabilities() {
    return [
      { capability: 'event headers, prints, original ordinals', status: 'available', use: 'a.events(), run.events(phase).at(n).text()' },
      { capability: 'static IR metrics on full function or module prints', status: 'available', use: 'q.ir.instructions()….count().at(state)' },
      { capability: 'IR metrics on loop fragments', status: 'unavailable', reason: 'loopFragment' },
      { capability: 'def-use edges inside one snapshot', status: 'available (opcode subset for operandIndex)', use: 'state.instructions()….uses()' },
      { capability: 'machine-function properties', status: 'available', use: 'q.machine.property(name).at(state)' },
      { capability: 'machine instruction metrics (spills, copies, MIR opcodes)', status: 'unsupported', reason: 'no MIR body parser in this release' },
      { capability: 'dynamic totals per arm (execution, typed)', status: liveList(() => (profilesApi.arms().length ? 'available' : 'unavailable')), use: 'profiles.arms()' },
      { capability: 'per-row samples', status: 'inspect', use: 'profiles.arm(name).describe().sampleKeys / .samples()' },
      { capability: 'PC samples and PC joins', status: 'unavailable', reason: 'missingPCSamples; no final image registered', use: 'q.joinPCs(…)' },
      { capability: 'source locations', status: 'unavailable unless the module has debug info', reason: 'missingDebugLocations', use: 'run.initialModule().sourceLocations({ function })' },
      { capability: 'optimization remarks', status: 'unavailable', reason: 'missingRemarksArtifact', use: 'run.remarks().forEvent(e)' },
      { capability: 'fragments, params, explain, session pins', status: 'available', use: 'q.fragment, q.param, q.explain, q.session' },
    ];
  }
  function cacheStats(options) {
    if (options && options.clear) { Object.keys(cache).forEach(k => cache[k].clear()); resolvedScopes.clear(); }
    return Object.keys(cache).map(k => cache[k].stats()).concat([{ name: 'resolvedScopes', entries: resolvedScopes.size }]);
  }
  function status() {
    const methods = ['events', 'text', 'profile', 'stats', 'initialModule', 'profileSHA'];
    return { version: VERSION, bridge: methods.filter(m => bridge && typeof bridge[m] === 'function'),
      archive: liveList(() => ({ variants: index().variants, streams: archive.streams() })), caches: cacheStats(), host: liveList(() => callBridge('stats', [])) };
  }

  // ───────────────────────── public surface ─────────────────────────
  const ir = {
    instructions() { return new InstructionQuery([]); },
    opcodes() { return OPCODES.slice(); },
    help() { return helpText('metrics'); },
  };
  param.help = () => helpText('params');
  session.help = () => 'q.session.pin(result, note) · q.session.pins() · q.session.clear() — pins are a session effect; plans stay unchanged.';
  const q = {
    version: VERSION,
    run: runPlan,
    help: helpText,
    archive(arg) {
      if (arg !== undefined) throw QueryError('noPaths', 'this session has one archive and the API takes no paths', { fix: 'q.archive() or the global a' });
      return archive;
    },
    profiles(arg) {
      if (arg !== undefined) throw QueryError('noPaths', 'the summaries are already loaded; the API takes no paths', { fix: 'q.profiles() or the global profiles' });
      return profilesApi;
    },
    ir, machine, param, session,
    bundle,
    add() { return new AddPlan(Array.prototype.slice.call(arguments), null); },
    compare(before, after) { return new ComparePlan(before, after, {}); },
    joinPCs(summary, image) { return new JoinPlan(summary, image, []); },
    explain, fragment, capabilities, status,
    cache: cacheStats,
  };
  root.q = q;
  root.a = archive;
  root.profiles = profilesApi;
})(typeof globalThis !== 'undefined' ? globalThis : this, typeof __trace !== 'undefined' ? __trace : undefined);
