#include "damage.h"
#include <assert.h>
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
kernel_t K;
profile_t PROFILE;
enum { N=51, WIDTH=320, HEIGHT=320, PIXELS=WIDTH*HEIGHT, BODY=WIDTH*PAINTER_HEIGHT };
typedef struct {uint16_t *words;size_t count;char hints[MOBILE_PAINTER_MAX_TEXT+1];} list;
static uint16_t oracle[N][BODY];
static list frames[N];

static void check(const dmabuf_t *fb,int frame) {
    assert(memcmp(fb->back+WIDTH*PAINTER_TOP,oracle[frame],BODY*2)==0);
    for(int i=0;i<WIDTH*PAINTER_TOP;i++) assert(fb->back[i]==0xa9a9);
    for(int i=WIDTH*(PAINTER_TOP+PAINTER_HEIGHT);i<PIXELS;i++) assert(fb->back[i]==0xa9a9);
}
static damage_stats step(dmabuf_t *fb,int old,int next,bool force) {
    damage_stats stats;
    damage_draw(fb,frames[old].words,frames[old].count,frames[next].words,frames[next].count,force,&stats);
    check(fb,next);
    return stats;
}
static void synthetic(dmabuf_t *fb) {
    enum { degenerate=8, old_count=6+4*degenerate+3*8+2 };
    uint16_t old[old_count]={1,0,0,320,280,0xf65a};
    for (int i=0;i<4;i++) old[6+8*i]=5;
    const uint16_t tail[]={5,19,40,21,40,21,43,0x31d2,
                           3,20,40,0,0xbd33,6,1,'A',
                           3,25,40,0,0xaa22,6,1,'B',
                           4,0};
    memcpy(old+6+32,tail,sizeof(tail));
    uint16_t next[old_count];
    memcpy(next,old,sizeof(old));
    next[6+32+7]=0x0031;
    char hints[MOBILE_PAINTER_MAX_TEXT+1];
    assert(painter_commands_valid(old,old_count,hints));
    assert(painter_commands_valid(next,old_count,hints));
    dmabuf_t reference=*fb;
    reference.back=malloc(fb->bytes);
    assert(reference.back);
    memcpy(reference.back,fb->back,fb->bytes);
    painter_commands_draw(fb,old,old_count);
    painter_commands_draw(&reference,next,old_count);
    damage_stats stats;
    damage_draw(fb,old,old_count,next,old_count,false,&stats);
    assert(stats.mode==DAMAGE_PARTIAL && stats.body.x1==31 && stats.body.y1==52);
    assert(memcmp(fb->back,reference.back,fb->bytes)==0);
    next[5]=0x0031;  /* Palette change forces a complete body repaint. */
    painter_commands_draw(&reference,next,old_count);
    damage_draw(fb,old,old_count,next,old_count,false,&stats);
    assert(stats.mode==DAMAGE_FULL && memcmp(fb->back,reference.back,fb->bytes)==0);
    const uint16_t rects[]={1,0,0,320,280,0x1cfc,2,120,88,27,29,0xfa8b,4,0};
    assert(painter_commands_valid(rects,sizeof(rects)/2,hints));
    painter_commands_draw(&reference,rects,sizeof(rects)/2);
    damage_draw(fb,next,old_count,rects,sizeof(rects)/2,false,&stats);
    assert(stats.mode==DAMAGE_FULL && memcmp(fb->back,reference.back,fb->bytes)==0);
    damage_draw(fb,NULL,0,old,old_count,false,&stats);
    painter_commands_draw(&reference,old,old_count);
    assert(stats.mode==DAMAGE_FULL && memcmp(fb->back,reference.back,fb->bytes)==0);
    free(reference.back);
}
int main(int argc,char **argv) {
    assert(argc==3);
    FILE *corpus=fopen(argv[1],"rb"), *references=fopen(argv[2],"rb");
    assert(corpus && references);
    assert(fread(oracle,sizeof(oracle),1,references)==1 && fgetc(references)==EOF);
    fclose(references);
    dmabuf_t fb={.w=WIDTH,.h=HEIGHT,.bytes=PIXELS*2};
    fb.back=malloc(fb.bytes);assert(fb.back);
    memset(fb.back,0xa9,fb.bytes);
    for(int i=0;i<N;i++){
        uint16_t n;
        assert(fread(&n,2,1,corpus)==1);
        frames[i].count=n;frames[i].words=malloc(n*2);assert(frames[i].words);
        assert(fread(frames[i].words,2,n,corpus)==n);
        assert(painter_commands_valid(frames[i].words,n,frames[i].hints));
        painter_commands_draw(&fb,frames[i].words,n);
        check(&fb,i);
    }
    assert(fgetc(corpus)==EOF);
    fclose(corpus);
    // Real caller rejects malformed candidate data before changing the retained display list.
    uint16_t invalid[]={5,0,0,321,1,2,2,0xffff,4,0};
    char hints[MOBILE_PAINTER_MAX_TEXT+1];
    assert(!painter_commands_valid(invalid,sizeof(invalid)/2,hints));
    assert(!painter_commands_valid(frames[0].words,frames[0].count-1,hints));
    // Repaint from arbitrary pixels on lost buffer ownership, even if the commands match.
    memset(fb.back+WIDTH*PAINTER_TOP,0x23,BODY*2);
    assert(step(&fb,0,0,true).mode==DAMAGE_FULL);
    for(int i=1;i<N;i++) step(&fb,i-1,i,false);
    puts("old,new,mode,x0,y0,x1,y1,records,different,ideal_x0,ideal_y0,ideal_x1,ideal_y1,hints_changed,dirty");
    for(int a=0;a<N;a++) for(int b=0;b<N;b++){
        memcpy(fb.back+WIDTH*PAINTER_TOP,oracle[a],BODY*2);
        fb.dirty=0;
        damage_stats st=step(&fb,a,b,false);
        int xmin=WIDTH,ymin=PAINTER_HEIGHT,xmax=-1,ymax=-1,count=0;
        for(int y=0;y<PAINTER_HEIGHT;y++) for(int x=0;x<WIDTH;x++){
            size_t pos=(size_t)y*WIDTH+x;
            if(oracle[a][pos]==oracle[b][pos]) continue;
            assert(x>=st.body.x0 && x<st.body.x1 && y>=st.body.y0 && y<st.body.y1);
            assert(fb.dirty & (UINT64_C(1)<<((PAINTER_TOP+y)/16)));
            if(x<xmin)xmin=x;
            if(y<ymin)ymin=y;
            if(x>xmax)xmax=x;
            if(y>ymax)ymax=y;
            count++;
        }
        if(!count){xmin=0;ymin=0;}
        printf("%d,%d,%d,%d,%d,%d,%d,%u,%d,%d,%d,%d,%d,%d,%" PRIu64 "\n",
               a,b,st.mode,st.body.x0,st.body.y0,st.body.x1,st.body.y1,st.replayed,count,
               xmin,ymin,xmax+1,ymax+1,strcmp(frames[a].hints,frames[b].hints)!=0,fb.dirty);
    }
    synthetic(&fb);
    for(int i=0;i<N;i++) free(frames[i].words);
    free(fb.back);
}
