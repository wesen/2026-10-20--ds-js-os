// The simulated PicoCalc (sim/*.c): what its parts call in each other.
#pragma once
#include "../nucleus/nucleus.h"

void st7365p_reset(void);
void st7365p_cmd(uint8_t cmd, vtime_t t);
void st7365p_data(const uint8_t *d, int n, vtime_t t);
int st7365p_capture_png(const char *path, int scale);
void st7365p_report(void);
void stm32_init(void);
int stm32_i2c(const uint8_t *wr, int nwr, uint8_t *rd, int nrd);
void stm32_key(uint8_t code, int state);
void stm32_battery(int pct, bool charging);
int stm32_backlight(void);
