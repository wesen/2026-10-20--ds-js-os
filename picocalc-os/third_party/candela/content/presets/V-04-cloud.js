import { scene, shape, material, light, camera, medium, phase, fx, units as u } from 'candela';

const puff = (p, c, r) => fx.float(r).sub(p.P.sub(fx.vec3(...c)).length()).div(r).max(0);
const cloud = medium.heterogeneous({
  density: fx.field(p => {
    const body = fx.max(fx.max(puff(p, [0, 2.0, 0], 1.0), puff(p, [0.9, 1.8, 0.2], 0.75)), fx.max(puff(p, [-0.9, 1.75, -0.1], 0.7), puff(p, [0.2, 2.6, 0], 0.6)));
    const n = fx.noise.fbm(p.P.mul(2.2), { octaves: 5 }).mul(0.8).add(0.6);
    return body.mul(n).smoothstep(0.05, 0.4).mul(18);
  }),
  bounds: shape.box(4, 2.4, 2.4).at(0, 2.0, 0),
  albedo: 0.99, phase: phase.hg(0.85),
});

export default scene()
  .medium(cloud)
  .light(light.sun().elevation(u.deg(30)).azimuth(u.deg(150)))
  .light(light.sky.physical({ turbidity: 2.2 }).fromSun())
  .add(shape.plane().material(material.pbr().baseColor('#5a6a3a').roughness(0.95)))
  .camera(camera.thinLens().at(0, 1.6, 7.5).lookAt(0, 2.0, 0).focal(u.mm(35)));
