// Laboratory-only reconstruction of completed display payloads on SPI2.
#include "freertos/semphr.h"
#include "esp_crc.h"

static struct {
  uint16_t *pixels;
  SemaphoreHandle_t mutex;
  int x0, x1, y0, y1, index, limit;
  unsigned windows, faults, bytes;
} panel;
static volatile bool panel_memory_keys;

static void panel_command(const req_t *r, const uint8_t *params) {
  if (r->cmd == 0x2a || r->cmd == 0x2b) {
    if (r->nbytes != 4) { panel.faults++; return; }
    int lo = params[0] * 256 + params[1], hi = params[2] * 256 + params[3];
    if (lo > hi || hi >= 320) { panel.faults++; return; }
    if (r->cmd == 0x2a) { panel.x0 = lo; panel.x1 = hi; }
    else { panel.y0 = lo; panel.y1 = hi; }
  } else if (r->cmd == 0x2c) {
    if (panel.index != panel.limit) panel.faults++;
    panel.windows++;
    panel.index = 0;
    panel.limit = (1 + panel.x1 - panel.x0) * (1 + panel.y1 - panel.y0);
  }
}
static void panel_completed(const spi_transaction_t *tx) {
  const uint8_t *data = tx->tx_buffer;
  int bytes = tx->length / 8, width = 1 + panel.x1 - panel.x0;
  if (!panel.pixels || !data || bytes % 2 || width <= 0 || panel.index + bytes/2 > panel.limit) {
    panel.faults++;
    return;
  }
  int x = panel.x0 + panel.index % width;
  int y = panel.y0 + panel.index / width;
  for (int i = 0; i < bytes; i += 2) {
    panel.pixels[y*320 + x] = (uint16_t)(data[i]*256 + data[i+1]);
    if (++x > panel.x1) { x = panel.x0; y++; }
  }
  panel.index += bytes/2;
  panel.bytes += bytes;
}
void panel_observer_console(const char *cmd) {
  if (!strcmp(cmd, "memory-keys")) { panel_memory_keys = true; puts("panel: memory keys"); }
  else if (!strcmp(cmd, "start") && panel.pixels) puts("panel capture active");
  else if (!strcmp(cmd, "check") && panel.pixels) {
    xSemaphoreTake(panel.mutex, portMAX_DELAY);
    uint32_t crc = esp_crc32_le(0, (const uint8_t *)(panel.pixels+22*320), 298*320*2);
    printf("{\"panelCRC\":\"%08lx\",\"faults\":%u,\"windows\":%u,\"bytes\":%u,\"remaining\":%d}\n",
           (unsigned long)crc, panel.faults, panel.windows, panel.bytes, panel.limit-panel.index);
    xSemaphoreGive(panel.mutex);
  }
}
