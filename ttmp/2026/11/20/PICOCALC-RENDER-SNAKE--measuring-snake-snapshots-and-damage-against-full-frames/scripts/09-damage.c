// Replay serialized full paint primitives and an independent semantic partial painter.
// Run the actual production fill, rect, text, commit, and invalidate functions.
#include "nucleus.h"
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
kernel_t K;
profile_t PROFILE;
enum { WIDTH=320, PIXELS=320*320, CELLS=396, LIMIT=395, MAXOPS=450 };
typedef struct { int alive,automatic,score,best,food,n,body[LIMIT]; } view_t;
typedef struct { char type; int x,y,w,h,font; pixel_t color; char text[512]; } op_t;
typedef struct {dmabuf_t fb; pixel_t *panel;} surface_t;
typedef struct {int count, area;} transfer_t;
static uint64_t ns(void) {
  struct timespec t; clock_gettime(CLOCK_MONOTONIC,&t);
  return (uint64_t)t.tv_sec*1000000000+t.tv_nsec;
}
static surface_t surface(void) {
  surface_t s={.fb={.w=WIDTH,.h=WIDTH,.bytes=PIXELS*sizeof(pixel_t)}};
  s.fb.back=calloc(PIXELS,sizeof(pixel_t)); s.fb.front=calloc(PIXELS,sizeof(pixel_t));
  s.panel=calloc(PIXELS,sizeof(pixel_t)); if(!s.fb.back||!s.fb.front||!s.panel) exit(2);
  gfx_invalidate(&s.fb); return s;
}
static void full(dmabuf_t *b, const op_t *ops, int n) {
  for(int i=0;i<n;i++){
    const op_t *o=&ops[i];
    switch(o->type) {
      case 'F':gfx_fill(b,o->x,o->y,o->w,o->h,o->color);break;
      case 'R':gfx_rect(b,o->x,o->y,o->w,o->h,o->color);break;
      case 'L':gfx_line(b,o->x,o->y,o->w,o->h,o->color);break;
      case 'T':gfx_text(b,o->x,o->y,o->text,o->font,o->color,o->w);break;
      default:exit(3);
    }
  }
}
static const pixel_t paper=0xffff;
static pixel_t ink, accent;
static int incremental(dmabuf_t *fb,const view_t *v,uint8_t old[CELLS]) {
  uint8_t now[CELLS]={0};
  for(int i=0;i<v->n;i++) now[v->body[i]]=i?1:2;
  now[v->food]=3;
  int writes=0;
  for(int c=0;c<CELLS;c++) if(now[c]!=old[c]) {
    int x=17+13*(c%22)+1,y=52+13*(c/22)+1;
    pixel_t color=now[c]==1?ink:now[c]==2?accent:paper;
    gfx_fill(fb,x,y,11,11,color); writes+=121;
    if(now[c]==3) {
      gfx_fill(fb,x+2,y+2,7,7,accent); gfx_rect(fb,x,y,11,11,accent); writes+=49+44;
    }
  }
  memcpy(old,now,CELLS); return writes;
}
static void remember(const view_t *v,uint8_t old[CELLS]){
  memset(old,0,CELLS);
  for(int i=0;i<v->n;i++) old[v->body[i]]=i?1:2;
  old[v->food]=3;
}
static transfer_t commit(surface_t *s,int skip) {
  int rects[64*4]; transfer_t t={.count=gfx_commit(&s->fb,rects,64)};
  for(int i=0;i<t.count;i++){
    int *r=rects+4*i; t.area+=r[2]*r[3];
    if(!skip) for(int y=r[1];y<r[1]+r[3];y++) {
      int off=WIDTH*y+r[0];
      memcpy(s->panel+off,s->fb.front+off,r[2]*sizeof(pixel_t));
    }
  }
  if(skip) gfx_invalidate(&s->fb);
  return t;
}
static void readop(op_t *o,FILE *in) {
  char line[2048],c[12],f[8],hex[1024]; if(!fgets(line,sizeof line,in))exit(4);
  o->type=line[0];
  if(o->type=='T'){
    if(sscanf(line+1,"%d %d %d %7s %11s %1023s",&o->x,&o->y,&o->w,f,c,hex)!=6)exit(5);
    o->font=gfx_font_index(f);
    size_t len=strlen(hex); if(len%2||len>=2*sizeof o->text)exit(6);
    for(size_t i=0;i<len;i+=2){unsigned val;if(sscanf(hex+i,"%2x",&val)!=1)exit(7);o->text[i/2]=(char)val;}
    o->text[len/2]=0;
  } else if(sscanf(line+1,"%d %d %d %d %11s",&o->x,&o->y,&o->w,&o->h,c)!=5)exit(8);
  o->color=gfx_color(c);
}
static int mismatches(const pixel_t *a,const pixel_t *b) {
  int changed=0;for(int i=0;i<PIXELS;i++) changed+=a[i]!=b[i];return changed;
}
int main(int argc,char **argv) {
  if(argc<4){fprintf(stderr,"damage INPUT ORACLE_DIRECTORY SKIP_INDEX [firstArm [omitStart omitCount]]\n");return 1;}
  FILE *in=fopen(argv[1],"r"); if(!in)return 2;
  int skip=atoi(argv[3]),phase=argc>4?atoi(argv[4]):0;
  int omitStart=argc>5?atoi(argv[5]):-1,omitCount=argc>6?atoi(argv[6]):0,havePrevious=0;
  char id[80],path[1024],line[512]; op_t ops[MAXOPS]; view_t prev={0};
  surface_t control=surface(),partial=surface(); uint8_t occupancy[CELLS]={0};
  pixel_t oracle[PIXELS],last[PIXELS]={0};
  ink=gfx_color("#1d1c1a");accent=gfx_color("#d42a2f");
  puts("index,id,mode,commands,changed,incrementalWrites,rects,transferPixels,skipped,stalePanelPixels,fullPaintNs,damagePaintNs,fullCommitNs,damageCommitNs");
  int index,count; view_t v;
  while(fgets(line,sizeof line,in)){
    if(sscanf(line,"G %d %79s %d %d %d %d %d %d %d",&index,id,&v.alive,&v.automatic,&v.score,&v.best,&v.food,&v.n,&count)!=9)return 9;
    if(v.n<4||v.n>LIMIT||count<1||count>MAXOPS||v.food<0||v.food>=CELLS)return 10;
    for(int i=0;i<v.n;i++)if(fscanf(in,"%d",v.body+i)!=1||v.body[i]<0||v.body[i]>=CELLS)return 11;
    if(fgetc(in)!='\n')return 12;
    for(int i=0;i<count;i++)readop(ops+i,in);
    if(index>=omitStart && index<omitStart+omitCount)continue;
    const int fallback=!havePrevious||!v.alive||!prev.alive||v.automatic!=prev.automatic||v.score!=prev.score||v.best!=prev.best||v.n!=prev.n;
    int writes=-1; uint64_t paintNs[2],commitNs[2];transfer_t transfer[2];
    for(int j=0;j<2;j++){
      int lane=(j+index+phase)&1; surface_t *s=lane?&partial:&control;
      uint64_t start=ns();
      if(lane && !fallback) writes=incremental(&s->fb,&v,occupancy);
      else {full(&s->fb,ops,count);if(lane)remember(&v,occupancy);}
      uint64_t painted=ns();
      transfer[lane]=commit(s,index==skip); uint64_t finished=ns();
      paintNs[lane]=painted-start;commitNs[lane]=finished-painted;
    }
    if(transfer[0].area!=transfer[1].area||transfer[0].count!=transfer[1].count)return 13;
    snprintf(path,sizeof path,"%s/%05d.rgb565",argv[2],index);
    FILE *file=fopen(path,"rb");if(!file||fread(oracle,sizeof(pixel_t),PIXELS,file)!=PIXELS)return 14;fclose(file);
    int stale=mismatches(partial.panel,oracle);
    if(mismatches(control.fb.back,oracle)||mismatches(partial.fb.back,oracle)||
       mismatches(control.panel,partial.panel)||(index!=skip && stale)||(index==skip && !stale)){
      fprintf(stderr,"pixel mismatch index=%d id=%s stale=%d\n",index,id,stale);return 15;
    }
    printf("%d,%s,%s,%d,%d,%d,%d,%d,%d,%d,%" PRIu64 ",%" PRIu64 ",%" PRIu64 ",%" PRIu64 "\n",
           index,id,fallback?"full":"partial",count,havePrevious?mismatches(oracle,last):-1,writes,
           transfer[0].count,transfer[0].area,index==skip,stale,paintNs[0],paintNs[1],commitNs[0],commitNs[1]);
    memcpy(last,oracle,sizeof last);prev=v;havePrevious=1;
  }
  return ferror(in)?16:0;
}
