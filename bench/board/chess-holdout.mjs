// Promoted from PICOCALC-SHADOW-CODEGEN scripts/validation/holdout.mjs (PICOCALC-REPO-LAYOUT Phase A).
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";

export const revision="57b2d9f";
export const sha = (b)=>createHash("sha256").update(b).digest("hex");
const files={"position":["chessSquare","chessSide"],"search":["chessValue","chessAbs","chessCenter","chessEvaluate"]};
export function loadSource() {
    const parts=[];
    for(const [file,names] of Object.entries(files)) {
        const path="picocalc-os/worlds/chess/"+file+".typed";
        const data=execFileSync("git",["show",revision+":"+path],{encoding:"utf8",cwd:new URL("../..",import.meta.url).pathname});
        for(const name of names) {
            const start=data.indexOf("function "+name+"(");
            if(start<0) throw Error(name);
            let end=data.indexOf("{",start), depth=1;
            while(depth && ++end<data.length) {
                if(data[end]==="{") depth++;
                if(data[end]==="}") depth--;
            }
            if(depth) throw Error(name+" unterminated");
            parts.push(data.slice(start,end+1));
        }
    }
    return parts.join("\n\n")+"\n";
}
export function boards() {
    // 0x88 board, piece codes (color*8+kind), and two cached king squares.
    const starting=Array(133).fill(0), home=[4,2,3,5,6,3,2,4];
    for(let f=0;f<8;f++){starting[f]=home[f]+8;starting[16+f]=9;starting[96+f]=1;starting[112+f]=home[f];}
    starting[131]=116;starting[132]=4;
    const played=starting.slice();
    for(const [from,to] of [[100,68],[20,52],[118,85],[1,34],[117,82]]) {played[to]=played[from];played[from]=0;}
    played[128]=1;
    const late=Array(133).fill(0);
    for(const [sq,piece] of [[17,14],[66,6],[36,9],[102,1],[71,4]])late[sq]=piece;
    late[131]=66;late[132]=17;
    return {starting,played,late};
}
export function independentScore(b, advanced) {
    let score=0,phase=0;const bishops=[0,0];
    const center=(f,r)=>14-Math.abs(2*f-7)-Math.abs(2*r-7);
    const price=[0,100,320,335,500,950,0];
    for(let r=0;r<8;r++) for(let f=0;f<8;f++) {
        const p=b[16*r+f], side=p>>3,k=p&7;
        if(!p)continue;
        let q=price[k];
        if(advanced){const c=center(f,r);
            if(k===1) q+=7*(side?r-1:6-r)+c;
            if(k===2) q+=5*c;
            if(k===3){q+=3*c;bishops[side]++;}
            if(k===4) q+=c+12*Number(r===1+5*side);
            if(k===5) q+=c;
            if(k>1 && k<6) phase+=price[k];
        }
        score+=(1-2*side)*q;
    }
    if(advanced) {
        score+=24*(Number(bishops[0]>=2)-Number(bishops[1]>=2));
        const w=b[131], k=b[132];
        score+=(phase<2200?4:-3)*(center(w%16,w>>4)-center(k%16,k>>4));
    }
    return score*(1-2*b[128])|0;
}
