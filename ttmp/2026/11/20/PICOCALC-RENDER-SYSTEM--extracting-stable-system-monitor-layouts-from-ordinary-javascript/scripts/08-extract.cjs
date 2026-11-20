// Build-time extraction. Generated catalog is derived only from ordinary SDK call sites.
// Serialization specialization deliberately follows JS evaluation/JSON.stringify so its
// observable evaluation order and fresh-object semantics require no app-wide proof.
const {parse}=require('acorn');
const crypto=require('node:crypto');
const {ui}=require('./04-harness.cjs');
function literal(n) {
  if(!n)throw Error('array hole');
  if(n.type==='Literal' && (n.value===null || ['string','boolean'].includes(typeof n.value) ||
      typeof n.value==='number'&&Number.isFinite(n.value)&&!Object.is(n.value,-0)))return n.value;
  if(n.type==='ArrayExpression')return n.elements.map(literal);
  if(n.type==='ObjectExpression'){
    const value={};
    for(const p of n.properties){
      if(p.type!=='Property'||p.kind!=='init'||p.method||p.computed||p.shorthand)throw Error('non-data property');
      const k=p.key.type==='Identifier'?p.key.name:p.key.value;
      if(typeof k!=='string'||k==='__proto__'||Object.hasOwn(value,k))throw Error('key');
      value[k]=literal(p.value);
    }
    return value;
  }
  throw Error(n.type);
}
function extract(source) {
  const ast=parse(source,{ecmaVersion:2022,locations:true}), calls=[],dict=new Set();
  const allowed=new Set(['col','row','box','text','title','gap','sep','list','table','lines','spark','canvas','input','grid','kv','textarea','bar']);
  let escapedUI=false;
  function visit(x,parent){
    if(!x||typeof x!=='object')return;
    if(x.type==='Identifier'&&x.name==='ui'&&!(parent?.type==='MemberExpression'&&parent.object===x&&!parent.computed))escapedUI=true;
    if(['AssignmentExpression','UpdateExpression','UnaryExpression'].includes(x.type)){
      const l=x.left||x.argument;
      if(l?.type==='MemberExpression'&&l.object?.name==='ui')escapedUI=true;
    }
    if(x.type==='CallExpression'&&x.callee?.type==='MemberExpression'&&x.callee.object.name==='ui')calls.push(x);
    for(const [key,z] of Object.entries(x))if(key!=='loc')Array.isArray(z)?z.forEach(v=>visit(v,x)):visit(z,x);
  }
  visit(ast,null);
  const sites=[];
  for(const call of calls){
    const method=call.callee.computed?'computed':call.callee.property.name;
    const site={line:call.loc.start.line,method,fragments:[],decision:''};sites.push(site);
    if(escapedUI||!allowed.has(method)){site.decision='fallback: unknown SDK binding or method';continue;}
    let all=true;
    const values=call.arguments.map(n=>{try{return literal(n);}catch{all=false;return undefined;}});
    const add=(v,origin)=>{
      const raw=JSON.stringify(v);
      // Accept only complete composite values. Primitives could accidentally match a key
      // or a decimal prefix. A tiny dictionary fragment costs more than a reference.
      if(v!==null&&typeof v==='object'&&raw.length>=12){dict.add(raw);site.fragments.push(origin);}
    };
    if(all) add(ui[method](...values),'node');
    // Only these positions survive an SDK constructor as intact composite fields.
    const fieldArgs={table:[0,1],kv:[0],canvas:[2],list:[0],lines:[0],spark:[0],grid:[0],textarea:[0]};
    for(const i of fieldArgs[method]||[]){if(values[i]!==undefined)add(values[i],'arg'+i);}
    site.decision=site.fragments.length?'catalog':'fallback: dynamic or unprofitable literal';
  }
  const entries=[...dict].sort((a,b)=>b.length-a.length||(a<b?-1:a>b?1:0));
  const version=crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0,16);
  return {entries,version,sites};
}
module.exports={extract};
