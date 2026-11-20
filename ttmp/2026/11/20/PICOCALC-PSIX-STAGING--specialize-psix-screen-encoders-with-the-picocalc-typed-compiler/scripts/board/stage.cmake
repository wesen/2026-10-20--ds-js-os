set(stage_elf "${CMAKE_CURRENT_BINARY_DIR}/staging-slot.elf")
add_custom_command(OUTPUT "${stage_elf}"
    COMMAND ${CMAKE_C_COMPILER} ${ELF_FLAGS} -o "${stage_elf}"
            "${CMAKE_CURRENT_LIST_DIR}/entry.c" "${CMAKE_CURRENT_LIST_DIR}/slot.S"
    DEPENDS "${CMAKE_CURRENT_LIST_DIR}/entry.c" "${CMAKE_CURRENT_LIST_DIR}/slot.S" VERBATIM)
list(APPEND BUNDLE_EXTRA "stage/slot.elf=${stage_elf}")
list(APPEND BUNDLE_EXTRA_DEPS "${stage_elf}")
foreach(asset link.js generator.js primitives.typed expected.elf adaptive.js)
    list(APPEND BUNDLE_EXTRA "stage/${asset}=${CMAKE_CURRENT_LIST_DIR}/${asset}")
    list(APPEND BUNDLE_EXTRA_DEPS "${CMAKE_CURRENT_LIST_DIR}/${asset}")
endforeach()
set_source_files_properties(staging_trial.c PROPERTIES COMPILE_OPTIONS "-Wno-unused-function")

if(EXISTS "${CMAKE_CURRENT_LIST_DIR}/patch.h")
    set_property(SOURCE staging_trial.c APPEND PROPERTY COMPILE_DEFINITIONS PSIX_PATCH_FOLLOWUP=1)
    set(stage_table "${CMAKE_CURRENT_BINARY_DIR}/stage-table.elf")
    add_custom_command(OUTPUT "${stage_table}"
        COMMAND ${CMAKE_C_COMPILER} ${ELF_FLAGS} -o "${stage_table}" "${CMAKE_CURRENT_LIST_DIR}/relocated-table.c"
        DEPENDS "${CMAKE_CURRENT_LIST_DIR}/relocated-table.c" "${CMAKE_CURRENT_LIST_DIR}/descriptor.h"
                "${CMAKE_CURRENT_LIST_DIR}/stage_fixtures.h" VERBATIM)
    list(APPEND BUNDLE_EXTRA "stage/table.elf=${stage_table}")
    list(APPEND BUNDLE_EXTRA_DEPS "${stage_table}")
endif()
