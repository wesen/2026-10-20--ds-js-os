import { scene, shape, material, light, camera, fx, units as u } from 'candela';

const moon = shape.sphere(0.06).at(0.35, 0, 0).material(material.pbr().baseColor(0.6));
const planet = shape.sphere(0.16).at(1.6, 0, 0).material(material.pbr().baseColor('#2e6fa8').roughness(0.5))
  .child(scene.group([moon]).rotateY(fx.time().mul(2)));
const arm = scene.group([planet]).rotateY(fx.time().mul(0.5));

export default scene()
  .add(shape.sphere(0.3).at(0, 0.6, 0).material(material.emissive('#ffcf80', u.nit(4000))).child(arm))
  .light(light.point().at(0, 0.6, 0).power(u.lm(8000)).temperature(u.K(4500)))
  .add(shape.disk(2.4).at(0, 0, 0).material(material.pbr().baseColor(0.25).roughness(0.6)))
  .light(light.env.uniform(u.nit(3)))
  .camera(camera.thinLens().at(0, 2.4, 3.6).lookAt(0, 0.4, 0).focal(u.mm(30)));
