import { scene, shape, material, bsdf, light, camera, units as u } from 'candela';
import { test } from 'candela/test';

const R = [0.2, 0.5, 0.8, 1.0];
const single = r => bsdf.conductor.schlick({ f0: 1, roughness: r }).multiscatter(false);
const multi = r => bsdf.conductor.schlick({ f0: 1, roughness: r });

console.log('furnace, roughness 1, single:', JSON.stringify(test.furnace(single(1)).albedo));
console.log('furnace, roughness 1, multi: ', JSON.stringify(test.furnace(multi(1)).albedo));

export default scene()
  .add(R.map((r, i) => shape.sphere(0.28).at(-0.35, 0.3 + i * 0.62, 0).material(material(single(r)))))
  .add(R.map((r, i) => shape.sphere(0.28).at(0.35, 0.3 + i * 0.62, 0).material(material(multi(r)))))
  .light(light.env.uniform(u.nit(100)))
  .camera(camera.pinhole().at(0, 1.25, 5).lookAt(0, 1.25, 0).focal(u.mm(50)).exposure(8.6));
