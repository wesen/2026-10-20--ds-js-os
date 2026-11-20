// Portable JS. A generic SDK envelope begins with a left brace. A versioned catalog
// envelope begins with a left bracket. Every accepted envelope is self-contained.
function makeAutoCodec(catalog) {
  const ids=new Map(catalog.entries.map((raw,i)=>[raw,i]));
  const escapeRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const stringToken=String.raw`"(?:[^"\\]|\\.)*"`;
  const values=catalog.entries.map(escapeRe);
  const search=new RegExp([...values,stringToken].join('|'),'g');
  const marker=String.raw`\{"\$r":([0-9]+)\}`;
  const refs=new RegExp(marker+'|'+stringToken,'g');
  const header='["'+catalog.version+'",';
  function encode(raw){
    if(!values.length||raw.includes('"$r":'))return raw;
    const body=raw.replace(search,text=>ids.has(text)?'{"$r":'+ids.get(text)+'}':text);
    const compressed=header+body+']';
    return compressed.length<raw.length?compressed:raw;
  }
  function decode(wire){
    if(wire[0]==='{')return JSON.parse(wire);
    if(!wire.startsWith(header)||!wire.endsWith(']'))throw Error('unknown automatic template');
    const data=wire.slice(header.length,-1).replace(refs,(text,index)=>{
      if(index===undefined)return text;
      if(!Object.prototype.hasOwnProperty.call(catalog.entries,index))throw Error('unknown automatic slot');
      return catalog.entries[index];
    });
    return JSON.parse(data);
  }
  return {encode,decode};
}
