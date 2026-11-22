import { scene, shape, material, light, camera, fx, param, params, units as u } from 'candela';

const P = params({ k: param.float(0.25).range(0.01, 0.6).label('Smooth union') });
const smin = (a, b, k) => { const h = fx.max(k.sub(a.sub(b).abs()), 0).div(k); return fx.min(a, b).sub(h.mul(h).mul(k).mul(0.25)); };
const ball = (p, c, r) => p.P.sub(fx.vec3(...c)).length().sub(r);

const blob = shape.sdf(p => smin(smin(ball(p, [0, 0, 0], 0.35), ball(p, [0.35, 0.3, 0], 0.25), P.k), ball(p, [-0.25, 0.35, 0.1], 0.2), P.k), { bound: 0.9 });

const twisted = shape.sdf(p => {
  const a = p.P.y.mul(2.2), c = a.cos(), s = a.sin();
  const q = fx.vec3(p.P.x.mul(c).sub(p.P.z.mul(s)), p.P.y, p.P.x.mul(s).add(p.P.z.mul(c)));
  const d = q.abs().sub(fx.vec3(0.14, 0.6, 0.14));
  return fx.max(d, 0).length().add(fx.min(fx.max(d.x, fx.max(d.y, d.z)), 0));
}, { bound: 0.75, lipschitz: 2 });

const gyroid = shape.sdf(p => {
  const q = p.P.mul(14);
  const g = q.x.sin().mul(q.y.cos()).add(q.y.sin().mul(q.z.cos())).add(q.z.sin().mul(q.x.cos())).abs().sub(0.25).div(14 * 1.6);
  return fx.max(g, p.P.length().sub(0.45));
}, { bound: 0.5, lipschitz: 1.6 });

export default scene().params(P)
  .add(blob.at(-1.2, 0.4, 0).material(material.pbr().baseColor('#d06a3c').roughness(0.3)))
  .add(twisted.at(0, 0.62, 0).material(material.metal('Au', { roughness: 0.25 })))
  .add(gyroid.at(1.2, 0.46, 0).material(material.pbr().baseColor('#e8e2d6').roughness(0.5)))
  .add(shape.plane(30).material(material.pbr().baseColor(0.2).roughness(0.7)))
  .light(light.env.studio({ intensity: u.nit(900), rotate: u.deg(30) }))
  .camera(camera.thinLens().at(0, 1.3, 3.8).lookAt(0, 0.45, 0).focal(u.mm(40)));
