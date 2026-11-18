import os,sys,subprocess,time
port='/dev/serial/by-id/usb-1a86_USB_Single_Serial_5B61091051-if00'
def identity():
    return os.stat(port).st_ino,os.lstat(port).st_ino
before=identity()
child=subprocess.Popen(sys.argv[1:])
while True:
    try: present=identity()==before
    except FileNotFoundError: present=False
    if not present:
        child.kill()
        child.wait()
        sys.exit('STOP: serial interface disappeared or was replaced during flash')
    result=child.poll()
    if result is not None: sys.exit(result)
    time.sleep(.01)
