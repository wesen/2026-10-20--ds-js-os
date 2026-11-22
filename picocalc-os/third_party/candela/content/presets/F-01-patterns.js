import { scene, shape, material, light, camera, fx, units as u } from 'candela';

const floor = material.pbr().roughness(0.7).baseColor(p => fx.mix(fx.color('#2b2b2b'), fx.color('#c8c0b0'), fx.checker(p.P.xz, 2)));
const striped = material.pbr().roughness(0.35).baseColor(p => fx.mix(fx.color('#1e4bb3'), fx.color('#f0ebe0'), fx.stripes(p.uv.x, 12)));
const ramped = material.pbr().roughness(0.4).baseColor(p => fx.ramp(p.N.y.mul(0.5).add(0.5), [[0, '#14324a'], [0.5, '#e0c090'], [1, '#f6f2e8']]));

export default scene()
  .add(shape.sphere(0.5).at(-0.65, 0.5, 0).material(striped))
  .add(shape.sphere(0.5).at(0.65, 0.5, 0).material(ramped))
  .add(shape.plane(30).material(floor))
  .light(light.daylight({ elevation: u.deg(40), azimuth: u.deg(30) }))
  .camera(camera.thinLens().at(0, 1.3, 3.4).lookAt(0, 0.45, 0).focal(u.mm(40)));
