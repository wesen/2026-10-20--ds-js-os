file(GLOB src_files "*.c" "*.S")
# The research image stages the same five QuickJS translation units used by the playable port.
file(GLOB qjs_files "quickjs/*.c")
idf_component_register(SRCS ${src_files} ${qjs_files} INCLUDE_DIRS "." "quickjs"
                       PRIV_REQUIRES esp_timer esp_psram)
file(READ ${CMAKE_CURRENT_LIST_DIR}/quickjs/VERSION qjs_version)
string(STRIP "${qjs_version}" qjs_version)
target_compile_definitions(${COMPONENT_LIB} PRIVATE CONFIG_VERSION="${qjs_version}")
target_compile_options(${COMPONENT_LIB} PRIVATE -O3 -Wno-error=misleading-indentation -Wno-trigraphs)
set_source_files_properties(${qjs_files} PROPERTIES
    COMPILE_OPTIONS "-O2;-w;-Wno-error=incompatible-pointer-types;-fwrapv;-fno-strict-aliasing;-include;${CMAKE_CURRENT_LIST_DIR}/p4_compat.h")
