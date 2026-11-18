/* CJI-4: what slas.c names of unistd.h (its build-time snapshot, which never runs on the board): all fail */
#pragma once
int dup(int fd);
int dup2(int a, int b);
int close(int fd);
