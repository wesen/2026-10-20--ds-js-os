"""Read the actual reactor slot and every ELF32 RELA write target, independent of code generation."""
import sys,struct,json
from pathlib import Path
stage,out=map(Path,sys.argv[1:]);rows={}
for app in ('editor','chess'):
    data=(stage/(app+'.elf')).read_bytes()
    def u32(pos):return struct.unpack_from('<I',data,pos)[0]
    def u16(pos):return struct.unpack_from('<H',data,pos)[0]
    magic=struct.pack('<III',0x4147454e,0x44415256,0x3332534c)
    slot=data.index(magic);assert data.count(magic)==1
    segments=[struct.unpack_from('<8I',data,u32(28)+i*u16(42)) for i in range(u16(44))]
    seg,=[s for s in segments if s[0]==1 and s[6]&1 and s[1]<=slot<s[1]+s[4]]
    start=slot+seg[2]-seg[1];end=start+u32(slot+12)
    patches=[]
    for i in range(u16(48)):
        sh=struct.unpack_from('<10I',data,u32(32)+i*u16(46));kind,offset,size,entry=sh[1],sh[4],sh[5],sh[9]
        if kind not in (4,9):continue
        assert entry==(12 if kind==4 else 8)
        for at in range(offset,offset+size,entry):
            address,info=struct.unpack_from('<II',data,at)
            assert address+4<=start or address>=end
            patches.append({'address':address,'type':info&255})
    assert len(patches)>0
    rows[app]={'slotVirtualStart':start,'slotVirtualEnd':end,'dynamicRelocations':patches,'overlap':False}
out.write_text(json.dumps(rows,indent=2)+'\n')
