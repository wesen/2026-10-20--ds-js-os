/* query.js — compiler-evidence query library for a PicoCalc LLVM pass-dump archive.
 * Runs inside the Goja trace REPL. The host injects one bridge object, __trace.
 * Public globals: q (query language), a (the archive), profiles (execution summaries).
 * Evaluation is synchronous: q.run(plan) or plan.run(). Nothing here prints to stdout.
 */
  // query/00: errors, names, the bridge, bounded caches (one scope with the other files here; install.go joins them in file-name order)
  const VERSION = '0.1.0';
  // The mounted capture's name, from its ticket directory (the manifest has no title).
  const ARCHIVE_NAME = (() => {
    try { return bridge && typeof bridge.describe === 'function' ? bridge.describe().name : 'an LLVM pass-dump archive'; }
    catch (err) { return 'an LLVM pass-dump archive'; }
  })();

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

