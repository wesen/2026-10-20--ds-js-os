import { scene, shape, material, light, camera, fx, units as u } from 'candela';

const dunes = shape.heightfield(p => {
  const q = p.P.mul(0.18);
  const w = q.x.mul(1.6).add(q.z.mul(0.4)).add(fx.noise.fbm(q.mul(0.6), { octaves: 3 }).mul(3.2));
  return w.sin().mul(0.5).add(0.5).pow(1.5);
}, { size: 80, height: 3 });
const ripples = p => p.P.x.mul(28).add(fx.noise.perlin(p.P.mul(2)).mul(3)).sin().mul(0.004);
const sand = material.pbr().baseColor('#d2a878').roughness(0.9).normal(fx.bump(ripples, 1));

export default scene()
  .add(dunes.material(sand))
  .add(shape.plane().material(sand))
  .light(light.sun().elevation(u.deg(8)).azimuth(u.deg(250)))
  .light(light.sky.physical({ turbidity: 4 }).fromSun())
  .camera(camera.thinLens().at(0, 7, 26).lookAt(0, 1, 0).focal(u.mm(40)));
