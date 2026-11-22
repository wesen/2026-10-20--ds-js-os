// battery: a driver written in C++, the native counterpart of part of js/drivers/power.js. It reads the battery
// register of the keyboard controller (register 0x0B on i2c0:0x1f) every two seconds, publishes the level on the
// "battery" channel when it changes, and answers "level" asks. A read is asynchronous: an ask that arrives while
// one is in flight is answered when it settles (NW_LATER), as a JavaScript driver would await it.
#include <array>
#include <cstdio>
#include <string>
#include "nw.h"
#include "nw_json.h"

namespace {

class Battery {
 public:
  void init() {
    nw_kind("driver");
    nw_provide("battery");
    nw_every(2000);
  }

  int on_event(const nw_event &e) {
    switch (e.kind) {
      case NW_START:
        dev_ = nw_i2c_open("i2c0:0x1f", 10000);
        if (dev_ < 0) return fail("open");
        return read();
      case NW_TICK:
        return read();
      case NW_SETTLE:
        if (e.token != pending_) return NW_DONE;
        pending_ = -1;
        if (e.ok) update(e.json);
        else log("battery: " + std::string(e.json));
        if (waiting_) { waiting_ = false; nw_reply(level_json().c_str()); }
        return NW_DONE;
      case NW_MESSAGE:
        if (std::string(e.type) != "level") return NW_DONE;
        if (pending_ < 0 && read() < 0) return NW_DONE;
        waiting_ = true;
        return NW_LATER;
    }
    return NW_DONE;
  }

 private:
  static constexpr unsigned char kRegBat = 0x0b;
  int dev_ = -1, pending_ = -1, pct_ = -1;
  bool charging_ = false, waiting_ = false;

  int read() {
    if (pending_ >= 0 || dev_ < 0) return NW_DONE;
    pending_ = nw_i2c(dev_, &kRegBat, 1, 2, 2);   // the register number, 2 ms for the controller, two bytes back
    return pending_ < 0 ? fail("read") : NW_DONE;
  }

  void update(const char *json) {
    std::array<unsigned char, 2> rd{};
    if (nw_json_bytes(json, rd.data(), static_cast<int>(rd.size())) != 2 || rd[0] != kRegBat) return;
    int pct = rd[1] & 0x7f;
    bool charging = rd[1] & 0x80;
    if (pct == pct_ && charging == charging_) return;
    pct_ = pct; charging_ = charging;
    nw_publish("battery", level_json().c_str());
    log("battery: " + std::to_string(pct_) + "%" + (charging_ ? ", charging" : ""));
  }

  std::string level_json() const {
    return "{\"pct\":" + std::to_string(pct_) + ",\"charging\":" + (charging_ ? "true" : "false") + "}";
  }

  int fail(const char *what) {
    std::array<char, 200> err{};
    nw_error(err.data(), static_cast<int>(err.size()));
    log(std::string("battery: ") + what + " failed: " + err.data());
    return NW_DONE;
  }

  static void log(const std::string &s) { nw_log(s.c_str()); }
};

Battery battery;

}  // namespace

extern "C" void nw_init(void) { battery.init(); }
extern "C" int nw_on_event(const nw_event *e) { return battery.on_event(*e); }
