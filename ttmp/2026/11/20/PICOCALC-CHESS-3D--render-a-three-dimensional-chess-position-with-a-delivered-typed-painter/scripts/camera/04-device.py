"""Flash the observed 3D build, replay real Chess keys and collect SPI-verified screenshots."""
import argparse
import fcntl
from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import time
import zlib

spec = importlib.util.spec_from_file_location("scene", Path(__file__).resolve().parents[1]/"scene/device.py")
scene = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scene)
spec = importlib.util.spec_from_file_location("animation",Path(__file__).with_name("07-physical-animation.py"))
animation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(animation)


def main(a):
    paths = (a.release,a.image,a.final)
    parts = [(p/scene.PARTITION).read_bytes() for p in paths]
    images = [(p/scene.APP).read_bytes() for p in paths]
    assert all(sha256(data).hexdigest() == scene.PART_SHA for data in parts)
    assert sha256(images[0]).hexdigest() == scene.RELEASE_SHA
    assert all(0 < len(image) < 0x800000 for image in images)
    rows = json.loads((a.reference/"match.json").read_text())
    refs = {r["label"]:(a.reference/(r["label"]+".ref")).read_bytes() for r in rows}
    assert all(len(image)==320*298*2 for image in refs.values())
    a.output.mkdir(parents=True,exist_ok=False)
    receipt = {"firmware":sha256(images[1]).hexdigest(),"partition":scene.PART_SHA,
               "input":"real keyboard world with observed key-count register","screens":[]}
    def save():
        (a.output/"receipt.json").write_text(json.dumps(receipt,indent=2)+"\n")
    with scene.serial.LOCK.open("a") as guard, (a.output/"uart.log").open("wb",buffering=0) as log:
        fcntl.flock(guard,fcntl.LOCK_EX)
        def connect(): return scene.serial.Console(a.port,log)
        flashed = False
        c = connect()
        try:
            scene.hold(c)
            scene.esp(a,"verify_flash",a.release,"before")
            c = connect()
            scene.hold(c)
            flashed = True
            scene.esp(a,"write_flash",a.image,"candidate")
            scene.esp(a,"verify_flash",a.image,"candidate-verified")
            c = connect()
            initial = c.health()
            receipt["bootPainter"] = scene.painter(c)
            assert receipt["bootPainter"]["installed"] and receipt["bootPainter"]["rejects"] == 0
            assert any("memory keys" in l for l in c.command("panelobs memory-keys"))
            assert "panel capture active" in c.command("panelobs start")
            c.command("key f1"); time.sleep(1)
            for row in rows:
                keylist,label = row["keys"],row["label"]
                for key in keylist:
                    c.command("key "+key)
                    time.sleep(.14)
                ref = refs[label]
                crc = f"{zlib.crc32(ref):08x}"
                deadline = time.monotonic()+12
                while True:
                    panel = scene.status(c,"panelobs check",'{"panel')
                    if panel["panelCRC"] == crc and not panel["remaining"] and not panel["faults"]:
                        break
                    if time.monotonic() >= deadline:
                        c.shot(label+"-actual",a.output)
                        raise ValueError(f"{label}: expected {crc}, got {panel}, painter {scene.painter(c)}")
                    time.sleep(.16)
                shot = c.shot(label,a.output)
                raw = (a.output/(label+".rgb565")).read_bytes()
                assert raw[scene.BODY_TOP:]==ref
                painter = scene.painter(c)
                assert painter["compiles"]==1 and painter["rejects"]==0
                receipt["screens"].append({"label":label,"yaw":row["yaw"],"caption":row["caption"],
                                           "keys":keylist,"appCRC":crc,"panel":panel,"painter":painter,**shot})
                if label == "turn-4":
                    animation.start(c)
                elif label == "yaw-4":
                    receipt["animation"] = animation.collect(c, a.reference, a.output)
                save()
                print(label,crc,"verified",flush=True)
            final = c.health()
            for name in scene.serial.NATIVE:
                assert initial[name]["restarts"] == final[name]["restarts"]
            receipt["qualified"] = True
            save()
        finally:
            if flashed:
                if c.port.is_open: scene.hold(c)
                restore = a.final if receipt.get("qualified") else a.release
                scene.esp(a,"write_flash",restore,"restore")
                scene.esp(a,"verify_flash",restore,"restore-verified")
                c = connect()
                receipt["finalFirmware"] = sha256((restore/scene.APP).read_bytes()).hexdigest()
                receipt["finalWorlds"] = sorted(k for k in c.health() if k in scene.serial.NATIVE)
                receipt["finalPainter"] = scene.painter(c)
                assert receipt["finalPainter"]["installed"] and not receipt["finalPainter"]["rejects"]
            c.close()
            save()


if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    for n in ("reference","output","release","image","final"):
        p.add_argument(n,type=Path)
    p.add_argument("--port",default="/dev/ttyACM0")
    p.add_argument("--esptool",type=Path,default=Path("/home/manuel/.espressif/python_env/idf5.4_py3.11_env/bin/esptool.py"))
    main(p.parse_args())
