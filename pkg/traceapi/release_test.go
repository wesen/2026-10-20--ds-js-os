package traceapi_test

import (
	"fmt"
	"testing"
)

// Release-integration checks for the merged query.js (release.js). Each script returns "ok" or a
// diagnostic string, so the comparison works whatever value() returns (an exported value or a JS value).
func TestReleaseIntegration(t *testing.T) {
	vm := session(t, loadArchive(t))
	cases := []struct{ name, src string }{
		{"describeIsMaterializedAndCarriesTreatment", `(() => {
  const arms = profiles.arms();
  for (let i = 0; i < arms.length; i++) {
    const name = arms[i].arm, d = profiles.arm(name).describe();
    if (q.run(d) !== d) return name + ': q.run(describe()) is not the descriptor itself';
    if (!d.treatment || d.treatment.id !== name) return name + ': no treatment record';
    if (d.treatment.provenance && d.treatment.provenance.measured !== false) return name + ': treatment metadata claims to be measured';
    if (!d.fields || !d.countsCover || !Array.isArray(d.comparisons) || !Array.isArray(d.cannotAttribute)) return name + ': treatment metadata missing';
    if (!/emulator/.test(d.timing)) return name + ': timing is not marked as emulator counts';
    const keys = Object.keys(d.totals);
    for (let j = 0; j < keys.length; j++) if (typeof d.units[keys[j]] !== 'string') return name + ': no unit for total ' + keys[j];
    if ((d.rowsVerified === null) !== (d.countsCover.verifiedBy === null)) return name + ': countsCover.verifiedBy disagrees with rowsVerified';
    if (d.sampleKeys !== null && (d.sampleCount < d.sampleKeys.length || d.sampleKeysTruncated !== (d.sampleCount > d.sampleKeys.length)))
      return name + ': sampleCount / sampleKeysTruncated disagree with sampleKeys';
    let code = null;
    try { q.run(d, { maxRows: 5 }); } catch (e) { code = e.code; }
    if (code !== 'alreadyMaterialized') return name + ': options on a descriptor gave ' + code;
  }
  return 'ok';
})()`},
		{"describeOnParamArmIsRefused", `(() => {
  const arms = profiles.arms().map(x => x.arm);
  if (!arms.length) return 'ok';
  const p = q.param.choice('releaseArm', arms.slice(0, 1));
  try { profiles.arm(p).describe(); return 'describe() on a q.param arm did not throw'; }
  catch (e) { return e.code === 'unboundParam' ? 'ok' : 'wrong error: ' + e.message; }
})()`},
		{"bareLoopsClaimNoOwner", `(() => {
  const vs = a.variants();
  for (let i = 0; i < vs.length; i++) for (let j = 0; j < vs[i].phases.length; j++) {
    const ph = vs[i].phases[j].phase;
    if (ph === 'backend') continue;     // llc headers name no loops; skip reading every MIR print
    const n = q.run(a.variant(vs[i].variant).events(ph).where(e => e.scope.kind === 'loop' &&
      e.scope.functionEvidence.method !== 'header' &&
      (e.scope.function !== null || (e.scope.ownerHint && e.scope.ownerHint.tentative !== true))).count()).value;
    if (n) return vs[i].variant + '/' + ph + ': ' + n + ' bare loop events assert an owner';
  }
  return 'ok';
})()`},
		{"knownChangesNeedConsecutiveOrdinals", `(() => {
  const vs = a.variants();
  for (let i = 0; i < vs.length; i++) {
    const run = a.variant(vs[i].variant), fns = run.functions();
    const fn = fns.indexOf('row') >= 0 ? 'row' : fns[0];
    const phs = run.phases().map(p => p.phase).filter(p => p !== 'backend');
    if (!fn || !phs.length) continue;
    const ch = run.function(fn).timeline(phs[0]).measure(q.ir.instructions().opcode('load').count()).changes();
    const bad = q.run(ch.where(c => c.status === 'known' && c.ordinal - c.from !== 1).count()).value;
    if (bad) return vs[i].variant + ': ' + bad + ' known changes between non-consecutive ordinals';
    const lost = q.run(ch.where(c => c.status === 'gap' && (!Array.isArray(c.skippedOrdinals) ||
      !(c.skipped || []).every(o => c.skippedOrdinals.indexOf(o) >= 0))).count()).value;
    if (lost) return vs[i].variant + ': ' + lost + ' gaps do not retain their original ordinals';
  }
  return 'ok';
})()`},
		{"helpTopicsAndSnippets", `(() => {
  if (q.help('plan') !== q.help('plans') || q.help('describe') !== q.help('plans') || q.help('q.run') !== q.help('plans')) return 'plans aliases lost';
  if (q.help('event') !== q.help('events')) return 'event alias lost';
  const v = a.variants()[0];
  if (v && v.phases.length) {
    const h = a.variant(v.variant).events(v.phases[0].phase).at(0).select('ordinal').help();
    if (h.indexOf(q.help('events')) < 0) return 'an event plan does not point at the events topic';
  }
  if (q.help('compare').indexOf('q.compare(total(') >= 0) return 'compare help calls an undefined total() helper';
  if (q.help('errors').indexOf('notEvaluated') < 0) return 'errors help omits notEvaluated';
  if (q.help('events').indexOf('ownerHint') < 0) return 'events help does not describe ownerHint';
  if (q.help('changes').indexOf('skippedOrdinals') < 0) return 'changes help does not describe skippedOrdinals';
  return 'ok';
})()`},
		{"compareHelpSnippetRuns", `(() => {
  const names = profiles.arms().map(x => x.arm);
  if (names.indexOf('checked-llc') < 0 || names.indexOf('checked-llc-nolsr') < 0) return 'ok';
  const t = arm => profiles.arm(arm).region('row').workload('opening-160-rows').total('instructions');
  const r = q.run(q.compare(t('checked-llc-nolsr'), t('checked-llc')).matchOn('workload', 'region', 'checkedContract', 'unit').percentChange({ denominator: 'before' }));
  return r && r.kind === 'comparison' && typeof r.status === 'string' ? 'ok' : 'unexpected result ' + JSON.stringify(r);
})()`},
	}
	for _, c := range cases {
		c := c
		t.Run(c.name, func(t *testing.T) {
			if got := fmt.Sprint(value(t, vm, c.src)); got != "ok" {
				t.Fatalf("%s: %s", c.name, got)
			}
		})
	}
}
