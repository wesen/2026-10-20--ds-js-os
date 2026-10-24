// A model of the PicoCalc's STM32 "southbridge" at I2C address 0x1F, after clockworkpi/PicoCalc
// Code/picocalc_keyboard: a register read is a one-byte write of the register number followed by a
// two-byte read; a write sets bit 7 of the register number. It serves the key FIFO, the screen and
// keyboard backlights and the battery level.
#include <string.h>
#include "../nucleus/nucleus.h"

enum { REG_VER = 0x01, REG_CFG = 0x02, REG_INT = 0x03, REG_KEY = 0x04, REG_BKL = 0x05, REG_DEB = 0x06,
       REG_FRQ = 0x07, REG_RST = 0x08, REG_FIF = 0x09, REG_BK2 = 0x0A, REG_BAT = 0x0B, REG_OFF = 0x0E };
#define FIFO_SIZE 31
#define WRITE_MASK 0x80

static struct {
  uint8_t regs[16];
  struct { uint8_t state, key; } fifo[FIFO_SIZE];
  int head, count;
  int overflows;
} S;

void stm32_init(void) {
  memset(&S, 0, sizeof(S));
  S.regs[REG_CFG] = 0xD2;            // CFG_OVERFLOW_INT | CFG_KEY_INT | CFG_USE_MODS | CFG_REPORT_MODS
  S.regs[REG_DEB] = 10; S.regs[REG_FRQ] = 5;
  S.regs[REG_BKL] = 16 * 2;          // LCD_BACKLIGHT_STEP * 2
  S.regs[REG_BAT] = 82;              // 82 %, not charging
}

void stm32_key(uint8_t code, int state) {
  if (S.count == FIFO_SIZE) { S.overflows++; return; }
  int i = (S.head + S.count) % FIFO_SIZE;
  S.fifo[i].state = (uint8_t)state; S.fifo[i].key = code;
  S.count++;
}

void stm32_battery(int pct, bool charging) { S.regs[REG_BAT] = (uint8_t)((pct & 0x7f) | (charging ? 0x80 : 0)); }
int stm32_backlight(void) { return S.regs[REG_BKL]; }

// One I2C transaction with the device, as the firmware does it: a write (the register number, with
// bit 7 set for a write of the byte after it) prepares a two-byte answer, popping the FIFO for REG_FIF;
// a read returns the prepared answer and clears it. A transaction may do both, write then read.
static uint8_t answer[2];
int stm32_i2c(const uint8_t *wr, int nwr, uint8_t *rd, int nrd) {
  if (nwr >= 1) {
    const bool is_write = wr[0] & WRITE_MASK;
    const uint8_t reg = wr[0] & ~WRITE_MASK;
    if (is_write && nwr >= 2 && reg < 16) {
      if (reg == REG_BKL || reg == REG_BK2 || reg == REG_CFG || reg == REG_DEB || reg == REG_FRQ) S.regs[reg] = wr[1];
      if (reg == REG_RST) stm32_init();
    }
    answer[0] = answer[1] = 0;
    switch (reg) {
      case REG_VER: answer[1] = 0x17; break;
      case REG_FIF:
        if (S.count) { answer[0] = S.fifo[S.head].state; answer[1] = S.fifo[S.head].key; S.head = (S.head + 1) % FIFO_SIZE; S.count--; }
        break;
      case REG_KEY: answer[0] = (uint8_t)S.count; break;
      case REG_BKL: case REG_BK2: case REG_BAT: answer[0] = reg; answer[1] = S.regs[reg]; break;
      case REG_OFF: answer[0] = reg; answer[1] = 1; break;
      default: answer[0] = reg; answer[1] = reg < 16 ? S.regs[reg] : 0; break;
    }
  }
  int n = nrd < 2 ? nrd : 2;
  for (int i = 0; i < n; i++) rd[i] = answer[i];
  if (nrd > 0) answer[0] = answer[1] = 0;
  return n;
}
