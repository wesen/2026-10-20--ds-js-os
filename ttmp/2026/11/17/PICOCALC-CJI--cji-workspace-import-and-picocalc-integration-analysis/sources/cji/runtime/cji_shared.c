/* Chapter 28: what goes with the runtime and the shared unit when several worlds use them (on the
 * board, the firmware; on the host, tools/nw_multi.c's process): the one function the runtime asks
 * of the program, the Error shape, which the shared unit exports. */
#include <stdint.h>
#include "runtime.h"

extern int64_t cji_error_shape[];
int64_t error_shape(void) { return (int64_t)cji_error_shape; }
