# picocalc-os for the PicoCalc with a Waveshare ESP32-P4-WIFI6 in place of the Pico.
#   source ~/esp/esp-idf-5.4.2/export.sh && idf.py build && idf.py -p PORT flash
cmake_minimum_required(VERSION 3.16)
# Network dependencies are deliberately opt-in: an ordinary offline build still needs only ESP-IDF.
# Use a separate build/config: idf.py -B build-agent -D PICOCALC_AGENT_WIFI=ON
#   -D SDKCONFIG=sdkconfig.agent -D SDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.agent-wifi" build
option(PICOCALC_AGENT_WIFI "Build the direct HTTPS agent transport over the onboard C6" OFF)
if(PICOCALC_AGENT_WIFI)
    list(APPEND EXTRA_COMPONENT_DIRS "${CMAKE_CURRENT_LIST_DIR}/optional/agent_wifi")
endif()
# Trusted drivers as machine code (PICOCALC-NATIVE N5): Espressif's elf_loader, also downloaded, also opt-in.
option(PICOCALC_NATIVE_ELF "Run manifest native worlds as ELF modules (trusted drivers, not isolated)" OFF)
if(PICOCALC_NATIVE_ELF)
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
project(picocalc-os-p4)
