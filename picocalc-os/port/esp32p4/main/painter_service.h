#pragma once

#include "nucleus.h"

void p4_painter_receive(world_t *receiver, world_t *sender, bool source, const uint8_t *data, size_t length);
void p4_painter_poll(void);
void p4_painter_status(void);
bool p4_painter_draw(dmabuf_t *fb, char *hints, size_t capacity);
