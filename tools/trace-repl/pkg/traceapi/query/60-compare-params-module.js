  // query/60: add and compare, parameters (q.param), the initial module, missing artifacts (one scope with the other files here; install.go joins them in file-name order)
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
      } else {
        const states = rs.map(r => JSON.stringify([r.state.variant, r.state.phase, r.state.ordinal, r.state.function, r.state.side]));
        if (states.some(s => s !== states[0])) throw QueryError('incompatibleScope', 'q.add over static counts of different states does not describe one program', { fix: 'q.compare or q.bundle for different states' });
        out.note = 'static selections are summed as given; q.add does not prove that they are disjoint';
      }
      out.value = rs.reduce((s, r) => s + r.value, 0);
      out.unit = rs[0].kind === 'total' ? rs[0].dimension : rs[0].unit;
      out.formula = rs.map(r => r.metric + '=' + r.value).join(' + ') + ' = ' + out.value;
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
    if (!s || !t || s.variant !== t.variant || s.phase !== t.phase || !s.function || s.function !== t.function ||
        typeof s.ordinal !== 'number' || typeof t.ordinal !== 'number')
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
      return markMaterialized({ kind: 'initialModule', variant: this.variant, digest: m.digest, bytes: utf8Length(m.text), functions: definedFunctions(m.text), debug: debugFacts(m.text, null) },
        { what: 'descriptor', of: 'a.variant("' + this.variant + '").initialModule().describe()' });
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

