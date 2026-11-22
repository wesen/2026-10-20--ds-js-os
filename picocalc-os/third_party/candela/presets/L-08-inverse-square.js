import { scene, shape, material, light, camera, units as u } from 'candela';

const white = material.pbr().baseColor(0.8).roughness(0.9);
const bulb = [0, 0.6, 0];
const cards = scene.group(g => {
  for (let d = 1; d <= 5; d++) {
    const a = (d - 3) * 0.4;                                   // fan them out so none shadows another
    g.add(shape.rect(0.5, 0.5).at(d * Math.cos(a), 0.6, d * Math.sin(a)).facing(...bulb).material(white).id('card-' + d));
  }
});

export default scene()
  .add(cards)
  .light(light.point().at(...bulb).power(u.lm(1500)).temperature(u.K(5000)).radius(0.03))
  .add(shape.plane(40).material(material.pbr().baseColor(0.1).roughness(0.95)))
  .camera(camera.thinLens().at(-1.6, 1.6, 0.3).lookAt(2.4, 0.4, 0.6).focal(u.mm(22)).exposure(6));
