import { scene, shape, material, light, camera, param, params, units as u } from 'candela';

const P = params({
  shutter: param.float(1 / 125).range(1 / 2000, 1 / 15).scale('log').label('Shutter (s)').static(),
  fstop: param.float(16).range(1.4, 22).scale('log').label('f-number').static(),
});

export default scene().params(P)
  .add(shape.box(0.4, 0.6, 0.04).at(-0.5, 0.3, 0).rotateY(u.deg(15)).material(material.pbr().baseColor(0.18)).id('grey-card'))
  .add(shape.box(0.4, 0.6, 0.04).at(0.1, 0.3, 0).rotateY(u.deg(-10)).material(material.pbr().baseColor(0.85).unchecked()).id('white-card'))
  .add(shape.sphere(0.25).at(0.7, 0.25, 0.2).material(material.metal('Al', { roughness: 0.1 })))
  .add(shape.plane(60).material(material.pbr().baseColor('#7a6a55').roughness(0.95)))
  .light(light.sun().elevation(u.deg(50)).azimuth(u.deg(35)).illuminance(u.lux(100_000)))
  .light(light.sky.physical({ turbidity: 2.5 }).fromSun())
  .camera(camera.thinLens().at(0, 1.0, 3.0).lookAt(0, 0.3, 0).focal(u.mm(50))
    .fstop(P.fstop.value).shutter(P.shutter.value).iso(100));
