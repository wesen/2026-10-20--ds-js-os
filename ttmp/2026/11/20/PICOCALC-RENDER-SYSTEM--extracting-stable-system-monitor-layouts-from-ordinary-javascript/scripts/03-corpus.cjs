// Frozen before candidate comparisons. Fixtures supply deterministic kernel records;
// the production screen handles its own windowing, formatting, and graph conversion.
function systemCases() {
  const worlds = Array.from({length:28}, (_,i)=>({
    name: ['kernel','display','keyboard','compositor','w«界»'][i%5]+i,
    state:['idle','busy','waiting','restarting','stopped'][i%5],
    turns: i%3===0?1e5+i*11:15+i, cpu_ms: i*21.125,
    mem_kb: 35+i*2.5, pct: i%4===0?null:i/47, restarts: i%5===3?3:0,
    mbox:i%4,mbox_peak:8,budget_ms:80,limit_kb:768,
    claims:i%2?['dma','sys.read']:[],last_error:i%7===0?'quote " newline\nslash \\':''
  }));
  const handles = Array.from({length:36}, (_,i)=>({
    id:i+1,holders:i%3===0?[]:['display','kernel'].slice(0,1+i%2),
    type:['dma','spi','i2c'][i%3],claim:'hw.'+i,rights:i%2?'r':'rw',
    kb:i%3?0:64,hz:i%3===1?40e6:1e4,revoked: i%7===0
  }));
  const hist = Array.from({length:48}, (_,i)=>((i*17)%48)/47);
  const buses=['i2c','spi2'].map((name,i)=>({name,transfers:155*(i+1),bytes:859*i,busy_ms:28.5+i,errors:i}));
  const base={focused:true,worlds,handles,lane:hist,i2c:hist,spi:hist,tab:0,sel:0,last:{t_ms:30500,buses}};
  const frames=[];
  function frame(id,patch={},extra={}) {frames.push({id,state:{...base,...patch},...extra});}
  frame('blur',{focused:false});
  frame('worlds-empty',{worlds:[],lane:[],last:null});
  frame('worlds-first');
  frame('worlds-first-repeat');
  frame('worlds-selection',{sel:1});
  frame('worlds-shift',{sel:8});
  frame('worlds-last',{sel:27});
  frame('worlds-refresh',{sel:27,last:{t_ms:31000,buses},lane:hist.map(v=>1-v)});
  frame('worlds-near-half',{lane:[0,(0.5+Number.EPSILON)/23,1]});
  frame('handles-empty',{tab:1,handles:[]});
  frame('handles-short',{tab:1,handles:handles.slice(0,3),sel:2});
  frame('handles-first',{tab:1});
  frame('handles-shift',{tab:1,sel:16});
  frame('handles-last',{tab:1,sel:35});
  frame('handles-last-overlay',{tab:1,sel:35},{banner:'disk ready'});
  frame('handles-overlay-removed',{tab:1,sel:35});
  frame('buses-empty',{tab:2,last:null});
  frame('buses-first',{tab:2});
  frame('buses-refresh',{tab:2,last:{t_ms:31000,buses:buses.map(b=>({...b,transfers:b.transfers+2}))}});
  frame('blur-again',{focused:false});
  return frames;
}
// This input is defined without observing Keys source. Use registered event handlers
// and periodic callbacks in the saved order, noting absent handlers.
const keysActions = [
  ['start'],['focus'],['tick'],['key',{key:'a',code:65,mods:0}],['key',{key:'down',code:40,mods:0}],
  ['key',{key:'enter',code:13,mods:0}],['key',{key:'b',code:66,mods:1}],
  ...Array.from({length:16},(_,i)=>['key',{key:String(i%10),code:48+i%10,mods:0}]),
  ['tick'],['blur'],['focus']
];
module.exports={systemCases,keysActions};
// Protocol extension preregistered on receipt of the blind brief, before the
// first candidate run. Keep the feature coverage above and add repeated series.
const boundaryCases=module.exports.systemCases;
module.exports.systemCases=()=>{
  const frames=boundaryCases(), base=frames[2].state;
  for(let i=0;i<50;i++){
    const tab=i%3;
    frames.push({id:'refresh-'+i,state:{...base,tab,sel:tab===0?27:tab===1?35:0,
      lane:base.lane.map((v,k)=>(v+(k===i%48?0.125:0))%1),
      worlds:base.worlds.map((w,k)=>k===27?{...w,turns:w.turns+i,state:i%2?'busy':'idle'}:w),
      handles:base.handles.map((h,k)=>k===35?{...h,kb:i}:h),
      last:{t_ms:31000+i*500,buses:base.last.buses.map(b=>({...b,errors:i%2}))}}});
  }
  for(let i=0;i<10;i++)frames.push({id:'select-'+i,state:{...base,sel:9+i}});
  for(let i=0;i<10;i++)frames.push({id:'unrelated-'+i,state:{...base,sel:18,unused:i}});
  for(let i=0;i<5;i++)frames.push({id:'title-'+i,state:base,title:'System '+i});
  for(let i=0;i<5;i++)frames.push({id:'switch-'+i,state:{...base,tab:i%3}});
  return frames;
};
