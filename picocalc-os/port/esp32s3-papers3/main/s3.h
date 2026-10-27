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
#ifdef __cplusplus
}
#endif
