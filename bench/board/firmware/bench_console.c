// The bench build's console commands (cmake/bench.cmake, profiles/bench.env), tried before the firmware's own.
#include <stdbool.h>
#include <string.h>

#include "p4.h"

void p4_raybench(const char *args);                  // raybench.c
void p4_cachestat(const char *args);                 // cachestat.c
void p4_typed_ray_console(const char *args);         // typed_ray_bench.c
void p4_typed_ray_material_console(const char *args);  // typed_ray_material_bench.c
bool p4_candela_bench_console(const char *args);     // candela_bench.c

bool p4_bench_console(const char *cmd, const char *args) {
  if (!strcmp(cmd, "raybench")) p4_raybench(args);
  else if (!strcmp(cmd, "cachestat")) p4_cachestat(args);
  else if (!strcmp(cmd, "typedray")) p4_typed_ray_console(args);
  else if (!strcmp(cmd, "typedmat")) p4_typed_ray_material_console(args);
  else if (!strcmp(cmd, "candela")) return p4_candela_bench_console(args);
  else return false;
  return true;
}
