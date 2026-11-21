#include "raytrace_demo.h"
#include <assert.h>
#include <inttypes.h>
#include <stdio.h>
#include <string.h>

enum { SIDE=RAYTRACE_DEMO_SIDE, MAX_CELLS=320*SIDE+2 };
static uint16_t colors[MAX_CELLS], ids[MAX_CELLS], second_color[MAX_CELLS], second_ids[MAX_CELLS];
static int16_t depths[MAX_CELLS], second_depth[MAX_CELLS];

static void store(const char *dir, const char *name, const char *plane, const void *source, size_t count) {
    char path[1024];
    const int n=snprintf(path,sizeof(path),"%s/%s.%s",dir,name,plane);
    assert(n>0 && (size_t)n<sizeof(path));
    FILE *f=fopen(path,"wb");
    assert(f);
    const uint8_t *bytes=source;
    for(size_t i=0;i<count;i++) {
        uint16_t value;
        memcpy(&value,bytes+i*sizeof(value),sizeof(value));
        assert(fputc(value&255,f)!=EOF && fputc(value>>8,f)!=EOF);
    }
    fclose(f);
}

int main(int argc, char **argv) {
    assert(argc==2);
    static const struct {
        const char *name;
        unsigned stride;
        raytrace_demo_scene scene;
    } cases[] = {
        {"default",160,{68,61,31,25}},{"lamp-only",160,{68,61,128,25}},
        {"near-corner",160,{32,32,0,0}},{"far-corner",160,{127,127,159,159}},
        {"left-bottom",165,{32,127,159,0}},{"right-top",165,{127,32,0,159}},
        {"blue-overlap",160,{100,65,80,80}},{"gold-overlap",160,{58,109,79,79}},
        {"left-lamp",160,{80,80,0,80}},{"right-lamp",160,{80,80,159,80}},
        {"bottom-lamp",160,{95,52,80,159}},{"top-lamp-wide",320,{85,97,80,0}},
    };
    puts("[");
    for(unsigned i=0;i<sizeof(cases)/sizeof(cases[0]);i++) {
        const raytrace_demo_scene *scene=&cases[i].scene;
        const unsigned stride=cases[i].stride;
        const size_t cells=SIDE*stride+2;
        assert(cells <= MAX_CELLS);
        memset(colors,0xa5,sizeof(colors));
        memset(ids,0xa5,sizeof(ids));
        memset(depths,0xa5,sizeof(depths));
        memset(second_color,0xa5,sizeof(second_color));
        memset(second_ids,0xa5,sizeof(second_ids));
        memset(second_depth,0xa5,sizeof(second_depth));
        assert(raytrace_demo_render_audit(colors+1,depths+1,ids+1,stride,scene,RAYTRACE_DEMO_SCALAR));
        raytrace_demo_stats stats;
        assert(raytrace_demo_render(second_color+1,stride,scene,RAYTRACE_DEMO_SCALAR,&stats));
        assert(memcmp(colors,second_color,sizeof(colors))==0);
        assert(raytrace_demo_trace_audit(second_depth+1,second_ids+1,stride,scene,RAYTRACE_DEMO_SCALAR));
        assert(memcmp(second_depth,depths,sizeof(depths))==0);
        assert(memcmp(second_ids,ids,sizeof(ids))==0);
        memset(second_color,0xa5,sizeof(second_color));
        assert(raytrace_demo_shade_audit(second_color+1,second_depth+1,second_ids+1,stride,scene));
        assert(memcmp(colors,second_color,sizeof(colors))==0);
        assert(memcmp(second_depth,depths,sizeof(depths))==0);
        assert(memcmp(second_ids,ids,sizeof(ids))==0);

        unsigned counts[4]={0};
        for(unsigned y=0;y<SIDE;y++) for(unsigned x=0;x<stride;x++) {
            const size_t pos=1+y*stride+x;
            if(x>=SIDE) {
                assert(colors[pos]==0xa5a5 && ids[pos]==0xa5a5 && depths[pos]==(int16_t)0xa5a5);
                continue;
            }
            assert(ids[pos] <= 3);
            assert((ids[pos]==0) == (depths[pos]==0));
            ++counts[ids[pos]];
        }
        assert(colors[0]==0xa5a5 && colors[cells-1]==0xa5a5 && ids[0]==0xa5a5 && ids[cells-1]==0xa5a5);
        assert(depths[0]==(int16_t)0xa5a5 && depths[cells-1]==(int16_t)0xa5a5);
        assert(counts[1]+counts[2]+counts[3]==stats.hit_pixels);
        store(argv[1],cases[i].name,"color",colors,cells);
        store(argv[1],cases[i].name,"depth",depths,cells);
        store(argv[1],cases[i].name,"id",ids,cells);
        printf("%s{\"name\":\"%s\",\"stride\":%u,\"scene\":[%d,%d,%d,%d],"
               "\"checksum\":\"%08" PRIx32 "\",\"winnerCounts\":[%u,%u,%u,%u],\"shadowPixels\":%" PRIu32 "}",
               i ? ",\n" : "",cases[i].name,stride,scene->sphere_x,scene->sphere_y,scene->light_x,scene->light_y,
               stats.checksum,counts[0],counts[1],counts[2],counts[3],stats.shadow_pixels);
    }
    puts("\n]");
}
