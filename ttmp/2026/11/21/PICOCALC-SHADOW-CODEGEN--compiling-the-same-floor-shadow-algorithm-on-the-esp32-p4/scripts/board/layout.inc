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
