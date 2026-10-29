// A model of the BM8563 real-time clock (PCF8563 registers): 0x02..0x08 hold seconds, minutes, hours, day,
// weekday, month and year in BCD. It runs on the board's time (sim_base_us + the kernel's virtual clock), which
// goes on while the board is off, from the time it was set to. It keeps its registers through a power cycle,
// as the chip does on its own supply.
//
// The countdown timer: 0x0E is its control (bit 7 enable; bits 1-0 the source: 2 = 1 Hz, 3 = 1/60 Hz), 0x0F the
// count. When it runs out, TF (0x01 bit 2) is set; with TIE (0x01 bit 0) set, INT is then active. On the PaperS3
// INT becoming active power-cycles the board, whether it was off or running (measured on the device, on USB:
// a power-on reset 15 s after arming 15 s). TF stays until software clears it; the timer then counts the same
// period again while it is enabled. The alarm registers (0x09..0x0C) are kept but never fire here.
#include <time.h>
#include "papers3.h"

#define TF 0x04
#define AF 0x08
#define TIE 0x01

static struct {
  double epoch_ms; vtime_t at;   // the time it read at board time `at`
  uint8_t reg;                   // the register pointer
  uint8_t ctl2, alarm[4], tctl, tcount;
  vtime_t t_start;               // board time the current countdown began
  vtime_t edge;                  // when INT last went active, until the board takes it (VT_INF: none)
} R;

void bm8563_init(double epoch_ms) {
  R.epoch_ms = epoch_ms; R.at = 0; R.reg = 0;
  R.ctl2 = 0; R.tctl = 0; R.tcount = 0;
  for (int i = 0; i < 4; i++) R.alarm[i] = 0x80;
  R.edge = VT_INF;
}

static uint8_t bcd(int v) { return (uint8_t)((v / 10) << 4 | v % 10); }
static int unbcd(uint8_t v) { return (v >> 4) * 10 + (v & 15); }

static vtime_t period_us(void) { return (R.tctl & 3) == 3 ? MS(60000) : (R.tctl & 3) == 2 ? MS(1000) : 0; }
static vtime_t runs_out(void) {   // when the running countdown ends, or VT_INF
  vtime_t p = period_us();
  return (R.tctl & 0x80) && p && R.tcount ? R.t_start + p * R.tcount : VT_INF;
}
static void advance(vtime_t now) {
  vtime_t t = runs_out();
  if (!(R.ctl2 & TF) && now >= t) { R.ctl2 |= TF; if (R.ctl2 & TIE) R.edge = t; }
}

bool bm8563_int(vtime_t now) { advance(now); return (R.ctl2 & TIE) && (R.ctl2 & TF); }
vtime_t bm8563_next_int(vtime_t now) {   // the next time INT goes active: an edge, so not while it already is
  advance(now);
  return (R.ctl2 & TIE) && !(R.ctl2 & TF) ? runs_out() : VT_INF;
}
vtime_t bm8563_take_edge(vtime_t now) { advance(now); vtime_t t = R.edge; R.edge = VT_INF; return t; }

int bm8563_i2c(const uint8_t *wr, int nwr, uint8_t *rd, int nrd, vtime_t t) {
  t += sim_base_us;
  advance(t);
  time_t now = (time_t)((R.epoch_ms + (t - R.at) / 1000.0) / 1000.0);
  struct tm tm;
  gmtime_r(&now, &tm);
  uint8_t regs[16] = { 0 };
  regs[1] = R.ctl2;
  regs[2] = bcd(tm.tm_sec); regs[3] = bcd(tm.tm_min); regs[4] = bcd(tm.tm_hour); regs[5] = bcd(tm.tm_mday);
  regs[6] = (uint8_t)tm.tm_wday; regs[7] = bcd(tm.tm_mon + 1); regs[8] = bcd(tm.tm_year % 100);
  for (int i = 0; i < 4; i++) regs[9 + i] = R.alarm[i];
  regs[14] = R.tctl; regs[15] = R.tcount;
  if (nwr >= 1) {
    R.reg = wr[0];
    if (nwr >= 8 && wr[0] == 0x02) {   // setting the time: seconds .. years
      struct tm s = { 0 };
      s.tm_sec = unbcd(wr[1] & 0x7f); s.tm_min = unbcd(wr[2] & 0x7f); s.tm_hour = unbcd(wr[3] & 0x3f);
      s.tm_mday = unbcd(wr[4] & 0x3f); s.tm_mon = unbcd(wr[6] & 0x1f) - 1; s.tm_year = 100 + unbcd(wr[7]);
      R.epoch_ms = (double)timegm(&s) * 1000.0; R.at = t;
    }
    for (int i = 1; i < nwr; i++) {   // the control, alarm and timer registers, from the pointer on
      int r = (wr[0] + i - 1) & 15;
      uint8_t v = wr[i];
      if (r == 1) {
        bool cleared = (R.ctl2 & TF) && !(v & TF);
        if (!(R.ctl2 & TIE) && (v & TIE) && (R.ctl2 & TF) && (v & TF)) R.edge = t;   // enabling with the flag up
        R.ctl2 = (uint8_t)((v & (TIE | 0x02)) | (R.ctl2 & v & (TF | AF)));   // flags can only be cleared
        if (cleared) R.t_start = t;   // the countdown goes round again
      } else if (r >= 9 && r <= 12) R.alarm[r - 9] = v;
      else if (r == 14) { R.tctl = v & 0x83; R.t_start = t; }
      else if (r == 15) { R.tcount = v; R.t_start = t; }
    }
  }
  for (int i = 0; i < nrd; i++) rd[i] = regs[(R.reg + i) & 15];
  return nrd;
}
