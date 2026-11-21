// In-memory fragments are private to this compiler instance and its release scalar backend.
(() => {
    const brand = {};
    globalThis.dependencySession = function(prior) {
        const items=Object.create(null), events=[], facts=new Map();
        let names, functions, records, enums, distinct, generated, ordinals, symbolIndex;
        let current, reused=false, captured;
        const fnShape=f=>f?[f.params,f.result,!!f.awaitable]:null;
        function init(imported,declared,r,e,d,lowered) {
            names=[...imported,...declared].map(f=>f.name);
            functions=new Map([...imported,...declared].map(f=>[f.name,f]));
            ordinals=new Map(declared.map((f,i)=>[f.name,i]));
            symbolIndex=new Map(names.map((name,i)=>[name,i]));
            records=r;enums=e;distinct=d;
            generated=JSON.stringify(lowered?[lowered.prefix,[...lowered.startFields]]:null);
        }
        function fact(key) {
            if(facts.has(key))return facts.get(key);
            const [kind,name,field]=key.split('/'); let value;
            switch(kind) {
            case 'fn': value=[ordinals.has(name),fnShape(functions.get(name))];break;
            case 'record': value=records.has(name);break;
            case 'field': {const f=records.get(name)?.get(field);value=f?[f.type,f.offset]:null;break;}
            case 'enum': value=enums.has(name);break;
            case 'members': {const table=enums.get(name);value=table?[...table]:null;break;}
            case 'distinct': value=distinct.has(name);break;
            default: throw Error('unregistered lookup '+kind);
            }
            const answer=JSON.stringify(value);facts.set(key,answer);return answer;
        }
        function watch(kind,name,field) {
            // The frontend's integer literal marker is a Symbol and cannot denote a declaration.
            if(typeof name!=='string')return;
            const key=kind+'/'+name+(field===undefined?'':'/'+field);
            if(!captured.has(key))captured.set(key,fact(key));
        }
        function lookup(lex,fn,edges) {
            const old=prior?.brand===brand && prior.items[fn.name];
            const signature=JSON.stringify([fn.params,fn.paramNames,fn.result]);
            reused=!!(old && prior.generated===generated && old.signature===signature &&
                lex.source.startsWith(old.body,fn.bodyAt) && old.deps.every(([key,value])=>fact(key)===value)
                && old.edges.every(name=>ordinals.has(name)));
            events.push([fn.name,reused]);
            if(reused) {
                current=items[fn.name]=old;
                for(const name of old.edges)edges.push(ordinals.get(name));
                return true;
            }
            lex.offset=fn.bodyAt;lex.next();const end=lex.skipBody();
            current={body:end===undefined?null:lex.source.slice(fn.bodyAt,end),signature,edgeBuffer:edges};
            captured=new Map();
            if(current.body!==null)items[fn.name]=current;
            return false;
        }
        function emit(Emitter,lex,declared,r,edges,base,e,d,fn) {
            const trackedFunctions={get(name){watch('fn',name);return declared.get(name);}};
            const trackedRecords={
                has(name){watch('record',name);return r.has(name);},
                get(name){watch('record',name);const fields=r.get(name);return fields&&{
                    get(field){watch('field',name,field);return fields.get(field);}
                };}
            };
            const trackedEnums={has(name){watch('enum',name);return e.has(name);},
                get(name){watch('members',name);return e.get(name);}};
            const trackedDistinct={has(name){watch('distinct',name);return d.has(name);}};
            new Emitter(lex,trackedFunctions,trackedRecords,edges,base,trackedEnums,trackedDistinct).function(fn);
            current.deps=[...captured];
        }
        function lower(fn,targets,build) {
            if(current!==items[fn.name] && current.body!==null)throw Error('emission order differs');
            if(reused) return {words:current.words.slice(),calls:current.calls.map(([from,name,at,rd])=>({
                from, target:name===null?{at}:targets[symbolIndex.get(name)], rd
            }))};
            const built=build();
            current.words=built.words.slice();
            current.calls=built.calls.map(({from,target,rd})=>{
                const i=targets.indexOf(target);
                if(i<0 && !Number.isInteger(target.at))throw Error('unknown relocation');
                return [from,i<0?null:names[i],i<0?target.at:0,rd];
            });
            current.edges=current.edgeBuffer.map(i=>names[names.length-ordinals.size+i]);
            delete current.edgeBuffer;
            return built;
        }
        return {init,lookup,emit,lower,commit:()=>({brand,generated,items}),
            stats:()=>({reused:events.filter(x=>x[1]).length,rebuilt:events.filter(x=>!x[1]).length}),
            events:()=>events};
    };
})();
