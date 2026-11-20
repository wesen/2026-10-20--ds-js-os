// node 04-screen-oracle.mjs frames.ndjson raw-output-dir [--skip-frame INDEX]
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const args=process.argv.slice(2);
const indexed=args.includes('--indexed');
const [input,output,flag,index]=args.filter(x=>x!=='--indexed');
if (!input || !output || (flag && flag !== '--skip-frame')) throw Error('Expected frames.ndjson output-directory [--skip-frame N]');
const scripts = dirname(fileURLToPath(import.meta.url));
const root = execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
const nucleus = join(root,'picocalc-os/nucleus');
const tmp = mkdtempSync(join(tmpdir(),'render-pixel-oracle-'));
const frames = readFileSync(input,'utf8').trim().split('\n').map(line=>JSON.parse(line));
mkdirSync(output,{recursive:true});
try {
    const binary = join(tmp,'raster');
    execFileSync('cc',['-O2','-I',nucleus,'-ffunction-sections','-fdata-sections',join(scripts,'03-raster-driver.c'),
        join(nucleus,'gfx.c'),join(nucleus,'util.c'),'-Wl,--gc-sections','-o',binary]);
    const fonts = JSON.parse(execFileSync(binary,['--fonts'],{encoding:'utf8'}));
    const builder = new Proxy({}, {get: () => () => builder});
    const compositor = readFileSync(join(root,'picocalc-os/js/system/compositor.js'),'utf8');
    const checkedCompositor = compositor.replace("catch (e) {   // a malformed tree", "catch (e) { throw e;   // a malformed tree");
    if (checkedCompositor === compositor) throw Error("compositor draw error hook changed");
    const paint = vm.runInNewContext(checkedCompositor+'\nF=fonts; paint;', {service:()=>builder, fonts, clock:{set:()=>false}});
    const rgb = c=> String(c).replace(/^#/,'').replace(/^([0-9a-f])([0-9a-f])([0-9a-f])$/i,'$1$1$2$2$3$3');
    const reader=indexed?vm.runInThisContext('(function(){'+readFileSync(join(scripts,'10-index-reader.js'),'utf8')+';return indexScreen})()'):null;
    const records=[];
    let previous;
    for (const [i,row] of frames.entries()) {
        const ops=[];
        const fb={
            text:(x,y,s,font,c,max=0)=>ops.push('T '+[x|0,y|0,max|0,font||'m',c,Buffer.from(String(s)).toString('hex')].join(' ')),
        };
        for(const [key,op] of [['fill','F'],['line','L'],['rect','R']])
            fb[key]=(a,b,c,d,color)=>ops.push(op+' '+[a|0,b|0,c|0,d|0,rgb(color)].join(' '));
        paint({apps:{[row.app]:{tree:reader?reader(JSON.stringify(row.tree)).view():row.tree,hints:row.hints||'',title:row.title||row.app}},focus:row.app,
            battery:row.battery??null,banner:row.banner??null,crashed:{},fb});
        const count=ops.length;
        // Run each transition as a two-frame replay, with the preceding state already on the virtual panel.
        // A skipped flush is followed by an unchanged repaint on the same raster instance.
        const prefix=previous ? previous+'\nP\n' : '';
        const drawing=ops.join('\n');
        const skip=flag && Number(index)===i;
        const commands=prefix+drawing+(skip?'\nS\n'+drawing:'')+'\nP\n';
        const raw=execFileSync(binary,[],{input:commands,maxBuffer:2*1024*1024});
        const frame=raw.subarray(raw.length-320*320*2);
        const filename=String(i).padStart(5,'0')+'.rgb565';
        writeFileSync(join(output,filename),frame);
        const changed=previous ? raw.subarray(0,320*320*2) : null;
        let changedPixels=0;
        if(changed) for(let j=0;j<frame.length;j+=2) if(frame.readUInt16LE(j)!==changed.readUInt16LE(j)) changedPixels++;
        records.push({id:row.id,app:row.app,filename,commands:count,changedPixels:changed ? changedPixels:null,
            recoveredSkippedFlush:Boolean(skip),pixelSha256:createHash('sha256').update(frame).digest('hex')});
        previous=drawing;
    }
    writeFileSync(join(output,'receipt.json'),JSON.stringify(records,null,2)+'\n');
} finally {rmSync(tmp,{recursive:true,force:true});}
