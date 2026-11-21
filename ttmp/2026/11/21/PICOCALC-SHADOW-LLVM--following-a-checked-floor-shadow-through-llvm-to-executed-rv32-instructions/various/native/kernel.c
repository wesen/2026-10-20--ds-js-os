#define uint32_t unsigned int
#define uint16_t unsigned short
#define abs __builtin_abs
typedef struct { uint32_t cap; uint16_t cells[]; } Surf;
static inline int checked_read(const Surf *w, unsigned i) {
    if(i >= w->cap) __builtin_trap();
    return w->cells[i];
}
#define CELL(i) checked_read(w,i)
#define PREDICATE checked_shadow
// Included twice with the same arithmetic and different halfword accessors.
static __attribute__((noinline)) int PREDICATE(void *ctx, int x, int y) {
    const Surf *w = ctx;
    const int lx = CELL(17) - 32, ly = CELL(18) - 32;
    const int norm = CELL(19), count = CELL(16);
    for (int s = 0; s < count; ++s) {
        const int box = 21 + 4*s;
        if (abs(4096 + 32*x - CELL(box)) > CELL(box+2) ||
            abs(4096 + 32*y - CELL(box+1)) > CELL(box+3)) continue;
        const int obj = 1 + 5*s;
        const int dx = CELL(obj)-x, dy = CELL(obj+1)-y, dz = 156-CELL(obj+2);
        const int r = CELL(obj+3), dot = dx*lx + dy*ly + 32*dz;
        if (dot > 0 && (dx*dx+dy*dy+dz*dz-r*r)*norm <= dot*dot) return 1;
    }
    return 0;
}
#undef CELL
#undef PREDICATE


extern __typeof(checked_shadow) kernel __attribute__((alias("checked_shadow")));
