  // query/40: snapshots, states, value references, metrics, measured timelines (one scope with the other files here; install.go joins them in file-name order)
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
      const d = this._pick._rows && this._pick._rows._domain;
      const nameOf = d && d.follow && fn === d.fn ? ev => nameAt(d, ev) : () => fn;
      if (this._side === 'after' || fn === null) return { event: e, fn: nameOf(e), followedAs: fn, of: e };
      const events = stream(e.variant, e.phase).events;
      let prev = null;
      for (let i = 0; i < events.length && events[i].ordinal < e.ordinal; i++) if (covers(events[i], nameOf(events[i]))) prev = events[i];
      return { event: prev, fn: prev ? nameOf(prev) : fn, followedAs: fn, of: e, derived: true };
    }
    _snapshot(ctx, fnHint, level) {
      const t = this._target(ctx, fnHint);
      if (!t.event)
        return { status: 'unavailable', reason: 'noEarlierPrint', why: UNAVAILABLE_WHY.noEarlierPrint, fn: t.fn, level,
          side: 'before', of: t.of.ordinal, source: sourceWitness(t.of), fix: 'a.variant("' + t.of.variant + '").initialModule() is the module given to the pipeline' };
      let snap = level === 'machine' ? machineSnapshot(t.event, t.fn) : irSnapshot(t.event, t.fn);
      if (t.followedAs && t.fn !== t.followedAs) snap = Object.assign({}, snap, { aliasOf: t.followedAs });
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
        const snap = t.fn ? irSnapshot(t.event, t.fn) : null, whole = printOf(t.event);
        const text = snap && snap.functionText ? snap.functionText : whole.print;
        const lines = text.split('\n');
        return { kind: 'text', scope: snap && snap.functionText ? 'function' : 'print', function: t.fn, source: sourceWitness(t.event),
          lineRange: snap && snap.lineRange ? snap.lineRange : [1, lines.length], truncated: lines.length > maxLines,
          text: lines.slice(0, maxLines).join('\n'), trailer: snap && snap.functionText ? null : trailerInfo(whole) };
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
    const read = rawBytesOf(t);
    if (read === span) return { offset: r.start, basis: 'ref span equals the bytes read (the print keeps their prefix)' };
    const head = utf8Length(t.header + '\n');
    if (head + read === span) return { offset: r.start + head, basis: 'ref span equals header line + bytes read' };
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
        excluded: useFn ? null : trailerInfo(text),
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
      if (snap.fn !== this.fn && snap.aliasOf !== this.fn) throw QueryError('functionMismatch', this.describe() + ' cannot be resolved in a snapshot of ' + snap.fn);
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
  ['value', 'status', 'witnesses'].forEach(k => {
    Object.defineProperty(Metric.prototype, k, { configurable: true, enumerable: false, get() {
      throw QueryError('notEvaluated', 'a metric has no ' + k + ' until it is bound to a state and run', { fix: 'q.run(metric.at(row.timeline("middle").at(74).after)).' + k });
    } });
  });
  function describeValue(v) {
    if (v instanceof Plan) return 'a plan (' + v._kind + ': ' + v._label + ')';
    if (v === null) return 'null';
    if (materializedInfo(v)) return runArgument(v, 1, true).what + ' (already a value; pass the plan itself)';
    if (v === undefined || typeof v === 'function') return runArgument(v, 1, true).what + ' (nothing was evaluated; not a zero)';
    return typeof v === 'object' ? 'an object with keys ' + Object.keys(v).slice(0, 6).join(', ') : typeof v + ' ' + JSON.stringify(v);
  }
  function computeMetric(metric, snap) {
    // Results are copied out of the cache so that a caller mutating a result cannot change later answers.
    const k = snap.key + '#' + metric._spec.key;
    let hit = cache.values.get(k);
    if (hit === undefined) hit = cache.values.set(k, metric._spec.compute(snap));
    return JSON.parse(JSON.stringify(hit));
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
  function measureEvent(e, metric, fn, d) {
    const m = metric._spec;
    const name = d && d.follow && fn === d.fn ? nameAt(d, e) : fn;
    let snap = m.level === 'machine' ? machineSnapshot(e, name) : irSnapshot(e, name);
    if (name !== fn) snap = Object.assign({}, snap, { aliasOf: fn });
    const v = snap.status === 'available' ? computeMetric(metric, snap) : { status: snap.status, value: null, reason: snap.reason };
    const row = { variant: e.variant, phase: e.phase, ordinal: e.ordinal, pass: e.pass, header: e.header, function: name,
      status: v.status, value: v.value, reason: v.reason || null, coverage: snap.coverage || null, unit: m.unit, ref: e.ref };
    if (d && d.follow) {
      row.followedAs = fn;
      const r = renameAt(d, e);
      if (r) row.rename = r;
    }
    return row;
  }
  class MeasureRows extends Rows {
    constructor(sel, metric, fn) {
      super('measurements', sel._label + '.measure(' + metric._spec.label + ')',
        (ctx, visit) => sel._each(ctx, e => visit(measureEvent(e, metric, fn, sel._domain))),
        { unit: metric._spec.unit, what: 'measurement' });
      this._sel = sel; this._metric = metric; this._fn = fn;
    }
    changes() { return new ChangeRows(this); }
  }
  // Adjacency is judged against the unfiltered timeline (`base`) of the same function and stream AND the
  // original stream ordinals: after a where() that skips events, or when other events of the stream ran
  // between two rows of the timeline, a pair of rows is a 'gap', never a 'known' change.
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
  // Original stream ordinals strictly between two rows (events of any scope), so a gap names what ran in between.
  function ordinalsBetween(variant, phase, from, to) {
    const s = index().streams.get(streamKey(variant, phase));
    if (!s) return null;
    const out = [];
    for (let o = from + 1; o < to; o++) if (s.byOrdinal.has(o)) out.push(o);
    return out;
  }
  function changeRow(prev, cur, positions, valueType) {
    const out = { ordinal: cur.ordinal, pass: cur.pass, header: cur.header, from: prev ? prev.ordinal : null,
      fromPass: prev ? prev.pass : null, before: prev ? prev.value : null, after: cur.value, delta: null,
      changed: null, transition: null, status: null, reason: null, skipped: null, skippedOrdinals: null, endpointDelta: null,
      unit: cur.unit, ref: cur.ref };
    if (cur.followedAs) {      // a followed timeline: the name the function had at this ordinal, and the rename here
      out.function = cur.function;
      if (cur.rename) out.rename = cur.rename;
    }
    if (cur.status !== 'available') { out.status = cur.status; out.reason = cur.reason || cur.status; return out; }   // absent | unavailable | unsupported
    if (!prev) { out.status = 'first'; out.reason = 'no earlier row in this selection'; return out; }
    if (prev.status !== 'available') { out.status = 'unknown'; out.reason = 'previous row ' + prev.ordinal + ' is ' + prev.status + ' (' + prev.reason + ')'; out.before = null; return out; }
    const pk = streamKey(prev.variant, prev.phase) + '|' + prev.ordinal, ck = streamKey(cur.variant, cur.phase) + '|' + cur.ordinal;
    const pp = positions.order.get(pk), cp = positions.order.get(ck);
    const sameStream = prev.variant === cur.variant && prev.phase === cur.phase;
    const timelineAdjacent = pp !== undefined && cp !== undefined && cp - pp === 1;
    // A per-pass change is known only between consecutive ORIGINAL ordinals of one stream. Rows adjacent in
    // a function timeline can still have other events between them (another function's passes, loops of
    // unknown owner excluded elsewhere, or ordinals missing from the capture): that is a gap, not a change.
    const consecutive = sameStream && cur.ordinal - prev.ordinal === 1;
    if (!timelineAdjacent || !consecutive) {
      out.status = 'gap';
      out.skipped = pp !== undefined && cp !== undefined ? positions.list.slice(pp + 1, cp) : null;
      out.skippedOrdinals = sameStream ? ordinalsBetween(cur.variant, cur.phase, prev.ordinal, cur.ordinal) : null;
      out.reason = !timelineAdjacent ? 'rows are not adjacent in the function timeline; intervening events may have changed the value'
        : !sameStream ? 'rows come from different streams (' + prev.variant + '/' + prev.phase + ', ' + cur.variant + '/' + cur.phase + '); ordinals restart per stream'
        : 'original ordinals ' + prev.ordinal + ' and ' + cur.ordinal + ' are not consecutive' +
          (out.skippedOrdinals && out.skippedOrdinals.length ? ' (stream events ' + out.skippedOrdinals.join(', ') + ' lie between them, outside this timeline)' : ' (no stream event recorded between them: ordinals missing from the capture)') +
          '; the difference is not attributable to one pass';
      if (valueType === 'count') out.endpointDelta = cur.value - prev.value;
      return out;
    }
    out.status = 'known';
    if (valueType === 'count') { out.delta = cur.value - prev.value; out.changed = out.delta !== 0; }
    else { out.changed = JSON.stringify(prev.value) !== JSON.stringify(cur.value); if (valueType === 'boolean') out.transition = prev.value + '→' + cur.value; }
    return out;
  }

