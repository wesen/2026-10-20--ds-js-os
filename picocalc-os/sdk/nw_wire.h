// The wire between picocalc-os and a native world that runs as a process (host/native_proc.c and sdk/nw_proc.c).
// One frame per SOCK_SEQPACKET datagram: this header, then the byte strings n[0], n[1], n[2] long, in order.
//
//   NW_F_EVENT   kernel -> binary   i = { kind, ask (a message) or ok (a settle), timer }, v = token (a settle),
//                                   strings: type, json, from
//   NW_F_CALL    binary -> kernel   i = { system call, a, b }, v = c (a third integer), strings: up to three arguments
//   NW_F_RESULT  kernel -> binary   v = the result (< 0: failed), string 0: the text it returns, or why it failed
//   NW_F_END     binary -> kernel   i[0] = NW_DONE or NW_LATER: the event has been handled
//
// Both ends are built for the same machine, so the header is sent as it is in memory.
#pragma once
#include <stdint.h>

#define NW_WIRE_MAGIC 0x3130574eu   // "NW01"
enum { NW_F_EVENT = 1, NW_F_CALL, NW_F_RESULT, NW_F_END };
#define NW_WIRE_INIT 5              // the event kind that runs nw_init (the others are nw.h's NW_MESSAGE ... NW_SETTLE)
// System calls, as numbered in nucleus/nucleus.h (host/native_proc.c checks that they agree)
enum {
  NW_CALL_LOG = 1, NW_CALL_NOW, NW_CALL_SELF, NW_CALL_SEND, NW_CALL_PUBLISH, NW_CALL_REPLY, NW_CALL_REJECT,
  NW_CALL_NEED, NW_CALL_PROVIDE, NW_CALL_EVERY, NW_CALL_KIND, NW_CALL_ASK, NW_CALL_SLEEP, NW_CALL_I2C_OPEN,
  NW_CALL_I2C, NW_CALL_RELEASE, NW_CALL_STORE_LOAD, NW_CALL_STORE_SAVE, NW_CALL_TIMER, NW_CALL_SCREEN, NW_CALL_PRESENT,
  NW_CALL_COUNT
};
typedef struct {
  uint32_t magic, op;
  int32_t i[3];
  int32_t pad;
  int64_t v;
  uint32_t n[3];
  uint32_t pad2;
} nw_frame_t;
#define NW_WIRE_STR_MAX 65536
#define NW_FRAME_MAX (sizeof(nw_frame_t) + 3 * NW_WIRE_STR_MAX)
