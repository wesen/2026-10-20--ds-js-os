#include "candela_scene.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

enum { SIDE=RAYTRACE_DEMO_SIDE, STRIDE=SIDE+5, FRAME_CELLS=SIDE*STRIDE+2 };
static FILE *transfer;
static bool record_materials;
static int calls;
static uint16_t framebuffer[FRAME_CELLS];

static int32_t sample(const candela_graph *graph, void *work, const void *materials,
                      int32_t y, void *out) {
    (void)graph;
    (void)work;
    const unsigned char *material_payload = (const unsigned char *)materials + sizeof(uint32_t);
    unsigned char *color_payload = (unsigned char *)out + sizeof(uint32_t);
    assert(y == calls++);
    if (record_materials) {
        if (fwrite(material_payload,sizeof(uint16_t),SIDE,transfer) != SIDE) return 0;
        memset(color_payload,0,2*SIDE*sizeof(uint16_t));
    } else if (fread(color_payload,sizeof(uint16_t),2*SIDE,transfer) != 2*SIDE) return 0;
    return SIDE;
}

static void reject(candela_graph *graph, unsigned index, uint16_t value, const candela_shader *shader) {
    const uint16_t old = graph->cells[index];
    graph->cells[index] = value;
    const raytrace_demo_stats sentinel = {.checksum=42};
    raytrace_demo_stats stats = sentinel;
    assert(!candela_validate(graph));
    assert(!candela_render(framebuffer+1,STRIDE,graph,31,25,RAYTRACE_DEMO_SCALAR,
        CANDELA_SHADE_ROW,shader,&stats));
    assert(memcmp(&stats,&sentinel,sizeof(stats))==0);
    assert(calls==0);
    for (size_t i=0;i<FRAME_CELLS;++i) assert(framebuffer[i]==0xa5a5);
    graph->cells[index] = old;
}

int main(int argc, char **argv) {
    assert(argc==5);
    FILE *input=fopen(argv[2],"rb");
    assert(input);
    candela_graph graph;
    assert(fread(&graph.capacity,sizeof(graph.capacity),1,input)==1);
    assert(fread(graph.cells,sizeof(uint16_t),CANDELA_GRAPH_CELLS,input)==CANDELA_GRAPH_CELLS);
    assert(fgetc(input)==EOF);
    fclose(input);
    assert(candela_validate(&graph));
    const candela_shader shader={.shade_row=sample};
    memset(framebuffer,0xa5,sizeof(framebuffer));
    if (strcmp(argv[1],"reject")==0) {
        reject(&graph,0,0,&shader);       // magic
        reject(&graph,1,2,&shader);       // version
        reject(&graph,2,65,&shader);      // node count
        reject(&graph,3,17,&shader);      // material count
        reject(&graph,4,4,&shader);       // sphere count
        reject(&graph,5,9,&shader);       // parameter count
        reject(&graph,6,16,&shader);      // floor handle
        reject(&graph,7,1,&shader);       // reserved
        reject(&graph,8,255,&shader);     // opcode
        reject(&graph,9,256,&shader);     // invalid color
        reject(&graph,21,3,&shader);      // fourth node's references or type
        reject(&graph,23,0,&shader);     // color used as a blend weight
        reject(&graph,264,64,&shader);    // material handle
        reject(&graph,280,31,&shader);    // sphere x
        reject(&graph,282,156,&shader);   // sphere z
        reject(&graph,283,33,&shader);    // radius
        reject(&graph,284,16,&shader);    // sphere material
        reject(&graph,295,257,&shader);   // parameter value
        graph.capacity=302;
        assert(!candela_validate(&graph));
        assert(!candela_render(framebuffer+1,STRIDE,&graph,31,25,RAYTRACE_DEMO_SCALAR,
            CANDELA_SHADE_ROW,&shader,NULL));
        assert(calls==0);
        return 0;
    }

    record_materials=strcmp(argv[1],"record")==0;
    assert(record_materials || strcmp(argv[1],"replay")==0);
    transfer=fopen(argv[3],record_materials ? "wb" : "rb");
    assert(transfer);
    raytrace_demo_stats stats;
    assert(candela_render(framebuffer+1,STRIDE,&graph,31,25,RAYTRACE_DEMO_SCALAR,
        CANDELA_SHADE_ROW,&shader,&stats));
    assert(calls==SIDE);
    if (!record_materials) assert(fgetc(transfer)==EOF);
    fclose(transfer);
    assert(framebuffer[0]==0xa5a5 && framebuffer[FRAME_CELLS-1]==0xa5a5);
    for(int y=0;y<SIDE;++y) for(int x=SIDE;x<STRIDE;++x) assert(framebuffer[1+y*STRIDE+x]==0xa5a5);
    if (!record_materials) {
        FILE *frame=fopen(argv[4],"wb");
        assert(frame);
        for(int y=0;y<SIDE;++y)
            assert(fwrite(framebuffer+1+y*STRIDE,sizeof(uint16_t),SIDE,frame)==SIDE);
        fclose(frame);
        printf("{\"rays\":%u,\"hits\":%u,\"shadow\":%u,\"checksum\":\"%08x\"}\n",
               stats.rays,stats.hit_pixels,stats.shadow_pixels,stats.checksum);
    }
}
