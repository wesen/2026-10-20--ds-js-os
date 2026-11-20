#include "freertos/FreeRTOS.h"
// Invoked only by the research command on the owning kernel lane.
// The retained display list belongs to the service and is never touched here.
static int trial_run(paint_entry entry, const state_buffer *input, draw_buffer *draw,
                     lattice_buffer *lattice) {
  return entry(input, draw,
               &lattice[0].capacity, &lattice[1].capacity, &lattice[2].capacity,
               &lattice[3].capacity, &lattice[4].capacity, &lattice[5].capacity);
}

void mobile_painter_benchmark(mobile_painter *painter, const uint16_t cells[MOBILE_PAINTER_STATE_CELLS]) {
  enum { samples = 11, repeats = 8, kinds = 2 };
  state_buffer input = {.capacity = MOBILE_PAINTER_STATE_CELLS};
  memcpy(input.cells, cells, sizeof(input.cells));
  lattice_buffer *lattice = painter->lattice;
  lattice[1].cells[LATTICE_VERTICES] = 5;
  lattice[5].cells[LATTICE_VERTICES] = 0;
  paint_entry arms[kinds] = {painter->guarded, painter->raw};
  uint32_t cycles[kinds][samples];
  int size = trial_run(painter->entry, &input, &painter->draw, lattice);
  if (size <= 0 || size > MOBILE_PAINTER_MAX_WORDS || lattice[5].cells[LATTICE_VERTICES] != 0xabcd) {
    printf("chess3d-paired invalid-witness\n");
    return;
  }

  size_t bytes = (size_t)size * sizeof(painter->draw.words[0]);
  uint16_t *reference = heap_caps_malloc(bytes, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
  if (!reference) {
    printf("chess3d-paired memory\n");
    return;
  }
  memcpy(reference, painter->draw.words, bytes);
  bool ok = true;
  lattice[5].cells[LATTICE_VERTICES] = 0;
  for (unsigned sample = 0; sample < samples; ++sample) {
    for (unsigned offset = 0; offset < kinds; ++offset) {
      unsigned arm = (sample + offset) % kinds;
      trial_run(arms[arm], &input, &painter->draw, lattice);
      uint32_t start = esp_cpu_get_cycle_count();
      int count = 0;
      for (unsigned i = 0; i < repeats; ++i)
        count = trial_run(arms[arm], &input, &painter->draw, lattice);
      cycles[arm][sample] = (esp_cpu_get_cycle_count() - start) / repeats;
      ok &= count == size && !memcmp(reference, painter->draw.words, bytes) &&
            lattice[5].cells[LATTICE_VERTICES] == 0;
    }
  }
  printf("chess3d-paired cursor=%u count=%d equal=%s fnv=%08" PRIx32 " core=%d\n",
         (unsigned)input.cells[72], size, ok ? "yes" : "no", packed_trial_hash(reference, bytes), xPortGetCoreID());
  for (unsigned arm = 0; arm < kinds; ++arm) {
    printf("chess3d-cycles arm=%s calls=%u", arm ? "raw-pie" : "guarded-rv32", (unsigned)repeats);
    for (unsigned sample = 0; sample < samples; ++sample)
      printf(" %" PRIu32, cycles[arm][sample]);
    printf("\n");
  }
  heap_caps_free(reference);
}
