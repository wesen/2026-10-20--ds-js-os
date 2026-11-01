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

// The screen: the tree of ui nodes it shows (a JSON object, as JavaScript's ui.* builds: {"t":"col","kids":[...]}; see
// sdk/nw_ui.h) and the hint bar's text. At any time; the kernel shows it after the current event if it changed, kept
// for a compositor that restarts. At most 16 KB with the hints (120 bytes).
int nw_screen(const char *tree_json, const char *hints);

// Declarations, in nw_init only.
int nw_need(const char *channel);
int nw_provide(const char *channel);
int nw_every(int ms);                     // returns the timer's index
int nw_kind(const char *kind);            // "driver", "service", "app"
// What it shows on the launcher (an "app"). An app from storage is always titled by its world name and has no letter.
int nw_title(const char *title);          // at most 31 bytes
int nw_icon(const char *ops_json);        // drawing operations in a 40 x 30 box, a JSON array of at most 1024 bytes:
                                          // ["rect"|"fill", x, y, w, h, colour?], ["line", x1, y1, x2, y2, colour?],
                                          // ["text", x, y, "A", "s"|"m", colour?]; colour: "accent", "muted", ...
int nw_about(const char *text);           // one line about it, at most 159 bytes
int nw_key(const char *letter);           // its shortcut on the launcher: one of a-z, 0-9

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
