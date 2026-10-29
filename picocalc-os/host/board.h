// What the host runner (main_host.c) needs from the simulated board it runs: sim/board.c for the PicoCalc,
// sim/papers3/board.c for the PaperS3. Script commands the runner does not know go to board_command.
#pragma once
void board_init(void);
int board_command(const char *cmd, char *rest, int lineno);   // 1 done, 0 not a command of this board, -1 error
int board_capture(const char *path, int scale, const char *opts);   // the panel as a PNG
void board_report(void);                                       // the "panel" command
extern const char *board_commands_help;
void host_store_dir(const char *dir);   // host/port_host.c: keep the persistent store in files under dir (-s)
