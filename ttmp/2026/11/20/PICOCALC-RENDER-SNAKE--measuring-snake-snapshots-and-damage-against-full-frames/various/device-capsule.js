(function(g){
const CW=22,CH=18,CELL=13;
const game={}, pub={screen(f){game.screen=f;return this},hints(f){game.hints=f;return this}};
const world={};
(function(g){  const isOpts = (x) => x && typeof x === "object" && !Array.isArray(x) && !x.t;
  const node = (t) => (...kids) => {
    const o = isOpts(kids[0]) ? kids.shift() : {};
    return Object.assign({ t }, o, { kids: kids.flat(9).filter((x) => x != null && x !== false) });
  };
  g.ui = {
    col: node("col"),
    row: node("row"),
    box: node("box"),
    text: (s, o) => Object.assign({ t: "text", s: String(s) }, o),
    title: (s, o) => Object.assign({ t: "text", s: String(s), font: "l" }, o),
    gap: (h) => ({ t: "gap", h: h == null ? 8 : h }),
    sep: (o) => Object.assign({ t: "sep" }, o),
    bar: (frac, o) => Object.assign({ t: "bar", v: Math.max(0, Math.min(1, +frac || 0)) }, o),
    list: (items, sel, o) => Object.assign({ t: "list", items, sel: sel == null ? -1 : sel }, o),
    table: (cols, rows, o) => Object.assign({ t: "table", cols, rows }, o),
    lines: (items, o) => Object.assign({ t: "lines", items }, o),
    // rows drawn as given (already wrapped), with o.cursor [row, col] and o.marks [[row, col, len, color]]
    textarea: (rows, o) => Object.assign({ t: "textarea", rows }, o),
    spark: (values, o) => Object.assign({ t: "spark", values }, o),
    canvas: (w, h, ops, o) => Object.assign({ t: "canvas", w, h, ops }, o),
    input: (value, o) => Object.assign({ t: "input", value: String(value) }, o),
    grid: (items, sel, o) => Object.assign({ t: "grid", items, sel: sel == null ? -1 : sel }, o),
    kv: (pairs, o) => Object.assign({ t: "kv", pairs }, o),
  };

})(world);
const ui=world.ui;
pub  .screen((s) => {
    const ops = [];
    for (let i = s.body.length - 1; i >= 0; i--) {  // tail first, so the head is drawn on top
      const [x, y] = s.body[i];
      ops.push(["fill", x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2, i === 0 ? "accent" : "ink"]);
    }
    const [fx, fy] = s.food;
    ops.push(["fill", fx * CELL + 3, fy * CELL + 3, CELL - 6, CELL - 6, "accent"], ["rect", fx * CELL + 1, fy * CELL + 1, CELL - 2, CELL - 2, "accent"]);
    if (!s.alive) {
      const bw = 190, bx = (CW * CELL - bw) >> 1, by = 70;
      ops.push(["fill", bx, by, bw, 78, "ink"], ["text", bx + 52, by + 12, "GAME OVER", "l", "accentInk"],
        ["text", bx + 16, by + 42, `score ${s.score}   best ${s.best}`, "s", "faint"], ["text", bx + 40, by + 58, "⏎ to play again", "s", "accentInk"]);
    }
    return ui.col({ gap: 6 },
      ui.row(ui.text(`score ${s.score}`, { font: "mb", w: 104 }), ui.text(`${s.auto ? "auto · " : ""}length ${s.body.length} · best ${Math.max(s.best, s.score)}`, { font: "s", color: s.auto ? "accent" : "muted", align: "right", pad: 3 })),
      ui.canvas(CW * CELL, CH * CELL, ops, { bg: "#ffffff", border: "line" }),
    );
  })
  .hints((s) => (s.alive ? "←→↑↓ or wasd steer  p autopilot" : "⏎ play again"));

// Complete visual state, head first. Little-endian 16-bit fields after version and flags.
const LIMIT = 395;
const cell = ([x,y]) => 22*y+x;
function project(state) {
  return {alive:state.alive, auto:state.auto, score:state.score, best:state.best,
    food:cell(state.food), body:state.body.map(cell)};
}
function encode(v) {
  const bytes=new Uint8Array(10+2*v.body.length);
  const words=new DataView(bytes.buffer);
  bytes[0]=1; bytes[1]=Number(v.alive) | (Number(v.auto)<<1);
  words.setUint16(2,v.body.length,true); words.setUint16(4,v.food,true);
  words.setUint16(6,v.score,true); words.setUint16(8,v.best,true);
  v.body.forEach((c,i)=>words.setUint16(10+2*i,c,true));
  return bytes;
}
function decode(b) {
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
function template(v) {
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

const samples=[{"focused":false,"best":0,"auto":false,"body":[[6,8],[5,8],[4,8],[3,8]],"dir":[1,0],"next":[1,0],"score":0,"alive":true,"ticks":0,"food":[7,8]},{"focused":true,"best":0,"auto":false,"body":[[7,8],[6,8],[5,8],[4,8],[3,8]],"dir":[1,0],"next":[1,0],"score":10,"alive":true,"ticks":1,"food":[2,5]},{"focused":true,"best":0,"auto":false,"body":[[7,9],[7,8],[6,8],[5,8],[4,8]],"dir":[0,1],"next":[0,1],"score":10,"alive":true,"ticks":2,"food":[2,5]},{"focused":true,"best":10,"auto":false,"body":[[6,9],[7,9],[7,8],[6,8],[5,8]],"dir":[0,-1],"next":[0,-1],"score":10,"alive":false,"ticks":4,"food":[2,5]},{"focused":true,"best":10,"auto":false,"body":[[6,8],[5,8],[4,8],[3,8]],"dir":[1,0],"next":[1,0],"score":0,"alive":true,"ticks":0,"food":[0,16]},{"focused":true,"best":10,"auto":false,"body":[[6,8],[6,9],[7,9],[7,8]],"dir":[0,-1],"next":[0,-1],"score":0,"alive":true,"ticks":4,"food":[0,16]},{"focused":true,"best":10,"auto":false,"body":[[6,0],[6,1],[6,2],[6,3]],"dir":[0,-1],"next":[0,-1],"score":0,"alive":false,"ticks":13,"food":[0,16]},{"focused":true,"best":10,"auto":true,"body":[[6,8],[5,8],[4,8],[3,8]],"dir":[1,0],"next":[1,0],"score":0,"alive":true,"ticks":0,"food":[20,11]},{"focused":true,"best":10,"auto":true,"body":[[16,12],[17,12],[18,12],[19,12],[19,13],[19,14],[19,15],[19,16],[19,17],[20,17]],"dir":[-1,0],"next":[-1,0],"score":60,"alive":true,"ticks":50,"food":[16,14]},{"focused":true,"best":10,"auto":true,"body":[[18,8],[17,8],[16,8],[15,8],[14,8],[13,8],[12,8],[12,7],[11,7],[10,7],[9,7],[8,7],[8,6],[8,5]],"dir":[1,0],"next":[1,0],"score":100,"alive":true,"ticks":100,"food":[19,11]},{"focused":true,"best":10,"auto":true,"body":[[12,16],[11,16],[10,16],[9,16],[8,16],[7,16],[6,16],[5,16],[4,16],[4,15],[4,14],[4,13],[4,12],[4,11],[4,10],[4,9],[4,8]],"dir":[1,0],"next":[1,0],"score":130,"alive":true,"ticks":150,"food":[16,6]},{"focused":true,"best":10,"auto":true,"body":[[9,11],[8,11],[7,11],[7,10],[7,9],[7,8],[7,7],[7,6],[6,6],[5,6],[4,6],[3,6],[3,5],[4,5],[5,5],[6,5],[7,5],[8,5],[8,6],[8,7],[8,8]],"dir":[1,0],"next":[1,0],"score":170,"alive":true,"ticks":200,"food":[10,17]}];
const full=s=>({tree:game.screen(s),hints:game.hints(s)});
const json=s=>JSON.stringify(full(s));
const bytes=s=>{let n=0;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);if(c<128)n++;else if(c<2048)n+=2;else if(c>=55296 && c<=56319){n+=4;i++;}else n+=3;}return n;};
const encoded=samples.map(s=>({j:json(s),t:encode(project(s)),sj:JSON.stringify(project(s))}));
for(const x of encoded)if(JSON.stringify(template(decode(x.t)))!==x.j)throw Error('Snake parity');
g.renderLabRun=function(arm,reps){
 if(['J','SJ','T'].indexOf(arm)<0||!Number.isInteger(reps)||reps<1||reps>500)throw Error('Snake parameters');
 const pack=arm==='J'?json:arm==='SJ'?s=>JSON.stringify(project(s)):s=>encode(project(s));
 const unpack=arm==='J'?s=>JSON.parse(s):arm==='SJ'?s=>template(JSON.parse(s)):s=>template(decode(s));
 const field=arm.toLowerCase(),sizes=encoded.map(x=>arm==='T'?x.t.byteLength:bytes(x[field]));
 let encodedCount=0,check=0,count=0,t0=labMicros();
 for(let r=0;r<reps;r++)for(const s of samples){const packed=pack(s);encodedCount+=packed.length;}
 const t1=labMicros();
 for(let r=0;r<reps;r++)for(const x of encoded){const a=unpack(x[field]);check+=a.tree.kids[1].ops.length+a.hints.length;count++;}
 const t2=labMicros();
 return JSON.stringify({arm,reps,count,producerUs:t1-t0,receiverUs:t2-t1,checksum:check,encodedUnits:encodedCount,bytes:sizes.reduce((a,b)=>a+b,0)*reps});
};
})(globalThis);
