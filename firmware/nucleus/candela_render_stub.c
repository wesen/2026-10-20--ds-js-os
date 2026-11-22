// A stand-in for the Candela renderer (candela_render.h), for the host and for the device until
// PICOCALC-CANDELA-FIRST-LIGHT lands the real one. It checks what the world hands over, keeps it as a renderer
// would (one program, one current scene, generations), and reports passes on the kernel's clock without
// drawing: STUB_PASS_US apart, up to STUB_PASSES per generation. A new generation (update) restarts the count,
// as a reset of accumulation would. Everything runs on the kernel task.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "candela_render.h"

#define STUB_PASS_US MS(500)
#define STUB_PASSES 4

static struct {
  int world;                  // -1: nothing is rendering
  cr_program_t *program;
  cr_scene_t *scene;
  uint32_t gen, pass;
  uint64_t starts, updates, stops, passes, refused;
  char last_refusal[160];
} R = { .world = -1 };

void cr_program_free(cr_program_t *p) { free(p); }   // one block (candela_world.c program_from)

static int refuse(char *why, size_t n, const char *what) {
  snprintf(why, n, "%s", what);
  snprintf(R.last_refusal, sizeof R.last_refusal, "%s", what);
  R.refused++;
  return -1;
}

// The checks a renderer must make before it binds buffers: the layout pack() promises.
static int check_scene(const cr_scene_t *s, char *why, size_t n) {
  if (!s || s->magic != CR_SCENE_MAGIC) return refuse(why, n, "not a packed Candela scene");
  if (!s->rows[CR_U] || !s->rows[CR_O]) return refuse(why, n, "a scene needs uniforms and objects");
  if (s->width < 8 || s->height < 8 || s->width > 640 || s->height > 640) return refuse(why, n, "frame size out of range");
  if (s->data[0] != (float)s->width || s->data[1] != (float)s->height) return refuse(why, n, "U[0..1] do not hold the frame size");
  return 0;
}

static void pass_done(void *arg, int gen) {
  (void)arg;
  if (R.world < 0 || (uint32_t)gen != R.gen || R.pass >= STUB_PASSES) return;
  R.pass++; R.passes++;
  candela_world_frame(R.world, R.gen, R.pass, R.pass, STUB_PASS_US);
  if (R.pass < STUB_PASSES) schedule_fn(K.vnow + STUB_PASS_US, pass_done, NULL, (int)R.gen);
}

static void begin_passes(void) {
  R.pass = 0;
  schedule_fn(K.vnow + STUB_PASS_US, pass_done, NULL, (int)R.gen);
}

int port_candela_start(int world, cr_program_t *program, cr_scene_t *scene, char *why, size_t n) {
  if (check_scene(scene, why, n)) return -1;
  if (!program || strlen(program->fixed_kernel_sha256) != 64) return refuse(why, n, "the program names no fixed kernel");
  if (strcmp(program->integrator, "path")) return refuse(why, n, "this renderer has only the path integrator");
  if (program->spectral) return refuse(why, n, "this renderer is RGB");
  if (R.world >= 0 && R.world != world) return refuse(why, n, "another world is rendering");
  cr_program_free(R.program); free(R.scene);
  R.world = world; R.program = program; R.scene = scene;
  R.gen = scene->gen; R.starts++;
  begin_passes();
  return 0;
}

int port_candela_update(int world, cr_scene_t *scene, char *why, size_t n) {
  if (R.world != world || !R.program) return refuse(why, n, "nothing is rendering: start first");
  if (check_scene(scene, why, n)) return -1;
  free(R.scene);
  R.scene = scene; R.gen = scene->gen; R.updates++;
  begin_passes();
  return 0;
}

void port_candela_stop(int world) {
  if (R.world != world) return;
  cr_program_free(R.program); free(R.scene);
  R.program = NULL; R.scene = NULL; R.world = -1; R.stops++;
}

char *port_candela_status_json(void) {
  char *j = malloc(640);
  if (!j) return NULL;
  snprintf(j, 640, "{\"renderer\":\"stub\",\"running\":%s,\"scene\":\"%s\",\"gen\":%u,\"pass\":%u,\"sceneBytes\":%u,"
           "\"fieldBytes\":%u,\"matBytes\":%u,\"fixedKernel\":\"%s\",\"tonemap\":\"%s\",\"exposure\":\"%s\","
           "\"starts\":%llu,\"updates\":%llu,\"stops\":%llu,\"passes\":%llu,\"refused\":%llu,\"lastRefusal\":\"%s\"}",
           R.world >= 0 ? "true" : "false", R.program ? R.program->scene_id : "", (unsigned)R.gen, (unsigned)R.pass, R.scene ? (unsigned)R.scene->bytes : 0u,
           R.program ? (unsigned)R.program->field_len : 0, R.program ? (unsigned)R.program->mat_len : 0,
           R.program ? R.program->fixed_kernel_sha256 : "", R.program ? R.program->tonemap : "", R.program ? R.program->exposure : "",
           (unsigned long long)R.starts, (unsigned long long)R.updates, (unsigned long long)R.stops,
           (unsigned long long)R.passes, (unsigned long long)R.refused, R.last_refusal);
  return j;
}
