"""Insert fixed duration counters in the isolated image, without logging payloads."""
from pathlib import Path
import sys
tree=Path(sys.argv[1])/'picocalc-os'
def change(p,needle,new):
    s=p.read_text()
    if new in s:return
    assert s.count(needle)==1,(p,needle)
    p.write_text(s.replace(needle,new))
k=tree/'nucleus/kernel.c'
change(k,'static void run_segment(world_t *W, bool is_settle) {',
'''extern void lab_timing(const char *,const char *,vtime_t,unsigned);
static void run_segment(world_t *W, bool is_settle) {''')
change(k,'      rc = eng_dispatch(W, m);','''      vtime_t dt=port_clock();
      rc = eng_dispatch(W, m);
      if(!strcmp(W->name,"compositor") || !strcmp(W->name,"chess") || !strcmp(W->name,"sysmon") || !strcmp(W->name,"snake"))
        lab_timing(W->name,W->turn_type,dt,0);''')
change(k,'      kernel_publish(W, "frames", post, NULL, 0);','''      kernel_publish(W, "frames", post, NULL, 0);
      lab_timing(W->name,"render+publish",t_render,strlen(post));''')
p=tree/'nucleus/gfx.c'
change(p,'  int n = 0;\n  for (int y0', '''  extern void lab_timing(const char *,const char *,vtime_t,unsigned);
  vtime_t begin=port_clock();
  int n = 0;
  for (int y0''')
change(p,'  charge((double)b->w * b->h * PROFILE.diff_ns_per_px);','''  lab_timing("graphics","commit",begin,n);
  charge((double)b->w * b->h * PROFILE.diff_ns_per_px);''')
p=tree/'port/esp32p4/main/bus_p4.c'
change(p,'    post(BUS_SPI2, &r, !err, err ? json : NULL, t0, bytes);','''    extern void lab_timing(const char *,const char *,vtime_t,unsigned);
    if(r.kind != REQ_SPI_CMD && !err)lab_timing("spi","pixel-send",t0,bytes);
    post(BUS_SPI2, &r, !err, err ? json : NULL, t0, bytes);''')
