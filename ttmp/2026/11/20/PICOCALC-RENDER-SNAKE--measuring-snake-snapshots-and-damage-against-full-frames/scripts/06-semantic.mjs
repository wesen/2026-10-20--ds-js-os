// Complete visual state, head first. Little-endian 16-bit fields after version and flags.
export const LIMIT = 395;
const cell = ([x,y]) => 22*y+x;
export function project(state) {
  return {alive:state.alive, auto:state.auto, score:state.score, best:state.best,
    food:cell(state.food), body:state.body.map(cell)};
}
export function encode(v) {
  const bytes=new Uint8Array(10+2*v.body.length);
  const words=new DataView(bytes.buffer);
  bytes[0]=1; bytes[1]=Number(v.alive) | (Number(v.auto)<<1);
  words.setUint16(2,v.body.length,true); words.setUint16(4,v.food,true);
  words.setUint16(6,v.score,true); words.setUint16(8,v.best,true);
  v.body.forEach((c,i)=>words.setUint16(10+2*i,c,true));
  return bytes;
}
export function decode(b) {
  if(b.length<10 || b.length>800) throw Error('byte length');
  if(b[0]!==1) throw Error('version');
  if(b[1]>3) throw Error('flags');
  const words=new DataView(b.buffer,b.byteOffset,b.byteLength);
  const n=words.getUint16(2,true), food=words.getUint16(4,true), score=words.getUint16(6,true), best=words.getUint16(8,true);
  if(n<4 || n>LIMIT || b.length!==10+2*n) throw Error('segment count');
  if(food>=396) throw Error('food cell');
  if(score!==(n-4)*10 || best>3910 || best%10!==0) throw Error('score');
  const used = new Uint8Array(396), body = [];
  used[food]=1;
  for(let i=0;i<n;i++) {
    const c=words.getUint16(10+i*2,true);
    if(c>=396 || used[c]) throw Error('occupied or invalid cell');
    const p=body.at(-1);
    if(i && Math.abs(c%22-p%22)+Math.abs(Math.floor(c/22)-Math.floor(p/22))!==1) throw Error('disconnected');
    body.push(c); used[c]=1;
  }
  return {alive:!!(b[1]&1),auto:!!(b[1]&2),score,best,food,body};
}

// A hand-authored resident view built independently of the control's screen callback.
export function template(v) {
  const fills=[];
  for(let i=v.body.length-1;i>=0;i--) {
    const c=v.body[i];
    fills.push(['fill',13*(c%22)+1,13*Math.floor(c/22)+1,11,11,i?'ink':'accent']);
  }
  const fx=13*(v.food%22), fy=13*Math.floor(v.food/22);
  fills.push(['fill',fx+3,fy+3,7,7,'accent'], ['rect',fx+1,fy+1,11,11,'accent']);
  if(!v.alive) {
    fills.push(['fill',48,70,190,78,'ink'],['text',100,82,'GAME OVER','l','accentInk'],
      ['text',64,112,`score ${v.score}   best ${v.best}`,'s','faint'],
      ['text',88,128,'⏎ to play again','s','accentInk']);
  }
  return {tree:{t:'col',gap:6,kids:[
    {t:'row',kids:[{t:'text',s:'score '+v.score,font:'mb',w:104},
      {t:'text',s:(v.auto?'auto · ':'')+'length '+v.body.length+' · best '+Math.max(v.score,v.best),
        font:'s',color:v.auto?'accent':'muted',align:'right',pad:3}]},
    {t:'canvas',w:286,h:234,ops:fills,bg:'#ffffff',border:'line'}]},
    hints:v.alive?'←→↑↓ or wasd steer  p autopilot':'⏎ play again'};
}
