// Write full compositor primitives and complete visual states for the C damage comparison.
import vm from 'node:vm';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const dir=process.argv[2];
const lines=name=>readFileSync(join(dir,name),'utf8').trim().split('\n').map(s=>JSON.parse(s));
const frames=lines('semantic.ndjson'), states=lines('states.ndjson');
const builder=new Proxy({}, {get:()=>()=>builder});
const fonts={s:[6,12],m:[8,16],mb:[8,16],l:[10,20],xl:[16,32]};
const source=readFileSync('picocalc-os/js/system/compositor.js','utf8');
const paint=vm.runInNewContext(source+'\nF=fonts; paint;', {service:()=>builder,fonts,clock:{set:()=>false}});
const records=[];
for(const [i,{id,tree,hints}] of frames.entries()) {
  const v=states[i]; if(v.id!==id) throw Error('Snapshot ID disagreement');
  const ops=[];
  const fb={text:(x,y,s,f,c,max=0)=>ops.push(['T',x|0,y|0,max|0,f||'m',c,Buffer.from(s).toString('hex')].join(' '))};
  for(const [name,symbol] of [['fill','F'],['rect','R'],['line','L']])
    fb[name]=(x,y,w,h,c)=>ops.push([symbol,x|0,y|0,w|0,h|0,c].join(' '));
  paint({fb,focus:'snake',apps:{snake:{tree,hints,title:'Snake'}},battery:null,banner:null,crashed:{}});
  records.push(`G ${i} ${id} ${+v.alive} ${+v.auto} ${v.score} ${v.best} ${v.food} ${v.body.length} ${ops.length}\n`+
    v.body.join(' ')+'\n'+ops.join('\n'));
}
writeFileSync(join(dir,'damage-input.txt'),records.join('\n')+'\n');
