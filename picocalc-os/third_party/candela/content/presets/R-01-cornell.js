import { scene, shape, material, light, camera, units as u } from 'candela';

const white = material.pbr().baseColor([0.73, 0.71, 0.68]).roughness(1);
const red = material.pbr().baseColor([0.55, 0.06, 0.05]).roughness(1);
const green = material.pbr().baseColor([0.12, 0.45, 0.09]).roughness(1);
const S = 2;

export default scene()
  .add(shape.rect(S, S).at(0, 0, 0).material(white))
  .add(shape.rect(S, S).at(0, S, 0).rotateX(u.deg(180)).material(white))
  .add(shape.rect(S, S).at(0, S / 2, -S / 2).rotateX(u.deg(90)).material(white))
  .add(shape.rect(S, S).at(-S / 2, S / 2, 0).rotateZ(u.deg(-90)).material(red))
  .add(shape.rect(S, S).at(S / 2, S / 2, 0).rotateZ(u.deg(90)).material(green))
  .add(shape.box(0.6, 1.2, 0.6).at(-0.35, 0.6, -0.3).rotateY(u.deg(17)).material(white))
  .add(shape.box(0.6).at(0.38, 0.3, 0.3).rotateY(u.deg(-17)).material(white))
  .add(shape.rect(0.5, 0.4).at(0, S - 0.001, 0).rotateX(u.deg(180)).emit(light.area().power(u.lm(6000)).temperature(u.K(3400))))
  .camera(camera.thinLens().at(0, 1, 4.2).lookAt(0, 1, 0).focal(u.mm(42)));
