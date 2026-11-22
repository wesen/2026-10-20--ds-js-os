import { scene, shape, material, light, camera, fx, units as u } from 'candela';

const wood = material.pbr().roughness(0.5).coat(1).coatRoughness(0.15).baseColor(p => fx.ramp(fx.noise.fbm(p.P.mul(fx.vec3(2, 2, 24))).mul(0.5).add(0.5), [[0, '#5a3820'], [1, '#9a6a40']]));
const fruit = (c, x, z, r = 0.08) => shape.sphere(r).at(x, 0.86 + r, z).tag('fruit').material(material.pbr().baseColor(c).roughness(0.45).coat(0.5));

export default scene()
  .add(shape.box(1.6, 0.05, 0.9).at(0, 0.8, 0).id('table').material(wood))
  .add(shape.cylinder(0.04, 0.8).at(-0.7, 0.4, -0.35).material(wood), shape.cylinder(0.04, 0.8).at(0.7, 0.4, -0.35).material(wood))
  .add(shape.cylinder(0.04, 0.8).at(-0.7, 0.4, 0.35).material(wood), shape.cylinder(0.04, 0.8).at(0.7, 0.4, 0.35).material(wood))
  .add(shape.cylinder(0.2, 0.06).at(0.1, 0.855, 0).id('bowl').material(material.ceramic('#e8e4da')))
  .add(fruit('#e8a020', 0.05, 0.02), fruit('#c8281c', 0.18, -0.06), fruit('#7aa030', 0.12, 0.1, 0.07), fruit('#e8a020', -0.45, 0.2))
  .add(shape.cylinder(0.12, 0.02).at(-0.5, 0.835, -0.25).material(material.metal('brass', { roughness: 0.3 })))
  .add(shape.cylinder(0.012, 0.45).at(-0.5, 1.06, -0.25).material(material.metal('brass', { roughness: 0.3 })))
  .light(light.point().id('lamp').at(-0.5, 1.33, -0.25).power(u.lm(900)).temperature(u.K(3000)).radius(0.05))
  .add(shape.rect(6, 3).at(0, 1.5, -1.2).rotateX(u.deg(90)).id('wall').material(material.pbr().baseColor('#b8b0a0').roughness(0.9)))
  .add(shape.plane(30).id('floor').material(material.pbr().baseColor('#6a5a48').roughness(0.7)))
  .light(light.env.uniform(u.nit(6)))
  .camera(camera.thinLens().at(0.3, 1.5, 2.2).lookAt(0, 0.85, 0).focal(u.mm(35)));
