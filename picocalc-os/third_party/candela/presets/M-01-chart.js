import { scene, shape, material, light, camera, units as u } from 'candela';

const base = '#c8452e';
const R = [0, 0.15, 0.3, 0.5, 0.7, 1];
const row = (metallic, y) => scene.group(R.map((r, i) =>
  shape.sphere(0.32).at((i - 2.5) * 0.8, y, 0).material(material.pbr().baseColor(metallic ? '#e0b070' : base).metallic(metallic).roughness(r))));

export default scene()
  .add(row(0, 1.15), row(1, 0.35))
  .add(shape.plane(40).material(material.pbr().baseColor(0.25).roughness(0.6)))
  .add(shape.rect(12, 4).at(0, 2, -0.8).rotateX(u.deg(90)).material(material.pbr().baseColor(0.3).roughness(0.8)))
  .light(light.env.studio({ intensity: u.nit(900) }))
  .camera(camera.thinLens().at(0, 0.9, 6).lookAt(0, 0.75, 0).focal(u.mm(45)));
