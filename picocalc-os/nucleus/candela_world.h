// The Candela world's host side (PICOCALC-CANDELA-WORLD): a module loader that reads Candela's front end as
// QuickJS bytecode from candela/front.qbc (written by tools/gen/candela/candela-bc when the firmware is built), and the
// __candela host object the world's modules use (clocks, memory and stack meters, digests, the long segment,
// scene texts, file-named compilation, and the renderer of candela_render.h).
#pragma once
#include "nucleus.h"
#include "quickjs.h"

#define CANDELA_BUNDLE "candela/front.qbc"
int candela_world_install(world_t *W, JSContext *ctx);   // from vm_create, after the prelude; -1 with W->last_error
void candela_world_dispose(world_t *W);                   // from vm_dispose: stops the renderer if W owns it
