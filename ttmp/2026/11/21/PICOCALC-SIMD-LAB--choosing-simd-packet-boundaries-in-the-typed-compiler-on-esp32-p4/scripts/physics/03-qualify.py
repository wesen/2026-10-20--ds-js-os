#!/usr/bin/env python3
"""Assemble the physics arms; execute their actual instruction words against an independent oracle.

Unicorn handles RV32IM. The extension hook only accepts vendor-disassembled aligned loads,
stores and saturating 16-bit adds/subtracts. Board timings must come from the independent
firmware runner. Usage: python3 03-qualify.py /tmp/physics-build /path/to/riscv32-esp-elf
"""
import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
import re
import struct
import subprocess
import sys
from unicorn import Uc, UC_ARCH_RISCV, UC_MODE_RISCV32, UC_HOOK_CODE
from unicorn import riscv_const as reg

HERE = Path(__file__).resolve().parent
BASE, MEM, DATA, PAIRS, RET = 0x10000, 0x50000, 0x20000, 0x24000, 0x40000
SAT = lambda x: max(-32768, min(32767, x))
def encode(values):
    return struct.pack("<"+"h"*len(values), *values)
def signed(x):
    return (x+32768)%65536-32768
def seed(i):
    return signed(i*17011+55777)
def integrate(aos):
    out=aos.copy()
    for i in range(0,len(out),2):
        out[i]=SAT(out[i]+out[i+1])
    return out
def layout(aos,planar):
    return aos[::2]+aos[1::2] if planar else aos.copy()
def solve(vs,pairs):
    result=vs.copy()
    for a,b in pairs:
        A,B=result[a],result[b]
        delta=(B-A)//2
        result[a],result[b]=SAT(A+delta),SAT(B-delta)
    return result
def colors(pairs):
    batches=[]; used=[]
    for a,b in pairs:
        assert a!=b
        for i,c in enumerate(used):
            if a not in c and b not in c: break
        else:
            i=len(used); used.append(set()); batches.append([])
        used[i].update((a,b)); batches[i].append((a,b))
    assert sorted(p for group in batches for p in group)==sorted(pairs)
    for group in batches: assert len({s for p in group for s in p}) == 2*len(group)
    return batches

class Machine:
    def __init__(self,name,image,entries,instructions):
        self.name,self.image,self.entries,self.instructions=name,image,entries,instructions
        self.sha=sha256(image).hexdigest()

    def run(self,name,args,writes,readback,counts):
        uc=Uc(UC_ARCH_RISCV,UC_MODE_RISCV32)
        uc.mem_map(BASE,MEM); uc.mem_write(BASE,self.image)
        for addr,data in writes:
            if data: uc.mem_write(addr,data)
        uc.reg_write(reg.UC_RISCV_REG_X1,RET); uc.reg_write(reg.UC_RISCV_REG_X2,0x5f000)
        for i,arg in enumerate(args): uc.reg_write(reg.UC_RISCV_REG_X10+i,arg)
        qs=[[0]*8 for _ in range(8)]
        def instruction(u,addr,size,_):
            pc=addr-BASE
            assert size==4 and pc in self.instructions,(pc,size)
            counts[pc]+=1
            m,args=self.instructions[pc]
            if not m.startswith("esp."): return
            r=lambda x: reg.UC_RISCV_REG_X0+int(x[1:])
            q=lambda x: int(x[1:])
            if m.startswith(("esp.vld.128.ip","esp.vst.128.ip")):
                ix=q(args[0]); base=r(args[1]); ptr=u.reg_read(base)
                assert ptr%16==0, (name,pc,m,ptr)
                if m.startswith("esp.vld"):
                    qs[ix]=list(struct.unpack("<8h",u.mem_read(ptr,16)))
                else:
                    u.mem_write(ptr,encode(qs[ix]))
                u.reg_write(base,ptr+int(args[2],0))
            elif m in ("esp.vadd.s16","esp.vsub.s16"):
                a,b=qs[q(args[1])],qs[q(args[2])]
                qs[q(args[0])]=[SAT(x+y if m=="esp.vadd.s16" else x-y) for x,y in zip(a,b)]
            else: raise ValueError(("unsupported PIE",m,args))
            u.reg_write(reg.UC_RISCV_REG_PC,addr+4)
        uc.hook_add(UC_HOOK_CODE,instruction)
        uc.emu_start(BASE+self.entries[name],RET,count=200000)
        assert uc.reg_read(reg.UC_RISCV_REG_PC)==RET and uc.reg_read(reg.UC_RISCV_REG_X2)==0x5f000, name
        addr,size=readback
        return bytes(uc.mem_read(addr,size)) if size else b""

