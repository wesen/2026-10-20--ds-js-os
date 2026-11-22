// 07-sky-error.cpp: how far CDL_SKY_TABLE's lookup is from Candela's skyL, over random directions.
// Built by 09-host-tests.py once per table size:
//   g++ -O2 -DCDL_NS=cdl_sky -DCDL_SKY_TABLE=1 -DCDL_SKY_N=N -I cpu -I generated 07-sky-error.cpp -o sky
//   sky SCENE.bin [DIRECTIONS]
// Includes the generated kernel as one translation unit, binds the scene (which builds the table), then
// compares cdl_cpu_skyL with skyL_wgsl on uniformly distributed directions. Reports the relative error of
// luminance (mean, 99th percentile, maximum) over the upper and lower hemispheres, and the mean of the exact
// and table luminance (what an escaped path averages). Prints one JSON line.
#define CDL_MONO 1
#define CDL_MONO_SCENE "B-01.inc"   // any scene: only the sky is used
#include "cdl_kernel.cpp"
#include <algorithm>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <vector>
using namespace CDL_NS;

static unsigned char ws[sizeof(SkyWs)];
int main(int argc, char **argv) {
  FILE *f = fopen(argv[1], "rb"); fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
  unsigned *blob = (unsigned *)malloc(n); if (fread(blob, 1, n, f) != (size_t)n) return 2; fclose(f);
  cdl_buffers b; const unsigned *c = blob + 1; const float *p = (const float *)(blob + 6);
  b.U = p; p += 4 * c[0]; b.O = p; p += 4 * c[1]; b.LI = p; p += 4 * c[2]; b.BV = p; p += 4 * c[3]; b.SD = p;
  if (CDL_C(bind)(&b, nullptr, ws) != 2) { fprintf(stderr, "the table was not built\n"); return 3; }
  const int N = argc > 2 ? atoi(argv[2]) : 200000;
  std::vector<double> up, down; double sumE = 0, sumT = 0;
  u32 s = 12345u;
  auto r = [&]() { s = s * 747796405u + 2891336453u; u32 w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return f32((w >> 22u) ^ w) * (1.0f / 4294967296.0f); };
  for (int i = 0; i < N; i++) {
    const f32 z = 1.0f - 2.0f * r(), ph = 6.2831853f * r(), rr = sqrtf(std::max(0.0f, 1.0f - z * z));
    const vec3f d(rr * cosf(ph), z, rr * sinf(ph));   // y is up in Candela
    const f32 e = lum(skyL_wgsl(d)), t = lum(cdl_cpu_skyL(d));
    sumE += e; sumT += t;
    const double rel = fabs(double(t) - e) / std::max(double(e), 1e-30);
    (d.y >= 0 ? up : down).push_back(rel);
  }
  auto stats = [](std::vector<double> &v) { std::sort(v.begin(), v.end()); double m = 0; for (double x : v) m += x; return std::vector<double>{m / v.size(), v[v.size() * 99 / 100], v.back()}; };
  const auto U = stats(up), D = stats(down);
  printf("{\"N\": %d, \"directions\": %d, \"upper\": {\"mean\": %.3g, \"p99\": %.3g, \"max\": %.3g}, \"lower\": {\"mean\": %.3g, \"p99\": %.3g, \"max\": %.3g}, "
         "\"meanLumExact\": %.6g, \"meanLumTable\": %.6g, \"tableBytes\": %u}\n",
         CDL_SKY_N, N, U[0], U[1], U[2], D[0], D[1], D[2], sumE / N, sumT / N, (unsigned)sizeof(SkyWs));
  return 0;
}
