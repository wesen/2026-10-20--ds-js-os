import { scene, shape, material, light, camera, units as u } from 'candela';

const sizes = [0.15, 0.6, 1.6];
const bay = (s, x) => scene.group([
  shape.rect(s, s).at(x, 2.4, 0).rotateX(u.deg(180)).emit(light.area().power(u.lm(1500)).temperature(u.K(4500))),
  shape.cylinder(0.12, 0.9).at(x, 0.45, 0).material(material.pbr().baseColor(0.75)),
]);

export default scene()
  .add(sizes.map((s, i) => bay(s, (i - 1) * 2.4)))
  .add(shape.plane(30).material(material.pbr().baseColor(0.55).roughness(0.9)))
  .add(shape.rect(9, 3.5).at(0, 1.75, -1.6).rotateX(u.deg(90)).material(material.pbr().baseColor(0.4)))
  .camera(camera.thinLens().at(0, 2.2, 5.6).lookAt(0, 0.4, 0).focal(u.mm(30)));
