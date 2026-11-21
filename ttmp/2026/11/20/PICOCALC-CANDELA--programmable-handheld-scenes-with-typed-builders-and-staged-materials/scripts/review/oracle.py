"""Independent wire-format parser, expression interpreter, and RGB565 ray oracle."""
import math
import struct


CELLS=303
SHAPES={1:('rgb',()),2:('scalar',()),3:('rgb',('rgb','rgb','scalar')),4:('rgb',('rgb','rgb')),5:('vec',()),6:('vec',('vec','scalar')),7:('vec',('vec',)),8:('scalar',('vec',))}

class BadScene(ValueError):
    pass

def require(test, message):
    if not test:raise BadScene(message)

class Graph:
    def __init__(self,cells):
        require(len(cells)>=CELLS and all(0<=v<=65535 for v in cells),'length or cell')
        magic,version,n,m,s,p,floor,reserved=cells[:8]
        require((magic,version,reserved)==(0x4341,1,0),'header')
        require(n<=64 and 0<m<=16 and s<=3 and p<=8,'count')
        self.params=cells[295:295+p]
        require(all(0<=v<=256 for v in self.params),'parameter value')
        self.nodes=[];types=[]
        for i in range(n):
            op,*args=cells[8+4*i:12+4*i]
            require(op in SHAPES,'operator')
            kind,dependencies=SHAPES[op]
            for index,want in enumerate(dependencies):
                v=args[index];require(v<i and types[v]==want,'node dependency')
            if op==1:require(max(args)<=255,'color')
            if op==2:require(args[0]<p and args[1:]==[0,0],'parameter index or reserved')
            if op==5:require(args==[0,0,0],'position reserved')
            if op==6:require(args[2]==0,'scale reserved')
            if op in (7,8):require(args[1:]==[0,0],'unary reserved')
            if op==4:require(args[2]>0,'checker divisor')
            self.nodes.append((op,*args));types.append(kind)
        self.materials=cells[264:264+m]
        require(all(h<n and types[h]=='rgb' for h in self.materials),'material')
        require(floor<m,'floor material')
        self.floor=floor
        self.spheres=[]
        for i in range(s):
            x,y,z,r,mat=cells[280+5*i:285+5*i]
            require(32<=x<=127 and 32<=y<=127 and 1<=r<=32 and r<z<156-r and mat<m,'sphere')
            self.spheres.append((x,y,z,r,mat))

    def rgb(self,mat,x,y):
        def visit(i):
            op,a,b,c=self.nodes[i]
            if op==1:return (a,b,c)
            if op==2:return self.params[a]
            if op==3:
                weight=visit(c)
                return tuple((l*(256-weight)+r*weight)//256 for l,r in zip(visit(a),visit(b),strict=True))
            if op==4:return visit((a,b)[((x//c)+(y//c))%2])
            if op==5:return (x*256,y*256)
            if op==6:return tuple(t*visit(b)//256 for t in visit(a))
            if op==7:return tuple(t%256 for t in visit(a))
            if op==8:return 256*int(min(t%256 for t in visit(a))>=32)
            raise BadScene('unreachable opcode')
        return visit(self.materials[mat])

def fixture(name,weight):
    """Build only the contract meaning. Node allocation order differs from the real builder."""
    b=[0]*CELLS;b[:8]=[0x4341,1,0,0,2,1,0,0]
    def node(op,a=0,c=0,e=0):
        i=b[2];b[2]+=1;b[8+i*4:12+i*4]=[op,a,c,e];return i
    def mat(expr):
        i=b[3];b[3]+=1;b[264+i]=expr;return i
    blue=node(1,30,70,150);param=node(2,0)
    left=mat(blue)
    if name=='shared':
        low=node(1,48,61,72);high=node(1,72,93,109);floor=mat(node(4,low,high,12))
        gold=node(1,220,170,40);right=mat(node(3,blue,gold,param))
    else:
        low=node(1,35,46,70);high=node(1,105,145,187)
        mask=node(8,node(7,node(6,node(5),param)));floor=mat(node(3,low,high,mask));right=left
    b[6]=floor;b[280:290]=[68,61,56,26,left,100,65,105,32,right];b[295]=weight
    return b

def rgb565(channels,illumination):
    r,g,b=[v*illumination//255 for v in channels]
    return ((r>>3)<<11)|((g>>2)<<5)|(b>>3)

def image(graph,light=(31,25)):
    # Independent geometry; there is no shared production material, lighting or ray code.
    lx,ly=(math.trunc((v-80)*3/10) for v in light)
    norm2=lx*lx+ly*ly+1024;norm=math.isqrt(norm2)
    output=bytearray()
    for y in range(160):
        for x in range(160):
            nearest=None
            for i,(cx,cy,z,r,mat) in enumerate(graph.spheres):
                d=r*r-(x-cx)**2-(y-cy)**2
                if d>=0:
                    hit=(z-math.isqrt(d),i)
                    if nearest is None or hit<nearest:nearest=hit
            if nearest is None:
                mat=graph.floor
                shadow=False
                for cx,cy,z,r,_ in graph.spheres:
                    a,b,c=cx-x,cy-y,156-z
                    dot=a*lx+b*ly+32*c
                    if dot>0 and dot*dot >= (a*a+b*b+c*c-r*r)*norm2:shadow=True;break
                color=graph.rgb(mat,x,y)
                if shadow:color=tuple(v//3 for v in color)
                out=rgb565(color,255)
            else:
                depth,i=nearest;cx,cy,z,r,mat=graph.spheres[i]
                dot=(x-cx)*lx+(y-cy)*ly+32*(z-depth)
                scale=62+min(183,max(0,dot*183//(r*norm)))
                out=rgb565(graph.rgb(mat,x,y),scale)
            output+=struct.pack('<H',out)
    return bytes(output)