def build(prefix,out):
    out.mkdir(exist_ok=True, parents=True)
    subprocess.run(["node",HERE/"02-build-typed.mjs",HERE/"physics.typed",out],check=True)
    machines={}
    for kind,source in [("native",HERE/"physics.S"),("typed",out/"physics-typed.S")]:
        obj=out/(kind+".o"); elf=out/(kind+".elf"); binary=out/(kind+".bin")
        subprocess.run([prefix+"-as","-march=rv32im_xesppie","-mabi=ilp32","-o",obj,source],check=True)
        subprocess.run([prefix+"-ld","--no-relax","-Ttext=0","-e","0","-o",elf,obj],check=True)
        subprocess.run([prefix+"-objcopy","-O","binary","--only-section=.text",elf,binary],check=True)
        listing=subprocess.check_output([prefix+"-objdump","-d","-j",".text","-M","numeric,no-aliases",elf],text=True)
        (out/(kind+".dis")).write_text(listing)
        word=re.compile(r"^\s*([0-9a-f]+):\s+[0-9a-f]{8}\s+(\S+)\s*(.*?)\s*$")
        entries={}; ins={}
        for line in listing.splitlines():
            m=word.match(line)
            if m:ins[int(m[1],16)]=(m[2],m[3].split(","))
            sym=re.match(r"^([0-9a-f]+) <(\w+)>:$",line)
            if sym:entries[sym[2]]=int(sym[1],16)
        machines[kind]=Machine(kind,binary.read_bytes(),entries,ins)
    return machines
def counts_record(machine,workload,name,counts):
    ops=Counter()
    for pc,n in counts.items():
        op=machine.instructions[pc][0]
        if op.startswith("esp."):ops[op]+=n
    return {"kernel":name,"imageSHA":machine.sha,"workload":workload,"steps":sum(counts.values()),"pieExecuted":dict(sorted(ops.items())),"counts":[{"pc":a,"executions":b} for a,b in sorted(counts.items())]}
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("out",type=Path);parser.add_argument("prefix")
    a=parser.parse_args(); native,typed=(m for m in build(a.prefix,a.out).values())
    summaries=[];trace=[]; cases=0
    for n in (0,1,2,7,8,9,15,16,17,31,64,127,128):
      for off in (0,2):
        data=DATA+off
        canonical=[seed(i) for i in range(2*n)]
        for i,(x,v) in enumerate([(-32768,-32768),(32767,32767),(-32768,32767),(32767,-32768)]):
            if i<n:canonical[2*i:2*i+2]=[x,v]
        for planar,label in [(False,"aos"),(True,"soa")]:
            initial=encode(layout(canonical,planar)); wanted=encode(layout(integrate(canonical),planar))
            typedName="physics_typed_"+("particleSoA" if planar else "particleAoS")
            for machine,name,isTyped in [(native,"particle_"+label+"_scalar",False),(native,"particle_"+label+"_pie",False),(typed,typedName,True)]:
                cnt=Counter(); result=machine.run(name,[data-4 if isTyped else data,n],[(data-4,struct.pack("<I",2*n)+initial+b"\xa5"*16)],(data,len(initial)+16),cnt)
                assert result==wanted+b"\xa5"*16,(n,off,name,result[:24],wanted[:24]); cases+=1
                if n in (7,8,64,127,128) and off==0:
                    tr=counts_record(machine,"particle-n"+str(n),name,cnt);trace.append(tr);summaries.append({k:v for k,v in tr.items() if k!="counts"})
    contacts=[]
    sets={"chain16":[(i,i+1) for i in range(16)],"star16":[(0,i+1) for i in range(16)],"disjoint16":[(2*i,2*i+1) for i in range(16)],"mesh128":[((11*i)%128,(11*i+1+i%5)%128) for i in range(128)]}
    for fixture,pairs in sets.items():
        n=max(max(p) for p in pairs)+1
        vals=[seed(i) for i in range(n)]; vals[:4]=[-32768,32767,32767,-32768]
        grouped=colors(pairs)
        original=solve(vals,pairs); scheduled=solve(vals,[p for group in grouped for p in group])
        for machine,name,batches,want,label in [(native,"contact_scalar",[pairs],original,"original-scalar"),(typed,"physics_typed_contacts",[pairs],original,"original-typed"),(native,"contact_scalar",grouped,scheduled,"scheduled-scalar"),(native,"contact_pie",grouped,scheduled,"scheduled-pie"),(typed,"physics_typed_contacts",grouped,scheduled,"scheduled-typed")]:
            curr=encode(vals);counts=Counter()
            for batch in batches:
                ptrTyped=machine is typed; pairsBytes=encode([i for p in batch for i in p])
                args=[DATA-4 if ptrTyped else DATA,PAIRS-4 if ptrTyped else PAIRS,len(batch)]
                curr=machine.run(name,args,[(DATA-4,struct.pack("<I",n)+curr),(PAIRS-4,struct.pack("<I",2*len(batch))+pairsBytes)],(DATA,len(curr)),counts)
            assert curr==encode(want),(fixture,label);cases+=1
            tr=counts_record(machine,fixture+":"+label,name,counts);trace.append(tr);summaries.append({k:v for k,v in tr.items() if k!="counts"})
        contacts.append({"fixture":fixture,"bodies":n,"contacts":len(pairs),"batchSizes":[len(g) for g in grouped],"originalVsScheduledDifferences":sum(a!=b for a,b in zip(original,scheduled))})
    (a.out/"host-summary.json").write_text(json.dumps({"unit":"executed RV32 instructions, each vendor instruction counts once","cases":cases,"images":{m.name:m.sha for m in (typed,native)},"workloads":summaries,"order":contacts},indent=2)+"\n")
    (a.out/"pc-traces.json").write_text(json.dumps(trace,separators=(",",":"))+"\n")
    print("physics host qualification",cases,"comparisons;",len(trace),"complete PC traces")
if __name__=="__main__":main()
