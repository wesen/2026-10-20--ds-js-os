import { scene, shape, material, light, camera } from 'candela';

export default scene()
  .add(shape.sphere('35 cm').at(0, 0.35, 0).material(material.pbr().baseColor('#c8452e').roughness(0.35)))
  .add(shape.box('60 cm').at(-1, 0.3, -0.3).rotateY('30 deg').material(material.pbr().baseColor(0.7)))
  .add(shape.plane(30).material(material.pbr().baseColor(0.45)))
  .light(light.point().at(1.2, 1.8, 1.0).power('1200 lm').temperature('3200 K').radius('2 cm'))
  .light(light.spot().at(-1.5, 2.5, 1.5).aim(0, 0.3, 0).power('2000 lm').cone('25 deg').softEdge('5 deg').temperature('5600 K'))
  .light(light.env.uniform('20 nit'))
  .camera(camera.thinLens().at(0, 1.3, 3.6).lookAt(0, 0.35, 0).focal('40 mm').fstop('f/4'));
