# The device build: the nucleus and QuickJS from the picocalc-os tree, the ESP32-P4 port, and the js/ tree
# compiled into a table (js_bundle.c) so the device reads the same files the host does.
set(OS ${CMAKE_CURRENT_LIST_DIR}/../../..)
set(QJS ${OS}/third_party/quickjs)

idf_component_register(
    SRCS
        "main_p4.c" "port_p4.c" "bus_p4.c"
        "${OS}/nucleus/kernel.c" "${OS}/nucleus/vm.c" "${OS}/nucleus/hw.c" "${OS}/nucleus/gfx.c" "${OS}/nucleus/util.c"
        "${QJS}/quickjs.c" "${QJS}/libregexp.c" "${QJS}/libunicode.c" "${QJS}/cutils.c" "${QJS}/dtoa.c"
    INCLUDE_DIRS "." "${OS}/nucleus" "${QJS}"
    PRIV_REQUIRES driver esp_driver_gpio esp_driver_i2c esp_driver_spi esp_driver_uart esp_psram esp_timer heap
)

file(READ ${QJS}/VERSION QJS_VERSION)
string(STRIP "${QJS_VERSION}" QJS_VERSION)
target_compile_definitions(${COMPONENT_LIB} PRIVATE CONFIG_VERSION="${QJS_VERSION}")
target_compile_options(${COMPONENT_LIB} PRIVATE -Wno-unused-parameter -Wno-format-truncation -include ${CMAKE_CURRENT_LIST_DIR}/p4_compat.h)
set_source_files_properties(
    ${QJS}/quickjs.c ${QJS}/libregexp.c ${QJS}/libunicode.c ${QJS}/cutils.c ${QJS}/dtoa.c
    # -Wno-error=incompatible-pointer-types: upstream mixes int and int32_t (long on RISC-V newlib).
    # -fwrapv: upstream's own Makefile sets it. -fno-strict-aliasing: at -O2, GCC 14 for RISC-V miscompiles
    # QuickJS's 32-bit NaN-boxed values without it (a JS string pointer read back as 0x9017be00, the
    # compositor's first paint crashed every boot); -Og and -O2 -fno-strict-aliasing both run clean.
    PROPERTIES COMPILE_OPTIONS "-w;-Wno-error=incompatible-pointer-types;-fwrapv;-fno-strict-aliasing")

file(GLOB_RECURSE JS_FILES CONFIGURE_DEPENDS ${OS}/js/*.js ${OS}/js/*.json)
set(BUNDLE ${CMAKE_CURRENT_BINARY_DIR}/js_bundle.c)
add_custom_command(
    OUTPUT ${BUNDLE}
    COMMAND ${CMAKE_COMMAND} -DJS_ROOT=${OS}/js -DOUT=${BUNDLE} -P ${CMAKE_CURRENT_LIST_DIR}/bundle_js.cmake
    DEPENDS ${JS_FILES} ${CMAKE_CURRENT_LIST_DIR}/bundle_js.cmake
    VERBATIM)
target_sources(${COMPONENT_LIB} PRIVATE ${BUNDLE})
