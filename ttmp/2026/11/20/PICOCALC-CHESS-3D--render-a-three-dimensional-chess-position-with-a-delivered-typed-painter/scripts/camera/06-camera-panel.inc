// Laboratory-only handoff between the single kernel thread and the SPI2 worker.
// All fields below are protected by panel.mutex; the frame remains immutable.
static struct {
  const uint16_t *expected;
  unsigned window, faults;
  int seq;
  vtime_t presented[33];
  unsigned failed;
} camera_panel;

static void camera_panel_end_window(void) {
  if (!camera_panel.expected || panel.windows < camera_panel.window || panel.index != panel.limit) return;
  vtime_t now = port_clock();
  if (panel.windows == camera_panel.window && !panel.faults &&
      !memcmp(camera_panel.expected, panel.pixels, 320 * 320 * 2))
    camera_panel.presented[camera_panel.seq] = now;
  else camera_panel.failed++;
  camera_panel.expected = NULL;
}

void camera_panel_arm(const uint16_t *frame, int seq, int rectangles) {
  xSemaphoreTake(panel.mutex, portMAX_DELAY);
  if (!seq) memset(&camera_panel, 0, sizeof(camera_panel));
  if (camera_panel.expected || !panel.pixels) camera_panel.failed++;
  camera_panel.seq = seq;
  camera_panel.window = panel.windows + rectangles;
  camera_panel.expected = frame;
  if (panel.pixels && !rectangles) camera_panel_end_window();
  xSemaphoreGive(panel.mutex);
}

vtime_t camera_panel_status(int seq, unsigned *failed) {
  xSemaphoreTake(panel.mutex, portMAX_DELAY);
  vtime_t seen = camera_panel.presented[seq];
  *failed = camera_panel.failed;
  xSemaphoreGive(panel.mutex);
  return seen;
}
