import { scene, shape, material, light, camera, fx, units as u } from 'candela';

const stones = [[-1.2, -0.4, 0.45], [0.9, 0.3, 0.35], [0.3, -1.3, 0.25]];
const gravel = shape.heightfield(p => {
  let near = fx.float(9);
  for (const [x, z] of stones) near = fx.min(near, p.P.xz.sub(fx.vec2(x, z)).length());
  const rings = near.mul(40).sin(), lines = p.P.z.mul(40).sin();
  return fx.mix(rings, lines, near.smoothstep(0.8, 1.3)).mul(0.5).add(0.5);
}, { size: 8, height: 0.015 });
const rock = (r) => shape.sdf(p => p.P.div(fx.vec3(1, 0.6, 0.85)).length().sub(r).add(fx.noise.fbm(p.P.mul(5), { octaves: 4 }).mul(r * 0.15)).mul(0.6), { bound: r * 1.3 });
const stone = material.pbr().roughness(0.8).baseColor(p => fx.mix(fx.color('#6a645c'), fx.color('#3d5a1e'), p.N.y.smoothstep(0.5, 0.9).mul(fx.noise.fbm(p.P.mul(8)).add(0.5)).smoothstep(0.45, 0.55)));

export default scene()
  .add(gravel.material(material.pbr().baseColor('#bdb6a8').roughness(0.95)))
  .add(stones.map(([x, z, r]) => rock(r).at(x, r * 0.35, z).material(stone)))
  .light(light.sun().elevation(u.deg(25)).azimuth(u.deg(120)))
  .light(light.sky.physical({ turbidity: 3 }).fromSun())
  .camera(camera.thinLens().at(0.4, 2.6, 3.8).lookAt(0, 0, -0.3).focal(u.mm(35)));
