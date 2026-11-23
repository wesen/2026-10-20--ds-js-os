  // query/70: def-use edges, fragments, explain, session pins (q.session), the profiles facade (one scope with the other files here; install.go joins them in file-name order)
  // ───────────────────────── def-use edges inside one snapshot ─────────────────────────
  // Value of a typed operand ("ptr noundef %work" → "%work"); attributes sit between type and value.
  function valueToken(part) {
    const t = typedOperand(part || '');
    const v = t && t.value ? t.value : String(part || '');
    const w = v.split(/\s+/);
    return w[w.length - 1];
  }
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
  FunctionHandle.prototype['with'] = function (frag) {
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

