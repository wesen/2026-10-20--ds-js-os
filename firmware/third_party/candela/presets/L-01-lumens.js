import { scene, shape, material, light, camera, units as u } from 'candela';

const floor = material.pbr().baseColor(0.5).roughness(0.85);
const wall = material.pbr().baseColor(0.35).roughness(0.9);

export default scene()
  .add(shape.plane(30).material(floor))
  .add(shape.rect(12, 5).at(0, 2.5, -2).rotateX(u.deg(90)).material(wall))
  .light(light.point().id('bare').at(-2.4, 1.6, 0).power(u.lm(1200)).temperature(u.K(3000)).radius(0.04))
  .light(light.spot().id('spot').at(0, 2.2, 0.3).aim(0, 0, 0.3).power(u.lm(1200)).cone(u.deg(20)).softEdge(u.deg(4)).temperature(u.K(3000)))
  .add(shape.rect(1, 0.5).at(2.4, 2.0, 0.2).rotateX(u.deg(180)).emit(light.area().power(u.lm(1200)).temperature(u.K(3000))))
  .camera(camera.thinLens().at(0, 2.4, 5.5).lookAt(0, 0.6, -0.2).focal(u.mm(32)));
