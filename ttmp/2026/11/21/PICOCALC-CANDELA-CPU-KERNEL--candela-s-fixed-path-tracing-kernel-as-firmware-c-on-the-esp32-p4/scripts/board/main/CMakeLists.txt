# The benchmark app: bench.c and microbench.c, plus what 07-stage-board.sh copies in from 04-build.py board:
# registry.c, blobs.S, libcdl.a (every arm's kernel, post pass and scene sections, compiled once outside IDF
# with the flags the counting interpreter's programs were built with), cdl_api.h and mode.h.
idf_component_register(SRCS "bench.c" "microbench.c" "registry.c" "blobs.S" INCLUDE_DIRS "."
                       PRIV_REQUIRES esp_timer esp_psram esp_hw_support)
add_prebuilt_library(cdl "${CMAKE_CURRENT_LIST_DIR}/libcdl.a" PRIV_REQUIRES newlib)
target_link_libraries(${COMPONENT_LIB} PRIVATE cdl m)
target_compile_options(${COMPONENT_LIB} PRIVATE -Wno-format)
