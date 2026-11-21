idf_component_register(SRCS "bench.c" "programs.S" INCLUDE_DIRS "." REQUIRES esp_timer)
set_property(SOURCE "programs.S" APPEND PROPERTY OBJECT_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/inputs.json")
