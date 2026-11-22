import { scene, shape, material, light, camera, units as u } from 'candela';

const temps = [1800, 2700, 3500, 5000, 6500, 9000, 12000];
const white = material.pbr().baseColor(0.8).roughness(0.5);
const bulbs = scene.group(g => temps.forEach((T, i) => {
  const x = (i - 3) * 0.9;
  g.add(light.point().at(x, 1.1, 0).power(u.lm(600)).temperature(u.K(T)).radius(0.04));
  g.add(shape.sphere(0.22).at(x, 0.22, 0.1).material(white));
  g.add(shape.box(0.02, 1.6, 1.2).at(x + 0.45, 0.8, -0.2).material(white));   // a divider between booths
}));

export default scene()
  .add(bulbs)
  .add(shape.box(0.02, 1.6, 1.2).at(-3.15, 0.8, -0.2).material(white))
  .add(shape.plane(30).material(white))
  .add(shape.rect(10, 3).at(0, 1.5, -0.8).rotateX(u.deg(90)).material(white))
  .camera(camera.thinLens().at(0, 1.2, 5.2).lookAt(0, 0.6, 0).focal(u.mm(30)));
