// A model of the PaperS3's GT911 touch controller, register by register, as the JS touch driver reads it.
//
// Registers use 16-bit big-endian addresses: a write sets the address and writes any bytes after it; a read
// continues from the address last set. 0x8140 holds the product id "911"; 0x814E is the status (bit 7: a
// report is ready; bits 0..3: how many points); the points follow from 0x814F, 8 bytes each (track id,
// x low, x high, y low, y high, size low, size high, reserved). The host clears 0x814E to hand the buffer
// back. While a finger is down the controller makes a new report every 10 ms, but not before the last one
// was handed back; a finger lifted makes one report with no points.
#include <string.h>
#include "papers3.h"

#define REPORT_US 10000
#define MAX_POINTS 5

static struct {
  uint16_t reg;                       // the address pointer
  struct { bool down; int x, y; } finger[MAX_POINTS], last[MAX_POINTS];
  uint8_t status, points[MAX_POINTS * 8];
  vtime_t last_report;
  bool lifted;                        // a finger went up since the last report
  int reports;
} G;

void gt911_init(void) { memset(&G, 0, sizeof G); G.last_report = -REPORT_US; }
int gt911_reports(void) { return G.reports; }

void gt911_finger(int id, bool down, int x, int y, vtime_t t) {
  (void)t;
  if (id < 0 || id >= MAX_POINTS) return;
  if (G.finger[id].down && !down) G.lifted = true;
  G.finger[id].down = down; G.finger[id].x = x; G.finger[id].y = y;
}

// a new report, if one is due and the buffer was handed back
static void maybe_report(vtime_t t) {
  if (G.status & 0x80) return;
  if (t - G.last_report < REPORT_US) return;
  int n = 0;
  for (int i = 0; i < MAX_POINTS; i++) n += G.finger[i].down;
  if (!n && !G.lifted) return;
  memset(G.points, 0, sizeof G.points);
  int k = 0;
  for (int i = 0; i < MAX_POINTS; i++) {
    if (!G.finger[i].down) continue;
    uint8_t *p = G.points + 8 * k++;
    p[0] = (uint8_t)i;
    p[1] = (uint8_t)G.finger[i].x; p[2] = (uint8_t)(G.finger[i].x >> 8);
    p[3] = (uint8_t)G.finger[i].y; p[4] = (uint8_t)(G.finger[i].y >> 8);
    p[5] = 24; p[6] = 0;   // contact size
  }
  G.status = (uint8_t)(0x80 | n);
  G.lifted = false;
  G.last_report = t;
  G.reports++;
}

static uint8_t reg_byte(uint16_t r) {
  static const uint8_t id[] = { '9', '1', '1', 0, 0x60, 0x10 };   // product id, firmware 0x1060
  if (r >= 0x8140 && r < 0x8146) return id[r - 0x8140];
  if (r == 0x8146) return PANEL_W & 0xff;
  if (r == 0x8147) return PANEL_W >> 8;
  if (r == 0x8148) return PANEL_H & 0xff;
  if (r == 0x8149) return PANEL_H >> 8;
  if (r == 0x814E) return G.status;
  if (r >= 0x814F && r < 0x814F + sizeof G.points) return G.points[r - 0x814F];
  return 0;
}

int gt911_i2c(const uint8_t *wr, int nwr, uint8_t *rd, int nrd, vtime_t t) {
  maybe_report(t);
  if (nwr >= 2) {
    G.reg = (uint16_t)(wr[0] << 8 | wr[1]);
    for (int i = 2; i < nwr; i++, G.reg++)
      if (G.reg == 0x814E) G.status = wr[i];   // the host hands the buffer back (writes 0)
  }
  for (int i = 0; i < nrd; i++) rd[i] = reg_byte(G.reg++);
  return nrd;
}
