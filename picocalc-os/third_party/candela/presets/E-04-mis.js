import { scene, shape, material, bsdf, light, camera, engine as E, integrator, param, params, units as u } from 'candela';

const P = params({ strategy: param.choice(['MIS', 'BSDF only', 'lights only'], 'MIS').label('Strategy') });
const rough = [0.04, 0.12, 0.25, 0.45];
const plates = rough.map((r, i) => shape.box(4, 0.04, 0.7).at(0, 0.3 + i * 0.25, -i * 0.65).rotateX(u.deg(18 + i * 6))
  .material(material(bsdf.conductor.schlick({ f0: 0.8, roughness: r }))));
const radii = [0.02, 0.06, 0.18, 0.45], cols = ['#ff7040', '#ffd040', '#60ff80', '#4090ff'];

export default scene().params(P)
  .add(plates)
  .light(radii.map((r, i) => light.point().at((i - 1.5) * 1.1, 2.4, -2.6).power(u.lm(3000)).color(cols[i]).radius(r)))
  .add(shape.plane(30).material(material.pbr().baseColor(0.05)))
  .camera(camera.thinLens().at(0, 2.4, 3.6).lookAt(0, 0.6, -0.8).focal(u.mm(35)));

export const engine = E.offline().integrator(P.strategy.pick({
  'MIS': integrator.path({ nee: true, mis: 'power' }),
  'BSDF only': integrator.path({ nee: false }),
  'lights only': integrator.path({ nee: true, mis: 'none' }),
}));
