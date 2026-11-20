// Read held-out sources only after verifying the exact committed policy lock.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {basename, dirname, join, resolve, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {choose, metadata, metadataCap} from './02-policy.mjs';
import {trainingSeeds, evaluationSeeds, families, generated, orders, source} from './03-generate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../../../..');
const revision = '40bcf850a5809ef6d839127869faa952596ed157';
const files = ['01-stage.py', '02-policy.mjs', '03-generate.mjs', '04-evaluate.mjs'];
const primaryBudget = 32768;
const policies = ['source', 'literal', 'density'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const text = path => readFileSync(path, 'utf8');
const json = path => JSON.parse(text(path));
const git = spec => execFileSync('git', ['-C', repo, 'show', spec]);
const pinned = file => git(revision + ':picocalc-os/worlds/' + file).toString();
const median = xs => {
    const sorted = xs.slice().sort((a,b) => a-b);
    const middle = sorted.length >> 1;
    return sorted.length % 2 ? sorted[middle] : (sorted[middle-1] + sorted[middle])/2;
};

function lockCandidate(overlay) {
    const paths = Object.fromEntries(files.map(name => [name, sha(readFileSync(join(here,name)))]));
    const staged = json(join(overlay, 'selection-overlay.json'));
    assert.equal(staged.revision, revision);
    for (const [name, digest] of Object.entries(staged.digests))
        assert.equal(digest, sha(readFileSync(join(overlay,name))));
    return {revision, paths, staged:staged.digests};
}

function verifyLock(overlay) {
    const lockPath = join(here, '../various/frozen-policy.json');
    const contents = readFileSync(lockPath);
    assert(contents.equals(git('HEAD:' + relative(repo, lockPath))), 'policy lock must be committed');
    assert.deepEqual(JSON.parse(contents), lockCandidate(overlay), 'policy freeze mismatch');
    return sha(contents);
}

function application(app, reactors) {
    const definitions = {
        files: ['files-reactor.elf', 'compileFilesRv32', () => pinned('files/files.typed')],
        agenda: ['agenda-reactor.elf', 'compileAgendaRv32',
            () => ['reminder','entry'].map(x => pinned('agenda/'+x+'.typed')).join('\n')],
        editor: ['typed-world-reactor.elf', 'compileTypedWorldRv32',
            () => pinned('editor/source.list').trim().split(/\s+/).map(x => pinned('editor/'+x)+'\n').join('')],
    };
    const [file, entry, readSource] = definitions[app];
    return {name:app, src:readSource(), reactor:readFileSync(join(reactors,file)), entry};
}

function makeCompiler(overlay) {
    const scripts = ['wasm', 'rv32', 'typed-world', 'files', 'agenda'].map(name =>
        new vm.Script(text(join(overlay,name+'.js')), {filename:name+'.js'}));
    return function compile(item, policy, budget, report = true) {
        const start = process.hrtime.bigint();
        const ctx = vm.createContext({});
        for (const script of scripts) script.runInContext(ctx);
        let raw;
        const observations = [];
        const options = {mode:policy, budget};
        if (report) options.observeFacts = row => observations.push(row);
        const native = ctx.typedRv32.compile;
        let visits = 0, measuredRows = [], fallback = false, compares = 0, planNs = 0;
        ctx.typedRv32.compile = (src, imports = [], max) => {
            if (policy === 'literal' || policy === 'density') {
                const planStart = process.hrtime.bigint();
                const imported = imports.map((fn,i) => ({...fn, index:i}));
                ctx.typedWasm.compileFunctions(src, imported.length, imported, max, true, fn => {
                    if (measuredRows.length < metadataCap) {
                        const data = metadata(fn, ctx.SelectionCursor, policy);
                        visits += data.visits;
                        measuredRows.push(data);
                    } else {
                        fallback = true;
                    }
                    fn.code = null;
                });
                if (fallback) options.mode = 'source';
                else {
                    const plan = choose(measuredRows, policy, budget);
                    options.mode = 'ranked';
                    options.selected = plan.names;
                    compares = plan.compares;
                }
                planNs = Number(process.hrtime.bigint() - planStart);
            }
            raw = native(src, imports, max, options);
            return raw;
        };
        const linked = item.reactor ? ctx[item.entry](item.src,new Uint8Array(item.reactor))
            : ctx.typedRv32.compile(item.src).image;
        const elapsedNs = Number(process.hrtime.bigint() - start);
        const names = Object.keys(raw.entries);
        const words = Object.fromEntries(names.map((name,i) => [name,
            ((raw.entries[names[i+1]] ?? raw.image.length) - raw.entries[name]) / 4]));
        return {words, raw:raw.image.length/4, sha:sha(raw.image), linkedSha:sha(linked),
            observations, elapsedNs, planNs, visits, compares, fallback, measuredRows};
    };
}

function profile(compile, item) {
    const base = compile(item,'none',0);
    const full = compile(item,'all',0);
    const shapes = compile(item,'density',0);
    assert.equal(shapes.raw, base.raw);
    assert.equal(shapes.sha, base.sha);
    assert(!shapes.fallback);
    const summaries = new Map(shapes.measuredRows.map(r => [r.name,r]));
    const rows = full.observations.map(r => {
        const shape = summaries.get(r.name);
        assert.equal(shape.charge, 2*r.cells);
        assert.equal(r.usedProofs, r.removedZero);
        const benefit = base.words[r.name] - full.words[r.name];
        assert.equal(benefit, 2*r.removedZero + 7*r.removedOverflow,
            item.name+' '+r.name+' emitted words did not match analyzed guards');
        assert(shape.candidate || benefit === 0);
        return {...shape, benefit};
    });
    assert.equal(base.raw-full.raw, rows.reduce((n,r) => n+r.benefit, 0));
    return rows;
}

function optimal(candidates, budget) {
    const cap = Math.floor(budget/2);
    const best = new Uint32Array(cap+1);
    for (const row of candidates) {
        if (!row.benefit) continue;
        const cost = row.charge/2;
        for (let i=cap; i>=cost; i--)
            best[i] = Math.max(best[i], best[i-cost]+row.benefit);
    }
    return best[cap];
}

function selection(rows, policy, budget, weight) {
    const {names, charge, compares, fallback} = choose(rows,policy,budget,weight);
    const admitted = rows.filter(r => names.has(r.name));
    return {
        words:admitted.reduce((n,r)=>n+r.benefit,0),
        wasted:admitted.reduce((n,r)=>n+(r.benefit ? 0 : r.charge),0),
        charge, compares, fallback, names,
    };
}

function checkPolicy(compile, item, order, policies, budget) {
    const baseline = compile(item,'none',0);
    const output = {};
    for (const policy of policies) {
        const predicted = selection(order,policy,budget);
        const actual = compile(item,policy,budget);
        assert.equal(baseline.raw-actual.raw,predicted.words);
        const admission = actual.observations.filter(r=>r.admitted);
        assert.deepEqual(new Set(admission.map(r=>r.name)),predicted.names);
        assert.equal(admission.reduce((a,r)=>a+r.chargedCells,0),predicted.charge);
        output[policy] = {removed:predicted.words, raw:actual.sha, linked:actual.linkedSha,
            charge:predicted.charge, plannerCells:actual.visits, comparisons:actual.compares,
            elapsedNs:actual.elapsedNs, planNs:actual.planNs};
    }
    return output;
}

function timeMatched(compile, item, expected) {
    const samples = [];
    for (let block = 0; block < 6; block++) {
        const order = policies.map((_,i) => policies[(block + (block < 3 ? i : 3-i))%3]);
        const row = {order};
        for (const policy of order) {
            const current = compile(item,policy,primaryBudget,false);
            assert.equal(current.linkedSha,expected[policy].linked);
            row[policy] = {elapsedNs:current.elapsedNs, planNs:current.planNs};
        }
        samples.push(row);
    }
    return samples;
}

function examine(compile, item, generatedModule, seed, extraWeights = false) {
    const rows = profile(compile,item);
    const byName = new Map(rows.map(r => [r.name,r]));
    const permutations = generatedModule ? orders(generatedModule.functions,seed) : [rows.map(r=>r.name)];
    const cost = rows.reduce((n,r)=>n+(r.candidate ? r.charge : 0),0);
    const budgets = [...new Set([primaryBudget, Math.floor(cost/8)*2, Math.floor(cost/4)*2, cost])];
    const results = [];
    const selectorVisits = rows.reduce((n,r)=>n+r.visits,0);
    for (const budget of budgets) {
        const oracle = optimal(rows,budget);
        const comparisons = Object.fromEntries(policies.map(p => [p,{
            words:[], charge:[], wasted:[], plannerChargedWords:[],
        }]));
        for (const permutation of permutations) {
            const ordered = permutation.map(n=>byName.get(n));
            for (const p of policies) {
                const r = selection(ordered,p,budget);
                const series = comparisons[p];
                assert(r.words <= oracle && r.charge <= budget);
                series.words.push(r.words);
                series.charge.push(r.charge);
                series.wasted.push(r.wasted);
                const adjusted = p === 'source' ? budget : Math.max(0,budget-selectorVisits);
                series.plannerChargedWords.push(selection(ordered,p,adjusted).words);
            }
        }
        for (const p of ['literal','density']) assert.equal(new Set(comparisons[p].words).size,1);
        const report = {budget, binding:cost>budget, oracle, comparisons};
        if (extraWeights) {
            report.localWeightWords = Object.fromEntries([0,.5,1,1.5,2].map(w =>
                [w,selection(rows,'density',budget,w).words]));
        }
        results.push(report);
    }
    const check = [];
    if (!generatedModule || [1,501].includes(seed)) {
        for (const p of generatedModule ? [0,1,2] : [0]) {
            const permutation = permutations[p];
            const input = generatedModule ? {...item,src:source(generatedModule.functions,permutation)} : item;
            check.push({order:p,...checkPolicy(compile,input,permutation.map(n=>byName.get(n)),policies,primaryBudget)});
        }
    }
    const timings = !generatedModule || seed === 501 ? timeMatched(compile,item,check[0]) : [];
    return {name:item.name, sourceSha256:sha(item.src), reactorSha256:item.reactor && sha(item.reactor),
        orderSha256:permutations.map(order=>sha(order.join('\n'))), eligibleCost:cost,
        selectorVisits, rows, budgets:results, compiledChecks:check, timings};
}

function aggregate(modules) {
    const primary = modules.flatMap(m => m.budgets
        .filter(b=>b.budget===primaryBudget && b.binding && b.oracle>0)
        .map(b=>({module:m.name,...b})));
    const stats = {};
    for (const p of policies) {
        const observations = primary.flatMap(m=>m.comparisons[p].words.map(x=>x/m.oracle));
        const charged = primary.flatMap(m=>m.comparisons[p].plannerChargedWords.map(x=>x/m.oracle));
        const regressions = primary.flatMap(m=>m.comparisons[p].words
            .flatMap((v,i)=> (m.comparisons.source.words[i]-v)/m.oracle>.05
                ? [{module:m.module,order:i,source:m.comparisons.source.words[i],words:v,oracle:m.oracle}] : []));
        stats[p] = {median:median(observations), minimum:Math.min(...observations),
            chargedMedian:median(charged), chargedMinimum:Math.min(...charged), regressions};
    }
    return {modules:primary.length, orders:primary.reduce((n,m)=>n+m.comparisons.source.words.length,0), stats};
}

function verifyDiagnostics(compile) {
    const simple = 'function f(x:i32):i32 { return x/3; }\n';
    const outcomes = ['@', 'function g():i32 { return missing; }','function f():i32 { return 1; }'].map(tail => {
        const all = ['none',...policies].map(p => {
            try { compile({src:simple+tail},p,primaryBudget); }
            catch (error) { return [error.name,error.message]; }
            throw Error('invalid fixture unexpectedly compiled');
        });
        for (const actual of all) assert.deepEqual(actual,all[0]);
        return all[0];
    });
    return outcomes;
}

function verifyMetadataLimit(compile) {
    const item = {src: Array.from({length:metadataCap+1}, (_,i) =>
        'function k'+i+'(x:i32):i32 {return x/3;}').join('\n')};
    const baseline = compile(item,'source',primaryBudget);
    for (const policy of ['literal','density']) {
        const actual = compile(item,policy,primaryBudget);
        assert(actual.fallback);
        assert.equal(actual.measuredRows.length,metadataCap);
        assert.equal(actual.sha,baseline.sha);
    }
    return {functions:metadataCap+1, retained:metadataCap, mode:'source', sha:baseline.sha};
}

const [phase, overlay, input, ...additionalInputs] = process.argv.slice(2);
if (phase === 'lock') {
    console.log(JSON.stringify(lockCandidate(overlay),null,2));
} else if (phase === 'custom') {
    const freeze = verifyLock(overlay);
    const compile = makeCompiler(overlay);
    const modules = [input,...additionalInputs].map(path =>
        examine(compile,{name:basename(path),src:text(path)},null,0));
    console.log(JSON.stringify({phase, freeze, revision, modules},null,2));
} else {
    assert(['training','held-out'].includes(phase));
    const freeze = phase === 'held-out' ? verifyLock(overlay) : undefined;
    const compile = makeCompiler(overlay);
    const appNames = phase === 'held-out' ? ['editor'] : ['files','agenda'];
    const modules = appNames.map(app => examine(compile,application(app,input),null,0,phase==='training'));
    const groups = phase === 'held-out' ? families : ['training'];
    for (const family of groups) {
        for (const seed of phase === 'held-out' ? evaluationSeeds : trainingSeeds) {
            const mod = generated(family,seed);
            modules.push(examine(compile,{name:mod.name,src:source(mod.functions)},mod,seed,phase==='training'));
        }
    }
    const cohorts = Object.fromEntries(groups.map(f=>[f,aggregate(modules.filter(m=>m.name.startsWith(f+'-')))]));
    console.log(JSON.stringify({phase, freeze, revision, diagnostics:verifyDiagnostics(compile),
        metadataLimit:verifyMetadataLimit(compile), modules, cohorts},null,2));
}
