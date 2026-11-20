// Check that the measurement-only JS produces the same artifacts and phase transitions.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createContext, runInContext} from 'node:vm';

const [pre, g4, preSource, g4Source, reactorPath] = process.argv.slice(2);
assert(pre && g4 && preSource && g4Source && reactorPath,
    'pass pre-G and G4 staging roots, both assembled source files, and the shared reactor ELF');
const reactor = readFileSync(reactorPath);
function check(stage, sourcePath) {
    const manifest = JSON.parse(readFileSync(join(stage, 'manifest.json'), 'utf8'));
    const source = readFileSync(sourcePath, 'utf8');
    let current;
    const visits = Object.fromEntries(manifest.phases.map(name => [name, 0]));
    const contexts = [createContext(), createContext({
        __egCompilePhase(index) {
            const name = manifest.phases[index];
            assert(name && Number.isInteger(index));
            if (name !== current) {
                visits[name]++;
                current = name;
            }
        },
    })];
    const artifacts = contexts.map((context, marked) => {
        for (const module of ['typed-wasm.js', 'typed-async.js', 'typed-rv32.js', 'typed-world.js']) {
            if (module === 'typed-async.js' && manifest.variant === 'pre-g') continue;
            const file = 'picocalc-os/compiler/' + module;
            const code = marked ? readFileSync(join(stage, 'sources', file), 'utf8')
                : execFileSync('git', ['show', manifest.revision + ':' + file], {encoding:'utf8'});
            runInContext(code, context, {filename:file});
        }
        return Buffer.from(context.compileTypedWorldRv32(source, reactor));
    });
    assert(artifacts[0].equals(artifacts[1]), manifest.variant + ' linked Editor differs');
    assert(visits.native_lower > 100);
    assert.equal(visits.ordinary_emission, visits.native_lower + 1);
    for (const [name, count] of Object.entries(visits)) {
        if (name.startsWith('rewrite_')) assert.equal(count, manifest.variant === 'g4' ? 1 : 0, name);
    }
    for (const name of ['native_setup', 'ordinary_signatures', 'ordinary_graph', 'native_assembly', 'world_validate', 'native_link'])
        assert.equal(visits[name], 1, name);
    return {revision:manifest.revision, elfSha256:createHash('sha256').update(artifacts[0]).digest('hex'), visits};
}
console.log(JSON.stringify({'pre-g':check(pre, preSource), g4:check(g4, g4Source)}, null, 2));
