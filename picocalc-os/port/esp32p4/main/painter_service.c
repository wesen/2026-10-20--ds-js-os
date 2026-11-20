// The kernel lane owns all live UI state. A worker receives one private copy of
// the approved source and returns a linked image through a one-element queue.
#include "p4.h"
#include "painter_service.h"
#include "mobile_painter_p4.h"
#include "painter_commands.h"
#include "chess-psix.h"
#include "esp_heap_caps.h"
#include "freertos/idf_additions.h"
#include <stdlib.h>
#include <string.h>

typedef struct {
  mobile_painter_image image;
  mobile_painter_install_stats stats;
} build_result;

typedef struct {
  size_t length;
  char bytes[];
} install_request;

typedef struct {
  uint16_t words[MOBILE_PAINTER_MAX_WORDS];
  char hints[MOBILE_PAINTER_MAX_TEXT + 1];
  unsigned count;
} display_list;

static QueueHandle_t completed;
static bool compiling, authorized, have_state;
static int publisher_epoch = -1, announced_epoch = -1, requested_epoch = -1;
static uint16_t state[MOBILE_PAINTER_INPUT_CELLS];
static display_list *current, *scratch;
static mobile_painter *program;
static mobile_painter_install_stats install_stats;
static unsigned sources, compiles, packets, calls, paints, rejects;
static int64_t last_native_us, last_draw_us;

static void compile_worker(void *arg) {
  install_request *request = arg;
  build_result result = {0};
  result.image = mobile_painter_compile(request->bytes, request->length, &result.stats);
  free(request);
  xQueueSend(completed, &result, portMAX_DELAY);
  vTaskDeleteWithCaps(NULL);
}

static bool start_compile(const uint8_t *data, size_t n) {
  if (!completed) completed = xQueueCreate(1, sizeof(build_result));
  if (!completed) return false;
  install_request *job = malloc(sizeof(*job) + n + 1);
  if (!job) return false;
  job->length = n;
  memcpy(job->bytes, data, n);
  job->bytes[n] = 0;
  // Run in the kernel's idle time. Competing from the other core can push a
  // cold launcher draw past its deadline under PSRAM and instruction-cache load.
  if (xTaskCreatePinnedToCoreWithCaps(compile_worker, "painter-build", 80 * 1024, job,
        2, NULL, 1, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT) != pdPASS) {
    free(job);
    return false;
  }
  compiling = true;
  compiles++;
  return true;
}

static bool render(const uint16_t *cells) {
  if (!scratch) scratch = port_heap_malloc(sizeof(*scratch));
  if (!scratch) return false;
  calls++;
  int n = mobile_painter_run(program, cells, scratch->words, &last_native_us);
  if (n <= 0 || !painter_commands_valid(scratch->words, n, scratch->hints)) return false;
  scratch->count = n;
  display_list *old = current;
  current = scratch;
  scratch = old;
  announced_epoch = -1;
  return true;
}

static void change_publisher(int epoch) {
  if (publisher_epoch == epoch) return;
  publisher_epoch = epoch;
  have_state = authorized = false;
  if (current) current->count = 0;
  announced_epoch = -1;
}

void p4_painter_receive(world_t *receiver, world_t *sender, bool source, const uint8_t *data, size_t length) {
  if (!receiver || !sender || strcmp(receiver->name, "compositor") || strcmp(sender->name, "chess")) return;
  change_publisher(sender->epoch);
  if (source) {
    sources++;
    if (!mobile_painter_source_allowed((const char *)data, length) ||
        (!program && !compiling && !start_compile(data, length))) {
      rejects++;
      return;
    }
    authorized = true;
    if (program && have_state && (!current || !current->count) && !render(state)) rejects++;
    return;
  }

  packets++;
  uint16_t candidate[MOBILE_PAINTER_INPUT_CELLS];
#if PICOCALC_CHESS_3D
  candidate[MOBILE_PAINTER_STATE_CELLS] = state[MOBILE_PAINTER_STATE_CELLS];
#endif
  if (!chess_psix_decode(data, length, candidate)) { rejects++; return; }
  if (have_state && !memcmp(state, candidate, sizeof(state))) return;
  if (authorized && program && !render(candidate)) { rejects++; return; }
  memcpy(state, candidate, sizeof(state));
  have_state = true;
}

void p4_painter_poll(void) {
  world_t *chess = world_by_name("chess");
  if (chess && chess->epoch != publisher_epoch) change_publisher(chess->epoch);
  build_result result;
  if (compiling && xQueueReceive(completed, &result, 0) == pdTRUE) {
    compiling = false;
    // Relocation invalidates caches and requires the kernel's internal-RAM stack.
    install_stats = result.stats;
    if (result.image.bytes) program = mobile_painter_load(result.image, &install_stats);
    if (!program) {
      rejects++;
      authorized = false;
      klog("painter: native installation failed");
    } else if (authorized && have_state && !render(state)) rejects++;
  }
  world_t *view = world_by_name("compositor");
  if (!view || !view->nat || view->status != W_IDLE) return;
  if (view->restarts > 1 && chess && chess->nat && requested_epoch != view->epoch) {
    // Raw messages for a previous receiver epoch can have been discarded.
    defer_deliver(chess, new_msg(M_ON, "painter.resend", "null", view->id));
    requested_epoch = view->epoch;
  }
  if (current && current->count && announced_epoch != view->epoch) {
#if PICOCALC_CHESS_3D
    const char *features = "{\"orbit\":true}";
#else
    const char *features = "null";
#endif
    defer_deliver(view, new_msg(M_ON, "painter.ready", features, view->id));
    announced_epoch = view->epoch;
  }
}

bool p4_painter_draw(dmabuf_t *fb, int yaw, char *hints, size_t capacity) {
  if (!fb || !current || !current->count || fb->w != PAINTER_WIDTH || fb->h != 320 ||
      !hints) return false;
#if PICOCALC_CHESS_3D
  if (yaw < 0 || yaw > 31) return false;
  if (state[MOBILE_PAINTER_STATE_CELLS] != yaw) {
    const int previous_yaw = state[MOBILE_PAINTER_STATE_CELLS];
    state[MOBILE_PAINTER_STATE_CELLS] = yaw;
    const int epoch = announced_epoch;
    if (!render(state)) {
      state[MOBILE_PAINTER_STATE_CELLS] = previous_yaw;
      rejects++;
      return false;
    }
    // The compositor is already drawing this change.
    announced_epoch = epoch;
  }
#else
  (void)yaw;
#endif
  if (strlen(current->hints) >= capacity) return false;
  vtime_t begin = port_clock();
  painter_commands_draw(fb, current->words, current->count);
  last_draw_us = port_clock() - begin;
  strcpy(hints, current->hints);
  paints++;
  return true;
}

void p4_painter_status(void) {
  printf("{\"sources\":%u,\"compiles\":%u,\"installed\":%s,\"packets\":%u,\"calls\":%u,"
         "\"paints\":%u,\"rejects\":%u,\"compile_us\":%lld,\"relocate_us\":%lld,"
         "\"native_us\":%lld,\"raster_us\":%lld,\"image_bytes\":%zu}\n",
         sources, compiles, program ? "true" : "false", packets, calls, paints, rejects,
         (long long)install_stats.compile_us, (long long)install_stats.relocate_us,
         (long long)last_native_us, (long long)last_draw_us, install_stats.image_bytes);
}
