  // query/10: plans, the synchronous terminal, event headers and scopes (one scope with the other files here; install.go joins them in file-name order)
  // ───────────────────────── plans and the synchronous terminal ─────────────────────────
  // Values this library has already materialized: eager describe() descriptors and every plan result.
  // They are tagged when created; q.run trusts the tag only, never an object's shape (copies are untagged).
  const MATERIALIZED = new WeakMap();
  function markMaterialized(value, info) {
    if (value !== null && typeof value === 'object') MATERIALIZED.set(value, info);
    return value;
  }
  function materializedInfo(v) { return v !== null && typeof v === 'object' ? MATERIALIZED.get(v) || null : null; }
  class Plan {
    constructor(kind, label) { this._kind = kind; this._label = label; }
    describe() { return this._label; }
    run(options) { return runPlan(this, options); }
    help() { return 'plan ' + this._label + '\n' + (KIND_TOPICS[this._kind] ? helpText(KIND_TOPICS[this._kind]) : helpText()); }
    toString() { return '[plan ' + this._label + '] (evaluate with q.run(plan) or plan.run())'; }
    toJSON() { return { plan: this._label, kind: this._kind, note: 'not evaluated yet: q.run(plan) or plan.run()' }; }
    _evaluate(ctx) {
      if (ctx.memo.has(this)) return ctx.memo.get(this);
      const value = markMaterialized(this._eval(ctx), { what: 'result', of: this._label, kind: this._kind });
      ctx.memo.set(this, value);
      return value;
    }
    _eval() { throw QueryError('internal', 'plan kind ' + this._kind + ' has no evaluator'); }
  }
  // Reading a result field on an unevaluated plan is the plan-builder version of a missing await:
  // make it an instruction instead of a silent undefined.
  const RESULT_FIELDS = ['value', 'rows', 'status', 'outputs', 'delta', 'percent', 'witnesses', 'hits', 'reason', 'before', 'after'];
  RESULT_FIELDS.forEach(k => {
    if (k === 'before' || k === 'after') return;          // event picks define .before/.after as states
    Object.defineProperty(Plan.prototype, k, { configurable: true, enumerable: false, get() {
      throw QueryError('notEvaluated', 'this is a plan (' + this._label + '); .' + k + ' belongs to its result', { fix: 'q.run(plan).' + k });
    } });
  });
  function newContext(options) {
    const opts = options || {};
    return { memo: new Map(), aux: new Map(), bindings: opts.bindings || {}, maxRows: opts.maxRows || 200, started: Date.now() };
  }
  // q.run(x, options?) — public contract (q.help("plans")):
  //   x is a plan → its result · x is { name: plan, … } with every value a plan → a bundle result
  //   x carries the MATERIALIZED tag (describe() descriptor, plan result) → x itself, unchanged; options → [alreadyMaterialized]
  //   anything else → [notAPlan] with err.got (what arrived) and err.fix. Nothing is coerced to a zero, an empty set or a default.
  const RUN_OPTIONS = ['bindings', 'maxRows'];
  function checkRunOptions(options, argc) {
    if (argc > 2)
      throw QueryError('badArgument', 'q.run(plan, options) takes one plan and optional options; got ' + argc + ' arguments, and the extra ones would be ignored',
        { fix: 'evaluate several plans together by name: q.run({ first: p1, second: p2 })', got: 'extraArguments' });
    if (options === undefined || options === null) return;
    if (options instanceof Plan || materializedInfo(options))
      throw QueryError('badArgument', 'q.run evaluates one plan; its second argument is options { bindings, maxRows }, not ' + runArgument(options, 1, true).what,
        { fix: 'evaluate several plans together by name: q.run({ first: p1, second: p2 })', got: 'planAsOptions' });
    if (typeof options !== 'object' || Array.isArray(options))
      throw QueryError('badArgument', 'q.run options must be an object { bindings, maxRows }; got ' + runArgument(options, 1, true).what,
        { fix: 'q.run(plan, { bindings: { minimum: 5 }, maxRows: 50 })', got: 'badOptions' });
    Object.keys(options).forEach(k => { if (RUN_OPTIONS.indexOf(k) < 0) throw unknownName('unknownOption', 'q.run option', k, RUN_OPTIONS); });
    const b = options.bindings, m = options.maxRows;
    if (b !== undefined && (b === null || typeof b !== 'object' || Array.isArray(b) || b instanceof Plan))
      throw QueryError('badArgument', 'q.run option bindings must be an object { paramName: value }; got ' + runArgument(b, 1, true).what,
        { fix: 'q.run(plan, { bindings: { minimum: 5 } })', got: 'badOptions' });
    if (m !== undefined && !(typeof m === 'number' && m % 1 === 0 && m > 0))
      throw QueryError('badArgument', 'q.run option maxRows must be a positive integer; got ' + runArgument(m, 1, true).what,
        { fix: 'q.run(plan, { maxRows: 500 })', got: 'badOptions' });
  }
  function runPlan(plan, options) {
    checkRunOptions(options, arguments.length);
    if (plan instanceof Plan) return plan._evaluate(newContext(options));
    const done = materializedInfo(plan);
    if (done) {
      const given = options ? Object.keys(options).filter(k => options[k] !== undefined) : [];
      if (given.length)
        throw QueryError('alreadyMaterialized', runArgument(plan, 1, true).what + ' is already a value; the options ' + given.join(', ') + ' cannot change it',
          { fix: done.what === 'result' ? 'run the plan with the options: q.run(' + done.of + ', { ' + given.map(k => k + ': …').join(', ') + ' })'
            : 'drop the options: ' + done.of + ' is the descriptor itself', got: done.what });
      return plan;     // idempotent by tag: the very object describe() / q.run produced, never a copy or a guess
    }
    if (plan && typeof plan === 'object' && !Array.isArray(plan) && Object.keys(plan).length &&
        Object.keys(plan).every(k => plan[k] instanceof Plan))
      return bundle(plan)._evaluate(newContext(options));     // q.run({ a: p1, b: p2 }) means a bundle
    const r = runArgument(plan, arguments.length, false);
    throw QueryError('notAPlan', 'q.run expects a plan or an object of named plans; got ' + r.what + (r.why ? '. ' + r.why : ''), { fix: r.fix, got: r.got });
  }
  const RUN_METHOD_HINTS = {
    total: 'q.run(profiles.arm("checked-gcc").total("instructions"))',
    describe: 'profiles.arm("checked-gcc").describe() (eager: the descriptor itself)',
    count: 'q.run(a.events().count())',
  };
  function firstPhase(variant) {
    try { const ps = phasesOf(variant); return !ps.length || ps.indexOf('middle') >= 0 ? 'middle' : ps[0]; } catch (err) { return 'middle'; }
  }
  // What arrived at q.run, in words, plus the next call to make. Only tags and classes are trusted, never shapes.
  // nested = describing an option or a bundle member (no bundle analysis, no recursion).
  function runArgument(v, argc, nested) {
    if (v instanceof Plan) return { got: 'plan', what: 'the plan ' + v._label, why: '', fix: 'q.run(plan)' };
    const done = materializedInfo(v);
    if (done) return { got: done.what, what: done.what === 'result' ? 'the evaluated ' + done.kind + ' result of ' + done.of : 'the descriptor ' + done.of,
      why: 'it is already a value', fix: 'use it directly' };
    if (v === undefined) return argc === 0
      ? { got: 'noArgument', what: 'no argument', why: 'nothing was evaluated', fix: RUN_METHOD_HINTS.total }
      : { got: 'undefined', what: 'undefined',
          why: 'nothing was evaluated, so this is not a zero, an empty set or an unavailable result. undefined usually comes from a misspelled method or field ' +
            '(describe().total instead of describe().totals), an unassigned variable or a lambda without return',
          fix: 'evaluate the argument alone to see what it is (a plan shows { plan, kind, note }), then q.run(thatPlan)' };
    if (v === null) return { got: 'null', what: 'null',
      why: 'null is a value, not a plan and not a zero (samples() and descriptor fields such as rowsVerified are null when the summary lacks them)',
      fix: 'use the value directly, or find the call or field that produced null' };
    if (typeof v === 'function') {
      const name = typeof v.name === 'string' ? v.name : '';
      return name
        ? { got: 'function', what: 'the function ' + name + ' itself', why: 'its call parentheses are missing, so nothing was evaluated',
            fix: 'call it: ' + (Object.prototype.hasOwnProperty.call(RUN_METHOD_HINTS, name) ? RUN_METHOD_HINTS[name] : '….' + name + '(…)') }
        : { got: 'function', what: 'an anonymous function', why: 'q.run does not call lambdas; a lambda belongs inside .where(…)',
            fix: 'q.run(selection.where(e => e.pass === "EarlyCSEPass").count())' };
    }
    if (typeof v === 'string') return { got: 'string', what: 'the string ' + JSON.stringify(v.length > 80 ? v.slice(0, 77) + '...' : v),
      why: 'q.run does not parse labels or source text; plan.describe() and metric.describe() return a label only',
      fix: 'pass the plan object itself: q.run(plan), not q.run(plan.describe())' };
    if (typeof v !== 'object') return { got: typeof v, what: 'the ' + typeof v + ' ' + String(v),
      why: 'it is already a plain value without unit, scope or provenance; q.run has nothing to evaluate and does not echo it',
      fix: typeof v === 'number' ? 'use the number directly, or ask for the total with unit, workload, contract and source: ' + RUN_METHOD_HINTS.total : 'use the value directly' };
    if (Array.isArray(v)) return v.length && v.every(isPlan)
      ? { got: 'arrayOfPlans', what: 'an array of ' + v.length + ' plans', why: 'q.run evaluates one plan or an object of named plans',
          fix: 'name them: q.run({ first: p1, second: p2 })' }
      : { got: 'array', what: 'an array of ' + v.length + ' value' + (v.length === 1 ? '' : 's'),
          why: 'eager listings such as profiles.arms(), sel.totals() and run.functions() already return values',
          fix: 'use the array directly; to evaluate several plans together: q.run({ name: plan, … })' };
    const handle = handleArgument(v);
    if (handle) return handle;
    const keys = Object.keys(v);
    if (!nested && keys.some(k => isPlan(v[k]) || materializedInfo(v[k]))) {
      const bad = keys.filter(k => !isPlan(v[k]));
      return { got: 'bundleMember', what: 'an object whose ' + bad.map(k => JSON.stringify(k) + ' is ' + runArgument(v[k], 1, true).what).join(', '),
        why: 'q.run treats an object as a bundle only when every value is a plan',
        fix: 'keep only plans in the object (e.g. sel.total("instructions") instead of sel.describe()) and read eager values outside q.run' };
    }
    if (!keys.length) return { got: 'object', what: 'an empty object', why: 'a bundle needs at least one named plan', fix: 'q.run({ name: plan })' };
    return { got: 'object', what: 'an object with keys ' + keys.slice(0, 6).join(', ') + (keys.length > 6 ? ', …' : ''),
      why: 'it is neither a plan, nor an object of plans, nor a value produced by describe() or q.run (copies and hand-built objects carry no tag)',
      fix: 'if it already holds the data you need, use it directly; otherwise evaluate the argument alone to see what it is (q.help("plans"))' };
  }
  function handleArgument(v) {
    if (v instanceof ProfileSelection) {
      const chain = v._chain();
      let names = [];
      try { if (!(v._armSpec instanceof Param)) names = Object.keys(findArm(v._armSpec).entry.totals); } catch (err) { names = []; }
      const metric = !names.length || names.indexOf('instructions') >= 0 ? 'instructions' : names[0];
      return { got: 'profileSelection', what: 'the profile selection ' + chain,
        why: 'a selection names an arm and is not evaluated' + (names.length ? '; its totals: ' + names.join(', ') : ''),
        fix: 'q.run(' + chain + '.total("' + metric + '")) for a total with unit and provenance, or ' + chain + '.describe() for the descriptor (eager; q.run returns it unchanged)' };
    }
    if (v instanceof FunctionHandle) {
      const at = 'a.variant("' + v.variant + '").function("' + v.name + '")', p = firstPhase(v.variant);
      return { got: 'functionHandle', what: 'the function handle ' + at,
        why: 'a function handle navigates to timelines and arguments; it is neither a plan nor an evaluated value',
        fix: 'q.run(' + at + '.timeline("' + p + '").count()) or q.run(' + at + '.timeline("' + p + '").at(n).after)' };
    }
    if (v instanceof Run) {
      const at = 'a.variant("' + v.name + '")';
      return { got: 'run', what: 'the run handle ' + at, why: 'a run handle navigates to streams and functions',
        fix: 'q.run(' + at + '.events("' + firstPhase(v.name) + '").count()); ' + at + '.phases() and ' + at + '.functions() return values now' };
    }
    if (v instanceof InitialModule) {
      const at = 'a.variant("' + v.variant + '").initialModule()';
      return { got: 'initialModule', what: 'the initial-module handle ' + at, why: 'it is an eager handle, not a plan',
        fix: at + '.describe() returns its facts now; plans: q.run(' + at + '.state("row")) or q.run(' + at + '.sourceLocations({ function: "row" }))' };
    }
    if (v instanceof Metric) {
      const p = v._spec.level === 'machine' ? 'backend' : 'middle';
      return { got: 'metric', what: 'the metric ' + v._spec.label, why: 'a metric is a definition; it has a value only at a state',
        fix: 'q.run(' + v._spec.label + '.at(row.timeline("' + p + '").at(n).after)) or q.run(row.timeline("' + p + '").measure(metric))' };
    }
    if (v instanceof InstructionQuery) {
      const label = v.toJSON().query;
      return { got: 'instructionQuery', what: 'the instruction selector ' + (v._state ? v._state._label + '.instructions()…' : label),
        why: 'a selector needs .count() or .sites()' + (v._state ? '' : ' and then a state'),
        fix: v._state ? 'add .count() or .sites(): q.run(state.instructions().opcode("load").count())' : 'q.run(' + label + '.count().at(row.timeline("middle").at(n).after))' };
    }
    if (v instanceof Param) return { got: 'param', what: 'the parameter ' + v.name, why: 'a parameter gets its value when a plan runs',
      fix: 'q.run(plan, { bindings: { ' + v.name + ': … } })' };
    if (v === archive) return { got: 'archive', what: 'the archive a', why: 'a is the archive handle', fix: 'q.run(a.events().count()); a.variants() and a.streams() return values now' };
    if (v === profilesApi) return { got: 'profiles', what: 'the profiles facade', why: 'it is the entry point for execution summaries',
      fix: 'profiles.arms() lists arms now; ' + RUN_METHOD_HINTS.total };
    const spaces = [[q, 'q'], [ir, 'q.ir'], [machine, 'q.machine'], [param, 'q.param'], [session, 'q.session']];
    for (let i = 0; i < spaces.length; i++)
      if (v === spaces[i][0]) return { got: 'namespace', what: 'the namespace ' + spaces[i][1], why: 'a namespace builds plans; it is not one', fix: spaces[i][1] + '.help()' };
    const proto = Object.getPrototypeOf(v);
    if (proto && proto !== Object.prototype && proto.constructor && proto.constructor.name)
      return { got: 'handle', what: 'the ' + proto.constructor.name + ' object', why: 'it is an input to other calls, not a plan',
        fix: typeof proto.help === 'function' ? 'its .help() lists the plans it builds' : 'q.help("plans")' };
    return null;
  }

  // ───────────────────────── event headers and scopes ─────────────────────────
  function unquote(s) { const t = String(s).trim(); return /^".*"$/.test(t) ? t.slice(1, -1) : t; }
  // A bare name ("row", "for.body29") is provisionally a function; index() keeps it a function only if
  // the module given to the pipeline defines it (or a CGSCC header names it) and otherwise makes it a loop.
  function parseScopeName(text) {
    let t = text.trim();
    const invalidated = / \(invalidated\)$/.test(t);
    if (invalidated) t = t.slice(0, -' (invalidated)'.length);
    if (t === '[module]') return { kind: 'module' };
    let m = /^\((.*)\)$/.exec(t);
    if (m) return { kind: 'cgscc', functions: m[1].split(/,\s*/).map(unquote) };
    m = /^loop %(\S+) in function (.+)$/.exec(t);
    if (m) return { kind: 'loop', loop: m[1], function: unquote(m[2]), functionEvidence: { method: 'header' } };
    const scope = { kind: 'function', function: unquote(t) };
    if (invalidated) scope.invalidated = true;
    return scope;
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
    // Split at the first " on ", as the archive's index does: pass names such as
    // "RequireAnalysisPass<llvm::GlobalsAA, llvm::Module>" contain spaces but never " on ".
    const m = /IR Dump (After|Before) (.+?) on (.+?)( omitted because no change)?(?: \*\*\*)?\s*$/.exec(h);
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
    const scopeEvidence = {};
    variants.forEach(v => { scopeEvidence[v] = assignLoopScopes(v, streams); });
    archiveIdx = { all, streams, variants: variants.sort(), phases: phases.sort(), scopeEvidence };
    return archiveIdx;
  }
  // New-PM loop passes name the loop by its header block ("on for.body29"); neither the header nor the
  // pass-manager line names the function. A bare header name is a function only if the module given to
  // the pipeline defines it or a CGSCC header names it; any other name is a loop. Nothing in such a
  // header or its fragment print proves which function owns the loop, so scope.function stays null
  // (every function timeline keeps the event). The nearest earlier event of the stream scoped to exactly
  // one function is only proximity: it is kept as scope.ownerHint { tentative: true, method, anchorOrdinal },
  // never as the owner. resolveScope later checks the print itself (confirmLoop).
  function assignLoopScopes(variant, streams) {
    let known;
    try { known = new Set(definedFunctions(initialModuleOf(variant).text)); }
    catch (err) { return { functions: null, note: 'initial module unreadable (' + err.message.split('\n')[0] + '); header names are taken as functions' }; }
    streams.forEach(s => { if (s.variant === variant) s.events.forEach(e => { if (e.scope.kind === 'cgscc') e.scope.functions.forEach(f => known.add(f)); }); });
    let loops = 0;
    streams.forEach(s => {
      if (s.variant !== variant) return;
      let anchor = null;
      s.events.forEach(e => {
        const sc = e.scope;
        if (sc.kind === 'function' && known.has(sc.function)) { anchor = { fn: sc.function, ordinal: e.ordinal }; return; }
        if (sc.kind === 'cgscc') { anchor = sc.functions.length === 1 ? { fn: sc.functions[0], ordinal: e.ordinal } : null; return; }
        if (sc.kind !== 'function') { if (sc.kind === 'module') anchor = null; return; }
        loops++;
        e.scope = { kind: 'loop', loop: sc.function, function: null,
          functionEvidence: { method: 'none', note: 'the header names only the loop header block, so ownership is not shown; function is null and every function timeline keeps this event' +
            (anchor ? ' (scope.ownerHint is a tentative proximity hint, not an owner)' : '') },
          ownerHint: anchor
            ? { function: anchor.fn, tentative: true, method: 'passManagerAdjacency', anchorOrdinal: anchor.ordinal,
                provenance: 'the nearest earlier event (ordinal ' + anchor.ordinal + ') of this ' + s.variant + '/' + s.phase + ' stream scoped to exactly one function; proximity only, not proof of ownership' }
            : null,
          classifiedBy: '"' + sc.function + '" is not a function of the module given to the pipeline' };
        if (sc.invalidated) e.scope.invalidated = true;
        e.function = e.scope.function;
      });
    });
    return { functions: Array.from(known).sort(), loopEvents: loops };
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

