// The native world API: what a binary (a host process, a WebAssembly module, P4 machine code) sees of picocalc-os.
// A module defines nw_init and nw_on_event; the kernel calls them. Everything else here is a system call: it acts
// for the calling world only, with that world's claims, exactly like the JavaScript operations of the same name.
//
// Calls return >= 0 on success and a negative number on failure; nw_error() says why. Asynchronous calls (nw_ask,
// nw_sleep, nw_i2c) return a token at once; the result arrives later as an NW_SETTLE event with that token.
#pragma once
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

enum { NW_MESSAGE, NW_TICK, NW_START, NW_IRQ, NW_SETTLE };   // nw_event.kind
enum { NW_DONE = 0, NW_LATER = 1 };                          // what nw_on_event returns

typedef struct nw_event {
  int kind;
  const char *type;   // message type or channel name; "" for ticks, start and settles
  const char *json;   // payload or result as JSON text ("null" if none); for a failed settle, the error as a JSON string
  int json_len;
  const char *from;   // the sender world's name; "" for the kernel
  int ask;            // NW_MESSAGE: 1 if the sender waits for an answer (nw_reply or nw_reject)
  int timer;          // NW_TICK: which timer (the value nw_every returned)
  int token;          // NW_SETTLE: the token of the call that finished
  int ok;             // NW_SETTLE: 1 if it succeeded
} nw_event;

// Defined by the module.
void nw_init(void);                       // once per start: declare channels, timers and kind here
int nw_on_event(const nw_event *e);       // NW_DONE: the turn is over; NW_LATER: it will answer in a later event

// Logging and identity.
void nw_log(const char *text);
int64_t nw_now(void);                     // microseconds since boot
int nw_self(char *buf, int n);            // the world's name

// Messages. Payloads are JSON text; "" or NULL sends none.
int nw_send(const char *to, const char *type, const char *json);
int nw_publish(const char *channel, const char *json);   // a channel the world provides
// The same, for state rather than an event (a level, a mode): the kernel keeps the latest, at most 4096 bytes for all
// of a world's channels, and gives it to worlds that start later and need the channel. It goes when the world stops.
int nw_publish_retained(const char *channel, const char *json);
int nw_reply(const char *json);           // answer the ask being handled
int nw_reject(const char *why);           // fail the ask being handled; the world does not crash
int nw_ask(const char *to, const char *type, const char *json, int timeout_ms);   // a token

// Declarations, in nw_init only.
int nw_need(const char *channel);
int nw_provide(const char *channel);
int nw_every(int ms);                     // returns the timer's index
int nw_kind(const char *kind);            // "driver", "service", "app"

// Time, timers and storage.
int nw_sleep(int ms);                     // a token, settled after ms
int nw_timer(int index, int on);
int nw_store_load(char *buf, int n);      // the world's saved record (JSON), its length; 0 if none
int nw_store_save(const char *json);

// Hardware, through claims and handles.
int nw_i2c_open(const char *claim, int hz);   // "i2c0:0x1f"; a handle
int nw_i2c(int handle, const unsigned char *wr, int nwr, int nrd, int gap_ms);   // a token; settles with the bytes read, [..]
int nw_release(int handle);

int nw_error(char *buf, int n);           // why the last call failed

#ifdef __cplusplus
}
#endif
