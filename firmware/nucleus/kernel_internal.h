// The kernel's own declarations, shared by kernel.c (the queue, logging, worlds, the lane), kernel_channels.c
// (deferred effects, channels, asks), kernel_supervision.c (crashes, restarts, apps, boot) and kernel_reports.c.
// Nothing outside those four files includes this.
#pragma once
#include "nucleus.h"

extern vtime_t apply_at;     // while a segment's effects are applied: the time it ended
extern vtime_t frozen_now;   // while a crash is handled: the time it happened
#if PICOCALC_MOBILE_PAINTER
extern unsigned painter_pending[2];   // allocations across deferred effects, events and mailboxes
#endif

int restarts_of(world_t *W);
void uart_fault(world_t *W, const char *why, const char *detail);
bool channels_allowed(world_t *W);
bool alive(world_t *W);
void apply_deferred(vtime_t at);
void discard_deferred(void);
void drop_retained(world_t *W);
char *frame_message(world_t *W);
void replay_retained(world_t *T);
void settle_ask(int id, int ok, const char *json, const int *hs, int nh);
void clear_turn(world_t *W);
void start_timers(world_t *W, vtime_t at);
int boot_world(world_t *W);
void publish_status(world_t *W, const char *state, const char *why, vtime_t in_us);
