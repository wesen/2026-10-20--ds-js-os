/* The checked form keeps the actual buffer header and each ordered access.
   The second build sets CHECKED=0 to quantify removing the bounds contract. */
#ifndef CHECKED
#define CHECKED 1
#endif
typedef __UINT16_TYPE__ u16;
typedef __UINT32_TYPE__ u32;
struct buffer { u32 capacity; u16 data[]; };
static inline u16 *element(struct buffer *work, u32 index) {
#if CHECKED
    if (index >= work->capacity) __builtin_trap();
#endif
    return work->data + index;
}
int row(struct buffer *work, int y) {
    for (int x=0; x<160; ++x) {
        *element(work,1545+x)=0;
        *element(work,1705+x)=0;
    }
    int count=*element(work,16);
    for (int s=0; s<count; ++s) {
        int obj=1+5*s;
        int dy=y-*element(work,obj+1);
        int cz=*element(work,obj+2);
        int r=*element(work,obj+3);
        int term=r*r-dy*dy;
        int horizontal=40+s*160;
        for (int x=0; x<160; ++x) {
            int d=term-*element(work,horizontal+x);
            if (d>=0) {
                int z=cz-*element(work,520u+(u32)d);
                int old=*element(work,1545+x);
                if (!old || z<old) {
                    *element(work,1545+x)=(u16)z;
                    *element(work,1705+x)=(u16)(s+1);
                }
            }
        }
    }
    return 1;
}
