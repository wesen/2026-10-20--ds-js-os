"""Add measurement-only hooks to an isolated P4 source tree."""
from pathlib import Path
import sys

tree = Path(sys.argv[1]).resolve()
if tree == next(p for p in Path(__file__).resolve().parents if (p / ".git").exists()):
    raise ValueError("stage into a private copy")
main = tree / "picocalc-os/port/esp32p4/main"

def edit(text, old, new):
    if text.count(old) != 1:
        raise ValueError(f"source anchor changed: {old}")
    return text.replace(old, new)

for name in ("bus_p4.c", "main_p4.c"):
    (main / (name+".before-observer")).write_bytes((main / name).read_bytes())
bus = main / "bus_p4.c"
s = bus.read_text()
anchor = "static void i2c_worker(void *arg) {"
s = edit(s, anchor, Path(__file__).with_name("panel-observer.inc").read_text()+"\n"+anchor)
anchor = "    if (!err && r.nbytes) err = i2c_master_transmit"
s = edit(s, anchor, """    if (panel_memory_keys && kbd && r.bytes[0] == KBD_REG_KEY && r.nread == 1) {
      int queued = inj_count();
      rd[0] = (uint8_t)(queued > 31 ? 31 : queued);
      r.nbytes = r.nread = 0;
    }
"""+anchor)
s = edit(s, "err = spi_device_get_trans_result(spi_dev, &done, portMAX_DELAY); inflight--;",
         "err = spi_device_get_trans_result(spi_dev, &done, portMAX_DELAY); if (!err) panel_completed(done); inflight--;")
s = edit(s, "spi_transaction_t *done; spi_device_get_trans_result(spi_dev, &done, portMAX_DELAY); inflight--;",
         "spi_transaction_t *done; esp_err_t e = spi_device_get_trans_result(spi_dev, &done, portMAX_DELAY); if (!e) panel_completed(done); else err = e; inflight--;")
s = edit(s, "    if (!err && r.kind == REQ_SPI_CMD)", "    xSemaphoreTake(panel.mutex, portMAX_DELAY);\n    if (!err && r.kind == REQ_SPI_CMD)")
s = edit(s, "      bytes = (uint32_t)(1 + r.nbytes);", "      if (!err) panel_command(&r, small);\n      bytes = (uint32_t)(1 + r.nbytes);")
s = edit(s, "    } else if (!err) err = spi_pixels(&r, &bytes);", """    } else if (!err) err = spi_pixels(&r, &bytes);
    if (err) panel.faults++;
    xSemaphoreGive(panel.mutex);""")
s = edit(s, "void bus_p4_init(void) {", """void bus_p4_init(void) {
  panel.mutex = xSemaphoreCreateMutex();
  panel.pixels = heap_caps_malloc(320*320*2, MALLOC_CAP_SPIRAM);
  if (panel.pixels) memset(panel.pixels, 0xa5, 320*320*2);""")
bus.write_text(s)
file = main / "main_p4.c"
anchor = '  } else if (!strcmp(cmd, "heap")) heap_report();'
file.write_text(edit(file.read_text(),anchor,anchor+'''
  else if (!strcmp(cmd, "panelobs")) {
    extern void panel_observer_console(const char *);
    panel_observer_console(rest);
  }'''))
