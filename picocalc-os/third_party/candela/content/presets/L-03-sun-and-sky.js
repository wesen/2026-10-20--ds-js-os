import { scene, shape, material, light, camera, param, params, units as u } from 'candela';

const P = params({
  elevation: param.angle(u.deg(45)).range(u.deg(1), u.deg(90)).label('Sun elevation'),
  azimuth: param.angle(u.deg(60)).range(u.deg(0), u.deg(360)).label('Sun azimuth'),
  turbidity: param.float(3).range(1.8, 9).label('Turbidity').static(),
});

const stone = material.pbr().baseColor('#bfb3a0').roughness(0.8);
const obelisk = shape.box(0.5, 3, 0.5).at(0, 1.5, 0).material(stone);

export default scene().params(P)
  .add(obelisk)
  .add(shape.sphere(0.6).at(1.8, 0.6, 0.8).material(material.pbr().baseColor(0.8).roughness(0.3)))
  .add(shape.plane().material(material.pbr().baseColor('#a89a80').roughness(0.95)))
  .light(light.sun().elevation(P.elevation).azimuth(P.azimuth))
  .light(light.sky.physical({ turbidity: P.turbidity.value }).fromSun())
  .camera(camera.thinLens().at(4.5, 1.6, 6.5).lookAt(0.4, 1.4, 0).focal(u.mm(28)));
