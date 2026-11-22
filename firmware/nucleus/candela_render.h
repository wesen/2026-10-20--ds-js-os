// The seam between the Candela world (PICOCALC-CANDELA-WORLD) and the firmware's Candela renderer.
//
// The world runs Candela's front end: it builds a scene, compiles it to a WGSL program, packs the scene's buffers
// and fills the frame uniforms. It hands the renderer a program (cr_program_t) and the packed buffers
// (cr_scene_t) through its host object (__candela.render.start / update / stop, nucleus/candela_world.c), and
// gets a "candela.frame" message back after every pass. The world never touches pixels; the renderer never runs
// JavaScript.
//
// The renderer is the port's: nucleus/candela_render_stub.c (this ticket) validates and keeps what it is given
// and reports passes on the kernel's clock without drawing. PICOCALC-CANDELA-FIRST-LIGHT replaces it with the
// fixed kernel of PICOCALC-CANDELA-CPU-KERNEL (cdl_api.h: NS_bind with cdl_buffers, NS_render_span) and the
// section interpreter of PICOCALC-CANDELA-SECTIONS, on a worker task. Every call here is on the kernel task.
#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "nucleus.h"

// The packed arrays, in pack()'s order. Each is a whole number of vec4 rows (4 floats), as Candela's GPU
// buffers are: U (uniforms, with the frame uniforms filled), O (objects), LI (lights), BV (BVH nodes), SDs (the
// static head of the scene-data buffer) and SDd (its dynamic tail, which starts at row dyn_base of that buffer).
enum { CR_U, CR_O, CR_LI, CR_BV, CR_SDS, CR_SDD, CR_ARRAYS };
#define CR_SCENE_MAGIC 0x31534443u   // "CDS1"
#define CR_RESET 1u                  // restart accumulation (every update the world sends today)

// One packed scene, in one malloc'd block: the renderer owns it once start or update returns 0 and frees it with
// free() when it no longer needs it. data[] holds the arrays back to back at offset[i] (in floats).
typedef struct {
  uint32_t magic, gen, flags;
  uint32_t width, height;     // the frame the uniforms were filled for (U[0], U[1])
  uint32_t dyn_base;          // pack().dynBase: SD row of SDd's first row
  uint32_t rows[CR_ARRAYS];   // vec4 rows of each array
  uint32_t offset[CR_ARRAYS]; // float offset of each array in data[]
  uint32_t bytes;             // of the whole block
  float data[];
} cr_scene_t;

// The program: what a compiled scene asks of the kernel, in one malloc'd block (the texts and bytecode follow the
// struct). The renderer owns it once start returns 0 and frees it with cr_program_free (free). The fixed kernel digest is the SHA-256 of the fixed WGSL the scene was compiled against
// (worlds/candela-world/program.js fixedText(): PRELUDE, SPECTRAL, the GGX table, CORE, metalAt, hitAlbedo,
// hitEmission, PATH); a renderer refuses a program whose digest differs from the kernel it was built from.
typedef struct {
  char scene_id[48];
  char fixed_kernel_sha256[65];
  bool spectral;
  char integrator[24];        // engine.integrator.__integrator: "path" in T0
  // post: what the display pass needs (worlds/candela-world/frame.js postOptions)
  char tonemap[16];
  bool denoise;
  char exposure[12];          // "auto" (the renderer meters), "fixed", "param" or "physical"
  bool has_ev; float ev;      // the EV for every mode but "auto"
  // the generated sections (program.js splitProgram): WGSL text, for PICOCALC-CANDELA-SECTIONS' translator
  char *field_wgsl; size_t field_len;   // sdfCode + hfCode + densCode
  char *mat_wgsl; size_t mat_len;       // helpers, mat_k, evalMaterial, customKernel
  uint8_t *sections; size_t sections_len;   // SECTIONS bytecode once the world translates sections (NULL today)
} cr_program_t;
void cr_program_free(cr_program_t *p);

// The port's renderer. 0 on success (the renderer now owns its arguments), -1 with why (the caller frees them).
int port_candela_start(int world, cr_program_t *program, cr_scene_t *scene, char *why, size_t n);
int port_candela_update(int world, cr_scene_t *scene, char *why, size_t n);   // new buffers for the running program
void port_candela_stop(int world);                                            // also when the world is torn down
char *port_candela_status_json(void);                                         // malloc'd JSON

// The renderer finished a pass of generation gen: the world gets "candela.frame" {gen, pass, spp, us} on the lane.
void candela_world_frame(int world, uint32_t gen, uint32_t pass, uint32_t spp, vtime_t pass_us);
