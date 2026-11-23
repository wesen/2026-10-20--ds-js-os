  // query/30: the archive (global a), runs, functions, the LLVM IR parser (one scope with the other files here; install.go joins them in file-name order)
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
  // ── function renames ──
  // The archive records a rename when a module print defines a new name that the previous module print
  // declared as an alias of a function that is now gone (GlobalOpt's alias resolution), or that has exactly
  // the body the vanished function last had. A rename that changes the body and leaves no alias is not seen.
  const renameCache = new Map();
  function renamesOf(variant) {
    if (!renameCache.has(variant))
      renameCache.set(variant, bridge && typeof bridge.renames === 'function' ? bridge.renames(variant) : []);
    return renameCache.get(variant).map(r => Object.assign({}, r));
  }
  // Earlier names of fn, newest first.
  function aliasChain(variant, fn) {
    const out = [], seen = new Set([fn]);
    let cur = fn;
    for (;;) {
      const r = renamesOf(variant).filter(x => x.to === cur).sort((x, y) => (x.phase === y.phase ? y.ordinal - x.ordinal : x.phase === 'backend' ? -1 : 1))[0];
      if (!r || seen.has(r.from)) return out;
      out.push({ name: r.from, renamedTo: r.to, phase: r.phase, ordinal: r.ordinal, pass: r.pass, method: r.method,
        aliasOrdinal: r.aliasOrdinal === undefined ? null : r.aliasOrdinal, ref: r.ref });
      seen.add(r.from);
      cur = r.from;
    }
  }
  // Segments of a followed timeline in one stream, oldest first: events before `before` carry `name`.
  function followSegments(variant, phase, fn) {
    return aliasChain(variant, fn).filter(x => x.phase === phase)
      .map(x => ({ name: x.name, before: x.ordinal, method: x.method })).sort((x, y) => x.before - y.before);
  }
  function nameAt(d, e) {
    if (d.follow) for (let i = 0; i < d.follow.length; i++) if (e.ordinal < d.follow[i].before) return d.follow[i].name;
    return d.fn;
  }
  function renameAt(d, e) {
    for (let i = 0; i < d.follow.length; i++)
      if (e.ordinal === d.follow[i].before) return { from: d.follow[i].name, to: i + 1 < d.follow.length ? d.follow[i + 1].name : d.fn, method: d.follow[i].method };
    return null;
  }
  class FunctionHandle {
    constructor(variant, name) { this.variant = variant; this.name = name; }
    timeline(phase, options) {
      const p = normalizePhase(this.variant, requireString(phase, 'timeline(phase)', 'row.timeline("middle")'));
      if (options !== undefined && (options === null || typeof options !== 'object' || Object.keys(options).some(k => k !== 'follow')))
        throw QueryError('badArgument', 'timeline(phase, options) takes { follow: true }', { fix: 'kernel.timeline("middle", { follow: true })' });
      const segments = options && options.follow ? followSegments(this.variant, p, this.name) : [];
      return new EventSelection({ variant: this.variant, phase: p, fn: this.name, follow: segments.length ? segments : null },
        'a.variant("' + this.variant + '").function("' + this.name + '").timeline("' + p + '"' + (options && options.follow ? ', { follow: true }' : '') + ')');
    }
    // Earlier names of this function, newest first: [{name, renamedTo, phase, ordinal, pass, method, aliasOrdinal, ref}].
    aliases() { return aliasChain(this.variant, this.name); }
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
    // Function renames in this variant, middle before backend: [{phase, ordinal, pass, from, to, method, aliasOrdinal?, bodySHA256?, ref}].
    renames() { return renamesOf(this.name); }
    functionNamed(name) {
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
  // run.function(name): assigned by key so that older parsers need not accept a keyword method name.
  Run.prototype['function'] = function (name) { return this.functionNamed(name); };
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
    toJSON() { return { archive: ARCHIVE_NAME, variants: index().variants, use: 'a.help()' }; },
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

