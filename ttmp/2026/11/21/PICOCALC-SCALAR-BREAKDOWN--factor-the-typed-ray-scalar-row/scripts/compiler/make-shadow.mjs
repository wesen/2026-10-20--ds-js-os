// Held-out test of the six-instruction entry check forecast at commit 9d43fba.
// The experiment admits only this closed renderer, pinning the purity of calls to typedRayAbs.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
const [sourcePath,backendPath,out]=process.argv.slice(2);
const read=f=>readFileSync(f,'utf8'), source=read(sourcePath),backend=read(backendPath);
const digest=createHash('sha256').update(source).digest('hex');
assert.equal(digest,'b0a7c02bbb8646a2b17c669c7c42fcb5d76ae4d666fe90f988ea2bb97f143e0f');
const methods=`
class ShadowCode extends FunctionCode {
    step(op) {
        if (op !== 0xf1) return super.step(op);
        const receiver=this.cell(), position=this.cell();
        this.load(T5,4*position);this.load(T6,4*receiver);
        const out=this.resultRegister();
        this.emit(instruction.i(0x13,out,1,T5,1));
        this.emit(instruction.r(0x33,out,0,T6,out));
        this.push(out);
        return false;
    }
}
function shiftShadowBody(body,offset) {
    const seen=new Set();
    for(const jump of body.calls){
        jump.from+=offset;
        if(!jump.target.global && jump.target.importIndex===undefined && !seen.has(jump.target)){
            jump.target.at+=offset;
            seen.add(jump.target);
        }
    }
}
function lowerShadow(fn,callables,targets) {
    const fast=new ShadowCode(fn,callables,targets).lower();
    const fallback=new FunctionCode(fn,callables,targets).lower();
    const guard=new FunctionCode(fn,callables,targets);
    const rejectAt=6+fast.words.length;
    // Local failure branches directly target the fallback within B-immediate range.
    if(rejectAt*4>=4096) throw Error('shadow guard branch out of range');
    guard.load(5,0,A0);
    guard.constant(6,33);
    guard.emit(instruction.b(6,5,6,4*(rejectAt-2)));
    guard.load(5,36,A0,5);
    guard.constant(6,3);
    guard.emit(instruction.b(6,6,5,4*(rejectAt-5)));
    shiftShadowBody(fast,6);
    shiftShadowBody(fallback,rejectAt);
    if (fast.inspection && fallback.inspection) {
        guard.program.nativeInspection.leafDecision='closed shadow function with checked fallback';
        guard.inspectionSegments=[{offset:24,label:'fast',ranges:fast.inspection.ranges},
            {offset:4*rejectAt,label:'fallback',ranges:fallback.inspection.ranges}];
    }
    guard.words.push(...fast.words,...fallback.words);
    guard.calls.push(...fast.calls,...fallback.calls);
    return guard;
}
`;
const anchor='function compile(source,',old='lowerLeaf(fn, callables, targets) ?? new FunctionCode(fn, callables, targets).lower()';
assert.equal(backend.split(old).length,2);
const helper='const shadowFrozenSource='+JSON.stringify(source)+';\n'+methods;
const body='(fn.name === "typedRayInShadow" && !imported.length && source === shadowFrozenSource ? lowerShadow(fn,callables,targets) : null) ?? '+old;
writeFileSync(out,backend.replace(anchor,helper+'\n'+anchor).replace(old,body));
