/* test-verify.c: the verifier's acceptance and rejection tests (PICOCALC-CANDELA-SECTIONS design, Section 6).
 *
 *   cc -std=c99 -O1 -g -fsanitize=address,undefined -DCDL_VM_COUNT test-verify.c cdl_vm.c -lm -o test-verify
 *   test-verify MUTANTS_PER_BLOB SEED blob.cdvm ...
 *
 * 1. Every given blob (the translator's output) must verify against a full kernel table.
 * 2. Targeted malformations of the first blob must each be rejected, with the message printed.
 * 3. Random mutants: each blob is corrupted MUTANTS_PER_BLOB times (one to four halfwords of the header, the entry
 *    descriptors or the code set to random values). A rejected mutant is counted; an accepted one is bound and every
 *    entry is evaluated on several inputs with stub kernel functions. Under AddressSanitizer an out-of-bounds access
 *    aborts the test, and the step counter (CDL_VM_COUNT) checks that each evaluation stays within the bound the
 *    verifier promises (the entry's code length, since every jump is forward).
 * Prints one JSON line of totals. */
#include "cdl_vm.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* stub kernel functions: defined values, no state */
static float s_fres(float c, float e) { (void)e; return c * 0.5f; }
static float s_n3(const float p[3]) { return p[0] * 0.25f; }
static float s_fbm(const float p[3], int oct, float lac, float gain, int mode) { (void)lac; (void)gain; return p[1] + (float)oct + (float)mode; }
static void s_vor(const float p[3], float o[4]) { o[0] = p[0]; o[1] = p[1]; o[2] = p[2]; o[3] = 0; }
static void s_tan(const cdl_hit *h, const float tl[3], float rot, const float N[3], float o[3]) { o[0] = tl[0] + h->t; o[1] = N[1] + rot; o[2] = 0; }
static float s_sell(float l, const float B[3], const float C[3]) { return l + B[0] + C[0]; }
static void s_trace(const float ro[3], const float rd[3], float tmax, cdl_hit *o) { memset(o, 0, sizeof *o); o->ok = rd[0] > 0; o->t = tmax; o->P[0] = ro[0]; }
static int s_occ(const float ro[3], const float rd[3], float tmax) { return ro[0] + rd[0] > tmax; }
static void s_alb(const cdl_hit *h, const float wo[3], float o[3]) { o[0] = h->t; o[1] = wo[1]; o[2] = 0.5f; }
static float s_h13(const float p[3]) { return p[2]; }
static void s_v3(const float p[3], float o[3]) { memcpy(o, p, 12); }
static float s_rnd(void) { return 0.25f; }
static void s_rnd2(float o[2]) { o[0] = 0.25f; o[1] = 0.75f; }
static float gT = 0.5f, gL = 550.0f;
static const cdl_vm_kernel FULL = { s_fres, s_n3, s_fbm, s_vor, s_tan, s_sell, s_trace, s_occ, s_alb, s_alb, s_h13, s_v3, s_v3, s_rnd, s_rnd2, s_v3, &gT, &gL };

static unsigned char *slurp(const char *p, size_t *n) {
  FILE *f = fopen(p, "rb"); if (!f) { perror(p); exit(2); }
  fseek(f, 0, SEEK_END); *n = (size_t)ftell(f); fseek(f, 0, SEEK_SET);
  unsigned char *b = malloc(*n + 16); if (fread(b, 1, *n, f) != *n) exit(2); fclose(f); return b;
}
static unsigned long long rng = 88172645463325252ull;
static unsigned rnd32(void) { rng ^= rng << 13; rng ^= rng >> 7; rng ^= rng << 17; return (unsigned)(rng >> 16); }

