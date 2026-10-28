// What the PaperS3 port's files share: the board's pins, and the queue through which the bus workers and the
// console hand work to the kernel task. Only the kernel task touches K.
#pragma once
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "nucleus.h"

// verified in M5GFX's board config (M5GFX.cpp, board_M5PaperS3) and esp32-s3-m5/0109's hal.cpp
#define PIN_I2C1_SDA 41
#define PIN_I2C1_SCL 42
#define PIN_PWROFF 44        // the power latch's off pulse: held low, or the board turns itself off
#define PIN_CHARGE 4         // the charger's status: low while charging
#define BAT_ADC_CHANNEL 2    // ADC1 channel 2 = GPIO3, behind a 1:2 divider

// For the kernel task: a finished bus transfer, a console command (line != NULL) or a watched pin that fired
// (irq != 0: the handle, from the GPIO interrupt).
typedef struct {
  char *line;
  int irq;
  int bus, w, epoch, promise, ok, buf;
  vtime_t t0, t1;
  uint32_t bytes;
  char json[200];
} kmsg_t;
extern QueueHandle_t s3_kq;

#ifdef __cplusplus
extern "C" {
#endif
void bus_s3_init(void);
void bus_s3_done(const kmsg_t *m);    // the kernel task's side of a finished transfer
void console_exec(char *line);        // main_s3.c, on the kernel task
void port_s3_init(void);
// Power management: with nothing held the chip scales its clock down and light-sleeps between events. Held while
// work runs: PM_KERNEL (worlds at full speed), PM_EPD (a whole panel update: full speed, no sleep), PM_I2C (a
// transfer: a steady peripheral clock). No-ops when CONFIG_PM_ENABLE is off (the QEMU build).
enum { PM_KERNEL, PM_EPD, PM_I2C, PM_LOCKS };
void s3_pm_init(void);
void s3_pm_hold(int which);
void s3_pm_release(int which);
#ifdef __cplusplus
}
#endif
