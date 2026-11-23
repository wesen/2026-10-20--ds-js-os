  // query/80: help, capabilities, status, and the public surface (q, a, profiles) (one scope with the other files here; install.go joins them in file-name order)
  // ───────────────────────── help ─────────────────────────
  function liveList(fn) { try { return fn(); } catch (err) { return '(unavailable: ' + err.message.split('\n')[0] + ')'; } }
  const TOPICS = {
    index: () => [
      'q — compiler-evidence queries over ' + ARCHIVE_NAME + ' (release ' + VERSION + '). Globals: q, a (archive), profiles.',
      'Plans are lazy; evaluate synchronously with q.run(plan) or plan.run(). Results are plain objects with status, unit and witnesses.',
      'Eager calls (….describe(), profiles.arms(), run.functions()) return values at once; q.run returns a describe() descriptor unchanged (q.help("plans")).',
      '  q.run(a.events().count())                                // all header records, with byStream',
      '  run = a.variant("checked"); row = run.function("row"); middle = row.timeline("middle")',
      '  q.run(run.events("middle").at(74).select("ordinal", "header", "ref"))',
      '  hdr = q.ir.instructions().opcode("load").resultType("i32").pointer(row.argument(0)).count()',
      '  q.run(hdr.at(middle.at(74).after))                         // static sites, with witnesses',
      '  q.run(middle.measure(hdr).changes().where(c => c.status === "known" && c.delta < 0).first())',
      '  q.run(profiles.arm("checked-gcc").region("row").workload("opening-160-rows").total("instructions"))',
      'Topics: q.help("plans" | "events" | "timeline" | "states" | "metrics" | "changes" | "machine" | "profiles" | "compare" | "capabilities" | "params" | "results" | "errors" | "cache").',
      'Every object answers .help(). Statuses: available · absent (module print lacks the function) · unavailable (capture lacks it) · unsupported (parser limit).',
      ...(root.compiler && typeof root.compiler.help === 'function'
        ? ['The Typed compiler at a git revision or the working tree, several side by side: compiler.help().'] : []),
      ...(root.repo && typeof root.repo.help === 'function'
        ? ['Read-only repository files, now or at a git revision: repo.help(); files mounted at startup: mounts.help().'] : []),
      ...(root.stats && typeof root.stats.help === 'function'
        ? ['Medians, quantiles and paired block comparisons shared by every study: stats.help().'] : []),
      ...(root.simd && typeof root.simd.help === 'function'
        ? ['SIMD compiler decision ranges and guest PC counts: simd.help() (' + (root.simd.help().available ? 'study available' : 'no SIMD study mounted') + ').'] : []),
      'Physical ESP32-P4 timings are a separate global, never mixed into profiles (guest instruction counts): ' + liveList(() => {
        const hw = typeof root.hardware === 'object' && root.hardware && typeof root.hardware.help === 'function' ? root.hardware.help() : null;
        return hw === null ? 'hardware is not installed in this session.' : hw.available ? 'hardware.help() (available in this session).' : 'hardware.help() reports them unavailable in this session (no device study).';
      }),
    ].join('\n'),
    events: () => [
      'Events = header records of print-after-all streams; one stream per (variant, phase); ordinals restart at 0 per stream.',
      '  a.variants()  a.streams()  a.events().count()  a.variant("checked").events("middle").count()',
      '  run.events("backend").at(78)            // absolute ordinal in its original stream; out of range → [ordinalOutOfRange]',
      '  run.events("middle").where(e => e.pass === "LoopVectorizePass").first()   // .first() .last() .one() (.one() reports ambiguous)',
      '  .select("ordinal", "pass", "scope", "ref")  .limit(10)  .count()  .ordinals()  .text()',
      'Event fields: ' + EVENT_FIELDS.join(', ') + ' (+ host fields). pass = new-PM class (EarlyCSEPass) or llc pass ID (virtregrewriter); passId = pass.',
      'scope.kind: function · module · cgscc (functions) · loop (loop, function) · machineFunction · unresolved (llc header; resolved from the print).',
      'A loop header names only the loop\'s header block ("on for.body29"). A name the initial module does not define is a loop; its owner is not shown,',
      'so scope.function is null and every function timeline keeps the event. scope.ownerHint { function, tentative: true, method, anchorOrdinal,',
      'headerBlockInAnchorPrint, provenance } is the nearest earlier single-function event: a proximity hint, never an owner. "loop %L in function F" headers',
      'do name the owner (functionEvidence.method "header"). Loop prints are fragments: whole-function metrics on them are unavailable, so the next',
      'change in a timeline that keeps one is "unknown", never "known".',
      'A print ends before the next pass\'s "Running pass: …" announcement; that tail is never searched or measured (see trailer/excluded).',
      'Variants now: ' + liveList(() => index().variants.join(', ')) + '. Phases: ' + liveList(() => index().phases.join(', ')) + '.',
    ].join('\n'),
    timeline: () => [
      'A function timeline = the events of one stream whose print can contain the function (its function/cgscc events, loops it is shown to own,',
      'loops whose owner is not shown, and module prints).',
      '  row = a.variant("checked").function("row"); middle = row.timeline("middle"); machine = row.timeline("backend")',
      '  middle.at(74)   // same original ordinal as run.events("middle").at(74); an ordinal of another function → [notInSelection]',
      '  machine.where(e => e.passId === "virtregrewriter").select("ordinal", "passId", "scope", "ref")',
      '  run.functions()   row.argument(0)   row.initialState()   row.with(q.fragment("name.v1").on("irFunction", { m: fn => metric }))',
      'Filtering never renumbers. Measuring a filtered timeline marks non-adjacent pairs as gaps (see q.help("changes")).',
      'Renames: run.renames() lists functions that continued under another name (GlobalOpt resolving an alias, or an identical body).',
      '  kernel.aliases()   // earlier names, e.g. [{ name: "checked_shadow", ordinal: 17, method: "alias" }]',
      '  kernel.timeline("middle", { follow: true })   // earlier names before each rename; measure() rows carry function, followedAs and rename',
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
      '.changes() → lazy rows: ordinal, pass, from, fromPass, before, after, delta, changed, status, reason, unit, ref (+ skipped, skippedOrdinals, endpointDelta for gaps).',
      'status: known (full prints at consecutive original ordinals) · first · unavailable (this print) · unknown (previous print unavailable; predecessor reset)',
      '  · gap (rows not adjacent in the function timeline, or other stream events between them: skipped = timeline rows, skippedOrdinals = every original ordinal between).',
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
      '  eager, values now:  profiles.arms()   profiles.arm("checked-gcc").describe()   .totals()   .samples()   profiles.workloads()   profiles.regions()',
      '  lazy, use q.run:    .total(name)   q.add(…)   q.compare(…).  q.run(<a describe() descriptor>) returns it unchanged; see q.help("plans").',
      '  q.run(profiles.arm("checked-gcc").region("row").workload("opening-160-rows").total("instructions"))',
      '  stock = profiles.arm("typed-stock").region("row").workload("opening-160-rows")',
      '  q.run(q.add(stock.total("stackLoads"), stock.total("stackStores")).label("direct stack accesses"))',
      'Typed-summary entries are arms with the prefix "typed-" (typed-stock = typed["stock"]). Workload "opening-160-rows" is verified by rowsVerified === 160.',
      'What an arm IS: profiles.arm("typed-scalar").describe().treatment → role, design, build, notA, provenance.',
      '  Treatment labels are study/capture metadata (provenance.measured === false), not measurements; status "partial"/"undescribed" means the sources say no more.',
      '  .describe().countsCover (treatment, workload, counter) · .fields (scope static|dynamic, meaning, isNot) · .comparisons (what a pair isolates) · .cannotAttribute',
      '  .describe().units (one per total) · .sampleKeys (first 40) with .sampleCount and .sampleKeysTruncated; .samples() returns every sample',
      'Totals are dynamic emulator counts: QEMU guest instructions inside the C row symbol, or RV32 interpreter steps for Typed. Neither is cycles or board time.',
      'rowBytes is static: the nm -S size of the linked C row symbol, not output bytes or the .gold length. Typed summaries carry no code size.',
      'Stack totals are direct sp-based accesses summed over the workload; they cannot be attributed to a stack slot, a spill, or one optimization in a bundled treatment.',
      'Arms now: ' + liveList(() => profilesApi.arms().map(x => x.arm).join(', ')),
    ].join('\n'),
    compare: () => [
      'q.bundle({ name: plan, … }) keeps outputs separate. q.add(t1, t2) sums disjoint categories of one dimension and scope.',
      'q.compare(before, after) → delta (counts), equal/transition (booleans), matchedOn; .matchOn(keys…), .percentChange({ denominator: "before"|"after" }), .asEndpoints().',
      '  t = arm => profiles.arm(arm).region("row").workload("opening-160-rows").total("instructions")',
      '  q.run(q.compare(t("checked-llc-nolsr"), t("checked-llc")).matchOn("workload", "region", "checkedContract", "unit").percentChange({ denominator: "before" }))',
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
      'total: { kind, status, arm, metric, value, unit, dimension, category, scope, region, workload, contract, pipeline{status: notLinked}, source{profile, entry, digest, path} }',
      'comparison: { kind, status, before, after, valueType, unit, delta, percent?, denominator?, equal?, transition?, matchedOn, interval? }',
      'sum: { kind, label, status, value, unit, parts, formula }      bundle: { kind, outputs, keys }',
      'Units are kept apart: events (records) · rows (result rows) · static instruction sites · executed … (dynamic work).',
    ].join('\n'),
    errors: () => [
      'Errors are thrown as "[code] message\\n  fix: …". Codes: unknownVariant unknownPhase unknownFunction unknownOpcode unknownProperty',
      'unknownArm unknownRegion unknownWorkload unknownTotal unknownMatchKey unknownField unknownTopic ordinalOutOfRange notInSelection',
      'ambiguousStream ambiguous noEvent needFunction functionMismatch notAPlan badArgument badType typeError incompatibleUnits',
      'incompatibleScope doubleCount percentBaselineRequired undeclaredParam unboundParam badBinding unknownOption alreadyMaterialized',
      'notEvaluated (a result field such as .value read on a plan: q.run(plan).value) noSuchArgument unknownCoverage unknownProfile needState',
      'unknownTarget noPaths unavailable (profiles.source(name) could not read that source)',
      'unsupported noBridge bridge. q.run refusals (notAPlan, badArgument, alreadyMaterialized) carry err.got and err.fix: q.help("plans").',
      'Scientific gaps are NOT errors: they come back as results with status absent / unavailable / unsupported and a reason.',
    ].join('\n'),
    plans: () => [
      'Lazy plans vs eager values. A plan is a description (it shows as { plan, kind, note }); q.run(plan) or plan.run() evaluates it.',
      '  plans: a.events(…), run.events(p), row.timeline(p) and what they build (.at(n) .after .before .where .select .count() .first() .measure(m) .changes()),',
      '         metric.at(state), profiles.arm(n).total(name), q.add, q.compare, q.bundle, q.joinPCs',
      '  eager, values when called: profiles.arms() .sources() .workloads() .regions(), profiles.arm(n).describe() .totals() .samples(),',
      '         a.variants() a.streams() run.phases() run.functions() initialModule().describe() q.capabilities() q.explain(plan)',
      'q.run(x, options?) with options { bindings: { name: value }, maxRows: n }:',
      '  x is a plan → its result · x is { name: plan, … } (every value a plan) → a bundle result',
      '  x is a describe() descriptor or a q.run / plan.run result (nested outputs too) → x itself, unchanged (q.run(d) === d)',
      '      recognized by a tag set when the value was created, never by its shape: copies are untagged. Options with it → [alreadyMaterialized].',
      '  anything else → [notAPlan], with err.got naming what arrived and err.fix the next call. err.got is one of:',
      '      noArgument undefined null function string number boolean array arrayOfPlans bundleMember object',
      '      profileSelection functionHandle run initialModule metric instructionQuery param archive profiles namespace handle',
      '  bad options → [unknownOption] (did you mean) or [badArgument] with err.got planAsOptions · badOptions · extraArguments',
      'A refused call evaluated nothing. It is never a zero, an empty set or an unavailable result.',
      '  q.run(profiles.arm("checked-llc-nolsr").describe())                // the descriptor, same as without q.run',
      '  q.run(profiles.arm("checked-llc-nolsr").total("instructions"))     // a total with unit, workload, contract and source',
    ].join('\n'),
    cache: () => 'q.cache() → bounded session caches (texts, snapshots, values) with hits/misses/evictions. Keys use declarative plan parts only; lambdas never enter a key. q.cache({ clear: true }) empties them.',
  };
  const TOPIC_ALIASES = { event: 'events', archive: 'events', rows: 'events', select: 'events', run: 'timeline', function: 'timeline',
    timelines: 'timeline', state: 'states', excerpt: 'states', text: 'states', ir: 'metrics', metric: 'metrics', count: 'metrics',
    uses: 'metrics', change: 'changes', measure: 'changes', property: 'machine', backend: 'machine', profile: 'profiles',
    arms: 'profiles', arm: 'profiles', totals: 'profiles', typed: 'profiles', add: 'compare', bundle: 'compare', explain: 'compare',
    percent: 'compare', unsupported: 'capabilities', missing: 'capabilities', remarks: 'capabilities', pc: 'capabilities',
    joinPCs: 'capabilities', source: 'capabilities', sourceLocations: 'capabilities', param: 'params', bindings: 'params',
    result: 'results', shapes: 'results', error: 'errors', plan: 'plans', eager: 'plans', lazy: 'plans', describe: 'plans',
    materialized: 'plans', notAPlan: 'plans', alreadyMaterialized: 'plans', 'q.run': 'plans' };
  const KIND_TOPICS = { events: 'events', pick: 'events', event: 'events', ordinals: 'events', count: 'results', state: 'states', excerpt: 'states',
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
    const methods = ['events', 'text', 'profile', 'stats', 'initialModule', 'profileSHA', 'renames'];
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
