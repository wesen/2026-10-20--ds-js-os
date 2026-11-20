idf_component_register(SRCS "main.c" "engine.S" INCLUDE_DIRS "." REQUIRES esp_timer)
set_property(SOURCE "engine.S" APPEND PROPERTY OBJECT_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/engine.bin")
