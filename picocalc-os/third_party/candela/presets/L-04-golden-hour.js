import { scene, shape, material, light, camera, units as u } from 'candela';

const plaster = material.pbr().baseColor('#d8c8b0').roughness(0.85);
const columns = scene.group(g => {
  for (let i = 0; i < 6; i++) g.add(shape.cylinder(0.18, 2.4).at(-3 + i * 1.2, 1.2, -1).material(plaster));
});

export default scene()
  .add(columns)
  .add(shape.box(7.6, 0.25, 1.2).at(0, 2.52, -1).material(plaster))
  .add(shape.sphere(0.4).at(0.6, 0.4, 1.4).material(material.pbr().baseColor('#5d7d9a').roughness(0.35)))
  .add(shape.plane().material(material.pbr().baseColor('#c2b49c').roughness(0.9)))
  .light(light.sun().elevation(u.deg(6)).azimuth(u.deg(70)))
  .light(light.sky.physical({ turbidity: 4 }).fromSun())
  .camera(camera.thinLens().at(1.5, 1.4, 7).lookAt(0, 1.0, 0).focal(u.mm(35)));
