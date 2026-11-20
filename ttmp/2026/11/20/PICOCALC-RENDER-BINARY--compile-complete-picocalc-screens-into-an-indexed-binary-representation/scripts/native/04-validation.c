// Application admission regression fixtures, fixed sender, with owned last-good state model.
#include <assert.h>
#define BX_NOW() 0ULL
#include "02-native.inc"
static bool try_replace(bx_data *live,const uint8_t *p,size_t n,const char *sender){
    bx_data incoming;uint8_t *owned=malloc(n?n:1);assert(owned);
    memcpy(owned,p,n);
    if(!bx_open(&incoming,owned,n)||!bx_shape(&incoming,sender)){free(owned);return false;}
    free((void*)live->p);*live=incoming;return true;
}
static void bad(bx_data *live,uint8_t *b,size_t n,const bx_spec *f) {
    const uint8_t *before=live->p;
    assert(!try_replace(live,b,n,f->app));
    assert(live->p==before && bx_weight(live,bx24(live->p+10))==f->hfull);
}
int main(void) {
    unsigned ntests=0;
    for(size_t k=0;k<sizeof(bx_fixtures)/sizeof(bx_fixtures[0]);k++){
        const bx_spec *f=&bx_fixtures[k];bx_data live={0};
        assert(try_replace(&live,f->bin,f->nb,f->app));
        uint8_t *b=malloc(f->nb+1);assert(b);
        for(int mode=0;mode<13;mode++){
            memcpy(b,f->bin,f->nb);size_t n=f->nb;
            unsigned root=bx24(b+10)&0xfffff,dict=bx16(b+13);
            switch(mode){
                case 0:b[0]='X';break;
                case 1:b[4]=2;break;
                case 2:b[5]=8;break;
                case 3:n--;break;
                case 4:b[15]=0;b[16]=0;break;
                case 5:b[dict]=0xff;break;
                case 6:b[10]++;break;
                case 7:b[12]=0xf0;break;
                case 8:b[root]=65;b[root+1]=0;break;
                case 9:b[root+2]=255;b[root+3]=255;break;
                case 10:b[root+7]=b[root+2];b[root+8]=b[root+3];break;
                case 11:b[dict]=0;break;
                case 12:n++;b[n-1]=42;b[6]=n;b[7]=n>>8;break;
            }
            bad(&live,b,n,f);ntests++;
        }
        assert(!try_replace(&live,f->bin,f->nb,"different-sender"));ntests++;
        assert(!bx_json_preflight((const uint8_t*)"\"a\\u0000b\"",10));
        assert(bx_json_preflight((const uint8_t*)"\"a\\\\u0000b\"",11));
        free((void*)live.p);free(b);
    }
    printf("validated four genuine specimens, %u rejected replacements preserved last-good plus NUL subdomain checks\n",ntests);
    return 0;
}
