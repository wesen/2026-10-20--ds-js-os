idf_component_register(SRCS "main.c" "stock.c" "raster_edges.c" "raster_scalar.c" "raster_pie.c"
  "gfx.c" "util.c" "span.S" "fixtures.S" "damage.c" "damage-benchmark.c"
  INCLUDE_DIRS ".")
target_compile_options(${COMPONENT_LIB} PRIVATE -ffunction-sections -fdata-sections)
set_property(SOURCE "fixtures.S" APPEND PROPERTY OBJECT_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/fixtures.bin")
