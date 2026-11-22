import { scene, shape, material, light, camera, fx, param, params, units as u } from 'candela';

const P = params({ snow: param.float(1.1).range(0, 2.5).label('Snow line (m)') });
const land = shape.heightfield(p => fx.noise.ridged(p.P.mul(0.11), { octaves: 5, gain: 0.45 }).pow(1.6).mul(1.1), { size: 24, height: 3 });

const rock = fx.color('#6a625a'), grass = fx.color('#4d5a32'), white = fx.color('#eef0f2');
const ground = material.pbr().roughness(0.85).baseColor(p => {
  const flat = p.N.y.smoothstep(0.75, 0.92);
  const snow = flat.mul(p.P.y.smoothstep(P.snow, P.snow.add(0.3)));
  const low = flat.mul(p.P.y.smoothstep(0.9, 0.3));
  return fx.mix(fx.mix(rock, grass, low), white, snow);
});

export default scene().params(P)
  .add(land.material(ground))
  .light(light.sun().elevation(u.deg(22)).azimuth(u.deg(250)))
  .light(light.sky.physical({ turbidity: 2.5 }).fromSun())
  .camera(camera.thinLens().at(0, 3.2, 11).lookAt(0, 0.6, 0).focal(u.mm(35)));
