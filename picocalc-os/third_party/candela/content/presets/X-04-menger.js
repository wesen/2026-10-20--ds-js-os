import { scene, shape, material, light, camera, fx, units as u } from 'candela';

const ITERATIONS = 3;
const sponge = shape.sdf(p => {
  const q = p.P.div(0.6);
  const b = q.abs().sub(1);
  let d = fx.max(b, 0).length().add(fx.min(fx.max(b.x, fx.max(b.y, b.z)), 0));
  let s = 1;
  for (let k = 0; k < ITERATIONS; k++) {
    const a = q.mul(s).mod(2).sub(1);
    s *= 3;
    const r = a.abs().mul(-3).add(1).abs();
    const da = fx.max(r.x, r.y), db = fx.max(r.y, r.z), dc = fx.max(r.z, r.x);
    d = fx.max(d, fx.min(da, fx.min(db, dc)).sub(1).div(s));
  }
  return d.mul(0.6);
}, { bound: 1.1 });

export default scene()
  .add(sponge.at(0, 0.6, 0).rotateY(u.deg(30)).material(material.pbr().baseColor('#d8c8a8').roughness(0.5)))
  .add(shape.plane(30).material(material.pbr().baseColor(0.3).roughness(0.8)))
  .light(light.sun().elevation(u.deg(40)).azimuth(u.deg(130)).illuminance(u.lux(60000)))
  .light(light.env.gradient({ top: '#a0b8d0', bottom: '#303030', intensity: u.nit(900) }))
  .camera(camera.thinLens().at(1.6, 1.5, 2.4).lookAt(0, 0.5, 0).focal(u.mm(35)));
