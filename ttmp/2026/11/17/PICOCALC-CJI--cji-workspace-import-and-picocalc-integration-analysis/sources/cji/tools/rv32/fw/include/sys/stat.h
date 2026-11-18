/* CJI-4: what slas.c names of sys/stat.h (its build-time snapshot, which never runs on the board) */
#pragma once
#include <stddef.h>
struct stat { long st_size; };
int fstat(int fd, struct stat *st);
