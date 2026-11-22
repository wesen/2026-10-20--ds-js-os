import { scene, shape, material, bsdf, ior, light, camera, engine as E, fx, units as u } from 'candela';

const diamond = material(bsdf.dielectric({ ior: ior.sellmeier({ B: [0.3306, 4.3356, 0], C: [0.1750 ** 2, 0.1060 ** 2, 0] }) }));
const gem = shape.sdf(p => { const q = p.P.abs(); return fx.max(q.x.add(q.y.mul(1.35)).add(q.z).sub(0.05).mul(0.55), p.P.y.sub(0.02)); }, { bound: 0.07 });
const pearl = material.pbr().baseColor('#f0ebe2').roughness(0.25).coat(1).coatRoughness(0.08).thinFilm(480).unchecked('W330');
const velvet = material(bsdf.layer(bsdf.sheen({ color: '#6a6a7a', roughness: 0.3 }), bsdf.lambert('#34343c')));
const chain = scene.group(g => { for (let i = 0; i < 18; i++) { const a = i * 0.33; g.add(shape.torus(0.012, 0.003).at(-0.18 + Math.cos(a) * 0.09, 0.004, 0.08 + i * 0.015).rotateY(a * 2).rotateX(u.deg(i % 2 ? 90 : 0)).material(material.metal('Ag', { roughness: 0.1 }))); } });

export default scene()
  .add(shape.torus(0.05, 0.008).at(0, 0.058, 0).rotateX(u.deg(90)).rotateY(u.deg(25)).material(material.metal('Au', { roughness: 0.1 })))
  .add(gem.at(0, 0.152, 0).rotateY(u.deg(25)).material(diamond))
  .add(shape.sphere(0.022).at(0.1, 0.022, 0.07).material(pearl))
  .add(chain)
  .add(shape.plane(10).material(velvet))
  .light(light.point().at(-0.4, 0.6, 0.4).power(u.lm(1500)).temperature(u.K(5600)).radius(0.01))
  .light(light.point().at(0.5, 0.4, 0.2).power(u.lm(900)).temperature(u.K(5600)).radius(0.01))
  .light(light.env.studio({ intensity: u.nit(40) }))
  .camera(camera.thinLens().at(0.1, 0.2, 0.55).lookAt(0.0, 0.08, 0.02).focal(u.mm(90)).fstop(8));

export const engine = E.offline().spectral();
