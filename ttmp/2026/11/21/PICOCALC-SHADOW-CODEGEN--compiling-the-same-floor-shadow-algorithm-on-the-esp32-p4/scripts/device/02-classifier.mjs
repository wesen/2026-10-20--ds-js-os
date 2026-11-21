function classify(w,x,y){
  const B=BigInt,abs=v=>v<0?-v:v;
  const lx=w[17]-32,ly=w[18]-32,norm=w[19],count=w[16];
  const sx=4096+32*x,sy=4096+32*y;
  const path=[],counts={x:0,y:0,miss:0,hit:0};
  const mark=k=>{path.push(k);counts[k]++;};
  for(let s=0;s<count;s++){
    const sh=21+4*s,ob=1+5*s;
    if(sh+3>=w.length)throw new RangeError('sphere '+s+' outside 33-element buffer');
    if(abs(sx-w[sh])>w[sh+2]){mark('x');continue;}
    if(abs(sy-w[sh+1])>w[sh+3]){mark('y');continue;}
    const dx=w[ob]-x,dy=w[ob+1]-y,dz=156-w[ob+2],r=w[ob+3];
    const dot=B(dx)*B(lx)+B(dy)*B(ly)+32n*B(dz);
    const dist=B(dx)*B(dx)+B(dy)*B(dy)+B(dz)*B(dz)-B(r)*B(r);
    if(dot>0n&&dist*B(norm)<=dot*dot){mark('hit');return{result:1,path,counts};}
    mark('miss');
  }
  return{result:0,path,counts};
}

export { classify };
