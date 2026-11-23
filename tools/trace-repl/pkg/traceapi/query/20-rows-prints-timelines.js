  // query/20: row plans, prints, event selections and timelines (one scope with the other files here; install.go joins them in file-name order)
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
  // A Ref runs to the next header. In the middle end its tail is -debug-pass-manager output: analysis
  // bookkeeping and the announcement of the NEXT pass ("Running pass: EarlyCSEPass on row" ends the
  // SROA print). That tail is not this snapshot, so it is split off and never searched or measured.
  const TRAILER_LINE = /^(Running (pass|analysis): |Invalidating (analysis: |all non-preserved analyses)|Clearing all analysis results for: |Skipping pass: )/;
  // Scans from the end only, so a 10 kB machine print costs a few line reads, not a split of the whole print.
  function splitTrailer(raw) {
    const trailer = [];
    let end = raw.length;
    for (;;) {
      let stop = end;
      while (stop > 0 && raw[stop - 1] === '\n') stop--;
      if (stop === 0) { end = 0; break; }
      const start = raw.lastIndexOf('\n', stop - 1) + 1, line = raw.slice(start, stop);
      if (start === 0 || !TRAILER_LINE.test(line)) { end = stop; break; }   // the first line is the header
      trailer.unshift(line);
      end = start;
    }
    return { print: raw.slice(0, end) + '\n', trailer, tail: raw.slice(end) };
  }
  // UTF-8 length of the bytes read for e (print without its added newline, plus the split-off tail).
  // Computed only when an excerpt needs stream offsets: it is a per-character loop in the interpreter.
  function rawBytesOf(t) {
    if (t.rawBytes === undefined) t.rawBytes = utf8Length(t.print) - 1 + utf8Length(t.tail);
    return t.rawBytes;
  }
  const TRAILER_NOTE = 'pass-manager output after this print (it announces the next pass); excluded from this snapshot\'s evidence';
  function printOf(e) {
    const key = eventKey(e);
    let t = cache.texts.get(key);
    if (t === undefined) {
      const raw = callBridge('text', [e.variant, e.phase, e.ordinal]);
      const whole = typeof raw === 'string' ? raw : raw && (typeof raw.print === 'string' ? raw.print : raw.text);
      if (typeof whole !== 'string')
        throw QueryError('bridge', '__trace.text(' + [e.variant, e.phase, e.ordinal].map(x => JSON.stringify(x)).join(', ') + ') returned no print');
      const parts = splitTrailer(whole);
      t = { header: raw && typeof raw.header === 'string' ? raw.header : e.header, print: parts.print, trailer: parts.trailer, tail: parts.tail };
      cache.texts.set(key, t, (whole.length + t.header.length) * 2);
    }
    return t;
  }
  function trailerInfo(t) { return t.trailer.length ? { lines: t.trailer.length, note: TRAILER_NOTE } : null; }
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
  const resolvedScopes = new Map();   // one entry per backend event whose header names no IR unit, or per loop event read
  function resolveScope(e) {
    const loop = e.scope.kind === 'loop' && e.scope.functionEvidence && e.scope.functionEvidence.method !== 'header';
    if (e.scope.kind !== 'unresolved' && !loop) return e.scope;
    const key = eventKey(e);
    if (!resolvedScopes.has(key)) resolvedScopes.set(key, loop ? confirmLoop(e) : scopeFromPrint(printOf(e).print));
    return resolvedScopes.get(key);
  }
  function labelRe(name) { return new RegExp('^(?:' + escapeRe(name) + '|"' + escapeRe(name) + '"):', 'm'); }
  // Checks a loop scope against the bytes: the print must be a loop fragment (or, for an invalidated
  // loop, the module), and the loop's header block should be a block of the function in the anchor print.
  function confirmLoop(e) {
    const s = Object.assign({}, e.scope, { functionEvidence: Object.assign({}, e.scope.functionEvidence),
      ownerHint: e.scope.ownerHint ? Object.assign({}, e.scope.ownerHint) : e.scope.ownerHint });
    const print = printOf(e).print, kind = printKind(print);
    if (kind === 'functions' && definedFunctions(print).indexOf(s.loop) >= 0)
      return { kind: 'function', function: s.loop, resolvedFrom: 'print', note: 'the print defines this function, which the initial module does not (created during the pipeline)' };
    s.print = kind === 'loop' ? 'loopFragment' : kind;
    s.headerBlockInPrint = kind === 'loop' ? labelRe(s.loop).test(print) : null;
    if (s.headerBlockInPrint === false)
      s.headerNote = 'the header names the loop as it was before the pass; a pass that replaces the header (LoopRotatePass) leaves that block out of its print';
    if (kind !== 'loop' && !(s.invalidated && kind === 'module'))
      s.note = 'expected a loop fragment' + (s.invalidated ? ' or, for an invalidated loop, a module print' : '') + '; found a ' + kind + ' print';
    // The anchor print containing a block of that name supports the hint but does not prove ownership
    // (block names such as for.body repeat across functions), so function stays null either way.
    if (s.ownerHint && s.ownerHint.anchorOrdinal !== undefined) {
      const anchor = stream(e.variant, e.phase).byOrdinal.get(s.ownerHint.anchorOrdinal);
      s.ownerHint.headerBlockInAnchorPrint = anchor ? labelRe(s.loop).test(printOf(anchor).print) : null;
    }
    return s;
  }
  function covers(e, fn) {
    // Loop membership uses the header-time assignment, never a print read, and keeps an unassigned loop in
    // every timeline: wrongly keeping a loop print only turns a change into "unknown"; wrongly dropping
    // one would let changes() difference across passes that ran in between.
    if (e.scope.kind === 'loop') return e.scope.function === null || e.scope.function === fn;
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
        if (d.fn !== null && !covers(events[j], nameAt(d, events[j]))) continue;
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
      let inSelection = d.fn === null || covers(e, nameAt(d, e));
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
        return { kind: 'text', ordinal: e.ordinal, variant: e.variant, phase: e.phase, header: t.header, print: t.print, ref: e.ref, trailer: trailerInfo(t) };
      });
    }
  }
  class FnPlan extends Plan {
    constructor(kind, label, fn) { super(kind, label); this._fn = fn; }
    _eval(ctx) { return this._fn(ctx); }
  }

