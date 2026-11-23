# picocalc-os for the PicoCalc with a Waveshare ESP32-P4-WIFI6 in place of the Pico.
#   source ~/esp/esp-idf-5.4.2/export.sh && idf.py build && idf.py -p PORT flash
cmake_minimum_required(VERSION 3.16)
# Network dependencies are deliberately opt-in: an ordinary offline build still needs only ESP-IDF.
# Use a separate build/config: idf.py -B build-agent -D PICOCALC_AGENT_WIFI=ON
#   -D SDKCONFIG=sdkconfig.agent -D SDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.agent-wifi" build
# The profile's Typed apps (apps/typed/NAME/app.json), compiled to RV32 on the handheld: a list such as
# "chess;agenda;editor;files" (profiles/*.env APPS). They run as ELF modules, so they turn on PICOCALC_NATIVE_ELF.
set(PICOCALC_APPS "" CACHE STRING "Typed apps compiled on the handheld (apps/typed/NAME/app.json), separated by semicolons")
option(PICOCALC_AGENT_WIFI "Build the direct HTTPS agent transport over the onboard C6" OFF)
if(PICOCALC_AGENT_WIFI)
    list(APPEND EXTRA_COMPONENT_DIRS "${CMAKE_CURRENT_LIST_DIR}/optional/agent_wifi")
endif()
# Trusted drivers as machine code (PICOCALC-NATIVE N5): Espressif's elf_loader, also downloaded, also opt-in.
option(PICOCALC_NATIVE_ELF "Run manifest native worlds as ELF modules (trusted drivers, not isolated)" OFF)
option(PICOCALC_CANDELA_WORLD "Candela's front end as a QuickJS world, with a stub renderer (PICOCALC-CANDELA-WORLD)" OFF)
option(PICOCALC_CANDELA_GALLERY "Candela's presets path-traced on core 1 and shown on the screen (PICOCALC-CANDELA-GALLERY)" OFF)
option(PICOCALC_BENCH "The console benchmarks of bench/board/firmware (profiles/bench.env), never in the playable image" OFF)
if(PICOCALC_APPS)
    set(PICOCALC_NATIVE_ELF ON)
endif()
if(PICOCALC_NATIVE_ELF)
    option(PICOCALC_HEADLESS "Boot the native P4 benchmark without PicoCalc peripheral drivers" OFF)
    option(PICOCALC_COMPILER_PROFILE "Enable controlled compiler heap and GC measurements" OFF)
    option(PICOCALC_DEVICE_COMPILER "Enable operator on-device compilation and installation" OFF)
    option(PICOCALC_TEST_CJI_GRANTS "Include the two capability-transfer hardware test worlds" OFF)
    option(PICOCALC_TEST_CJI_PHASE3 "Run the compiled workflow acceptance fixtures" OFF)
    set(CJI_DIAGNOSTICS toplog)
    if(PICOCALC_TEST_CJI_PHASE3)
        list(APPEND CJI_DIAGNOSTICS fs-probe)
    endif()
    if(PICOCALC_TEST_CJI_GRANTS)
        list(APPEND CJI_DIAGNOSTICS grant-peer)
    endif()
    set(CJI_BUILD ${CMAKE_BINARY_DIR}/cji)
    set(CJI_WORLDS snake flaky keyboard power settings files editor compositor display agent)
    # A Typed app replaces the CJI-compiled world of the same name.
    foreach(app IN LISTS PICOCALC_APPS)
        list(REMOVE_ITEM CJI_WORLDS ${app})
    endforeach()
    get_filename_component(CJI_ROOT "${CMAKE_CURRENT_LIST_DIR}/../../../compiler/cji" ABSOLUTE)
    list(APPEND EXTRA_COMPONENT_DIRS "${CMAKE_CURRENT_LIST_DIR}/optional/native_elf")
endif()
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
# Each set of downloaded dependencies keeps its own lock, so building one configuration does not rewrite another's.
if(PICOCALC_AGENT_WIFI AND PICOCALC_NATIVE_ELF)
    idf_build_set_property(DEPENDENCIES_LOCK "${CMAKE_CURRENT_LIST_DIR}/dependencies.agent-elf.lock")
elseif(PICOCALC_AGENT_WIFI)
    # Keep the reproducible Wi-Fi resolution when someone also builds the offline target.
    idf_build_set_property(DEPENDENCIES_LOCK "${CMAKE_CURRENT_LIST_DIR}/dependencies.agent.lock")
elseif(PICOCALC_NATIVE_ELF)
    idf_build_set_property(DEPENDENCIES_LOCK "${CMAKE_CURRENT_LIST_DIR}/dependencies.elf.lock")
endif()
# Reproducible images (sdkconfig.reproducible): ESP-IDF maps its own tree and this project directory out of
# __FILE__; the firmware also compiles sources from the rest of the repository and from the build directory
# (generated bundles), so those prefixes are mapped too.
get_filename_component(PICOCALC_REPO "${CMAKE_CURRENT_LIST_DIR}/../../.." ABSOLUTE)
idf_build_set_property(COMPILE_OPTIONS "-fmacro-prefix-map=${PICOCALC_REPO}=/picocalc" APPEND)
idf_build_set_property(COMPILE_OPTIONS "-fdebug-prefix-map=${PICOCALC_REPO}=/picocalc" APPEND)
idf_build_set_property(COMPILE_OPTIONS "-fmacro-prefix-map=${CMAKE_BINARY_DIR}=/build" APPEND)
idf_build_set_property(COMPILE_OPTIONS "-fdebug-prefix-map=${CMAKE_BINARY_DIR}=/build" APPEND)
project(picocalc-os-p4)
