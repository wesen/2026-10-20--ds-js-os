// What the ESP32-P4 port's files share: the board's pins, and the queue through which the bus workers and the
// console hand work to the kernel task. Only the kernel task touches K.
#pragma once
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "nucleus.h"

// The same-position RPico adapter (verified in esp32-s3-m5/0099).
#define PIN_KBD_SDA 50
#define PIN_KBD_SCL 49
#define PIN_LCD_SCK 3
#define PIN_LCD_MOSI 2
#define PIN_LCD_CS 7
#define PIN_LCD_DC 24
#define PIN_LCD_RST 25

// A finished bus transfer, or (line != NULL) a console command, for the kernel task.
typedef struct {
  char *line;
  int bus, w, epoch, promise, ok, buf;
  vtime_t t0, t1;
  uint32_t bytes;
  char json[96];
} kmsg_t;
extern QueueHandle_t p4_kq;

void bus_p4_init(void);
void bus_p4_done(const kmsg_t *m);    // the kernel task's side of a finished transfer
void console_exec(char *line);        // main_p4.c, on the kernel task
