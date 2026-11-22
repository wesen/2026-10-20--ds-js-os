# picocalc-os for the M5Stack PaperS3 (ESP32-S3, e-paper, GT911 touch), worlds on MicroQuickJS.
#   source ~/esp/esp-idf-5.3.4/export.sh && idf.py build && idf.py -p PORT flash
# Serial: use tools/s3cap.py, not idf.py monitor (opening the port can latch the chip in download mode).
cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(picocalc-os-papers3)
