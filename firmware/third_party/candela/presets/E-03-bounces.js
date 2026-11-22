import { scene, shape, material, light, camera, engine as E, integrator, param, params, units as u } from 'candela';

const P = params({ depth: param.int(4).range(1, 12).label('Max depth').static() });
const white = material.pbr().baseColor(0.72).roughness(0.9);

export default scene().params(P)
  .add(shape.rect(3, 3).at(0, 0, 0).material(white))
  .add(shape.rect(3, 3).at(0, 3, 0).rotateX(u.deg(180)).material(white))
  .add(shape.rect(3, 3).at(0, 1.5, -1.5).rotateX(u.deg(90)).material(white))
  .add(shape.rect(3, 3).at(-1.5, 1.5, 0).rotateZ(u.deg(-90)).material(material.pbr().baseColor('#a8231c').roughness(0.9)))
  .add(shape.rect(3, 3).at(1.5, 1.5, 0).rotateZ(u.deg(90)).material(material.pbr().baseColor('#2a8a3a').roughness(0.9)))
  .add(shape.box(0.8, 1.6, 0.8).at(-0.5, 0.8, -0.4).rotateY(u.deg(18)).material(white))
  .add(shape.box(0.8).at(0.55, 0.4, 0.4).rotateY(u.deg(-18)).material(white))
  .add(shape.rect(0.8, 0.8).at(0, 2.99, 0).rotateX(u.deg(180)).emit(light.area().power(u.lm(4000)).temperature(u.K(4500))))
  .camera(camera.thinLens().at(0, 1.5, 5.2).lookAt(0, 1.4, 0).focal(u.mm(35)));

export const engine = E.offline().integrator(integrator.path({ maxDepth: P.depth.value, rr: { after: 3 } }));
