// console_exec and the CJI drawing syscalls run on the same kernel thread.
extern void camera_panel_arm(const uint16_t *, int, int);
extern vtime_t camera_panel_status(int, unsigned *);

enum { CAMERA_COUNT = 33, CAMERA_PIXELS = 320 * 320 };
typedef struct {
  dmabuf_t *fb;
  int owner, epoch, handle, phase;
  vtime_t begin, committed;
} camera_draw;
static struct {
  camera_draw painted, last, snapshots[CAMERA_COUNT];
  uint16_t *storage;
  int count, faults;
  bool active;
} camera;

void camera_painted(world_t *w, int id, dmabuf_t *b, int phase, vtime_t begin) {
  camera.painted = (camera_draw){b, w->id, w->epoch, id, phase, begin, 0};
}

static void camera_save(camera_draw draw, int rectangles) {
  int seq = camera.count++;
  camera.snapshots[seq] = draw;
  uint16_t *pixels = camera.storage + (size_t)seq * CAMERA_PIXELS;
  memcpy(pixels, draw.fb->front, CAMERA_PIXELS * 2);
  camera_panel_arm(pixels, seq, rectangles);
  if (camera.count == CAMERA_COUNT) camera.active = false;
}

void camera_committed(world_t *w, int id, dmabuf_t *b, int rectangles) {
  if (strcmp(w->name, "compositor")) return;
  camera_draw d = camera.painted;
  camera.painted.fb = NULL;
  if (d.fb != b || w->epoch != d.epoch || w->id != d.owner || id != d.handle ||
      b->w != 320 || b->h != 320 || d.phase < 0 || d.phase >= 32) {
    camera.last.fb = NULL;
    if (camera.active) { camera.faults++; camera.active = false; }
    return;
  }
  d.committed = port_clock();
  camera.last = d;
  if (!camera.active) return;
  camera_draw base = camera.snapshots[0];
  if (base.fb != b || d.owner != base.owner || d.epoch != base.epoch || id != base.handle) {
    camera.faults++; camera.active = false; return;
  }
  if (d.phase == ((camera.count - 1) % 32)) return;
  if (d.phase != (camera.count % 32) || !rectangles) {
    camera.faults++; camera.active = false; return;
  }
  camera_save(d, rectangles);
}

static void camera_console(const char *cmd) {
  if (!strcmp(cmd, "start")) {
    camera_draw d = camera.last;
    world_t *w = world_by_name("compositor");
    char err[96];
    handle_t *h = w && d.fb && w->id == d.owner && w->epoch == d.epoch ?
        handle_use(w, d.handle, H_DMA, R_WRITE, err, sizeof(err)) : NULL;
    if (!h || handle_buf(h) != d.fb || d.phase != 0 || camera.active || snap.busy) {
      puts("camobs: need stable committed compositor phase zero"); return;
    }
    if (!camera.storage)
      camera.storage = heap_caps_malloc((size_t)CAMERA_COUNT * CAMERA_PIXELS * 2, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (!camera.storage) { puts("camobs: frame allocation failed"); return; }
    camera.count = camera.faults = 0;
    camera.active = true;
    camera_save(d, 0);
    unsigned failures;
    if (!camera_panel_status(0, &failures) || failures) {
      camera.active = false; puts("camobs: initial SPI pixels differ"); return;
    }
    puts("camera capture active");
  } else if (!strcmp(cmd, "status")) {
    unsigned failures = 0;
    for (int i = 0; i < camera.count; i++) {
      camera_draw d = camera.snapshots[i];
      vtime_t displayed = camera_panel_status(i, &failures);
      printf("CAMFRAME %d %d %d %d %d %lld %lld %lld\n", i, d.phase, d.owner, d.epoch, d.handle,
             (long long)d.begin, (long long)d.committed, (long long)displayed);
    }
    printf("CAMSTATE %d %d %u %d\n", camera.count, camera.faults, failures, (int)camera.active);
  } else if (!strncmp(cmd, "shot ", 5)) {
    char *end = NULL;
    long seq = strtol(cmd + 5, &end, 10);
    if (seq < 0 || seq >= camera.count || end == cmd + 5 || *end || snap.busy) {
      puts("camobs: shot unavailable"); return;
    }
    size_t bytes = CAMERA_PIXELS * 2;
    if (!snap.px || (size_t)snap.w * snap.h * 2 < bytes) {
      heap_caps_free(snap.px);
      snap.px = heap_caps_malloc(bytes, MALLOC_CAP_SPIRAM);
    }
    if (!snap.px) { puts("camobs: shot memory unavailable"); return; }
    memcpy(snap.px, camera.storage + (size_t)seq * CAMERA_PIXELS, bytes);
    snap.w = snap.h = 320; snap.busy = true;
    xTaskNotifyGive(snap.task);
  }
}
