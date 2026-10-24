# picocalc-os for the PicoCalc with a Waveshare ESP32-P4-WIFI6 in place of the Pico.
#   source ~/esp/esp-idf-5.4.2/export.sh && idf.py build && idf.py -p PORT flash
cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(picocalc-os-p4)
