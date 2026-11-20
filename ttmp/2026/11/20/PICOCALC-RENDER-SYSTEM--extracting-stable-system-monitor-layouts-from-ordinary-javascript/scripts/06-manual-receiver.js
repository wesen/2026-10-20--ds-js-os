// Resident catalog v1, executed using the normal compositor-side UI constructors.
function materializeManual(v) {
  if(!Array.isArray(v)||v[0]!==1||![-1,0,1,2].includes(v[1]))throw Error('unknown System template');
  const tab=v[1], d=v[3];
  if(tab===-1)return ui.text('');
  const stateColor={idle:'ink',busy:'accent',waiting:'blue',restarting:'warn',stopped:'accent'};
  const header=ui.row({gap:4},...['Worlds','Handles','Buses'].map((t,i)=>ui.text(t,{
    font:'mb',color:i===tab?'accentInk':'muted',bg:i===tab?'ink':undefined,pad:3,align:'center',w:74})),
    ui.text(v[2],{font:'s',color:'muted',align:'right',pad:5}));
  function spark(g,h){return ui.spark(g[0],{label:g[2],right:g[3],color:g[4],h,max:g[1],points:48});}
  let body;
  if(tab===0){
    const rows=d[1].map(r=>({cells:[r[0],{s:r[1],color:stateColor[r[1]]},...r.slice(2)]}));
    body=[spark(d[0],26),ui.gap(2),ui.table([
      {label:'world',w:72},{label:'state',w:62},{label:'turns',align:'right'},{label:'cpu%',align:'right',w:36},
      {label:'cpu ms',align:'right'},{label:'KB',align:'right',w:32},{label:'rst',align:'right',w:22}],
      rows,{sel:d[2],font:'s',lead:3}),ui.sep({h:5}),ui.kv([
        ['cpu',d[3]],['mailbox / peak',d[4]],['budget, limit',d[5]],['claims',d[6]],
        ['last error',d[7],d[8]?'accent':'muted']],{keyW:96,lead:2})];
  }else if(tab===1){
    body=[ui.text('Hardware the kernel has handed out. A handle is checked on every use; a narrowed one carries fewer rights.',
      {wrap:true,font:'s',color:'muted'}),ui.gap(4),ui.table([
      {label:'id',w:22,align:'right'},{label:'type',w:32},{label:'claim',w:66},{label:'rt',w:28},{label:'held by'},{label:'',w:52,align:'right'}],
      d[0].map(r=>({cells:r.slice(0,6),color:r[6]?'muted':undefined})),{sel:d[1],font:'s',lead:5})];
  }else{
    body=d.length?d.flatMap(b=>[spark(b[0],30),ui.kv([['transfers',b[1]],['bytes',b[2]],['busy',b[3]],
      ['errors',b[4],b[5]?'accent':'muted']],{keyW:96,lead:1}),ui.gap(6)]):[ui.text('…')];
  }
  return ui.col({gap:4},header,...body);
}
