import { scene, shape, material, bsdf, ior, light, camera, engine as E, fx, units as u } from 'candela';

const diamondIOR = ior.sellmeier({ B: [0.3306, 4.3356, 0], C: [0.1750 ** 2, 0.1060 ** 2, 0] });
const gem = shape.sdf(p => {
  const q = p.P.abs();
  const oct = q.x.add(q.y.mul(1.35)).add(q.z).sub(0.12).mul(0.55);
  return fx.max(oct, p.P.y.sub(0.05));                       // a flat table on top
}, { bound: 0.15 });

export default scene()
  .add(gem.at(0, 0.13, 0).rotateY(u.deg(22)).material(material(bsdf.dielectric({ ior: diamondIOR }))))
  .add(shape.cylinder(0.06, 0.04).at(0, 0.02, 0).material(material.pbr().baseColor(0.05).roughness(0.3)))
  .add(shape.plane(30).material(material.pbr().baseColor(0.04).roughness(0.5)))
  .light(light.point().at(-1.2, 2.2, 1.0).power(u.lm(9000)).temperature(u.K(5600)).radius(0.03))
  .light(light.point().at(1.4, 1.6, 0.4).power(u.lm(6000)).temperature(u.K(5600)).radius(0.03))
  .light(light.env.studio({ intensity: u.nit(120) }))
  .camera(camera.thinLens().at(0, 0.42, 0.62).lookAt(0, 0.1, 0).focal(u.mm(90)).fstop(8));

export const engine = E.offline().spectral();