static float Ubuf[4 * 4096];
static cdl_vm_word regs[CDL_VM_REG_LIMIT];
static long long accepted, rejected, evaluations, worstSteps;
/* evaluate every entry of a verified program on a few inputs; the step counter must stay within the entry's length */
static void exercise(const cdl_vm_program *p) {
  cdl_vm_ctx c; char err[CDL_VM_ERRLEN];
  if (cdl_vm_bind(&c, p, &FULL, regs, Ubuf, 4096, err, sizeof err)) return;
  cdl_hit h; memset(&h, 0, sizeof h); h.ok = 1; h.t = 1.5f; h.N[1] = 1; h.mat = 0;
  for (int k = 0; k < 6; k++) {
    float v[3] = { (float)k - 2.0f, 0.5f * (float)k, 1.0f }, out[3]; cdl_lobe L;
    h.mat = k - 1;
    unsigned long long limit, s0;
    const cdl_vm_entry_desc *e = p->entry;
    s0 = c.steps; cdl_vm_eval_material(&c, &h, v, 0.1f * (float)k, &L); limit = e[0].end - e[0].pc;
    if (c.steps - s0 > limit) { fprintf(stderr, "material ran %llu steps > %llu\n", c.steps - s0, limit); exit(1); }
    if ((long long)(c.steps - s0) > worstSteps) worstSteps = (long long)(c.steps - s0);
    s0 = c.steps; (void)cdl_vm_sd_user(&c, k - 1, v); if (c.steps - s0 > (unsigned long long)(e[1].end - e[1].pc)) { fprintf(stderr, "sdUser overran\n"); exit(1); }
    s0 = c.steps; (void)cdl_vm_height_at(&c, k - 1, v); if (c.steps - s0 > (unsigned long long)(e[2].end - e[2].pc)) { fprintf(stderr, "heightAt overran\n"); exit(1); }
    s0 = c.steps; (void)cdl_vm_density_of(&c, k - 1, v); if (c.steps - s0 > (unsigned long long)(e[3].end - e[3].pc)) { fprintf(stderr, "densityOf overran\n"); exit(1); }
    /* customKernel may call hitAlbedo -> the stub (not the material entry), so its bound is its own length */
    s0 = c.steps; cdl_vm_custom_kernel(&c, v, v, out); if (c.steps - s0 > (unsigned long long)(e[4].end - e[4].pc)) { fprintf(stderr, "customKernel overran\n"); exit(1); }
    evaluations += 5;
  }
}

static int expect_reject(const char *what, unsigned char *b, size_t n, const cdl_vm_kernel *k) {
  cdl_vm_program p; char err[CDL_VM_ERRLEN] = "";
  const int r = cdl_vm_load(&p, b, n, k, err, sizeof err);
  printf("  %-44s %s%s\n", what, r ? "rejected: " : "ACCEPTED", r ? err : "");
  return r != 0;
}
static void put16(unsigned char *b, size_t at, unsigned v) { b[at] = v & 255; b[at + 1] = (v >> 8) & 255; }
static unsigned get16(const unsigned char *b, size_t at) { return b[at] | (b[at + 1] << 8); }

