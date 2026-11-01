#!/usr/bin/env python3
"""Provision the P4 agent over its existing UART console without command-line secrets.

Values come from prompts (hidden for secrets) or from local sources that already hold them:
  --wifi-from-nm SSID     the passphrase NetworkManager stores for that connection (nmcli -s)
  --pi-provider NAME      endpoint and API key of a provider in ~/.pi/agent/models.json
                          (api "openai-completions" -> BASE/chat/completions, otherwise BASE/responses)
  --model ID              the default model sent with the endpoint (net model)
  --skip-wifi             change only the provider settings
Secret values are never printed; console replies are scrubbed of them.
"""
import argparse
import getpass
import json
import os
import re
import subprocess
import time

DEFAULT_PORT = '/dev/serial/by-id/usb-1a86_USB_Single_Serial_5B61091051-if00'


def checked(value, limit, label, allow_empty=False):
    if (not value and not allow_empty) or len(value.encode('utf-8')) > limit or any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise ValueError(f'{label} is empty, too long, or contains a control character')
    return value


def command(port, text, expected, secrets):
    port.write((text + '\n').encode('utf-8'))
    port.flush()
    deadline = time.monotonic() + 10
    accepted = False
    while time.monotonic() < deadline:
        line = port.readline().decode('utf-8', errors='replace').strip()
        for s in secrets:
            line = line.replace(s, '<secret>')
        if line.startswith('net:'):
            print(line)
        if line.startswith(expected):
            accepted = True
        if line == '#OK net':
            if not accepted:
                raise RuntimeError('The device rejected a setting. Check net status and firmware configuration.')
            return
    raise RuntimeError('No console acknowledgement. Close other serial programs and check the port/firmware.')


def nm_passphrase(ssid):
    r = subprocess.run(['nmcli', '-s', '-g', '802-11-wireless-security.psk', 'connection', 'show', ssid],
                       capture_output=True, text=True)
    if r.returncode:
        raise ValueError(f'NetworkManager has no connection {ssid!r}')
    return r.stdout.strip()


def pi_provider(name):
    with open(os.path.expanduser('~/.pi/agent/models.json')) as f:
        providers = json.load(f).get('providers', {})
    if name not in providers:
        raise ValueError(f'~/.pi/agent/models.json has no provider {name!r}')
    p = providers[name]
    base = p['baseUrl'].rstrip('/')
    return base + ('/chat/completions' if p.get('api') == 'openai-completions' else '/responses'), p['apiKey']


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--port', default=DEFAULT_PORT, help='PicoCalc CH343 UART device; close other serial tools first')
    parser.add_argument('--baud', type=int, default=115200)
    parser.add_argument('--wifi-from-nm', metavar='SSID')
    parser.add_argument('--skip-wifi', action='store_true')
    parser.add_argument('--pi-provider', metavar='NAME')
    parser.add_argument('--model', metavar='ID')
    args = parser.parse_args()
    try:
        import serial
    except ImportError:
        raise SystemExit('Install pyserial: python3 -m pip install pyserial')
    settings = []
    if not args.skip_wifi:
        if args.wifi_from_nm:
            ssid, password = args.wifi_from_nm, nm_passphrase(args.wifi_from_nm)
        else:
            ssid = input('Wi-Fi SSID: ')
            password = getpass.getpass('Wi-Fi password (empty for an open network): ')
        checked(ssid, 32, 'SSID')
        checked(password, 64, 'Password', True)
        if password and len(password.encode('utf-8')) < 8:
            raise ValueError('Wi-Fi password must be at least 8 bytes')
        if len(password.encode('utf-8')) == 64 and not re.fullmatch(r'[0-9A-Fa-f]{64}', password):
            raise ValueError('A 64-byte Wi-Fi password must be a hexadecimal PSK')
        settings += [('ssid', ssid), ('password', password)]
    if args.pi_provider:
        endpoint, token = pi_provider(args.pi_provider)
    else:
        token = getpass.getpass('API key: ')
        endpoint = input('HTTPS endpoint [https://api.openai.com/v1/responses]: ').strip() or 'https://api.openai.com/v1/responses'
    checked(token, 512, 'API key')
    if any(ord(c) > 126 or c.isspace() for c in token):
        raise ValueError('API key must be printable ASCII with no whitespace')
    checked(endpoint, 255, 'Endpoint')
    if not re.fullmatch(r'https://[A-Za-z0-9.:-]+/[!-~]*', endpoint) or any(c in endpoint for c in '@#?\\'):
        raise ValueError('Endpoint must be an ASCII HTTPS host/path without credentials, query, fragment, or backslash')
    settings += [('endpoint', endpoint), ('token', token)]
    if args.model:
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}', args.model):
            raise ValueError('Model must be 1..80 characters of letters, digits and ._:/-')
        settings.append(('model', args.model))
    secrets = [v for k, v in settings if k in ('password', 'token') and v]
    # Open with DTR and RTS both asserted (pyserial's default). The board's auto-reset circuit pulls EN low only
    # when RTS is asserted and DTR is not, which clearing DTR before the open briefly produced: it reset the P4
    # and the boot swallowed the first command.
    with serial.Serial(args.port, args.baud, timeout=.25, write_timeout=2) as port:
        port.write(b'\n')
        time.sleep(.3)
        port.reset_input_buffer()
        for key, value in settings:
            command(port, 'net ' + key + ' ' + value, 'net: ' + key + ' saved', secrets)
        if not args.skip_wifi:
            command(port, 'net connect', 'net: connect queued', secrets)
    print('Settings saved. Use net status to check Wi-Fi, network time, api and model.')
    print('The device stores credentials in NVS. They are never sent to a JavaScript world.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, OSError) as error:
        raise SystemExit(str(error))
