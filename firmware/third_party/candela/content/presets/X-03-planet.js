import { scene, shape, material, medium, phase, light, camera, fx, param, params, units as u } from 'candela';

const R = 1.0;
const P = params({ sea: param.float(0.012).range(-0.02, 0.06).label('Sea level').static() });
const height = q => fx.noise.ridged(q.mul(2.2), { octaves: 6 }).mul(0.07).sub(0.035);
const land = shape.sdf(p => p.P.length().sub(R).sub(height(p.P.normalize())), { bound: R * 1.12, lipschitz: 1.5 });
const ground = material.pbr().roughness(0.85).baseColor(p => {
  const alt = p.P.length().sub(R);
  return fx.ramp(alt.mul(12).add(0.45), [[0, '#c8b080'], [0.3, '#4a6a2a'], [0.65, '#6a5a4a'], [0.9, '#f0f0f0']]);
});
const atmosphere = medium.heterogeneous({
  density: fx.field(p => fx.pow(Math.E, p.P.length().sub(R).mul(-1 / 0.05)).mul(3).mul(p.P.length().lt(R * 1.25).select(1, 0))),
  bounds: shape.box(2.6, 2.6, 2.6), albedo: 0.95, phase: phase.hg(0.6),
});

export default scene().params(P)
  .add(land.material(ground))
  .add(shape.sphere(R + P.sea.value).material(material.pbr().baseColor('#143c5e').roughness(0.08).specular(0.6)))
  .medium(atmosphere)
  .light(light.sun().elevation(u.deg(20)).azimuth(u.deg(60)).illuminance(u.lux(100000)))
  .light(light.env.night())
  .camera(camera.thinLens().at(0, 0.6, 4.2).lookAt(0, 0, 0).focal(u.mm(50)).exposure(14.5));
