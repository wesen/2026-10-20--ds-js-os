import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import {basename, join} from 'node:path';
import vm from 'node:vm';

export const revision = '6426798f69c691f5c1979233ebdeb540f8ce7c61';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function compiler(directory) {
    const realm = vm.createContext({});
    const files = {};
    for (const path of ['compiler/typed-wasm.js', 'compiler/typed-rv32.js', 'compiler/typed-world.js',
            'worlds/files/compile.js', 'worlds/agenda/compile.js']) {
        const frozen = () => execFileSync('git', ['show', revision + ':picocalc-os/' + path]);
        const options = directory ? [join(directory, path), join(directory, 'picocalc-os', path)] : [];
        if (directory && path.startsWith('compiler/')) options.push(join(directory, basename(path)),
            join(directory, 'typed', basename(path).replace('typed-', '')));
        if (directory && path.startsWith('worlds/')) options.push(join(directory, path.slice('worlds/'.length)));
        const chosen = options.find(p => existsSync(p));
        const content = chosen ? readFileSync(chosen) : frozen();
        files[path] = {source: chosen ? 'overlay' : 'frozen', sha256: hash(content)};
        vm.runInContext(content.toString(), realm, {filename: path});
    }
    if (directory && files['compiler/typed-rv32.js'].source !== 'overlay')
        throw new Error('candidate directory contains no RV32 backend');
    return {realm, files};
}
