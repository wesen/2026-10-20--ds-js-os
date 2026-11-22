import { scene, shape, material, light, camera, param, params, units as u } from 'candela';

const P = params({
  N: param.float(8).range(1.4, 22).scale('log').label('f-number').static(),
  t: param.float(1 / 250).range(1 / 4000, 1 / 8).scale('log').label('Shutter (s)').static(),
  iso: param.float(100).range(50, 6400).scale('log').label('ISO').static(),
});

export default scene().params(P)
  .add(shape.box(0.4, 0.6, 0.02).at(0, 0.5, 0.3).rotateY(u.deg(-15)).material(material.pbr().baseColor(0.18)).id('grey-card'))
  .add(shape.box(2.4, 3, 2.4).at(-2, 1.5, -2).material(material.pbr().baseColor('#b8866a').roughness(0.9)))
  .add(shape.box(2.4, 2.4, 2.4).at(2.2, 1.2, -2.6).material(material.pbr().baseColor('#d8d0c0').roughness(0.9)))
  .add(shape.sphere(0.3).at(0.8, 0.3, 0.6).material(material.plastic('#c03020', 0.3)))
  .add(shape.plane().material(material.pbr().baseColor(0.25).roughness(0.9)))
  .light(light.sun().elevation(u.deg(45)).azimuth(u.deg(220)))
  .light(light.sky.physical({ turbidity: 3 }).fromSun())
  .camera(camera.thinLens().at(0.4, 1.4, 4).lookAt(0, 0.6, 0).focal(u.mm(35))
    .fstop(P.N.value).shutter(P.t.value).iso(P.iso.value));
