/* stats.js — the summary statistics compiler studies report, implemented once.
 * Installed in every trace-REPL session as the global `stats`. Pure functions over plain
 * arrays; nothing here reads the archive. Every function refuses input it cannot summarize
 * honestly (empty arrays, non-finite values, unmatched or duplicate pairs) with an Error
 * whose message names the offending keys.
 */
(function (root) {
  'use strict';

  function fail(code, message) {
    const e = new Error('[' + code + '] ' + message);
    e.name = 'StatsError';
    e.code = code;
    return e;
  }

  function numbers(xs, what) {
    if (!Array.isArray(xs)) throw fail('notAnArray', what + ' must be an array of numbers, got ' + typeof xs);
    if (xs.length === 0) throw fail('empty', what + ' is empty');
    xs.forEach((x, i) => {
      if (typeof x !== 'number' || !isFinite(x)) throw fail('notFinite', what + '[' + i + '] is ' + String(x) + ', not a finite number');
    });
    return xs.slice().sort((a, b) => a - b);
  }

  // Linear interpolation between order statistics (R type 7, NumPy's default):
  // position p * (n - 1) in the sorted sample.
  function quantileSorted(s, p) {
    const at = p * (s.length - 1), lo = Math.floor(at), hi = Math.ceil(at);
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (at - lo);
  }

  function quantile(xs, p) {
    if (typeof p !== 'number' || !(p >= 0 && p <= 1)) throw fail('badArgument', 'quantile p must be in [0, 1], got ' + String(p));
    return quantileSorted(numbers(xs, 'quantile input'), p);
  }

  // The middle value, or the mean of the two middle values for an even count.
  function median(xs) { return quantileSorted(numbers(xs, 'median input'), 0.5); }

  function mean(xs) {
    const s = numbers(xs, 'mean input');
    return s.reduce((a, b) => a + b, 0) / s.length;
  }

  function summary(xs) {
    const s = numbers(xs, 'summary input');
    return { n: s.length, min: s[0], q1: quantileSorted(s, 0.25), median: quantileSorted(s, 0.5),
      q3: quantileSorted(s, 0.75), max: s[s.length - 1], mean: s.reduce((a, b) => a + b, 0) / s.length };
  }

  // Percentage of the control that the candidate saves: 100 * (1 - candidate / control).
  // Positive means the candidate is lower (faster, smaller).
  function percentSaved(control, candidate) {
    if (typeof control !== 'number' || typeof candidate !== 'number' || !isFinite(control) || !isFinite(candidate))
      throw fail('notFinite', 'percentSaved needs two finite numbers, got ' + String(control) + ' and ' + String(candidate));
    if (control === 0) throw fail('zeroControl', 'percentSaved is undefined for a control of 0');
    return 100 * (1 - candidate / control);
  }

  function accessor(spec, what) {
    if (typeof spec === 'function') return spec;
    if (typeof spec === 'string') return r => r[spec];
    throw fail('badArgument', what + ' must be a function or a field name');
  }

  function predicate(spec, what) {
    if (typeof spec === 'function') return spec;
    throw fail('badArgument', what + ' must be a function row => boolean');
  }

  const keyText = k => typeof k === 'string' ? JSON.stringify(k) : String(k);
  const byKey = (a, b) => (typeof a.key === 'number' && typeof b.key === 'number') ? a.key - b.key
    : String(a.key) < String(b.key) ? -1 : String(a.key) > String(b.key) ? 1 : 0;

  // paired(rows, {key, control, candidate, value, better}) pairs one control row with one
  // candidate row per key and reports the median of the per-pair percentage saved. That is
  // the statistic the PicoCalc board studies report. percentSavedOfMedians, the change between
  // the two medians, is reported beside it, because the two differ and reports have mixed them.
  function paired(rows, spec) {
    if (!Array.isArray(rows)) throw fail('notAnArray', 'paired(rows, spec) needs an array of rows');
    if (spec === null || typeof spec !== 'object') throw fail('badArgument', 'paired(rows, {key, control, candidate, value}) needs a spec object');
    const key = accessor(spec.key, 'spec.key'), value = accessor(spec.value, 'spec.value');
    const isControl = predicate(spec.control, 'spec.control'), isCandidate = predicate(spec.candidate, 'spec.candidate');
    const better = spec.better === undefined ? 'lower' : spec.better;
    if (better !== 'lower' && better !== 'higher') throw fail('badArgument', 'spec.better must be "lower" or "higher"');
    const arms = { control: new Map(), candidate: new Map() };
    const duplicates = { control: [], candidate: [] };
    const both = [];
    rows.forEach((r, i) => {
      const c = !!isControl(r), d = !!isCandidate(r);
      if (c && d) { both.push(i); return; }
      if (!c && !d) return;
      const arm = c ? 'control' : 'candidate', k = key(r);
      if (typeof k !== 'string' && typeof k !== 'number') throw fail('badKey', 'row ' + i + ' has key ' + String(k) + '; keys must be strings or numbers');
      if (arms[arm].has(k)) duplicates[arm].push(keyText(k));
      else arms[arm].set(k, { row: i, value: value(r) });
    });
    if (both.length) throw fail('ambiguousRow', 'rows ' + both.slice(0, 8).join(', ') + ' match both control and candidate');
    for (const arm of ['control', 'candidate'])
      if (duplicates[arm].length) throw fail('duplicatePair', arm + ' has more than one row for key ' + [...new Set(duplicates[arm])].join(', '));
    const onlyControl = [...arms.control.keys()].filter(k => !arms.candidate.has(k));
    const onlyCandidate = [...arms.candidate.keys()].filter(k => !arms.control.has(k));
    if (onlyControl.length || onlyCandidate.length)
      throw fail('unmatchedKey', 'unpaired keys: control only ' + (onlyControl.map(keyText).join(', ') || 'none') +
        '; candidate only ' + (onlyCandidate.map(keyText).join(', ') || 'none'));
    if (arms.control.size === 0) throw fail('empty', 'no row matched control or candidate');
    const perPair = [...arms.control.entries()].map(([k, c]) => {
      const d = arms.candidate.get(k);
      for (const [arm, x] of [['control', c], ['candidate', d]])
        if (typeof x.value !== 'number' || !isFinite(x.value)) throw fail('notFinite', arm + ' value for key ' + keyText(k) + ' is ' + String(x.value));
      if (c.value === 0) throw fail('zeroControl', 'control value for key ' + keyText(k) + ' is 0; a percentage is undefined');
      return { key: k, control: c.value, candidate: d.value, percentSaved: 100 * (1 - d.value / c.value) };
    }).sort(byKey);
    const sign = better === 'lower' ? 1 : -1;
    const controlMedian = median(perPair.map(p => p.control)), candidateMedian = median(perPair.map(p => p.candidate));
    // The per-block view: the same pairs under the names reports use, with each pair's outcome.
    const blocks = perPair.map(p => ({ key: p.key, control: p.control, candidate: p.candidate, savedPct: p.percentSaved,
      outcome: p.control === p.candidate ? 'tie' : sign * (p.control - p.candidate) > 0 ? 'win' : 'loss' }));
    return {
      pairs: perPair.length,
      controlMedian, candidateMedian,
      medianPercentSaved: median(perPair.map(p => p.percentSaved)),
      percentSavedOfMedians: controlMedian === 0 ? null : 100 * (1 - candidateMedian / controlMedian),
      wins: perPair.filter(p => sign * (p.control - p.candidate) > 0).length,
      losses: perPair.filter(p => sign * (p.control - p.candidate) < 0).length,
      ties: perPair.filter(p => p.control === p.candidate).length,
      better,
      method: 'median of per-pair percentage saved, 100 * (1 - candidate / control); wins count pairs where the candidate is ' + better,
      spread: summary(blocks.map(b => b.savedPct)),
      blocks,
      perPair,
    };
  }

  const HELP = [
    'stats — shared summary statistics (one implementation for every study).',
    '  stats.median(xs)            middle value; mean of the two middle values for an even count',
    '  stats.mean(xs)   stats.quantile(xs, p)   (linear interpolation, R type 7)',
    '  stats.summary(xs)           {n, min, q1, median, q3, max, mean}',
    '  stats.percentSaved(control, candidate)   100 * (1 - candidate / control)',
    '  stats.paired(rows, {key, control, candidate, value, better})',
    '      key, value: field name or row => value; control, candidate: row => boolean; better: "lower" (default) | "higher"',
    '      → {pairs, controlMedian, candidateMedian, medianPercentSaved, percentSavedOfMedians, wins, losses, ties, better, method, spread, blocks, perPair}',
    '      blocks: [{key, control, candidate, savedPct, outcome: "win" | "loss" | "tie"}] sorted by key; spread: stats.summary of savedPct;',
    '      perPair: the same pairs as [{key, control, candidate, percentSaved}] (kept for older scripts)',
    '      refuses rows matching both arms, duplicate keys in one arm and keys present in only one arm.',
    'Errors carry err.code: notAnArray, empty, notFinite, badArgument, badKey, ambiguousRow, duplicatePair, unmatchedKey, zeroControl.',
  ].join('\n');

  root.stats = Object.freeze({ median, mean, quantile, summary, percentSaved, paired, help: () => HELP });
})(globalThis);
