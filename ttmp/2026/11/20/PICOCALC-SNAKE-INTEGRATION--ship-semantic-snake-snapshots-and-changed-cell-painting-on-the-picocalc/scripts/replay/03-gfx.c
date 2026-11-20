// Thin Node N-API binding for the production RGB565 primitives and DMA commit.
// JS owns the three Buffers and keeps them alive while drawing. No panel hardware is involved.
#include <node_api.h>
#include "nucleus.h"
#include <stdlib.h>
#include <string.h>

kernel_t K;
profile_t PROFILE;

typedef struct { dmabuf_t framebuffer; } surface_t;
#define NAPI(call) do { if ((call) != napi_ok) { napi_throw_error(env, NULL, #call); return NULL; } } while (0)
static void release(napi_env env, void *ptr, void *hint) { (void)env; (void)hint; free(ptr); }

static napi_value make(napi_env env, napi_callback_info info) {
    size_t count=2, nb=0, nf=0;
    napi_value args[2], result;
    void *back=NULL,*front=NULL;
    NAPI(napi_get_cb_info(env,info,&count,args,NULL,NULL));
    if(count!=2) {napi_throw_error(env,NULL,"two buffers required"); return NULL;}
    NAPI(napi_get_buffer_info(env,args[0],&back,&nb));
    NAPI(napi_get_buffer_info(env,args[1],&front,&nf));
    if(nb!=320*320*sizeof(pixel_t) || nf!=nb) {napi_throw_error(env,NULL,"wrong surface size"); return NULL;}
    surface_t *s=calloc(1,sizeof(*s));
    if(!s){napi_throw_error(env,NULL,"surface allocation failed");return NULL;}
    s->framebuffer=(dmabuf_t){.w=320,.h=320,.bytes=nb,.back=back,.front=front};
    gfx_invalidate(&s->framebuffer);
    NAPI(napi_create_external(env,s,release,NULL,&result));
    return result;
}

static napi_value op(napi_env env, napi_callback_info info) {
    size_t n=9, sz=0;
    napi_value args[9],result;
    surface_t *s=NULL;
    int kind;
    NAPI(napi_get_cb_info(env,info,&n,args,NULL,NULL));
    if(n<2) {napi_throw_error(env,NULL,"missing opcode"); return NULL;}
    NAPI(napi_get_value_external(env,args[0],(void**)&s));
    NAPI(napi_get_value_int32(env,args[1],&kind));
    dmabuf_t *fb=&s->framebuffer;
    if(kind==4) {
        int rects[4*64];
        int count=gfx_commit(fb,rects,64);
        NAPI(napi_create_array_with_length(env,count,&result));
        for(int i=0;i<count;i++){
            napi_value rect; NAPI(napi_create_array_with_length(env,4,&rect));
            for(int j=0;j<4;j++){
                napi_value v; NAPI(napi_create_int32(env,rects[i*4+j],&v));
                NAPI(napi_set_element(env,rect,j,v));
            }
            NAPI(napi_set_element(env,result,i,rect));
        }
        return result;
    }
    if(kind==5) {gfx_invalidate(fb); return NULL;}
    int a[4];
    char color[20];
    if(n<7 || kind<0 || kind>3) {napi_throw_error(env,NULL,"invalid primitive");return NULL;}
    for(int i=0;i<4;i++) {NAPI(napi_get_value_int32(env,args[i+2],&a[i]));}
    NAPI(napi_get_value_string_utf8(env,args[6],color,sizeof color,&sz));
    if(sz>=sizeof(color)-1) {napi_throw_error(env,NULL,"color too long");return NULL;}
    pixel_t c=gfx_color(color);
    switch(kind){
    case 0:gfx_fill(fb,a[0],a[1],a[2],a[3],c);break;
    case 1:gfx_rect(fb,a[0],a[1],a[2],a[3],c);break;
    case 2:gfx_line(fb,a[0],a[1],a[2],a[3],c);break;
    case 3:{
        char font[12],text[2048];
        if(n!=9){napi_throw_error(env,NULL,"text arguments required");return NULL;}
        NAPI(napi_get_value_string_utf8(env,args[7],font,sizeof font,&sz));
        NAPI(napi_get_value_string_utf8(env,args[8],text,sizeof text,&sz));
        if(sz>=sizeof(text)-1){napi_throw_error(env,NULL,"test text too long");return NULL;}
        NAPI(napi_create_int32(env,gfx_text(fb,a[0],a[1],text,gfx_font_index(font),c,a[2]),&result));
        return result;
    }}
    return NULL;
}

static napi_value fonts(napi_env env,napi_callback_info info){
    (void)info;
    napi_value result;
    char *names=gfx_fonts_json();
    NAPI(napi_create_string_utf8(env,names,NAPI_AUTO_LENGTH,&result));free(names);return result;
}

NAPI_MODULE_INIT() {
    napi_property_descriptor methods[]={
        {.utf8name="make",.method=make}, {.utf8name="op",.method=op}, {.utf8name="fonts",.method=fonts}
    };
    NAPI(napi_define_properties(env,exports,3,methods));
    return exports;
}
