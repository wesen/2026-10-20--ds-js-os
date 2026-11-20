idf_component_register(SRCS "main.c" "kernels.S" INCLUDE_DIRS ".")
set_property(SOURCE "kernels.S" APPEND PROPERTY OBJECT_DEPENDS
    "${CMAKE_CURRENT_SOURCE_DIR}/stock.bin;${CMAKE_CURRENT_SOURCE_DIR}/portable.bin;${CMAKE_CURRENT_SOURCE_DIR}/pie.bin")
