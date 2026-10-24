#!/usr/bin/env python3
# Reset the ESP32-P4 through the CH343's DTR/RTS lines (DTR released: normal boot; RTS pulses EN) and print
# what arrives on the console for a few seconds. One process may own the port at a time.
#   tools/p4cap.py [-p PORT] [-s SECONDS] [--no-reset]
import argparse, sys, time
import serial

ap = argparse.ArgumentParser()
ap.add_argument("-p", "--port", default="/dev/serial/by-id/usb-1a86_USB_Single_Serial_5B61091051-if00")
ap.add_argument("-s", "--seconds", type=float, default=8)
ap.add_argument("--no-reset", action="store_true")
a = ap.parse_args()
ser = serial.Serial(a.port, 115200, timeout=0.05)
ser.reset_input_buffer()
if not a.no_reset:
    ser.dtr = False   # IO0 high: boot the app, not the ROM downloader
    ser.rts = True    # EN low: hold the chip in reset
    time.sleep(0.12)
    ser.rts = False   # EN high: run
t0 = time.time()
while time.time() - t0 < a.seconds:
    d = ser.read(4096)
    if d:
        sys.stdout.buffer.write(d); sys.stdout.buffer.flush()
ser.close()
