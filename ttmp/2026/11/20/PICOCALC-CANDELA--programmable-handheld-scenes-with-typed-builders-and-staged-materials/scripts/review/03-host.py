"""Test malformed graphs and ray agreement with portable production C."""
import ctypes as c
import json, subprocess, tempfile, zlib
from pathlib import Path
from oracle import Graph, BadScene, fixture, image

here=Path(__file__).resolve()
repo=next(p for p in here.parents if (p/'.git').is_dir())
nucleus=repo/'picocalc-os/nucleus'
u16=c.c_uint16
class Wire(c.Structure):
    _fields_=[('capacity',c.c_uint32),('cells',u16*303)]

def controlled(bytes_, changes):
    cells=bytes_.copy()
    for i,v in changes:cells[i]=v
    return cells

def test(lib):
    base=fixture('tile',64);rows=[];frames=[]
    callback=c.CFUNCTYPE(c.c_int32,c.POINTER(Wire),c.c_void_p,c.c_int32,c.c_int32,c.c_int32)
    class Shader(c.Structure):_fields_=[('pixel',callback),('row',c.c_void_p)]
    observed=None
    @callback
    def rgb(wire,workspace,mat,x,y):
        r,g,b=observed.rgb(mat,x,y)
        return r*65536+g*256+b
    shader=Shader(rgb,None)
    lib.candela_validate.argtypes=[c.POINTER(Wire)]
    lib.candela_validate.restype=c.c_bool
    lib.candela_render.argtypes=[c.POINTER(u16),c.c_size_t,c.POINTER(Wire),c.c_int,c.c_int,c.c_int,c.c_int,c.POINTER(Shader),c.c_void_p]
    lib.candela_render.restype=c.c_bool
    cases={'valid':([],303,True),'empty-geometry':([(4,0)],303,True),'extended-capacity':([],320,True),
      'short-capacity':([],302,False),'wrong-magic':([(0,0)],303,False),'wrong-version':([(1,2)],303,False),
      'reserved-header':([(7,1)],303,False),'node-count':([(2,65)],303,False),'material-count':([(3,17)],303,False),
      'sphere-count':([(4,4)],303,False),'param-count':([(5,9)],303,False),'no-material':([(3,0)],303,False),
      'floor-handle':([(6,65535)],303,False),'material-handle':([(264,64)],303,False),'material-type':([(264,1)],303,False),
      'shape-material':([(284,16)],303,False),'sphere-x':([(280,31)],303,False),'sphere-y':([(281,128)],303,False),
      'sphere-z-near':([(282,26)],303,False),'sphere-z-far':([(282,130)],303,False),'zero-radius':([(283,0)],303,False),
      'large-radius':([(283,33)],303,False),'parameter-value':([(295,257)],303,False),'negative-as-uint':([(295,65535)],303,False),
      'unknown-op':([(8,65535)],303,False),'color-value':([(9,256)],303,False),'param-slot':([(13,1)],303,False),
      'param-reserved':([(14,1)],303,False),'position-reserved':([(25,1)],303,False),'scale-reserved':([(31,1)],303,False),
      'scale-wrong-kind':([(29,0)],303,False),'self-edge':([(29,5)],303,False),'forward-edge':([(29,6)],303,False),
      'fract-reserved':([(34,1)],303,False),'mask-reserved':([(39,1)],303,False),
      'mixed-weight-kind':([(43,0)],303,False),'checker-zero-divisor':([(40,4),(43,0)],303,False)}
    maxed=base.copy();maxed[2:6]=[64,16,3,8]
    for i in range(base[2],64):maxed[8+i*4:12+i*4]=[1,1,2,3]
    maxed[290:295]=base[280:285]
    cases['at-all-limits']=([(i,b) for i,b in enumerate(maxed) if b!=base[i]],303,True)
    for label,(changes,cap,want) in cases.items():
        cells=controlled(base,changes);wire=Wire(cap,(u16*303)(*cells))
        try:
            if cap<303:raise BadScene('capacity')
            Graph(cells)
            predicted=True
        except BadScene:predicted=False
        actual=lib.candela_validate(c.byref(wire))
        assert actual==predicted==want,(label,actual,predicted,want)
        if not want:
            pixels=(u16*25600)(*[0xa55a]*25600)
            assert not lib.candela_render(pixels,160,c.byref(wire),31,25,0,0,c.byref(shader),None)
            assert all(x==0xa55a for x in pixels)
        rows.append({'case':label,'accepted':actual})
    for name,weight,lamp in [('shared',0,(31,25)),('shared',128,(31,25)),('shared',256,(31,25)),
                              ('tile',64,(31,25)),('tile',73,(31,25)),('tile',128,(31,25)),('tile',80,(31,17))]:
        cells=fixture(name,weight);wire=Wire(303,(u16*303)(*cells));observed=Graph(cells)
        output=(u16*(163*160))(*[0xa55a]*(163*160))
        assert lib.candela_render(output,163,c.byref(wire),*lamp,0,0,c.byref(shader),None)
        native=b''.join(bytes(output)[326*y:326*y+320] for y in range(160))
        assert all(output[y*163+x]==0xa55a for y in range(160) for x in range(160,163))
        oracle=image(observed,lamp);assert native==oracle,(name,weight,[(i,a,b) for i,(a,b) in enumerate(zip(native,oracle)) if a!=b][:5])
        frames.append(dict(scene=name,weight=weight,light=lamp,pixels=25600,crc=f'{zlib.crc32(oracle):08x}'))
    return dict(validation=rows,frames=frames)

with tempfile.TemporaryDirectory() as temp:
    so=Path(temp)/'scene.so'
    subprocess.run(['cc','-O2','-std=c11','-fPIC','-shared',str(nucleus/'candela_scene.c'),str(nucleus/'raytrace_demo.c'),'-o',str(so)],check=True)
    print(json.dumps(test(c.CDLL(str(so))),indent=2))
