// A JavaScript tokenizer for the bundler (CJI-3, step 5a): enough of the language to find the
// compiler's top-level declarations and the identifiers that refer to them. Template literals are
// split into their text chunks and the tokens of their ${} expressions, which are code.
//
// Token: { t: 'id' | 'num' | 'str' | 'tpl' | 're' | 'p' | 'com' | 'ws', v: text, s: start, e: end }
// ('tpl' is a chunk of template text including its delimiters: `...${, }...${, }...`)

const ID_START = /[A-Za-z_$ -￿]/;
const ID_PART = /[A-Za-z0-9_$ -￿]/;
const PUNCT = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&',
  '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**'];
// after these, a / starts a regular expression; after anything else it divides
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);

export function tokenize(src) {
  const out = [];
  let i = 0;
  const braces = [];   // for each open {, whether it opened a template substitution
  let lastSig = null;  // the last significant token
  const push = (t, s) => { const tok = { t, v: src.slice(s, i), s, e: i }; out.push(tok); if (t !== 'ws' && t !== 'com') lastSig = tok; };
  const regexAllowed = () => {
    if (!lastSig) return true;
    if (lastSig.t === 'id') return REGEX_AFTER_WORD.has(lastSig.v);
    if (lastSig.t === 'num' || lastSig.t === 'str' || lastSig.t === 're') return false;
    if (lastSig.t === 'tpl') return !lastSig.v.endsWith('`') ? true : false;
    if (lastSig.t === 'p') return ![')', ']', '}'].includes(lastSig.v);
    return true;
  };
  // the rest of a template from i (just after ` or }), up to and including ` or ${
  const templateChunk = (s) => {
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { i++; push('tpl', s); return false; }
      if (c === '$' && src[i + 1] === '{') { i += 2; push('tpl', s); braces.push(true); return true; }
      i++;
    }
    throw new Error(`unterminated template at ${s}`);
  };
  while (i < src.length) {
    const s = i, c = src[i];
    if (/\s/.test(c)) { while (i < src.length && /\s/.test(src[i])) i++; push('ws', s); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; push('com', s); continue; }
    if (c === '/' && src[i + 1] === '*') { const k = src.indexOf('*/', i + 2); if (k < 0) throw new Error(`unterminated comment at ${s}`); i = k + 2; push('com', s); continue; }
    if (ID_START.test(c)) { while (i < src.length && ID_PART.test(src[i])) i++; push('id', s); continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1]))) {
      while (i < src.length && /[0-9A-Za-z_.]/.test(src[i])) { if ((src[i] === 'e' || src[i] === 'E') && (src[i + 1] === '+' || src[i + 1] === '-')) i++; i++; }
      push('num', s); continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < src.length && src[i] !== c) { if (src[i] === '\\') i++; i++; }
      i++; push('str', s); continue;
    }
    if (c === '`') { i++; templateChunk(s); continue; }
    if (c === '}' && braces.length && braces[braces.length - 1]) { braces.pop(); i++; templateChunk(s); continue; }
    if (c === '/' && regexAllowed()) {
      i++;
      let cls = false;
      while (i < src.length) {
        const d = src[i];
        if (d === '\\') { i += 2; continue; }
        if (d === '[') cls = true; else if (d === ']') cls = false;
        else if (d === '/' && !cls) break;
        else if (d === '\n') throw new Error(`newline in a regular expression at ${s}`);
        i++;
      }
      i++;
      while (i < src.length && /[a-z]/.test(src[i])) i++;
      push('re', s); continue;
    }
    const p = PUNCT.find((q) => src.startsWith(q, i));
    if (p && !(p === '?.' && /[0-9]/.test(src[i + 2] ?? ''))) { i += p.length; push('p', s); continue; }
    if (c === '{') braces.push(false);
    if (c === '}') braces.pop();
    i++; push('p', s);
  }
  return out;
}
