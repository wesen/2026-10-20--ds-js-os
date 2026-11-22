import { scene, shape, material, units as u } from 'candela';

const glow = material.emissive('#ffe2bf', u.nit(2500));
const wall = material.pbr().baseColor(0.6).roughness(0.9);

export default scene()
  .add(shape.box(1.0).at(-0.7, 0.5, 0).rotateY(u.deg(20)).material(material.pbr().baseColor(0.6)))
  .add(shape.sphere(0.45).at(0.8, 0.45, 0.2).material(material.pbr().baseColor('#5a7fa8').roughness(0.2)))
  .add(shape.rect(2.4, 1.2).at(0, 2.4, -0.2).rotateX(u.deg(180)).material(glow))
  .add(shape.rect(8, 3).at(0, 1.5, -1.6).rotateX(u.deg(90)).material(wall))
  .add(shape.plane(20).material(material.pbr().baseColor(0.45)));
