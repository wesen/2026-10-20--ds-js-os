# The RV32 conformance capture app (PICOCALC-RV32-CONFORMANCE): runs every board vector of bench/rv32/vectors.mjs on the
# ESP32-P4 and prints its results. Built by bench/board/rv32-build.sh; run by bench/board/rv32-capture.py.
cmake_minimum_required(VERSION 3.16)
set(COMPONENTS main)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(rv32-vectors)
