import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const [staged,out]=process.argv.slice(2);
const hashes=JSON.parse(fs.readFileSync(path.join(staged,'identity.json'),'utf8'));
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const read=x=>fs.readFileSync(path.join(staged,x));
const clock=()=>performance.now();
function realm(candidate) {
    const r=vm.createContext({});
    for (const name of ['typed-wasm.js','typed-async.js','typed-rv32.js','typed-world.js']) {
        const file=(candidate?'candidate-':'')+name;
        vm.runInContext(read(file).toString(),r,{filename:file});
    }
    for(const file of ['02-fragments.js','04-edits.js'])
        vm.runInContext(fs.readFileSync(path.join(here,file),'utf8'),r,{filename:file});
    return r;
}
function snapshot(r,source,elf,session) {
    r.activeFragments=session;
    const bytes=r.compileTypedWorldRv32(source,elf,{asyncSource:true});
    return {hash:digest(bytes),bytes:bytes.length,async:digest(JSON.stringify([bytes.asyncLayout,bytes.asyncSource]))};
}
function save(filename,identity,state) {
    const payload=JSON.stringify(state),data=JSON.stringify({identity,hash:digest(payload),payload});
    const tmp=filename+'.tmp'; let fd=fs.openSync(tmp,'w');
    try {fs.writeFileSync(fd,data);fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
    fs.renameSync(tmp,filename);
    fd=fs.openSync(path.dirname(filename),'r');try {fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
    return Buffer.byteLength(data);
}
function load(filename,identity) {
    try {
        const res=JSON.parse(fs.readFileSync(filename));
        if(res.identity!==identity || res.hash!==digest(res.payload)) return null;
        return JSON.parse(res.payload);
    } catch {return null;}
}
const output={configuration:'current source, Node/V8 wall ms, same-machine paired blocks; host POSIX fsync on checkpoint file and parent directory',hashes,apps:{}};
fs.mkdirSync(out,{recursive:true});
for(const app of ['editor','chess']) {
    const clean=realm(false),candidate=realm(true),elf=read(app+'.elf');
    const texts=clean.incrementalEdits(app,read(app+'.typed').toString());
    const identity=digest(JSON.stringify([hashes,app]));
    const root=path.join(out,app+'.cache');
    const observations={}, gold={};
    for(const [name,source] of Object.entries(texts)){
        if(name!=='bad') gold[name]=snapshot(clean,source,elf,null);
    }
    let initial=null;
    for(const name of ['base','body','bad','signature','layout']){
        const session=candidate.fragmentSession(initial);
        if(name==='bad'){
            function error(r,session) {try{snapshot(r,texts[name],elf,session);}catch(e){return e.name+': '+e.message;}}
            const expected=error(clean,null);assert(expected);
            assert.equal(error(candidate,session),expected);
            observations.bad={diagnostic:expected};continue;
        }
        assert.deepEqual(snapshot(candidate,texts[name],elf,session),gold[name]);
        initial=session.commit();observations[name]=session.stats();
    }
    const trials=[];
    const pairs=[['base','base'],['base','body'],['body','signature'],['signature','layout']];
    for(const [parent,child] of pairs){
        const seed=candidate.fragmentSession(null);snapshot(candidate,texts[parent],elf,seed);
        const old=seed.commit(); const saved=save(root,identity,old);
        for(let block=0;block<5;block++) {
            const arms=['clean','ram','disk','cold-cache'];
            for(let i=0;i<4;i++){
                const arm=arms[(block+i)%4];
                if(arm==='disk') save(root,identity,old);
                const t=clock();
                let lookup=0,write=0,size=0,session=null,built;
                if(arm==='clean')built=snapshot(clean,texts[child],elf,null);
                else {
                    const raw=arm==='disk'?load(root,identity):arm==='ram'?old:null;
                    if(arm==='disk') assert(raw);
                    lookup=clock()-t;
                    session=candidate.fragmentSession(raw);
                    built=snapshot(candidate,texts[child],elf,session);
                    if(arm==='disk'){
                        const before=clock();size=save(root,identity,session.commit());write=clock()-before;
                    }
                }
                const total=clock()-t;assert.deepEqual(built,gold[child]);
                trials.push({parent,child,block,arm,total,lookup,write,size,...session?.stats()});
            }
        }
        assert(load(root,'foreign firmware')===null);
        const intact=fs.readFileSync(root);fs.writeFileSync(root,intact.subarray(0,24));
        assert(load(root,identity)===null);fs.writeFileSync(root,intact);
        assert(saved>0);
    }
    output.apps[app]={gold,observations,trials};
    console.log(app,observations);
}
fs.writeFileSync(path.join(out,'host.json'),JSON.stringify(output,null,2)+'\n');
