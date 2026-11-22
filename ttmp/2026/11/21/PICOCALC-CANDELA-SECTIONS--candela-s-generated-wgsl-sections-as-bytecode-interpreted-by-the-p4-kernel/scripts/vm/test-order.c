/* test-order.c: evaluation order of calls with side effects (design Section 4.6), with a stub kernel whose functions
 * change one counter n, as the real kernel's random generator and trace state change:
 *   rnd: n += 1, returns n          rnd2: n += 1, returns (n, n + 0.5)
 *   occluded: n += 10, returns 0    traceScene: n += 100, returns a miss with t = n
 *   hitAlbedo: returns (h.t, 0, 0)
 * For each blob, evaluates customKernel(ro = (0, 0, 0), rd = (0, 0, 1)) from n = 0 and prints "file x y z n".
 *
 *   cc -std=c99 -O1 test-order.c cdl_vm.c -lm -o test-order && test-order blob.cdvm ... */
#include "cdl_vm.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static float n;
static float k_fres(float c, float e) { (void)e; return c; }
static float k_n3(const float p[3]) { return p[0]; }
static float k_fbm(const float p[3], int oct, float lac, float gain, int mode) { (void)oct; (void)lac; (void)gain; (void)mode; return p[0]; }
static void k_vor(const float p[3], float o[4]) { o[0] = p[0]; o[1] = p[1]; o[2] = p[2]; o[3] = 0; }
static void k_tan(const cdl_hit *h, const float tl[3], float rot, const float N[3], float o[3]) { (void)h; (void)rot; (void)N; memcpy(o, tl, 12); }
static float k_sell(float l, const float B[3], const float C[3]) { (void)B; (void)C; return l; }
static void k_trace(const float ro[3], const float rd[3], float tmax, cdl_hit *o) { (void)ro; (void)rd; (void)tmax; n += 100; memset(o, 0, sizeof *o); o->t = n; }
static int k_occ(const float ro[3], const float rd[3], float tmax) { (void)ro; (void)rd; (void)tmax; n += 10; return 0; }
static void k_alb(const cdl_hit *h, const float wo[3], float o[3]) { (void)wo; o[0] = h->t; o[1] = 0; o[2] = 0; }
static float k_h13(const float p[3]) { return p[0]; }
static void k_v3(const float p[3], float o[3]) { memcpy(o, p, 12); }
static float k_rnd(void) { n += 1; return n; }
static void k_rnd2(float o[2]) { n += 1; o[0] = n; o[1] = n + 0.5f; }
static float gT, gL = 550.0f;
static const cdl_vm_kernel K = { k_fres, k_n3, k_fbm, k_vor, k_tan, k_sell, k_trace, k_occ, k_alb, k_alb, k_h13, k_v3, k_v3, k_rnd, k_rnd2, k_v3, &gT, &gL };
static cdl_vm_word regs[CDL_VM_REG_LIMIT];
static float U[4 * 64];

int main(int argc, char **argv) {
  int bad = 0;
  for (int a = 1; a < argc; a++) {
    FILE *f = fopen(argv[a], "rb"); if (!f) { perror(argv[a]); return 2; }
    unsigned char buf[65536]; const size_t len = fread(buf, 1, sizeof buf, f); fclose(f);
    cdl_vm_program p; cdl_vm_ctx c; char err[CDL_VM_ERRLEN];
    if (cdl_vm_load(&p, buf, len, &K, err, sizeof err) || cdl_vm_bind(&c, &p, &K, regs, U, 64, err, sizeof err)) { printf("%s error %s\n", argv[a], err); bad++; continue; }
    const float ro[3] = { 0, 0, 0 }, rd[3] = { 0, 0, 1 }; float o[3];
    n = 0;
    cdl_vm_custom_kernel(&c, ro, rd, o);
    printf("%s %.9g %.9g %.9g %.9g\n", argv[a], o[0], o[1], o[2], n);
  }
  return bad != 0;
}
