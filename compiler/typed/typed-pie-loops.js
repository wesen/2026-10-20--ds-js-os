// Optional host/QuickJS pass. Only the selected compiler loads this module.
(() => {
"use strict";

const get = 0x20, set = 0x21, literal = 0x41, add = 0x6a, address = 0xf1;
const is = (op, code, arg) => op?.opcode === code && (arg === undefined || op.operands[0] === arg);
function value(op) {
    if (is(op, get)) return {local:op.operands[0]};
    if (is(op, literal)) return {constant:op.operands[0]};
}

function affineBefore(ops, end, iv) {
    if (is(ops[end-1], get, iv)) return {constant:0};
    if (!is(ops[end-1], add)) return;
    if (is(ops[end-2], get, iv)) return value(ops[end-3]);
    if (is(ops[end-3], get, iv)) return value(ops[end-2]);
}

// Track only provenance needed to identify stores. Arithmetic destroys an
// address fact. A branch result is unknown even when both arms return addresses.
function memoryEffects(ops, begin, end, iv) {
    let stack=[];
    const controls=[], writes=[];
    for (let i=begin;i<end;i++) {
        const op=ops[i], [slot,index]=op.operands;
        switch (op.opcode) {
        case 0x04:
            stack.pop(); controls.push({entry:stack.slice(),result:slot===0x7f}); break;
        case 0x05: stack=controls.at(-1).entry.slice(); break;
        case 0x0b: {
            const c=controls.pop(); stack=c.entry; if(c.result) stack.push(null);
            break;
        }
        case get: case literal: stack.push(null); break;
        case set: case 0x1a: stack.pop(); break;
        case address: {
            const base=is(ops[i-1],set,index)?affineBefore(ops,i-1,iv):undefined;
            stack.push({buffer:slot,base});
            break;
        }
        case 0x2f: case 0x28: case 0x45: stack.pop(); stack.push(null); break;
        case 0x3b: {
            stack.pop();
            const dest=stack.pop();
            if (!dest?.base || op.operands[1]!==4) return {reason:"store address is not a proved unit-stride buffer access"};
            writes.push(dest);
            break;
        }
        default:
            if (op.opcode<0x46 || op.opcode>0x75) return {reason:"continuation has an unsupported control transfer, call or memory effect"};
            stack.pop(); stack.pop(); stack.push(null);
        }
    }
    return {writes};
}

function analyzeLoop(ops, loop, matching) {
    const reject=reason=>({loop:ops[loop].offset,reason});
    const end=matching.get(loop);
    if (!is(ops[loop-1],0x02,64) || !is(ops[loop],0x03,64) || !is(ops[end+1],0x0b)) return reject("requires a counted block/loop pair");
    const iv=ops[loop+1]?.operands[0], bound=value(ops[loop+2]);
    if (!is(ops[loop+1],get) || !bound || !is(ops[loop+3],0x48) || !is(ops[loop+4],0x45) || !is(ops[loop+5],0x0d,1))
        return reject("requires a signed increasing index below an invariant bound");
    function sequence(at,pattern) {return pattern.every(([c,a],i)=>is(ops[at+i],c,a));}
    if (!sequence(end-5,[[get,iv],[literal,1],[add],[set,iv],[0x0c,0]])) return reject("backedge does not advance the index by one");
    const begin=loop+6,row=value(ops[begin]);
    let i=begin+1;
    if (!row) return reject("no invariant subtraction operand");
    while (i<end && i<=begin+4 && !is(ops[i],set)) i++;
    const base=affineBefore(ops,i,iv);
    if (!base || !is(ops[i],set) || !is(ops[i+1],address) || ops[i+1].operands[1]!==ops[i].operands[0] ||
        !sequence(i+2,[[0x2f,1],[0x6b],[set]]) || ops[i+2].operands[1]!==4)
        return reject("no contiguous checked u16 subtraction producer");
    // Consume exactly the producer expression; extra stack values cannot cross this boundary.
    if (i-begin!==(is(ops[i-1],add)?4:2)) return reject("unexpected producer operand stack");
    const buffer=ops[i+1].operands[0],indexSlot=ops[i].operands[0],difference=ops[i+4].operands[0];
    const predicate=i+5, condition=i+8;
    if (!sequence(predicate,[[get,difference],[literal,0],[0x4e],[0x04,64]]) || matching.get(condition)!==end-6)
        return reject("difference must feed a single nonnegative guarded continuation");
    const update=end-5;
    const seen=new Set();
    for (let j=begin;j<update;j++) if (is(ops[j],set)) seen.add(ops[j].operands[0]);
    const pins=[iv,buffer,row.local,base.local,bound.local];
    if (pins.some(n=>seen.has(n)) || [row,base,bound].some(v=>v.local===iv))
        return reject("a supposedly invariant input changes in the loop");
    const constantTrips = bound.constant !== undefined && is(ops[loop-2],set,iv) && is(ops[loop-3],literal)
        ? Math.max(0, bound.constant - ops[loop-3].operands[0]) : null;
    if (constantTrips !== null && constantTrips < 8) return reject("trip count cannot fill eight lanes");
    // A skipped miss must have no observable uses. The index temporary is
    // omitted by the fast path, so require it to have exactly its original use.
    for (let j=0;j<ops.length;j++) {
        const op=ops[j],uses=is(op,get)?op.operands:is(op,address)?op.operands:
            is(op,0xf2)?[op.operands[0]]:[];
        if (uses.includes(indexSlot) && j!==i+1) return reject("index temporary is live outside the producer");
        if (uses.includes(difference) && (j<predicate || j>=update))
            return reject("signed difference is observable outside its nonnegative arm");
        if (is(op,set,difference) && j!==i+4) return reject("difference has another definition");
        if (is(op,0x05) && matching.get(j)===condition) return reject("miss has an observable alternative");
    }
    const effects=memoryEffects(ops,condition+1,end-6,iv);
    if (effects.reason) return reject(effects.reason);
    if (effects.writes.some(w=>seen.has(w.buffer) || seen.has(w.base.local) || w.base.local===iv))
        return reject("store base varies across iterations");
    return {loop:ops[loop].offset, iv, bound, row, buffer, base, difference, indexSlot,
        consumerStart:ops[condition+1].offset,consumerEnd:ops[end-6].offset,
        stores:effects.writes, constantTrips, lanes:8};
}

function analyze(fn) {
    const ops=typedWasm.decodeNumericOperations(fn.code), matching=new Map(), stack=[];
    for (let i=0;i<ops.length;i++) {
        if ([0x02,0x03,0x04].includes(ops[i].opcode)) stack.push(i);
        if (is(ops[i],0x05)) matching.set(i,stack.at(-1));
        if (is(ops[i],0x0b) && stack.length) matching.set(stack.pop(),i);
    }
    return ops.flatMap((o,i)=>is(o,0x03)?[analyzeLoop(ops,i,matching)]:[]);
}

// The ESP words use fixed operands. scripts/01-reference-words.S is the
// independent assembly source; host qualification decodes the final image.
const minInputU16=0x919057db; // esp.min.u16.a q1,t6
const broadcast=0x8607203b, packetLoad=0x0203a63b, subtract=0x06a406df, packetStore=0x82072a3b;
const zero=0, sp=2, a0=10, x=12, lanes=13, uniform=14, input=15, lanePtr=16, limit=17, t5=30,t6=31;

// Every admitted producer contains this exact opcode/immediate suffix. A raw
// cell match is only a necessary condition: an immediate can look like an
// opcode. The structural analyzer still decides every acceptance.
function mayContainProducer(tape) {
    for (let at=tape.indexOf(0x2f); at>=0; at=tape.indexOf(0x2f,at+1)) {
        if (tape[at+1]===1 && tape[at+2]===4 && tape[at+3]===0x6b &&
            tape[at+4]===set && tape[at+6]===get && tape[at+5]===tape[at+7] &&
            tape[at+8]===literal && tape[at+9]===0 && tape[at+10]===0x4e &&
            tape[at+11]===0x04 && tape[at+12]===64) return true;
    }
    return false;
}

function lower(fn,callables,targets,mode,FunctionCode,ins) {
    // An explicitly observed function still reports the reason for each rejection.
    if (!fn.nativeInspection && !mayContainProducer(fn.code)) return null;
    const decisions=analyze(fn);
    if (fn.nativeInspection) fn.loopDecisions=decisions;
    const plans=new Map();
    for (const p of decisions) {
        if (p.reason) continue;
        let selected=mode;
        if (typeof mode === "function") {
            const decision=mode({constantTrips:p.constantTrips, writeStreams:p.stores.length, lanes:p.lanes});
            selected=decision?.plan;
            if (!["stock","scalar","pie","pie-empty"].includes(selected)) throw new TypeError("invalid PIE policy decision");
            if (fn.nativeInspection) p.policyDecision=decision;
            p.selectedMode=selected;
        }
        if (selected === "stock") continue;
        plans.set(p.loop,p);
    }
    if (!plans.size) return null;
    class PackedFunction extends FunctionCode {
        constructor() {
            super(fn,callables,targets);
            this.packet=(4*this.locals+15)&-16;
            this.locals=this.packet/4+5; // aligned packet, then broadcast slot
        }
        step(op) {
            const p=op===0x03 && plans.get(this.at-1);
            if (p && this.depth===0) this.grouped(p);
            return super.step(op);
        }
        pick(reg,v) {
            if(v.local!==undefined) this.readLocal(reg,v.local);
            else this.constant(reg,v.constant);
        }
        immediate(to,from,n) {this.emit(ins.i(0x13,to,0,from,n));}
        plus(to,a,b) {this.emit(ins.r(0x33,to,0,a,b));}
        minus(to,a,b) {this.emit(ins.r(0x33,to,0,a,b,32));}
        twice(to,from) {this.emit(ins.i(0x13,to,1,from,1));}

        grouped(p) {
            const selectedMode=p.selectedMode ?? mode;
            const vectorProducer=selectedMode!=="scalar";
            const skipEmpty=selectedMode==="pie-empty";
            const empty={};
            const saved=this.at, ordinary={}, group={}, single={}, got={}, lane={}, advance={};
            const regions=[];
            let start=this.words.length*4;
            const note=(segment,lo,hi)=>{
                if(this.inspection) regions.push({role:"operation",segment,inputStart:lo,inputEnd:hi,
                    start,end:this.words.length*4,decisions:[]});
                start=this.words.length*4;
            };
            this.readLocal(x,p.iv); this.pick(limit,p.bound); this.pick(uniform,p.row);
            this.branch(4,x,zero,ordinary); // negative induction index
            this.branch(5,x,limit,ordinary);
            this.constant(t5,32766); this.branch(6,t5,uniform,ordinary);
            // Limit index arithmetic before scaling and adding a physical pointer.
            this.constant(t5,0x1fffffff); this.branch(6,t5,limit,ordinary);
            this.pick(t6,p.base); this.branch(6,t5,t6,ordinary);
            this.plus(t6,t6,limit); this.readLocal(a0,p.buffer); this.load(t5,0,a0);
            this.branch(6,t5,t6,ordinary);
            this.twice(t6,t6); this.plus(t6,t6,a0); this.immediate(t6,t6,4);
            this.branch(7,a0,t6,ordinary); // input exclusive end cannot wrap
            // Stash the exclusive end in lanes until we enter the packet loop.
            this.move(lanes,t6);
            this.pick(input,p.base); this.plus(input,input,x); this.twice(input,input);
            this.plus(input,input,a0); this.immediate(input,input,4);
            for(const w of p.stores) {
                // Potential stores may target another buffer referencing nearby
                // memory. Protect the input header as well as unread input cells.
                this.pick(t6,w.base); this.constant(t5,0x1fffffff); this.branch(6,t5,t6,ordinary);
                this.readLocal(lanePtr,w.buffer);
                this.plus(t5,t6,x); this.twice(t5,t5); this.plus(t5,t5,lanePtr); this.immediate(t5,t5,4);
                this.plus(t6,t6,limit); this.twice(t6,t6); this.plus(t6,t6,lanePtr); this.immediate(t6,t6,4);
                this.branch(7,lanePtr,t6,ordinary);
                const safe={}, headerSafe={};
                this.branch(7,t5,lanes,safe); // write range above entire source
                this.branch(6,input,t6,ordinary); // overlaps payload
                this.branch(7,a0,t6,headerSafe);
                this.immediate(lanePtr,a0,4); this.branch(6,t5,lanePtr,ordinary);
                this.mark(headerSafe); this.mark(safe);
            }
            if(vectorProducer) {
                this.store(uniform,this.packet+16,sp,1);
                this.immediate(t5,sp,this.packet+16); this.emit(broadcast);
            }
            this.mark(group);
            this.minus(t5,limit,x); this.constant(t6,8);
            this.branch(6,t5,t6,ordinary); // ordinary loop handles short tail
            this.emit(ins.i(0x13,t5,7,input,15)); this.branch(1,t5,zero,single);
            note("admission and packet control",p.loop,p.loop+2);
            this.immediate(t5,sp,this.packet);
            if(vectorProducer) {
                this.emit(packetLoad); // post-increments the input pointer by one packet
                if(skipEmpty) {
                    // If the smallest input exceeds the uniform row term, every
                    // signed difference is negative. No hit continuation can run.
                    this.emit(minInputU16);
                    this.branch(6,uniform,t6,empty);
                    note("packet minimum and all-miss test",p.loop,p.consumerStart);
                }
                this.emit(subtract); this.emit(packetStore);
            } else {
                for(let i=0;i<8;i++) {
                    this.load(t6,2*i,input,5); this.minus(t6,uniform,t6); this.store(t6,2*i,t5,1);
                }
                this.immediate(input,input,16);
            }
            this.constant(lanes,8); this.jump(got);
            this.mark(single);
            this.load(t6,0,input,5); this.minus(t6,uniform,t6); this.store(t6,this.packet,sp,1);
            this.immediate(input,input,2); this.constant(lanes,1);
            this.mark(got); this.immediate(lanePtr,sp,this.packet);
            this.mark(lane); this.load(t6,0,lanePtr,5);
            this.branch(6,uniform,t6,advance);
            this.writeLocal(t6,p.difference);
            note("halfword producer and sign guard",p.loop,p.consumerStart);
            // Replay ordinary lowering of each effectful scalar operation, in order.
            this.at=p.consumerStart;
            while(this.at<p.consumerEnd) {
                const at=this.at;
                FunctionCode.prototype.step.call(this,this.cell());
                note("scalar hit continuation",at,this.at);
            }
            this.mark(advance);
            this.immediate(x,x,1); this.writeLocal(x,p.iv);
            this.immediate(lanePtr,lanePtr,2); this.immediate(lanes,lanes,-1);
            this.branch(1,lanes,zero,lane); this.jump(group);
            note("packet backedge",p.loop,p.loop+2);
            if(skipEmpty) {
                this.mark(empty);
                this.immediate(x,x,8); this.writeLocal(x,p.iv);
                this.jump(group);
                note("advance past eight misses",p.loop,p.loop+2);
            }
            this.mark(ordinary);
            this.at=saved;
            if(this.inspection) this.loopRanges=regions;
        }
    }
    const emitter=new PackedFunction();
    if (emitter.packet+16>2000) {
        for (const p of plans.values()) p.reason="frame has no room for aligned packet scratch";
        return null;
    }
    try {return emitter.lower();}
    catch(e) {
        if (e.message!=="RV32 function frame exceeds the instruction range") throw e;
        for (const p of plans.values()) p.reason="packet scratch exceeds native frame limit";
        return null;
    }
}
globalThis.typedPieLoops={analyze,lower};
})();
