// Execute search entry points in complete, normally linked game images using ESP-IDF's PSRAM ELF loader.
#include <inttypes.h>
#include <stdio.h>
#include <string.h>
#include "esp_elf.h"
#include "esp_heap_caps.h"
#include "esp_memory_utils.h"
#include "esp_private/esp_clk.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

enum { CAPACITY = 16384, BLOCKS = 6 };
typedef struct { uint32_t capacity; uint16_t cells[CAPACITY]; } board_buffer;
typedef struct { int position, depth, budget; int32_t expected[5]; } bench_case;
#include "bench-data.h"
#include "addresses.h"
extern unsigned char old_start[] asm("_binary_stock_elf_start");
extern unsigned char old_end[] asm("_binary_stock_elf_end");
extern unsigned char new_start[] asm("_binary_promoted_elf_start");
extern unsigned char new_end[] asm("_binary_promoted_elf_end");
extern long long __divdi3(long long, long long);
extern double __floatsidf(int);

static uintptr_t resolve_symbol(const char *name) {
#define SYMBOL(x) if (!strcmp(name, #x)) return (uintptr_t)x
    SYMBOL(__divdi3); SYMBOL(__floatsidf); SYMBOL(memcpy); SYMBOL(memmove);
    SYMBOL(snprintf); SYMBOL(strlen); SYMBOL(strcmp);
#undef SYMBOL
    return 0;
}

static int run_arm(unsigned block, unsigned which, board_buffer *board, int32_t *state) {
    const struct { unsigned char *first, *end; unsigned begin, slice; } arms[] = {
        {old_start,old_end,STOCK_chessStartSearch,STOCK_chessSearchSlice},
        {new_start,new_end,PROMOTED_chessStartSearch,PROMOTED_chessSearchSlice}
    };
    const int selected[] = {0,6,15};
    esp_elf_t elf = {0};
    esp_elf_init(&elf);
    if (esp_elf_relocate(&elf, arms[which].first, arms[which].end-arms[which].first)) return 0;
    bool ok=esp_ptr_external_ram(elf.psegment);
    const unsigned offsets[] = {arms[which].begin, arms[which].slice};
    for (int j=0;j<2;j++) ok &= offsets[j]>=elf.svaddr && offsets[j]-elf.svaddr+4<=elf.segment_size;
    if (!ok) {esp_elf_deinit(&elf); return 0;}
    typedef int (*start_fn)(board_buffer *, int32_t *, int, int, int);
    typedef int (*slice_fn)(board_buffer *, int32_t *, int);
    start_fn start=(start_fn)(elf.psegment + (offsets[0]-elf.svaddr));
    slice_fn slice=(slice_fn)(elf.psegment + (offsets[1]-elf.svaddr));
    printf("PROMO_LOAD %u %u %p %p %p\n",block,which,elf.psegment,(void *)start,(void *)slice);
    for (unsigned i=0; i<sizeof(selected)/sizeof(selected[0]); ++i) {
        const int index=selected[(i+block)%3];
        const bench_case *row=&cases[index];
        memset(board,0,sizeof(*board));
        board->capacity=CAPACITY;
        memcpy(board->cells,positions[row->position],sizeof(positions[0]));
        memset(state,0,64*sizeof(*state));
        int slices=0;
        int64_t begin=esp_timer_get_time();
        start(board,state,row->depth,row->budget,1);
        while (state[FIELD_running] && slices<=row->expected[4]) {slice(board,state,SLICE_STEPS); ++slices;}
        int64_t elapsed=esp_timer_get_time()-begin;
        const int32_t actual[]={state[FIELD_bestMove],state[FIELD_score],state[FIELD_completed],state[FIELD_nodes],slices};
        ok &= !memcmp(actual,row->expected,sizeof(actual)) && board->capacity==CAPACITY &&
            !memcmp(board->cells,positions[row->position],sizeof(positions[0]));
        printf("PROMO_ROW %u %u %d %" PRId64 " %ld %ld %ld %ld %d %d\n",
               block,which,index,elapsed,(long)actual[0],(long)actual[1],(long)actual[2],(long)actual[3],slices,(int)ok);
        vTaskDelay(1);
    }
    esp_elf_deinit(&elf);
    return ok;
}

void app_main(void) {
    vTaskDelay(pdMS_TO_TICKS(4000));
    board_buffer *board=heap_caps_malloc(sizeof(*board),MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    int32_t *state=heap_caps_malloc(64*sizeof(*state),MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    bool ok=board && state && esp_ptr_external_ram(board) && esp_ptr_external_ram(state);
    printf("PROMO_BEGIN %d %d %d %d\n",esp_clk_cpu_freq(),xPortGetCoreID(),BLOCKS,(int)ok);
    elf_set_symbol_resolver(resolve_symbol);
    for (unsigned b=0;b<BLOCKS && ok;++b)
        for(unsigned j=0;j<2 && ok;++j) ok=run_arm(b,(b+j)%2,board,state);
    printf("PROMO_DONE %s\n",ok?"ok":"failed");
    fflush(stdout);
    free(board);free(state);
}
