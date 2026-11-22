import { scene, shape, material, light, camera, medium, phase, fx, param, params, units as u } from 'candela';

const P = params({ density: param.float(14).range(1, 40).label('Density').static() });
const D = P.density.value;
const smoke = medium.heterogeneous({
  density: fx.field(p => {
    const q = p.P.sub(fx.vec3(0, 0.9, 0));
    const w = q.y.add(0.9).div(1.8).mul(0.3).add(0.18);                  // the plume widens as it rises
    const plume = q.xz.length().smoothstep(w, w.mul(0.3)).mul(q.y.smoothstep(0.85, 0.4)).mul(q.y.smoothstep(-0.9, -0.75));
    const n = fx.noise.fbm(p.P.mul(3).add(fx.vec3(0, -0.6, 0)), { octaves: 5 }).add(0.45).max(0);
    return plume.mul(n).mul(D);
  }),
  bounds: shape.box(1.4, 1.8, 1.4).at(0, 0.9, 0),
  albedo: 0.92, phase: phase.hg(0.3),
});

export default scene().params(P)
  .medium(smoke)
  .add(shape.plane(30).material(material.pbr().baseColor(0.3).roughness(0.9)))
  .light(light.sun().elevation(u.deg(35)).azimuth(u.deg(120)).illuminance(u.lux(30000)))
  .light(light.env.gradient({ top: '#8aa0c0', bottom: '#2a2a2a', intensity: u.nit(600) }))
  .camera(camera.thinLens().at(0, 1.2, 4.2).lookAt(0, 0.9, 0).focal(u.mm(35)));
