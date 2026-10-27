// The simulated M5Stack PaperS3 (sim/papers3/*.c): what its parts call in each other.
#pragma once
#include "../../nucleus/nucleus.h"

#define PANEL_W 540
#define PANEL_H 960

// gt911.c: the touch controller on i2c1 at 0x5D (16-bit register addresses)
void gt911_init(void);
int gt911_i2c(const uint8_t *wr, int nwr, uint8_t *rd, int nrd, vtime_t t);
void gt911_finger(int id, bool down, int x, int y, vtime_t t);   // a finger's state from now on
int gt911_reports(void);
#define PIN_TOUCH_INT 48                  // the GT911's INT line
bool gt911_int(vtime_t t);                // INT is active (low): a report waits
bool gt911_active(void);                  // a finger is down or a lift is unreported

// bm8563.c: the real-time clock on i2c1 at 0x51
void bm8563_init(double epoch_ms);
int bm8563_i2c(const uint8_t *wr, int nwr, uint8_t *rd, int nrd, vtime_t t);

// epd.c: the ED047TC1 panel behind M5GFX's waveform engine
void epd_init(void);
vtime_t epd_update(const pixel_t *src, int stride, int x, int y, int w, int h, int mode, vtime_t t);   // how long it takes
int epd_capture_png(const char *path, int scale, bool ghosts);
void epd_report(void);
