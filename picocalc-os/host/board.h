// What the host runner (main_host.c) needs from the simulated board it runs: sim/board.c for the PicoCalc,
// sim/papers3/board.c for the PaperS3. Script commands the runner does not know go to board_command.
#pragma once
void board_init(void);
int board_command(const char *cmd, char *rest, int lineno);   // 1 done, 0 not a command of this board, -1 error
int board_capture(const char *path, int scale, const char *opts);   // the panel as a PNG
void board_report(void);                                       // the "panel" command
extern const char *board_commands_help;
// The board's power. A board that can switch itself off (the PaperS3: port_power_off sets K.halted) keeps its own
// time across the power cycles: board_now() is that time; the kernel's K.vnow starts again from 0 at each boot.
vtime_t board_now(void);
void board_off(void);                  // the kernel halted: the parts that lose power reset (call before kernel_reset)
void board_pass(vtime_t us);           // time passes while the board is off
vtime_t board_next_wake(void);         // the board time at which something power-cycles it (on or off), or VT_INF
vtime_t board_take_wake(void);         // when that happened since the last call (it may happen during a run), or VT_INF
void board_wake(const char *why);      // it is switched on ("button", "rtc"); the runner boots the kernel next
void host_store_dir(const char *dir);   // host/port_host.c: keep the persistent store in files under dir (-s)
