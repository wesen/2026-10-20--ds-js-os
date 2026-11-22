import { scene, shape, material, light, camera, units as u } from 'candela';

const spot = (c, x) => light.spot().at(x, 4, 2.5).aim(x * 0.15, 0, 0).power(u.lm(2000)).cone(u.deg(16)).softEdge(u.deg(3)).color(c);

export default scene()
  .light(spot('#ff2020', -1.2), spot('#20ff30', 0), spot('#2040ff', 1.2))
  .add(shape.cylinder(3, 0.3).at(0, 0.15, 0).material(material.pbr().baseColor(0.7).roughness(0.6)))
  .add(shape.sphere(0.35).at(0, 0.65, 0).material(material.pbr().baseColor(0.85).roughness(0.25)))
  .add(shape.plane(40).material(material.pbr().baseColor(0.08).roughness(0.9)))
  .add(shape.rect(14, 6).at(0, 3, -3).rotateX(u.deg(90)).material(material.pbr().baseColor(0.1)))
  .camera(camera.thinLens().at(0, 2.2, 6.5).lookAt(0, 0.5, 0).focal(u.mm(35)).exposure(7.5));
