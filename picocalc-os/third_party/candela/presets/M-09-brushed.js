import { scene, shape, material, bsdf, light, camera, param, params, units as u } from 'candela';

const P = params({ along: param.float(0.08).range(0.01, 1).label('Roughness along'), across: param.float(0.45).range(0.01, 1).label('Roughness across') });
const brushed = material(bsdf.conductor({ ior: 'Al', roughness: [P.along, P.across] }));
const iso = material.metal('Al', { roughness: 0.25 });

export default scene().params(P)
  .add(shape.cylinder(0.45, 1.0).at(-0.6, 0.5, 0).material(brushed))
  .add(shape.cylinder(0.45, 1.0).at(0.6, 0.5, 0).material(iso))
  .add(shape.disk(1.3).at(0, 0.002, 1.3).material(brushed))
  .add(shape.plane(30).material(material.pbr().baseColor(0.1).roughness(0.6)))
  .light(light.point().at(0.2, 2.2, 2.4).power(u.lm(6000)).radius(0.04))
  .light(light.env.gradient({ top: '#9fb4c8', bottom: '#202020', intensity: u.nit(60) }))
  .camera(camera.thinLens().at(0, 1.5, 3.8).lookAt(0, 0.4, 0.2).focal(u.mm(40)));
