import { scene, shape, material, light, camera, units as u } from 'candela';

const m = c => material.pbr().baseColor(c).roughness(0.35);
const back = [
  shape.sphere(0.32).material(m('#c8452e')),
  shape.box(0.55).material(m('#e0a03c')),
  shape.cylinder(0.28, 0.6).material(m('#3c8a5a')),
  shape.disk(0.32).rotateX(u.deg(70)).material(m('#2e6fa8')),
  shape.rect(0.6, 0.6).rotateX(u.deg(70)).material(m('#7a4aa0')),
];
const front = [
  shape.capsule(0.15, 0.4).material(m('#d8d0c0')),
  shape.torus(0.25, 0.08).rotateX(u.deg(60)).material(m('#d8d0c0')),
  shape.roundedBox(0.5, 0.5, 0.5, 0.1).material(m('#d8d0c0')),
  shape.cone(0.28, 0.6).material(m('#d8d0c0')),
  shape.prism({ size: 0.55, depth: 0.3 }).material(m('#d8d0c0')),
];

export default scene()
  .add(back.map((s, i) => s.at((i - 2) * 0.85, 0.34, -0.7)))
  .add(front.map((s, i) => s.at((i - 2) * 0.85, 0.32, 0.4)))
  .add(shape.plane(30).material(material.pbr().baseColor(0.45).roughness(0.8)))
  .light(light.daylight({ elevation: u.deg(50), azimuth: u.deg(35) }))
  .camera(camera.thinLens().at(0, 1.9, 3.8).lookAt(0, 0.2, -0.1).focal(u.mm(32)));
