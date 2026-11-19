import {readFileSync} from 'node:fs';
import {createContext, runInContext} from 'node:vm';

export const baselineRevision = 'dd69a81cbf91ebf00e1f527bcbbf785697b1c9a4';
export const lowererPath = 'picocalc-os/compiler/typed-rv32.js';

export const lowererSource = path => readFileSync(path ?? lowererPath, 'utf8');

export function loadCompiler(path) {
    const context = createContext();
    runInContext(readFileSync('picocalc-os/compiler/typed-wasm.js', 'utf8'), context);
    runInContext(lowererSource(path), context, {filename: lowererPath});
    return context;
}
