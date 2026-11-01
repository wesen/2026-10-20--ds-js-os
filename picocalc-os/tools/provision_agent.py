#!/usr/bin/env python3
"""Provision the P4 agent over its existing UART console without command-line secrets."""
import argparse
import getpass
import re
import time


def checked(value, limit, label, allow_empty=False):
    if (not value and not allow_empty) or len(value.encode('utf-8')) > limit or any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise ValueError(f'{label} is empty, too long, or contains a control character')
    return value


def command(port, text, expected):
    port.write((text + '\n').encode('utf-8'))
    port.flush()
    deadline = time.monotonic() + 10
    accepted = False
    while time.monotonic() < deadline:
        line = port.readline().decode('utf-8', errors='replace').strip()
        if line.startswith(expected):
            accepted = True
        if line == '#OK net':
            if not accepted:
                raise RuntimeError('The device rejected a setting. Check net status and firmware configuration.')
            return
    raise RuntimeError('No console acknowledgement. Close other serial programs and check the port/firmware.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', required=True, help='PicoCalc CH343 UART device; close other serial tools first')
    parser.add_argument('--baud', type=int, default=115200)
    args = parser.parse_args()
    try:
        import serial
    except ImportError:
        raise SystemExit('Install pyserial: python3 -m pip install pyserial')
    ssid = checked(input('Wi-Fi SSID: '), 32, 'SSID')
    password = checked(getpass.getpass('Wi-Fi password (empty for an open network): '), 64, 'Password', True)
    if password and len(password.encode('utf-8')) < 8:
        raise ValueError('Wi-Fi password must be at least 8 bytes')
    if len(password.encode('utf-8')) == 64 and not re.fullmatch(r'[0-9A-Fa-f]{64}', password):
        raise ValueError('A 64-byte Wi-Fi password must be a hexadecimal PSK')
    token = checked(getpass.getpass('OpenAI API key: '), 512, 'API key')
    if any(ord(c) > 126 or c.isspace() for c in token):
        raise ValueError('API key must be printable ASCII with no whitespace')
    endpoint = checked(input('HTTPS Responses endpoint [https://api.openai.com/v1/responses]: ').strip()
                       or 'https://api.openai.com/v1/responses', 255, 'Endpoint')
    if not re.fullmatch(r'https://[A-Za-z0-9.:-]+/[!-~]*', endpoint) or any(c in endpoint for c in '@#?\\'):
        raise ValueError('Endpoint must be an ASCII HTTPS host/path without credentials, query, fragment, or backslash')
    # Set the modem-control lines before opening. This avoids intentionally resetting the board.
    port = serial.Serial(port=None, baudrate=args.baud, timeout=.25, write_timeout=2)
    port.dtr = False
    port.rts = False
    port.port = args.port
    with port:
        port.reset_input_buffer()
        for key, value in [('ssid', ssid), ('password', password), ('endpoint', endpoint), ('token', token)]:
            command(port, 'net ' + key + ' ' + value, 'net: ' + key + ' saved')
        command(port, 'net connect', 'net: connect queued')
    print('Settings saved; Wi-Fi connection requested. Use net status to check Wi-Fi and network time.')
    print('The device stores credentials in NVS. They are never sent to a JavaScript world.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, OSError) as error:
        raise SystemExit(str(error))
