// A model of the BM8563 real-time clock (PCF8563 registers): 0x02..0x08 hold seconds, minutes, hours, day,
// weekday, month and year in BCD. It runs on the board's time (sim_base_us + the kernel's virtual clock), which
// goes on while the board is off, from the time it was set to.
#include <time.h>
#include "papers3.h"

static struct { double epoch_ms; vtime_t at; uint8_t reg; } R;   // the time it read at virtual time `at`

void bm8563_init(double epoch_ms) { R.epoch_ms = epoch_ms; R.at = 0; R.reg = 0; }

static uint8_t bcd(int v) { return (uint8_t)((v / 10) << 4 | v % 10); }
static int unbcd(uint8_t v) { return (v >> 4) * 10 + (v & 15); }

int bm8563_i2c(const uint8_t *wr, int nwr, uint8_t *rd, int nrd, vtime_t t) {
  t += sim_base_us;
  time_t now = (time_t)((R.epoch_ms + (t - R.at) / 1000.0) / 1000.0);
  struct tm tm;
  gmtime_r(&now, &tm);
  uint8_t regs[16] = { 0 };
  regs[2] = bcd(tm.tm_sec); regs[3] = bcd(tm.tm_min); regs[4] = bcd(tm.tm_hour); regs[5] = bcd(tm.tm_mday);
  regs[6] = (uint8_t)tm.tm_wday; regs[7] = bcd(tm.tm_mon + 1); regs[8] = bcd(tm.tm_year % 100);
  if (nwr >= 1) {
    R.reg = wr[0];
    if (nwr >= 8 && wr[0] == 0x02) {   // setting the time: seconds .. years
      struct tm s = { 0 };
      s.tm_sec = unbcd(wr[1] & 0x7f); s.tm_min = unbcd(wr[2] & 0x7f); s.tm_hour = unbcd(wr[3] & 0x3f);
      s.tm_mday = unbcd(wr[4] & 0x3f); s.tm_mon = unbcd(wr[6] & 0x1f) - 1; s.tm_year = 100 + unbcd(wr[7]);
      R.epoch_ms = (double)timegm(&s) * 1000.0; R.at = t;
    }
  }
  for (int i = 0; i < nrd; i++) rd[i] = regs[(R.reg + i) & 15];
  return nrd;
}
