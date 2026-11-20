#include "damage.h"
#include <string.h>

static int smaller(int a, int b) { return a < b ? a : b; }
static int larger(int a, int b) { return a > b ? a : b; }

static bool empty(damage_box b) { return b.x0 >= b.x1 || b.y0 >= b.y1; }

static bool intersects(damage_box a, damage_box b) {
    return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

static damage_box unite(damage_box a, damage_box b) {
    if (empty(a)) return b;
    if (empty(b)) return a;
    return (damage_box){smaller(a.x0,b.x0),smaller(a.y0,b.y0),larger(a.x1,b.x1),larger(a.y1,b.y1)};
}

static damage_box bounds(const uint16_t *r) {
    if (r[0] == MOBILE_PAINTER_TEXT)
        return (damage_box){r[1],r[2],r[1]+6,r[2]+12};
    return (damage_box){smaller(r[1],smaller(r[3],r[5])),smaller(r[2],smaller(r[4],r[6])),
                        larger(r[1],larger(r[3],r[5])),larger(r[2],larger(r[4],r[6]))};
}

// The frozen painter emits a body-wide fill, eight-word triangular faces and
// single glyphs, followed by hints. Other already-valid programs use the full renderer.
static bool body(const uint16_t *p, size_t count, size_t *records) {
    if (!p || count < 8 || p[0]!=MOBILE_PAINTER_FILL || p[1] || p[2] ||
        p[3]!=PAINTER_WIDTH || p[4]!=PAINTER_HEIGHT) return false;
    size_t i=6;
    while (i<count && p[i]!=MOBILE_PAINTER_HINTS) {
        if (count-i < 8) return false;
        if (p[i]!=5 && !(p[i]==MOBILE_PAINTER_TEXT && p[i+3]==0 &&
            p[i+6]==1 && p[i+1]+6<=PAINTER_WIDTH && p[i+2]+12<=PAINTER_HEIGHT)) return false;
        i+=8;
    }
    *records=(i-6)/8;
    return count-i>=2 && p[i]==MOBILE_PAINTER_HINTS && (size_t)p[i+1]+2 == count-i;
}

static bool same_record(const uint16_t *a,const uint16_t *b) {
    return memcmp(a,b,8*sizeof(*a))==0;
}

// Strip an equal prefix and suffix, then compare aligned records inside the
// changed segment. An inserted/deleted command contributes its own footprint.
static damage_box changes(const uint16_t *a,size_t na,const uint16_t *b,size_t nb) {
    while(na && nb && same_record(a,b)){a+=8;b+=8;--na;--nb;}
    while(na && nb && same_record(a+8*(na-1),b+8*(nb-1))){--na;--nb;}
    damage_box box={0};
    size_t i=0;
    for(;i<na && i<nb;i++){
        if (!same_record(a+8*i,b+8*i)){
            box=unite(box,bounds(a+8*i));
            box=unite(box,bounds(b+8*i));
        }
    }
    for(;i<na;i++) box=unite(box,bounds(a+8*i));
    for(;i<nb;i++) box=unite(box,bounds(b+8*i));
    return box;
}

// Preserve the ordinary anti-aliased font routine. If a glyph crosses a
// boundary, enlarge the damage rectangle until every touched glyph fits.
static damage_box include_glyphs(damage_box box,const uint16_t *p,size_t n) {
    if(empty(box)) return box;
    bool expanded;
    do {
        expanded=false;
        for(size_t i=0;i<n;i++) {
            const uint16_t *r=p+8*i;
            if(r[0]!=MOBILE_PAINTER_TEXT) continue;
            damage_box g=bounds(r);
            if(intersects(g,box) && (g.x0<box.x0 || g.y0<box.y0 || g.x1>box.x1 || g.y1>box.y1)) {
                box=unite(box,g);
                expanded=true;
            }
        }
    } while(expanded);
    return box;
}

static int edge_x(int ax,int ay,int bx,int by,int y) {
    int dy=by-ay, den=2*dy;
    int num=2*ax*dy+(2*y+1-2*ay)*(bx-ax)-dy;
    return (num+den-1)/den;
}

static void triangle(dmabuf_t *fb,const uint16_t *p,damage_box box,damage_box face) {
    for(int y=larger(face.y0,box.y0);y<smaller(face.y1,box.y1);y++){
        int x[2],found=0;
        for(int k=0;k<3;k++){
            int j=(k+1)%3, a=p[2*k+1] < p[2*j+1] ? k:j, b=k+j-a;
            if(p[2*a+1]<=y && y<p[2*b+1])
                x[found++]=edge_x(p[2*a],p[2*a+1],p[2*b],p[2*b+1],y);
        }
        if(found==2){
            int left=larger(smaller(x[0],x[1]),box.x0);
            int right=smaller(larger(x[0],x[1]),box.x1);
            if(left<right) gfx_fill(fb,left,PAINTER_TOP+y,right-left,1,p[6]);
        }
    }
}

void damage_draw(dmabuf_t *fb,const uint16_t *old,size_t old_n,const uint16_t *next,size_t next_n,
                 bool force_full,damage_stats *stats) {
    size_t na=0,nb=0;
    damage_box screen={0,0,PAINTER_WIDTH,PAINTER_HEIGHT};
    *stats=(damage_stats){0};
    if(force_full || !body(old,old_n,&na) || !body(next,next_n,&nb) || old[5]!=next[5] ||
       na<4 || nb<4 || memcmp(old+6,next+6,4*8*sizeof(*old))!=0) {
        stats->mode=DAMAGE_FULL;
        stats->body=screen;
        painter_commands_draw(fb,next,next_n);
        return;
    }
    damage_box box=changes(old+6,na,next+6,nb);
    if(empty(box)) return;
    box=include_glyphs(box,next+6,nb);
    stats->mode=DAMAGE_PARTIAL;
    stats->body=box;
    gfx_fill(fb,box.x0,PAINTER_TOP+box.y0,box.x1-box.x0,box.y1-box.y0,next[5]);
    for(size_t i=0;i<nb;i++){
        const uint16_t *r=next+6+8*i;
        damage_box face=bounds(r);
        if(empty(face) || !intersects(face,box)) continue;
        ++stats->replayed;
        if(r[0]==5) triangle(fb,r+1,box,face);
        else{
            const char text[2]={(char)r[7],0};
            gfx_text(fb,r[1],PAINTER_TOP+r[2],text,0,r[4],r[5]);
        }
    }
}
