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
