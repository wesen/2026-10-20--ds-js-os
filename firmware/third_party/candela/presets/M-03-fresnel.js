import { scene, shape, material, bsdf, light, camera, param, params, units as u } from 'candela';

const P = params({ n: param.float(1.5).range(1.0, 2.5).label('Floor IOR'), rough: param.float(0.02).range(0, 0.5).label('Floor roughness') });
const lacquer = material(bsdf.layer(bsdf.dielectric({ ior: P.n, roughness: P.rough }), bsdf.lambert(0.03)));
const col = material.pbr().baseColor('#e8e0d0').roughness(0.6);

export default scene().params(P)
  .add(scene.group(g => { for (let i = 0; i < 8; i++) { g.add(shape.cylinder(0.2, 2.5).at(-1.6, 1.25, -i * 2).material(col)); g.add(shape.cylinder(0.2, 2.5).at(1.6, 1.25, -i * 2).material(col)); } }))
  .add(shape.plane().material(lacquer))
  .light(light.daylight({ elevation: u.deg(35), azimuth: u.deg(200) }))
  .camera(camera.thinLens().at(0, 0.9, 4).lookAt(0, 0.7, -6).focal(u.mm(28)));
