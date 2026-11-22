// Promoted from PICOCALC-AGENDA-COMPILER scripts/14-check-local-inference.mjs (PICOCALC-REPO-LAYOUT Phase A); run from the repository root.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../../lib/compiler.mjs';

const annotated = readFileSync('apps/typed/agenda/reminder.typed', 'utf8');
const declarations = /\b(let|const) (\w+): (i32|bool) =/g;
const inferred = annotated.replace(declarations, '$1 $2 =');
assert(annotated !== inferred);
assert.deepEqual(compileTyped(inferred), compileTyped(annotated));
assert.deepEqual(typedRv32.compile(inferred), typedRv32.compile(annotated));

const valid = 'function run(start: i32): i32 { let at = start; at = at + 1; return at; }';
const {instance} = await WebAssembly.instantiate(compileTyped(valid));
assert.equal(instance.exports.run(42), 43);

const invalid = [
    ['let at = start; at = true;', /expected i32, got bool/],
    ['let at: bool = start;', /expected bool, got i32/],
    ['const at = start; at = 1;', /expected mutable local at/],
    ['let at = at;', /unknown local at/],
    ['let at;', /expected =/],
];
for (const [body, diagnostic] of invalid) {
    const program = 'function run(start: i32): i32 { ' + body + ' return 0; }';
    for (const compile of [compileTyped, typedRv32.compile]) {
        assert.throws(() => compile(program), diagnostic);
    }
}
console.log(JSON.stringify({
    declarations: [...annotated.matchAll(declarations)].length,
    targets: ['wasm', 'rv32'],
    byteIdentical: true,
    diagnostics: invalid.length,
}));
