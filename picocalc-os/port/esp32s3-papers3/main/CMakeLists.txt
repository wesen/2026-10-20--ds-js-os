# The device build: the nucleus with the MicroQuickJS binding, the PaperS3 port, and the js-papers3 tree
# compiled into a table (js_bundle.c) so the device reads the same files the host does.
set(OS ${CMAKE_CURRENT_LIST_DIR}/../../..)
set(ENG ${OS}/third_party/mquickjs)
set(GEN ${CMAKE_CURRENT_BINARY_DIR}/gen)

idf_component_register(
    SRCS
        "main_s3.c" "port_s3.c" "bus_s3.cpp"
        "${OS}/nucleus/kernel.c" "${OS}/nucleus/vm_mqjs.c" "${OS}/nucleus/hw.c" "${OS}/nucleus/gfx.c" "${OS}/nucleus/util.c"
        "${ENG}/mquickjs.c" "${ENG}/dtoa.c" "${ENG}/libm.c" "${ENG}/cutils.c"
    INCLUDE_DIRS "." "${OS}/nucleus" "${ENG}"
    PRIV_REQUIRES driver esp_driver_gpio esp_driver_usb_serial_jtag esp_adc esp_psram esp_timer heap vfs
)

# MicroQuickJS's standard library: ROM tables generated on the host for a 32-bit target
find_program(HOST_CC NAMES gcc cc REQUIRED)
add_custom_command(
    OUTPUT ${GEN}/mqjs_stdlib.h ${GEN}/mquickjs_atom.h
    COMMAND ${CMAKE_COMMAND} -E make_directory ${GEN}
    COMMAND ${HOST_CC} -O2 -w -I${ENG} -o ${GEN}/stdlib-gen ${ENG}/nucleus_stdlib.c ${ENG}/mquickjs_build.c
    COMMAND sh -c "${GEN}/stdlib-gen -m32 > ${GEN}/mqjs_stdlib.h 2>/dev/null"
    COMMAND sh -c "${GEN}/stdlib-gen -m32 -a > ${GEN}/mquickjs_atom.h 2>/dev/null"
    DEPENDS ${ENG}/nucleus_stdlib.c ${ENG}/mqjs_stdlib.c ${ENG}/mquickjs_build.c
    VERBATIM)
add_custom_target(mqjs_stdlib DEPENDS ${GEN}/mqjs_stdlib.h)
add_dependencies(${COMPONENT_LIB} mqjs_stdlib)
target_include_directories(${COMPONENT_LIB} BEFORE PRIVATE ${GEN})

file(READ ${ENG}/VERSION MQJS_VERSION)
string(STRIP "${MQJS_VERSION}" MQJS_VERSION)
target_compile_definitions(${COMPONENT_LIB} PRIVATE BOARD_PAPERS3 NUCLEUS_GRAY8 "NUCLEUS_FONT_HEADER=\"font_paper.h\"" "MQJS_VERSION=\"${MQJS_VERSION}\"")
target_compile_options(${COMPONENT_LIB} PRIVATE -Wno-unused-parameter -Wno-format-truncation)
set_source_files_properties(
    ${ENG}/mquickjs.c ${ENG}/dtoa.c ${ENG}/libm.c ${ENG}/cutils.c
    # as the host build: upstream's warnings are not ours to fix; -fwrapv and -fno-strict-aliasing as for QuickJS
    PROPERTIES COMPILE_OPTIONS "-w;-fwrapv;-fno-strict-aliasing")

file(GLOB_RECURSE JS_FILES CONFIGURE_DEPENDS ${OS}/js-papers3/*.js ${OS}/js-papers3/*.json)
set(BUNDLE ${CMAKE_CURRENT_BINARY_DIR}/js_bundle.c)
add_custom_command(
    OUTPUT ${BUNDLE}
    COMMAND ${CMAKE_COMMAND} -DJS_ROOT=${OS}/js-papers3 -DOUT=${BUNDLE} -P ${OS}/port/esp32p4/main/bundle_js.cmake
    DEPENDS ${JS_FILES} ${OS}/port/esp32p4/main/bundle_js.cmake
    VERBATIM)
target_sources(${COMPONENT_LIB} PRIVATE ${BUNDLE})