int main(int argc, char **argv) {
  if (argc < 4) { fprintf(stderr, "usage: test-verify MUTANTS SEED blob.cdvm ...\n"); return 2; }
  const int mutants = atoi(argv[1]); rng ^= strtoull(argv[2], 0, 10) * 0x9e3779b97f4a7c15ull;
  for (int i = 0; i < 4 * 4096; i++) Ubuf[i] = 0.001f * (float)(i % 997);
  int nblob = 0, okblob = 0;
  for (int a = 3; a < argc; a++) {
    size_t n; unsigned char *b = slurp(argv[a], &n);
    cdl_vm_program p; char err[CDL_VM_ERRLEN];
    nblob++;
    if (cdl_vm_load(&p, b, n, &FULL, err, sizeof err)) { printf("valid blob rejected: %s: %s\n", argv[a], err); free(b); continue; }
    okblob++;
    exercise(&p);
    free(b);
  }
  /* targeted malformations of the first blob */
  size_t n; unsigned char *orig = slurp(argv[3], &n), *b = malloc(n + 64);
  cdl_vm_program p; char err[CDL_VM_ERRLEN];
  if (cdl_vm_load(&p, orig, n, &FULL, err, sizeof err)) { printf("first blob invalid\n"); return 1; }
  const size_t HDR = 20 + 12 * 5, codeAt = HDR + 4u * p.nconst + 4u * p.nimport;
  int targeted = 0, targetedRejected = 0;
#define CASE(what, mutate, kern) do { memcpy(b, orig, n); size_t len = n; (void)len; mutate; targeted++; targetedRejected += expect_reject(what, b, len, kern); } while (0)
  printf("targeted malformations of %s:\n", argv[3]);
  CASE("bad magic", b[0] ^= 1, &FULL);
  CASE("future version", put16(b, 4, 2), &FULL);
  CASE("truncated by one halfword", len = n - 2, &FULL);
  CASE("register file larger than the limit", put16(b, 8, 5000), &FULL);
  CASE("constants beyond the register file", put16(b, 10, get16(b, 8) + 1), &FULL);
  CASE("material frame overlaps sdUser's", put16(b, 20 + 6, get16(b, 20 + 12 + 4) + 1), &FULL);
  CASE("material result outside its frame", put16(b, 20 + 10, get16(b, 20 + 6)), &FULL);
  CASE("entry code ranges overlap", put16(b, 20 + 12, get16(b, 20 + 0)), &FULL);
  CASE("unknown opcode", put16(b, codeAt, 250), &FULL);
  {
    /* first instruction of the material entry: an HLD (h.mat) whose destination is moved below the frame */
    const unsigned pc = p.entry[0].pc;
    CASE("destination register outside the frame", put16(b, codeAt + 2 * (pc + 1), 0), &FULL);
    CASE("hit field beyond the 23-word record", put16(b, codeAt + 2 * (pc + 2), 23), &FULL);
  }
  {
    /* find the material SWITCH and corrupt its targets */
    unsigned sw = 0; for (unsigned i = p.entry[0].pc; i < p.entry[0].end; i++) if ((p.code[i] & 255) == 7) { sw = i; break; }
    if (sw) {
      CASE("backward jump", put16(b, codeAt + 2 * (sw + 3), sw), &FULL);
      CASE("jump outside the entry", put16(b, codeAt + 2 * (sw + 3), p.entry[0].end + 1), &FULL);
      CASE("jump into the middle of an instruction", put16(b, codeAt + 2 * (sw + 3), p.code[sw + 3] + 1), &FULL);
      CASE("SWITCH with 300 cases", put16(b, codeAt + 2 * (sw + 2), 300), &FULL);
    }
  }
  {
    cdl_vm_kernel noFres = FULL; noFres.fresnelDielectric = 0;
    CASE("kernel without fresnelDielectric", (void)0, &noFres);
  }
  CASE("last instruction of an entry is not RET/JMP", put16(b, codeAt + 2 * (p.entry[1].end - 1), 8), &FULL);
  printf("targeted: %d of %d rejected\n", targetedRejected, targeted);
  /* random mutants of every blob */
  for (int a = 3; a < argc; a++) {
    size_t m; unsigned char *src = slurp(argv[a], &m), *mu = malloc(m + 16);
    cdl_vm_program q;
    if (cdl_vm_load(&q, src, m, &FULL, err, sizeof err)) { free(src); free(mu); continue; }
    const size_t cAt = HDR + 4u * q.nconst + 4u * q.nimport;
    for (int t = 0; t < mutants; t++) {
      memcpy(mu, src, m);
      const int edits = 1 + (int)(rnd32() % 4);
      for (int e = 0; e < edits; e++) {
        size_t at;
        const unsigned where = rnd32() % 10;
        if (where == 0) at = 2 * (rnd32() % (HDR / 2));              /* header or descriptors */
        else at = cAt + 2 * (rnd32() % q.ncode);                       /* code */
        unsigned v = rnd32() & 0xffff;
        if (rnd32() & 1) v = (get16(mu, at) + (rnd32() % 7) - 3) & 0xffff;   /* small perturbations find more accepted mutants */
        put16(mu, at, v);
      }
      cdl_vm_program r;
      if (cdl_vm_load(&r, mu, m, &FULL, err, sizeof err)) { rejected++; continue; }
      accepted++;
      exercise(&r);
    }
    free(src); free(mu);
  }
  free(orig); free(b);
  printf("{\"blobs\": %d, \"blobsVerified\": %d, \"targeted\": %d, \"targetedRejected\": %d, \"mutants\": %lld, \"mutantsRejected\": %lld, \"mutantsAcceptedAndRun\": %lld, \"evaluations\": %lld, \"maxStepsOneMaterialEvaluation\": %lld}\n",
         nblob, okblob, targeted, targetedRejected, accepted + rejected, rejected, accepted, evaluations, worstSteps);
  return okblob == nblob && targetedRejected == targeted ? 0 : 1;
}
