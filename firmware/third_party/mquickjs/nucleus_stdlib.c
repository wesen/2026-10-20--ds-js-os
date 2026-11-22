/* The standard library picocalc-os worlds get on MicroQuickJS: the stock one (mqjs_stdlib.c) with the
   REPL's globals (print, console, performance, gc, load, timers) replaced by the nucleus's host calls.
   Built and run on the host to generate the ROM tables:
     cc nucleus_stdlib.c mquickjs_build.c -o gen && ./gen [-m32] > mqjs_stdlib.h && ./gen [-m32] -a > mquickjs_atom.h */
#define CONFIG_NUCLEUS
#include "mqjs_stdlib.c"
