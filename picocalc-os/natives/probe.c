// probe: a native world that tries to leave its sandbox, for tests/test_native_worlds.py. Its name picks the attempt
// (manifest entries probe_open, probe_socket, ... all run this binary); it logs what it is about to do, then does it.
// Each attempt except alloc and stdio must kill the process; those two must fail inside it, and the world carries on.
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/socket.h>
#include <sys/syscall.h>
#include <unistd.h>
#include "nw.h"

void nw_init(void) {}

static void attempt(const char *what) {
  char line[96];
  snprintf(line, sizeof line, "TEST probe %s", what);
  nw_log(line);
  if (!strcmp(what, "open")) open("/etc/hostname", O_RDONLY);
  else if (!strcmp(what, "socket")) socket(AF_INET, SOCK_STREAM, 0);
  else if (!strcmp(what, "fork")) syscall(SYS_fork);
  else if (!strcmp(what, "exec")) { char *argv[] = { "sh", NULL }; execve("/bin/sh", argv, NULL); }
  else if (!strcmp(what, "execat")) { char *argv[] = { "sh", NULL }; syscall(SYS_execveat, AT_FDCWD, "/bin/sh", argv, NULL, 0); }
  else if (!strcmp(what, "kill")) syscall(SYS_kill, 1, 0);   // signalling another process
  else if (!strcmp(what, "prlimit")) { struct rlimit r = { 0, 0 }; syscall(SYS_prlimit64, 1, RLIMIT_NOFILE, &r, NULL); }
  else if (!strcmp(what, "stdio")) {   // printf and writes to standard error fail quietly: the process lives on
    printf("into nowhere\n");
    fflush(stdout);
    snprintf(line, sizeof line, "TEST stdio write=%d", (int)write(2, "x", 1));
    nw_log(line);
    return;
  } else if (!strcmp(what, "alloc")) {
    void *p = malloc((size_t)64 << 20);   // 64 MB, far over the manifest's mem_kb
    snprintf(line, sizeof line, "TEST alloc %s", p ? "succeeded" : "failed");
    nw_log(line);
    free(p);
    return;
  }
  nw_log("TEST probe survived");
}

int nw_on_event(const nw_event *e) {
  if (e->kind != NW_START) return NW_DONE;
  char me[32];
  nw_self(me, sizeof me);
  attempt(strncmp(me, "probe_", 6) ? me : me + 6);
  return NW_DONE;
}
