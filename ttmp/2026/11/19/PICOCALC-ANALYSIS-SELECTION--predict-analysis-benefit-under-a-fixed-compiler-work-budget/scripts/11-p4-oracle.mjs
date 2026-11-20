// Verify the physical JS translation against the original locked host results.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';

const [work] = process.argv.slice(2);
const text = path => readFileSync(path,'utf8');
const json = path => JSON.parse(text(path));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const locked = json(join(work,'transfer-inputs.json'));
const oracle = json(join(work,'oracle.json'));
const compilers = json(join(work,'lanes.json'));
const firmware = readFileSync(join(work,'build/picocalc-os-p4.bin'));
const tree = join(work,'tree/picocalc-os');
const main = join(work,'build/esp-idf/main');
const selection = {};
const source = text(join(main,'editor.typed'));
const reactor = readFileSync(join(main,'typed-world-reactor.elf'));
assert.equal(sha(source),locked.editor.sourceSha256);
assert.equal(sha(reactor),locked.editor.reactorSha256);
const synthetic = locked.synthetic && text(join(work,'synthetic.typed'));
if (synthetic) {
    assert.equal(sha(synthetic),locked.synthetic.sourceSha256);
    assert(firmware.includes(Buffer.from(synthetic)));
}
for (const [lane, pair] of Object.entries(compilers)) {
    const policy = lane === 'base' ? 'source' : lane;
    let phases = [];
    let counters;
    let raw;
    const context = vm.createContext({
        selectorPhase: phase => phases.push(phase),
        selectorSummary: (cells, comparisons, retained, proof) => {
            assert.equal(counters,undefined);
            counters = {cells, comparisons, retained, proof};
        },
    });
    for (const [kind, digest] of Object.entries(pair)) {
        const compiler = readFileSync(join(work,'lanes',lane,'typed',kind+'.js'));
        assert.equal(sha(compiler),digest);
        assert(firmware.includes(compiler));
        vm.runInContext(compiler.toString(),context);
    }
    vm.runInContext(text(join(tree,'compiler/typed-world.js')),context);
    const compile = context.typedRv32.compile;
    context.typedRv32.compile = (...args) => (raw = compile(...args));

    function verify(app, emitted) {
        const expected = locked[app].compiledChecks[0][policy];
        assert.equal(sha(raw.image),expected.raw);
        assert.equal(sha(emitted),expected.linked);
        assert.deepEqual(phases, policy === 'source' ? [4] : [2,3,4]);
        const {cells, comparisons, retained, proof} = counters;
        assert.equal(cells, expected.plannerCells);
        assert.equal(comparisons, expected.comparisons);
        assert.equal(proof, expected.charge);
        assert.equal(retained, policy === 'source' ? 0 : raw.signatures.length);
        const result = {sourceSha256:locked[app].sourceSha256, sha256:sha(emitted),
            bytes:emitted.length, raw:sha(raw.image), words:raw.image.length/4, counters};
        phases = [];
        counters = undefined;
        return result;
    }

    const editor = verify('editor', context.compileTypedWorldRv32(source,new Uint8Array(reactor)));
    for (const [key, value] of Object.entries(editor))
        if (key !== 'counters') assert.equal(value,oracle[lane].editor[key]);
    selection[lane] = {editor};
    if (synthetic) {
        vm.runInContext(text(join(work,'synthetic.js')),context);
        const profile = verify('synthetic',context.compileSelectorSynthetic(synthetic,new Uint8Array(1)));
        oracle[lane].synthetic = profile;
        selection[lane].synthetic = profile;
    }
}
const result = {firmware:sha(firmware), firmwareBytes:firmware.length, compilers, selection};
writeFileSync(join(work,'oracle.json'),JSON.stringify(oracle,null,2)+'\n');
writeFileSync(join(work,'transfer-preflight.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
