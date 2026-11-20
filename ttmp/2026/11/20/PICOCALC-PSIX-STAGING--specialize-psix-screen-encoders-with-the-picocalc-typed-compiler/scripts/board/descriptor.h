// A hand-written C interpreter of the schema-generated offset/field table.
// Only the two runtime strings participate in insertion into the sorted vocabulary.
#include <stdint.h>
#include <stddef.h>
#include <string.h>
struct stage_input { uint32_t length; uint16_t words[90]; };
#include "stage_fixtures.h"

static int stage_plan(const struct stage_input *in, uint8_t *output, size_t capacity) {
    if (in->length != 90) return -1;
    static const char hex[]="0123456789abcdef";
    char board[65],mask[17];
    unsigned occupied=0;
    for (int i=0;i<64;i++) {
        unsigned p=in->words[i];
        if (p>14 || p==7 || p==8) return -1;
        occupied += p != 0;
        board[i]=hex[p];
    }
    if(occupied>32) return -1;
    board[64]=0;
    for (int j=0;j<8;j++) {
        unsigned m=in->words[64+j];
        if (m>255 || (in->words[74]==64 && m)) return -1;
        mask[2*j]=hex[m>>4]; mask[2*j+1]=hex[m&15];
    }
    mask[16]=0;
    enum { LITERALS=sizeof(stage_vocab)/sizeof(*stage_vocab), SYMBOLS=LITERALS+2 };
    const char *strings[SYMBOLS];
    unsigned order[SYMBOLS],ids[SYMBOLS];
    for(unsigned i=0;i<LITERALS;i++) { strings[i]=stage_vocab[i]; order[i]=i; }
    strings[LITERALS]=board; strings[LITERALS+1]=mask;
    for(unsigned i=LITERALS;i<SYMBOLS;i++) {
        unsigned j=i;
        while(j && strcmp(strings[order[j-1]],strings[i])>0) {order[j]=order[j-1];j--;}
        order[j]=i;
    }
    unsigned count=0,text=0,unique[SYMBOLS];
    for(unsigned i=0;i<SYMBOLS;i++) {
        unsigned k=order[i];
        if(!i || strcmp(strings[k],strings[order[i-1]])) {unique[count++]=k;text+=strlen(strings[k]);}
        ids[k]=count-1;
    }
    int32_t numbers[9];
    unsigned begin=15+2*count,body=begin+text,tail=body+sizeof(stage_body),total=tail;
    for(unsigned i=0;i<9;i++) {
        numbers[i]=(int32_t)((uint32_t)in->words[72+2*i]|((uint32_t)in->words[73+2*i]<<16));
        if(numbers[i]<-524288 || numbers[i]>524287) total+=8;
    }
    if(numbers[0]<0 || numbers[0]>63 || numbers[1]<0 || numbers[1]>64 ||
       numbers[2]<0 || numbers[2]>64 || numbers[3]<0 || numbers[3]>64 ||
       (numbers[2]==64)!=(numbers[3]==64) || numbers[4]<0 || numbers[4]>8 ||
       numbers[5]<0 || numbers[5]>1 || numbers[6]<0 || numbers[6]>32 ||
       numbers[7]<0 || numbers[8]==INT32_MIN) return -1;
    if(total>capacity) return -2;
    memcpy(output,"PSIX\1\0",6); bp_u16(output+6,total); bp_u16(output+8,count);
    bp_ref(output+10,7,body);
    unsigned cursor=begin;
    for(unsigned i=0;i<count;i++) {
        const char *s=strings[unique[i]];
        size_t len=strlen(s);
        bp_u16(output+13+2*i,cursor); memcpy(output+cursor,s,len); cursor+=len;
    }
    bp_u16(output+13+2*count,cursor);
    memcpy(output+body,stage_body,sizeof(stage_body));
    for(unsigned i=0;i<sizeof(stage_slots)/sizeof(*stage_slots);i++) {
        const uint8_t *slot=stage_slots[i];
        if(!slot[1]) bp_u16(output+body+slot[0],ids[slot[2]]);
        else bp_ref(output+body+slot[0],slot[1],slot[1]==5?ids[slot[2]]:body+slot[2]);
    }
    for(unsigned i=0;i<9;i++) {
        int32_t v=numbers[i]; uint8_t *slot=output+body+stage_numbers[i];
        if(v>=-524288 && v<=524287) bp_ref(slot,3,(uint32_t)v&0xfffff);
        else {double d=v; bp_ref(slot,4,tail); memcpy(output+tail,&d,8); tail+=8;}
    }
    return (int)total;
}
