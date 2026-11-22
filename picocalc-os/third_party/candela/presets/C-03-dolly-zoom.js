import { scene, shape, material, light, camera, param, params, units as u } from 'candela';

const P = params({ f: param.float(50).range(18, 200).scale('log').label('Focal length (mm)').static() });
const f = P.f.value;
const col = material.pbr().baseColor('#d8d0c0').roughness(0.6);

export default scene().params(P)
  .add(scene.group(g => { for (let i = 0; i < 12; i++) { g.add(shape.box(0.3, 2.6, 0.3).at(-1.4, 1.3, -i * 1.6).material(col)); g.add(shape.box(0.3, 2.6, 0.3).at(1.4, 1.3, -i * 1.6).material(col)); } }))
  .add(shape.rect(4, 3).at(0, 1.5, -18).rotateX(u.deg(90)).material(material.pbr().baseColor('#7a2a20')))
  .add(shape.sphere(0.3).at(0, 1.0, 1).material(material.pbr().baseColor('#2e6fa8').roughness(0.3)).id('subject'))
  .add(shape.plane().material(material.pbr().baseColor(0.35)))
  .light(light.daylight({ elevation: u.deg(60), azimuth: u.deg(20) }))
  .camera(camera.thinLens().at(0, 1.1, 1 + f / 1000 * 40).lookAt(0, 1.0, 1).focal(u.mm(f)).fstop(8));
