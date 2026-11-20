set(qjs quickjs.c libregexp.c libunicode.c cutils.c dtoa.c)
idf_component_register(SRCS trial.c typed_lex_index.c payload.S ${qjs} INCLUDE_DIRS "."
                       REQUIRES esp_timer esp_psram esp_hw_support fatfs wear_levelling spi_flash)
file(READ "${CMAKE_CURRENT_SOURCE_DIR}/VERSION" qversion)
string(STRIP "${qversion}" qversion)
target_compile_definitions(${COMPONENT_LIB} PRIVATE CONFIG_VERSION="${qversion}")
set_source_files_properties(${qjs} PROPERTIES COMPILE_OPTIONS "-w;-Wno-error=incompatible-pointer-types;-fwrapv;-fno-strict-aliasing")
target_compile_options(${COMPONENT_LIB} PRIVATE "$<$<COMPILE_LANGUAGE:C>:-include;${CMAKE_CURRENT_SOURCE_DIR}/p4_compat.h>")
