  // query/50: machine-function properties (q.machine), execution summaries (one scope with the other files here; install.go joins them in file-name order)
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
  // ── treatment metadata: study/capture provenance, NOT measurements ──
  // Curated from the capture scripts (execute.py, typed-counts.mjs) and the studies (study.md,
  // evidence.md). Keyed by profile source + entry so a label never attaches to another source.
  const TREATMENT_CATALOG = 'picocalc-row-treatments.v1';
  const TREATMENT_BASIS = {
    typed: ['typed-counts.mjs (build options, workload, counters)', 'study.md (treatment design)', 'evidence.md §4'],
    execution: ['execute.py (link, workload, counters)', 'evidence.md §3 (build table, LSR pairs)'],
  };
  const TYPED_TREATMENTS = {
    stock: { role: 'baseline', build: 'typedRv32.compile(src, [], undefined, { pieLoops: undefined })',
      design: 'ordinary Typed RV32 backend; no PIE-loops region inference' },
    scalar: { role: 'matched scalar control for typed-pie', build: 'typedRv32.compile(src, [], undefined, { pieLoops: "scalar" })',
      design: 'PIE-loops region inference and lowering with a scalar producer: eight scalar subtracts and halfword stores fill the lane scratch; admission, memory intervals, iteration domain, lane consumer and fallback are shared with typed-pie',
      notA: 'a dedicated stack-placement treatment; its stack-count change vs typed-stock comes from the bundled region lowering, which the counts cannot apportion' },
    pie: { role: 'packed-producer treatment', build: 'typedRv32.compile(src, [], undefined, { pieLoops: "pie" })',
      design: 'same region lowering as typed-scalar, but the producer is one 16-byte load, one eight-lane signed saturating subtraction and one 16-byte scratch store; it targets the discriminant subtraction of the inner pixel loop',
      notA: 'an intervention targeted at stack traffic; the hit continuation (lookup, depth compare, stores) stays ordinary scalar code' },
  };
  const C_FORMS = {
    checked: 'checked C model of the Typed row (01-row.c, hand-written, not Typed compiler output): each element access calls a capacity check that traps on failure',
    unchecked: 'unchecked C model of the Typed row (01-row.c, hand-written, not Typed compiler output): no capacity checks',
  };
  const C_TOOLS = {
    gcc: { role: 'GCC build', build: 'GCC 14.2 -O2' },
    'gcc-noiv': { role: 'GCC build without IV optimization', build: 'GCC with -fno-ivopts' },
    llc: { role: 'LSR-on arm of the llc LSR ablation', build: 'LLVM 18 llc, Loop Strength Reduction on' },
    'llc-nolsr': { role: 'LSR-off arm of the llc LSR ablation', build: 'LLVM 18 llc -disable-lsr, from the same optimized module as the llc arm' },
    llvm: { role: 'LLVM-built object labelled "llvm"', build: null },
  };
  const TREATMENT_NOT_ATTRIBUTABLE = [
    'an individual stack slot, frame offset or PC: totals and row samples carry no addresses (see q.joinPCs)',
    'spill vs prologue/epilogue save vs local stack home vs scratch: the predicate sees only the base register sp',
    'an individual optimization inside a treatment that bundles several changes',
    'cycles or ESP32-P4 board time: these are emulator counts',
    'trap-path behaviour: every workload input is a valid row',
  ];
  const TREATMENT_CAPTURE = {
    execution: { workload: 'one qemu-riscv32-static run of the linked executable per fixture row (fixtures/<y>.in on stdin); stdout must equal fixtures/<y>.gold',
      counter: 'QEMU exec trace (-one-insn-per-tb -d exec,nochain); only PCs inside the nm -S range of symbol row are counted' },
    typed: { workload: 'one runRv32 call of typedRayComputeRow per fixture row; each must not trap, must return 1 and must reproduce fixtures/<y>.gold',
      counter: 'runRv32 per-PC hook over the whole call; the script applies no symbol-range filter' },
  };
  const NOT_TIME = 'ESP32-P4 cycles or board time';
  const TREATMENT_FIELDS = {
    execution: {
      'totals.instructions': { scope: 'dynamic', meaning: 'QEMU guest instructions executed with PC inside the linked row symbol, summed over the workload', isNot: NOT_TIME },
      'totals.stackLoads': { scope: 'dynamic', meaning: 'executed lw/lh/lhu whose operand text contains (sp), summed over the workload', isNot: 'a stack-slot or spill count; byte, FP and copied-sp accesses are not counted' },
      'totals.stackStores': { scope: 'dynamic', meaning: 'executed sw/sh whose operand text contains (sp), summed over the workload', isNot: 'a stack-slot or spill count; byte, FP and copied-sp accesses are not counted' },
      rowBytes: { scope: 'static', meaning: 'bytes of linked machine code: the size of the C row symbol from nm -S on the linked executable', isNot: 'output bytes, the .gold file length, a checksum, or an execution count' },
    },
    typed: {
      'totals.instructions': { scope: 'dynamic', meaning: 'RV32 interpreter steps (r.steps): one decoded instruction per step, a packed instruction counts once', isNot: NOT_TIME },
      'totals.stackLoads': { scope: 'dynamic', meaning: 'executed PCs whose 32-bit word has rs1 = sp and major opcode LOAD (any integer width), summed over the workload', isNot: 'a stack-slot or spill count; compressed and vendor encodings are not decoded' },
      'totals.stackStores': { scope: 'dynamic', meaning: 'executed PCs whose 32-bit word has rs1 = sp and major opcode STORE (any integer width), summed over the workload', isNot: 'a stack-slot or spill count; compressed and vendor encodings are not decoded' },
      'totals.packets': { scope: 'dynamic', meaning: 'r.packed.stores: executed 16-byte packed scratch stores', isNot: 'a separately counted number of packed groups' },
      rowBytes: { scope: 'static', meaning: 'absent from this summary: typed-counts.mjs records no code size', isNot: 'a Typed image size; image bytes are a study figure (study.md)' },
    },
  };
  const SHARED_FIELDS = {
    samples: { scope: 'dynamic', meaning: 'per-row totals for a few fixture rows, keyed by row index', isNot: 'PC samples' },
    rowsVerified: { scope: 'workload', meaning: 'row inputs whose output equalled fixtures/<y>.gold', isNot: 'a count of output bytes' },
  };
  function ownKey(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function treatmentOf(arm) {
    const provenance = { kind: 'study/capture metadata', measured: false, catalog: TREATMENT_CATALOG, basis: TREATMENT_BASIS[arm.source] || [],
      note: 'curated from the attached study and capture sources; not read from the profile entry and not covered by source.digest' };
    if (arm.source === 'typed' && ownKey(TYPED_TREATMENTS, arm.key)) {
      const t = TYPED_TREATMENTS[arm.key];
      return { id: arm.arm, status: 'described', role: t.role, design: t.design, build: t.build, notA: t.notA || null, provenance };
    }
    const m = arm.source === 'execution' ? /^(checked|unchecked)-(.+)$/.exec(arm.key) : null;
    if (m && ownKey(C_TOOLS, m[2])) {
      const c = C_TOOLS[m[2]];
      return { id: arm.arm, status: c.build ? 'described' : 'partial', role: c.role, design: C_FORMS[m[1]],
        build: c.build || 'not described by the attached sources (execute.py only links ' + m[1] + '/' + m[2] + '.o)', notA: null, provenance };
    }
    return { id: arm.arm, status: 'undescribed', why: 'no study/capture metadata for ' + arm.source + '["' + arm.key + '"] in ' + TREATMENT_CATALOG };
  }
  function treatmentComparisons(arm) {
    const out = [];
    const pair = (before, after, isolates, heldEqual) => { if (arm.arm === before || arm.arm === after) out.push({ before, after, isolates, heldEqual }); };
    if (arm.source === 'typed') {
      pair('typed-scalar', 'typed-pie', 'the packet producer only (scalar lane fill vs packed subtraction)',
        'source, workload, counters, admission, memory intervals, iteration domain, lane consumer, fallback');
      pair('typed-stock', 'typed-scalar', 'no single change: the whole region lowering (admission and entry guards, lane scratch, checked-interval reuse, register-held induction state) with a scalar producer',
        'source, workload, counters');
      pair('typed-stock', 'typed-pie', 'no single change: region lowering plus packed producer', 'source, workload, counters');
    }
    const m = arm.source === 'execution' ? /^(checked|unchecked)-(llc|llc-nolsr)$/.exec(arm.key) : null;
    if (m) pair(m[1] + '-llc-nolsr', m[1] + '-llc', 'LLVM backend Loop Strength Reduction: its net effect through the rest of the llc pipeline',
      'optimized module, contract, link, workload, counters; only -disable-lsr differs');
    return out;
  }
  function treatmentFields(arm) {
    const table = TREATMENT_FIELDS[arm.source] || {}, out = {};
    Object.keys(arm.entry.totals).forEach(k => { const f = 'totals.' + k; out[f] = table[f] || { scope: 'dynamic', meaning: 'not described by ' + TREATMENT_CATALOG, isNot: null }; });
    if (table.rowBytes) out.rowBytes = table.rowBytes;
    Object.keys(SHARED_FIELDS).forEach(k => { if (arm.entry[k] !== undefined) out[k] = SHARED_FIELDS[k]; });
    return out;
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
    _chain() {
      return 'profiles.arm(' + (this._armSpec instanceof Param ? this._armSpec.name : JSON.stringify(this._armSpec)) + ')' +
        (this._region ? '.region("' + this._region + '")' : '') + (this._workload ? '.workload("' + this._workload + '")' : '');
    }
    // describe(), totals(), samples() are eager: they read the summary now, so a q.param arm cannot be bound yet.
    _eagerArm(method) {
      if (this._armSpec instanceof Param)
        throw QueryError('unboundParam', this._chain() + '.' + method + '() is eager (it reads the summary now), so it cannot use the q.run binding of parameter ' + JSON.stringify(this._armSpec.name),
          { fix: 'name the arm: profiles.arm(' + JSON.stringify((this._armSpec.choices || [])[0] || 'checked-llc') + ').' + method + '(), or stay lazy: q.run(' + this._chain() +
            '.total("instructions"), { bindings: { ' + this._armSpec.name + ': … } })' });
      return findArm(this._armSpec);
    }
    totals() { const arm = this._eagerArm('totals'); return Object.keys(arm.entry.totals).map(k => ({ metric: k, value: arm.entry.totals[k], unit: unitOf(k).unit })); }
    describe() {
      // Eager (reads the summary now; a q.param arm is refused with a fix), tagged as a materialized
      // descriptor so q.run(d) === d, and carrying the treatment's study/capture metadata.
      const arm = this._eagerArm('describe'), e = arm.entry, t = treatmentOf(arm);
      const allSampleKeys = e.samples && typeof e.samples === 'object' ? Object.keys(e.samples) : null;
      return markMaterialized({ arm: arm.arm, source: { profile: arm.source, entry: arm.key, digest: arm.digest }, totals: e.totals,
        units: Object.keys(e.totals).reduce((o, k) => { o[k] = unitOf(k).unit; return o; }, {}),
        rowsVerified: e.rowsVerified === undefined ? null : e.rowsVerified, rowBytes: e.rowBytes === undefined ? null : e.rowBytes,
        sampleKeys: allSampleKeys ? allSampleKeys.slice(0, 40) : null,
        sampleCount: allSampleKeys ? allSampleKeys.length : null,
        sampleKeysTruncated: allSampleKeys ? allSampleKeys.length > 40 : null,
        contract: contractOf(arm), otherFields: Object.keys(e).filter(k => ['totals', 'rowsVerified', 'rowBytes', 'samples'].indexOf(k) < 0),
        // additive: what the arm is and what its numbers can and cannot support (study/capture metadata)
        treatment: t,
        countsCover: Object.assign({ treatment: arm.arm, role: t.role || null, verifiedBy: 'rowsVerified' },
          TREATMENT_CAPTURE[arm.source] || { workload: null, counter: null }),
        fields: treatmentFields(arm), comparisons: treatmentComparisons(arm), cannotAttribute: TREATMENT_NOT_ATTRIBUTABLE.slice(),
        timing: 'emulator counts only; ESP32-P4 timings are a separate study layer, not loaded as a profile' },
        { what: 'descriptor', of: this._chain() + '.describe()' });
    }
    samples() { const arm = this._eagerArm('samples'); return arm.entry.samples === undefined ? null : arm.entry.samples; }
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
      const workload = workloadOf(arm, this._sel._workload);
      // A requested workload that the entry contradicts is not a reading of that workload.
      const contradicted = this._sel._workload !== null && workload.rowsVerified !== null && !workload.verified;
      const status = typeof value !== 'number' ? 'unavailable' : contradicted ? 'unavailable' : 'available';
      return { kind: 'total', status, reason: typeof value !== 'number' ? 'notANumber' : contradicted ? 'workloadMismatch' : null,
        arm: arm.arm, metric: this._metric,
        value: status === 'available' ? value : null, recordedValue: contradicted ? value : undefined,
        unit: u.unit, dimension: u.dimension, category: u.category || null,
        scope: 'dynamic (executed work, summed over the workload)',
        region: { name: region, requested: !!this._sel._region, evidence: REGIONS[region] },
        workload, contract: contractOf(arm),
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

